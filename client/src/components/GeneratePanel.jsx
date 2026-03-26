import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import VideoMetadataPanel from './VideoMetadataPanel';
import MediaLightbox from './MediaLightbox';
import BatchPickerModal from './BatchPickerModal';
import LyricsPanel from './LyricsPanel';
import FontPicker from './FontPicker';
import FilterPicker from './FilterPicker';
import LayoutEditor from './LayoutEditor';
import {
  Clapperboard, Play, Pause, Upload, RefreshCw, Check, AlertCircle,
  Download, Trash2, Music, Monitor, FileText, Sliders, Lock, X, Type, Sparkles,
  Film, Image, Volume2, VolumeX, Scissors, LayoutGrid, List, Eye, StopCircle, BookOpen, ChevronDown,
} from 'lucide-react';
import { Button } from './ui-button';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
  Input, Label, Progress, Badge, Separator
} from './ui-primitives';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';

const SESSION_TOKEN = (() => {
  let t = sessionStorage.getItem('vg_session');
  if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('vg_session', t); }
  return t;
})();

const RESOLUTION_ICONS = {
  '1920x1080': '🖥️',
  '1080x1080': '⬛',
  '1080x1920': '📱',
  '3840x2160': '🔭',
  '2160x3840': '📲',
};

const DEFAULT_VIDEO_LAYOUT = {
  logo:          { x: 50, y: 90, w: 18, enabled: true },
  subtitles:     { x: 50, y: 50, fontSize: 52, enabled: true, textAlign: 'center', textBold: false },
  overlays:      [],
  dimBackground: 0,
};

export default function GeneratePanel({ selectedBatch, onSelectBatch, batches = [], fileRefreshTrigger, activePreset, onPresetUpdated, onClearPreset, onJobComplete, presets, onApplyPreset }) {
  const { token } = useAuth();
  const [quotes, setQuotes]                     = useState('');
  const [quotesMode, setQuotesMode]             = useState('manual'); // 'manual' | 'library'
  const [libraryQuotes, setLibraryQuotes]       = useState([]);
  const [libraryLoading, setLibraryLoading]     = useState(false);
  const [libraryBatch, setLibraryBatch]         = useState(null); // null = all
  const [quoteBatches, setQuoteBatches]         = useState([]);
  const [fontFamily, setFontFamily]             = useState('default');
  const [fontSize, setFontSize]                 = useState('52');
  const [imageFilter, setImageFilter]           = useState('none');
  const [textMaxChars, setTextMaxChars]         = useState('20');
  const [preferredDuration, setPreferredDuration] = useState('20');
  const [sliceDuration, setSliceDuration]       = useState('3');
  const [imageDuration, setImageDuration]       = useState('0.2');
  const [mediaType, setMediaType]               = useState('video'); // 'video' | 'image'
  const [selectedResolutions, setSelectedResolutions] = useState(['1920x1080']);
  const [resolutionCounts, setResolutionCounts] = useState({}); // { key: count }
  const [videoCount, setVideoCount]             = useState(1);
  const [availableResolutions, setAvailableResolutions] = useState([]);
  const [batchFiles, setBatchFiles]             = useState({ videos: [], images: [] });
  const [selectedVideos, setSelectedVideos]     = useState([]);
  const [selectedImages, setSelectedImages]     = useState([]);
  const [fileViewMode, setFileViewMode]         = useState('grid'); // 'list' | 'grid'
  const [videoFilePage, setVideoFilePage]       = useState(0);
  const [imageFilePage, setImageFilePage]       = useState(0);
  const [fileLightboxSrc, setFileLightboxSrc]   = useState(null);
  const [showBatchPicker, setShowBatchPicker]   = useState(false);
  const [logoFile, setLogoFile]                 = useState(null);
  const [uploadingLogo, setUploadingLogo]       = useState(false);

  const [srtFile, setSrtFile]                   = useState(null);
  const [audioFile, setAudioFile]               = useState(null);
  const [audioVolume, setAudioVolume]           = useState(80);
  const [audioDuration, setAudioDuration]       = useState(0);
  const [audioStart, setAudioStart]             = useState(0);
  const [audioEnd, setAudioEnd]                 = useState(0); // 0 = until end
  const [isPlaying, setIsPlaying]               = useState(false);
  const [uploadingSrt, setUploadingSrt]         = useState(false);
  const [uploadingAudio, setUploadingAudio]     = useState(false);

  // Audio batch state
  const [audioMode, setAudioMode]               = useState('manual'); // 'manual' | 'batch'
  const [audioBatches, setAudioBatches]         = useState([]);
  const [selectedAudioBatch, setSelectedAudioBatch] = useState(null);
  const [audioBatchFiles, setAudioBatchFiles]   = useState([]);
  const [selectedAudioFiles, setSelectedAudioFiles] = useState([]);
  const [loadingAudioBatch, setLoadingAudioBatch] = useState(false);

  const [localLayouts, setLocalLayouts]         = useState({ '1920x1080': DEFAULT_VIDEO_LAYOUT });
  const [activeLayoutRes, setActiveLayoutRes]   = useState('1920x1080');

  const [logOpen, setLogOpen]                   = useState(false);
  const [rightOpen, setRightOpen]               = useState({ resolution: false, config: false, filter: false, quotes: false, logo: false, subtitles: false, audio: false });
  const toggleRight = (key) => setRightOpen(prev => ({ ...prev, [key]: !prev[key] }));

  const [generating, setGenerating]             = useState(false);
  const [jobIds, setJobIds]                     = useState([]);
  const [jobs, setJobs]                         = useState([]);
  const [generatingQuotes, setGeneratingQuotes] = useState(false);
  const [aiQuoteError, setAiQuoteError]         = useState(null);
  const logoInputRef   = useRef();
  const srtInputRef    = useRef();
  const quotesFileRef  = useRef();
  const audioInputRef  = useRef();
  const audioPreviewRef = useRef();
  const pollRef        = useRef();

  const locked = activePreset?.locked ?? false;

  // Derive batch type from loaded files
  const batchType = !selectedBatch ? null
    : batchFiles.videos.length > 0 && batchFiles.images.length === 0 ? 'video'
    : batchFiles.images.length > 0 && batchFiles.videos.length === 0 ? 'image'
    : batchFiles.videos.length > 0 && batchFiles.images.length > 0 ? 'mixed'
    : null;

  // When a preset is applied, populate all fields from it
  useEffect(() => {
    if (!activePreset) return;
    if (activePreset.resolutionEntries?.length) {
      setSelectedResolutions(activePreset.resolutionEntries.map(e => e.key));
      const counts = {};
      activePreset.resolutionEntries.forEach(e => { counts[e.key] = e.count || 1; });
      setResolutionCounts(counts);
    } else {
      setSelectedResolutions([activePreset.resolution || '1920x1080']);
      setResolutionCounts({ [activePreset.resolution || '1920x1080']: activePreset.videoCount || 1 });
    }
    setMediaType(activePreset.mediaType || 'video');
    setSliceDuration(String(activePreset.sliceDuration ?? 3));
    setImageDuration(String(activePreset.imageDuration ?? 0.2));
    setFontFamily(activePreset.fontFamily || 'default');
    if (activePreset.layout?.subtitles?.fontSize) setFontSize(String(activePreset.layout.subtitles.fontSize));
    setImageFilter(activePreset.imageFilter || 'none');
    setTextMaxChars(String(activePreset.textMaxChars ?? 20));
    setPreferredDuration(String(activePreset.preferredDuration ?? 20));
    setVideoCount(activePreset.videoCount ?? 1);
    // Build per-resolution layouts from preset
    let resKeys;
    if (activePreset.resolutionEntries?.length) {
      resKeys = activePreset.resolutionEntries.map(e => e.key);
    } else {
      resKeys = [activePreset.resolution || '1920x1080'];
    }
    if (activePreset.layout) {
      const layouts = {};
      resKeys.forEach(res => {
        layouts[res] = { ...DEFAULT_VIDEO_LAYOUT, ...(activePreset.layouts?.[res] || activePreset.layout) };
      });
      setLocalLayouts(layouts);
      setActiveLayoutRes(resKeys[0]);
    }
    // File selections are batch-specific — not loaded from preset
  }, [activePreset?.id]); // re-run only when a different preset is applied

  // Auto-save current field values back to active preset (debounced)
  const saveBackTimerRef = useRef(null);
  // Use a ref so the resolution useEffect always calls the latest version
  const saveBackFnRef = useRef(null);
  const saveBackToPreset = useCallback((patch) => {
    if (!activePreset || locked) return;
    if (saveBackTimerRef.current) clearTimeout(saveBackTimerRef.current);
    saveBackTimerRef.current = setTimeout(async () => {
      await fetch(`${API}/api/presets/${activePreset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      onPresetUpdated?.(patch);
    }, 800);
  }, [activePreset, locked, onPresetUpdated]);
  saveBackFnRef.current = saveBackToPreset;

  const handleLayoutChange = useCallback((patch) => {
    if (patch.layout) {
      setLocalLayouts(prev => {
        const updated = { ...prev, [activeLayoutRes]: patch.layout };
        if (activePreset && !locked) saveBackToPreset({ layout: patch.layout, layouts: updated });
        return updated;
      });
    } else {
      if (activePreset && !locked) saveBackToPreset(patch);
    }
  }, [activeLayoutRes, activePreset, locked, saveBackToPreset]);

  // Wrapped setters that also save back to preset
  const toggleResolution = (key) => {
    setSelectedResolutions(prev => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev;
        const remaining = prev.filter(r => r !== key);
        setLocalLayouts(l => { const { [key]: _, ...rest } = l; return rest; });
        setActiveLayoutRes(ar => ar === key ? remaining[0] : ar);
        return remaining;
      }
      setResolutionCounts(c => ({ ...c, [key]: c[key] ?? 1 }));
      // Copy layout from first existing resolution as starting point
      setLocalLayouts(l => ({ ...l, [key]: l[prev[0]] ? { ...l[prev[0]] } : { ...DEFAULT_VIDEO_LAYOUT } }));
      return [...prev, key];
    });
  };

  const adjustCount = (key, delta) => {
    setResolutionCounts(prev => ({
      ...prev,
      [key]: Math.max(1, Math.min(20, (prev[key] ?? 1) + delta)),
    }));
  };

  // Auto-save resolution entries to preset when selections or counts change
  useEffect(() => {
    const entries = selectedResolutions.map(key => ({ key, count: resolutionCounts[key] ?? 1 }));
    saveBackFnRef.current?.({ resolution: selectedResolutions[0], resolutionEntries: entries });
  }, [selectedResolutions, resolutionCounts]); // eslint-disable-line

  const setAndSaveMediaType = (v) => { setMediaType(v); saveBackToPreset({ mediaType: v }); };
  const setAndSaveSlice = (v) => { setSliceDuration(v); saveBackToPreset({ sliceDuration: Number(v) || 3 }); };
  const setAndSaveImageDur = (v) => { setImageDuration(v); saveBackToPreset({ imageDuration: Number(v) || 0.2 }); };
  const setAndSaveQuotes      = (v) => { setQuotes(v); }; // quotes are per-generation, not saved to preset
  const setAndSaveFontFamily  = (v) => { setFontFamily(v); saveBackToPreset({ fontFamily: v }); };
  const setAndSaveFontSize    = (v) => { setFontSize(v); saveBackToPreset({ 'layout.subtitles.fontSize': Number(v) || 52 }); };
  const setAndSaveTextMaxChars = (v) => { setTextMaxChars(v); saveBackToPreset({ textMaxChars: Number(v) || 0 }); };
  const setAndSavePreferredDuration = (v) => { setPreferredDuration(v); saveBackToPreset({ preferredDuration: Number(v) || 0 }); };
  const setAndSaveVideos    = (v) => { setSelectedVideos(v); }; // not saved to preset — batch-specific
  const setAndSaveImages    = (v) => { setSelectedImages(v); }; // not saved to preset — batch-specific
  const setAndSaveVideoCount = (v) => { setVideoCount(v); saveBackToPreset({ videoCount: v }); };

  const loadLibraryQuotes = useCallback(async (batchId = null) => {
    setLibraryLoading(true);
    try {
      const url = batchId ? `${API}/api/quotes?batchId=${batchId}` : `${API}/api/quotes`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const all = await res.json();
      setLibraryQuotes(all.filter(q => q.enabled));
    } catch {}
    finally { setLibraryLoading(false); }
  }, [token]);

  const switchLibraryBatch = (batchId) => {
    setLibraryBatch(batchId);
    loadLibraryQuotes(batchId);
  };

  const switchQuotesMode = (mode) => {
    setQuotesMode(mode);
    if (mode === 'library') {
      fetch(`${API}/api/quote-batches`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(setQuoteBatches).catch(() => {});
      loadLibraryQuotes(libraryBatch);
    }
  };

  // Audio batch helpers
  const loadAudioBatches = useCallback(() => {
    fetch(`${API}/api/audio-batches`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setAudioBatches).catch(() => {});
  }, [token]);

  const selectAudioBatch = async (batchId) => {
    setSelectedAudioBatch(batchId);
    setSelectedAudioFiles([]);
    if (!batchId) { setAudioBatchFiles([]); return; }
    setLoadingAudioBatch(true);
    try {
      const res = await fetch(`${API}/api/audio-batches/${batchId}/files`, { headers: { Authorization: `Bearer ${token}` } });
      setAudioBatchFiles(await res.json());
    } finally { setLoadingAudioBatch(false); }
  };

  const toggleAudioFile = (filename) => {
    setSelectedAudioFiles(prev =>
      prev.includes(filename) ? prev.filter(f => f !== filename) : [...prev, filename]
    );
  };

  const switchAudioMode = (mode) => {
    setAudioMode(mode);
    if (mode === 'batch') loadAudioBatches();
  };

  // Load available resolutions
  useEffect(() => {
    fetch(`${API}/api/resolutions`).then(r => r.json()).then(setAvailableResolutions).catch(() => {});
  }, []);

  // Load batch files when batch or trigger changes
  useEffect(() => {
    if (selectedBatch) {
      fetch(`${API}/api/batches/${selectedBatch}/files`)
        .then(r => r.json())
        .then(data => {
          setBatchFiles(data);
          setVideoFilePage(0);
          setImageFilePage(0);
          // Auto-detect batch type and lock mediaType accordingly
          const bt = data.videos.length > 0 && data.images.length === 0 ? 'video'
            : data.images.length > 0 && data.videos.length === 0 ? 'image'
            : null;
          if (bt) setMediaType(bt);
          // Only auto-select all if no preset is active
          if (!activePreset) {
            setSelectedVideos(data.videos);
            setSelectedImages(data.images);
          }
        })
        .catch(() => {});
    }
  }, [selectedBatch, fileRefreshTrigger]);

  // Load logo + overlay files
  useEffect(() => {
    fetch(`${API}/api/assets/logo`).then(r => r.json()).then(d => setLogoFile(d.logo)).catch(() => {});
    fetch(`${API}/api/assets/overlays/${SESSION_TOKEN}`).then(r => r.json()).then(d => {
      setSrtFile(d.srt || null);
      setAudioFile(d.audio || null);
    }).catch(() => {});
  }, []);

  // Poll all active job statuses
  useEffect(() => {
    if (!jobIds.length) return;
    const poll = async () => {
      try {
      const results = await Promise.all(
        jobIds.map(id => fetch(`${API}/api/jobs/${id}`).then(r => r.json()))
      );
      setJobs(results);
      const anyActive = results.some(j => j.status !== 'done' && j.status !== 'error');
      if (anyActive) {
        pollRef.current = setTimeout(poll, 1200);
      } else {
        setGenerating(false);
        results.forEach(j => onJobComplete?.(j));
      }
      } catch { pollRef.current = setTimeout(poll, 1200); }
    };
    poll();
    return () => clearTimeout(pollRef.current);
  }, [jobIds]);

  const uploadLogo = async (file) => {
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      await fetch(`${API}/api/assets/logo`, { method: 'POST', body: fd });
      setLogoFile(file.name);
    } finally { setUploadingLogo(false); }
  };

  const uploadSrt = async (file) => {
    setUploadingSrt(true);
    try {
      const fd = new FormData();
      fd.append('subtitle', file);
      await fetch(`${API}/api/assets/subtitle/${SESSION_TOKEN}`, { method: 'POST', body: fd });
      setSrtFile(file.name);
    } finally { setUploadingSrt(false); }
  };

  const uploadAudio = async (file) => {
    setUploadingAudio(true);
    try {
      const fd = new FormData();
      fd.append('audio', file);
      await fetch(`${API}/api/assets/audio/${SESSION_TOKEN}`, { method: 'POST', body: fd });
      // Re-fetch to get the actual server-side filename (token + ext)
      const res = await fetch(`${API}/api/assets/overlays/${SESSION_TOKEN}`);
      const d = await res.json();
      setAudioFile(d.audio || null);
    } finally { setUploadingAudio(false); }
  };

  // Reset clip range whenever the audio file changes
  useEffect(() => {
    setAudioStart(0);
    setAudioEnd(0);
    setAudioDuration(0);
    setIsPlaying(false);
  }, [audioFile]);

  const removeOverlay = async (type) => {
    await fetch(`${API}/api/assets/overlays/${SESSION_TOKEN}/${type}`, { method: 'DELETE' });
    if (type === 'srt') setSrtFile(null);
    else {
      audioPreviewRef.current?.pause();
      setIsPlaying(false);
      setAudioFile(null);
    }
  };

  const toggleVideo = f => setSelectedVideos(p => p.includes(f) ? p.filter(x => x !== f) : [...p, f]);
  const toggleImage = f => setSelectedImages(p => p.includes(f) ? p.filter(x => x !== f) : [...p, f]);

  const generate = async () => {
    if (!selectedBatch) return;
    setGenerating(true);
    setJobs([]);
    setJobIds([]);
    setLogOpen(true);
    try {
      // Resolve quotes: pull from library if in library mode
      let resolvedQuotes = quotes;
      let usedQuoteIds = [];
      if (quotesMode === 'library') {
        const needed = totalVideos;
        const pool = libraryQuotes.slice(0, needed);
        resolvedQuotes = pool.map(q => q.text).join('\n');
        usedQuoteIds = pool.map(q => q.id);
      }

      const baseParams = {
        batchName: selectedBatch,
        videoFiles: selectedVideos,
        imageFiles: selectedImages,
        quotes: resolvedQuotes,
        fontFamily,
        fontSize: Number(fontSize) || 52,
        imageFilter,
        textMaxChars: Number(textMaxChars) || 0,
        preferredDuration: Number(preferredDuration) || 0,
        sliceDuration: Number(sliceDuration) || 3,
        imageDuration: Number(imageDuration) || 0.2,
        audioVolume: audioVolume / 100,
        audioStart: audioStart || 0,
        audioEnd: audioEnd || 0,
        sessionToken: audioMode === 'manual' ? SESSION_TOKEN : null,
        audioBatchId: audioMode === 'batch' ? selectedAudioBatch : null,
        audioBatchFileNames: audioMode === 'batch' ? selectedAudioFiles : [],
        presetId: activePreset?.id || null,
      };
      const ids = await Promise.all(
        selectedResolutions.map(async (res) => {
          const count = resolutionCounts[res] ?? 1;
          const layout = localLayouts[res] || (activePreset?.layout ? { ...DEFAULT_VIDEO_LAYOUT, ...activePreset.layout } : DEFAULT_VIDEO_LAYOUT);
          const r = await fetch(`${API}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...baseParams, resolution: res, videoCount: count, layout }),
          });
          const { jobId } = await r.json();
          return jobId;
        })
      );
      setJobIds(ids);

      // Mark used library quotes as disabled
      if (usedQuoteIds.length > 0) {
        await fetch(`${API}/api/quotes/mark-used`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ids: usedQuoteIds }),
        });
        setLibraryQuotes(prev => prev.filter(q => !usedQuoteIds.includes(q.id)));
      }
    } catch { setGenerating(false); }
  };

  const hasContent = selectedVideos.length > 0 || selectedImages.length > 0;

  // Background preview URL for LayoutEditor
  const previewBgIsVideo = selectedVideos.length > 0;
  const previewBgUrl = selectedBatch
    ? previewBgIsVideo && selectedVideos[0]
      ? `${API}/batches-media/${selectedBatch}/videos/${encodeURIComponent(selectedVideos[0])}`
      : selectedImages[0]
      ? `${API}/batches-media/${selectedBatch}/images/${encodeURIComponent(selectedImages[0])}`
      : null
    : null;

  const currentLayout = localLayouts[activeLayoutRes] || DEFAULT_VIDEO_LAYOUT;
  const layoutPreset = {
    ...(activePreset || {}),
    id: activePreset?.id || null,
    resolution: activeLayoutRes,
    layout: currentLayout,
  };

  // Pre-compute generate button label (avoid IIFE in JSX)
  const totalVideos = selectedResolutions.reduce((sum, r) => sum + (resolutionCounts[r] ?? 1), 0);

  const FILE_PAGE_SIZE = 24;
  const videoPageCount = Math.ceil(batchFiles.videos.length / FILE_PAGE_SIZE);
  const imagePageCount = Math.ceil(batchFiles.images.length / FILE_PAGE_SIZE);
  const pagedVideos = batchFiles.videos.slice(videoFilePage * FILE_PAGE_SIZE, (videoFilePage + 1) * FILE_PAGE_SIZE);
  const pagedImages = batchFiles.images.slice(imageFilePage * FILE_PAGE_SIZE, (imageFilePage + 1) * FILE_PAGE_SIZE);

  const layoutSidebarContent = (
    <>

          {/* Resolution */}
          <Card>
            <CardHeader className="px-4 pt-4 pb-3 cursor-pointer select-none" onClick={() => toggleRight('resolution')}>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-primary" /> Resolution
                  {selectedResolutions.length > 1 && (
                    <Badge className="text-xs bg-primary/20 text-primary border-primary/30">{selectedResolutions.length} resolutions</Badge>
                  )}
                </CardTitle>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200 flex-shrink-0", rightOpen.resolution && "rotate-180")} />
              </div>
              <CardDescription>Each selected resolution generates a separate video</CardDescription>
            </CardHeader>
            {rightOpen.resolution && <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-1 gap-2">
                {availableResolutions.map(r => {
                  const selected = selectedResolutions.includes(r.key);
                  const count = resolutionCounts[r.key] ?? 1;
                  return (
                    <button key={r.key} onClick={() => !locked && toggleResolution(r.key)} disabled={locked}
                      className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all",
                        selected ? "border-primary bg-primary/10 text-foreground" : "border-border hover:border-border/80 text-muted-foreground hover:text-foreground",
                        locked && "opacity-60 cursor-not-allowed")}
                    >
                      <span className="text-lg">{RESOLUTION_ICONS[r.key]}</span>
                      <div className="flex-1 min-w-0">
                        <div className={cn("text-sm font-semibold mono", selected && "text-primary")}>{r.key}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.label.split('—')[1]?.trim()}</div>
                      </div>
                      {selected && (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => adjustCount(r.key, -1)} disabled={locked || count <= 1}
                            className="w-5 h-5 rounded border border-border hover:border-primary/60 hover:bg-primary/10 text-xs font-bold flex items-center justify-center transition-all disabled:opacity-30">−</button>
                          <span className="w-5 text-center text-xs font-mono font-semibold text-primary">{count}</span>
                          <button onClick={() => adjustCount(r.key, 1)} disabled={locked || count >= 20}
                            className="w-5 h-5 rounded border border-border hover:border-primary/60 hover:bg-primary/10 text-xs font-bold flex items-center justify-center transition-all disabled:opacity-30">+</button>
                        </div>
                      )}
                      <div className={cn("w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all",
                        selected ? "border-primary bg-primary" : "border-muted-foreground/40")}>
                        {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>}
          </Card>

          {/* Generation Config */}
          <Card>
            <CardHeader className="px-4 pt-4 pb-3 cursor-pointer select-none" onClick={() => toggleRight('config')}>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Generation Config</CardTitle>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200 flex-shrink-0", rightOpen.config && "rotate-180")} />
              </div>
              <CardDescription>Media type and timing settings</CardDescription>
            </CardHeader>
            {rightOpen.config && <CardContent className="px-4 pb-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Source Media</Label>
                {batchType && batchType !== 'mixed' ? (
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium",
                    "border-primary/40 bg-primary/10 text-primary"
                  )}>
                    {batchType === 'video' ? <Film className="w-4 h-4" /> : <Image className="w-4 h-4" />}
                    {batchType === 'video' ? 'Video Batch' : 'Image Batch'}
                    <span className="ml-auto text-[10px] text-muted-foreground font-normal">Auto-detected</span>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button disabled={locked} onClick={() => setAndSaveMediaType('video')}
                      className={cn("flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                        mediaType === 'video' ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-border/80",
                        locked && "opacity-50 cursor-not-allowed")}>
                      <Film className="w-4 h-4" /> Video Batch
                    </button>
                    <button disabled={locked} onClick={() => setAndSaveMediaType('image')}
                      className={cn("flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                        mediaType === 'image' ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-border/80",
                        locked && "opacity-50 cursor-not-allowed")}>
                      <Image className="w-4 h-4" /> Image Batch
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {mediaType === 'video' ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Slice duration (sec)</Label>
                    <Input type="number" min="1" max="60" step="1" value={sliceDuration} disabled={locked}
                      onChange={e => setAndSaveSlice(e.target.value)}
                      onBlur={e => { if (e.target.value === '' || isNaN(Number(e.target.value))) setAndSaveSlice('3'); }} />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Image duration (sec)</Label>
                    <Input type="number" min="0.1" max="10" step="0.1" value={imageDuration} disabled={locked}
                      onChange={e => setAndSaveImageDur(e.target.value)}
                      onBlur={e => { if (e.target.value === '' || isNaN(Number(e.target.value))) setAndSaveImageDur('0.2'); }} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">Output duration (sec)</Label>
                  <Input type="number" min="0" max="3600" step="1" value={preferredDuration} disabled={locked}
                    placeholder="0 = auto"
                    onChange={e => setAndSavePreferredDuration(e.target.value)}
                    onBlur={e => { if (e.target.value === '' || isNaN(Number(e.target.value))) setAndSavePreferredDuration('0'); }} />
                </div>
              </div>
            </CardContent>}
          </Card>

          {/* Filter */}
          <Card>
            <CardHeader className="px-4 pt-4 pb-3 cursor-pointer select-none" onClick={() => toggleRight('filter')}>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="text-base">🎨</span> Color Filter
                </CardTitle>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200 flex-shrink-0", rightOpen.filter && "rotate-180")} />
              </div>
              <CardDescription>Apply a cinematic tint or color grade to the media</CardDescription>
            </CardHeader>
            {rightOpen.filter && <CardContent className="px-4 pb-4">
              <FilterPicker value={imageFilter} onChange={setImageFilter} disabled={locked} />
            </CardContent>}
          </Card>

          {/* Quotes & Text */}
          <Card>
            <CardHeader className="px-4 pt-4 pb-3">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <CardTitle className="text-base flex items-center gap-2 min-w-0 truncate">
                  <FileText className="w-4 h-4 text-primary flex-shrink-0" /> Quotes &amp; Text
                </CardTitle>
                <div className="flex items-center gap-1 flex-shrink-0">
                {quotesMode === 'manual' && (
                  <div className="flex items-center gap-1">
                    {srtFile && <span className="text-xs text-yellow-400 flex items-center gap-1"><FileText className="w-3 h-3" /></span>}
                    <Button variant="outline" size="sm" disabled={!!srtFile || generatingQuotes}
                      onClick={async () => {
                        setAiQuoteError(null); setGeneratingQuotes(true);
                        try {
                          const r = await fetch(`${API}/api/ai/quotes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: totalVideos }) });
                          const data = await r.json();
                          if (!r.ok) throw new Error(data.error || 'Unknown error');
                          setAndSaveQuotes(data.quotes.join('\n'));
                        } catch (e) { setAiQuoteError(e.message); } finally { setGeneratingQuotes(false); }
                      }}
                      className="h-7 px-2 text-xs gap-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-0 shadow-md shadow-violet-500/20 disabled:opacity-50"
                    >
                      {generatingQuotes ? <><RefreshCw className="w-3 h-3 animate-spin" /> AI…</> : <><Sparkles className="w-3 h-3" /> AI ({totalVideos})</>}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => quotesFileRef.current?.click()} disabled={!!srtFile} className="h-7 px-2 text-xs">
                      <Upload className="w-3 h-3" />
                    </Button>
                    <input ref={quotesFileRef} type="file" accept=".txt" className="hidden"
                      onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setAndSaveQuotes(ev.target.result); r.readAsText(f); e.target.value = ''; }} />
                  </div>
                )}
                <button onClick={e => { e.stopPropagation(); toggleRight('quotes'); }} className="p-0.5 text-muted-foreground hover:text-foreground transition-colors rounded">
                  <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", rightOpen.quotes && "rotate-180")} />
                </button>
                </div>
              </div>
              <CardDescription className="text-xs">
                {quotesMode === 'library' ? 'Using quotes from your library' : 'One per line — each video picks one'}
              </CardDescription>
            </CardHeader>
            {rightOpen.quotes && <CardContent className="px-4 pb-4 space-y-4">
              {/* Mode toggle */}
              <div className="flex gap-1.5 bg-secondary rounded-lg p-1">
                <button onClick={() => switchQuotesMode('manual')}
                  className={cn("flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all",
                    quotesMode === 'manual' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  <FileText className="w-3 h-3" /> Manual
                </button>
                <button onClick={() => switchQuotesMode('library')}
                  className={cn("flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all",
                    quotesMode === 'library' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  <BookOpen className="w-3 h-3" /> Quote Library
                </button>
              </div>

              {quotesMode === 'manual' ? (
                <>
                  {aiQuoteError && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3 flex-shrink-0" />{aiQuoteError}</p>}
                  <textarea
                    placeholder={"One quote per line\n\nBelieve in yourself\nWork hard, dream big"}
                    value={quotes} onChange={e => setAndSaveQuotes(e.target.value)}
                    disabled={!!srtFile} rows={4}
                    className={cn("w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y mono",
                      srtFile && "opacity-40 cursor-not-allowed")}
                  />
                  {quotes.trim() && (
                    <p className="text-xs text-muted-foreground">{quotes.split('\n').filter(l => l.trim()).length} quote{quotes.split('\n').filter(l => l.trim()).length !== 1 ? 's' : ''}</p>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  {/* Batch selector */}
                  {quoteBatches.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => switchLibraryBatch(null)}
                        className={cn("px-2.5 py-1 rounded-md border text-xs font-medium transition-all",
                          !libraryBatch ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                        All
                      </button>
                      {quoteBatches.map(b => (
                        <button key={b.id} onClick={() => switchLibraryBatch(b.id)}
                          className={cn("px-2.5 py-1 rounded-md border text-xs font-medium transition-all",
                            libraryBatch === b.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                          {b.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {libraryLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : libraryQuotes.length === 0 ? (
                    <div className="py-5 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                      No active quotes in your library.
                      <br /><span className="text-xs">Add quotes in the Quotes tab.</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">{libraryQuotes.length}</span> active quote{libraryQuotes.length !== 1 ? 's' : ''} available
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Will use <span className="font-semibold text-foreground">{Math.min(totalVideos, libraryQuotes.length)}</span> for {totalVideos} video{totalVideos !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                        {libraryQuotes.slice(0, totalVideos).map((q, i) => (
                          <div key={q.id} className="flex items-start gap-2 px-3 py-2 rounded-md bg-primary/5 border border-primary/20 text-xs">
                            <span className="text-primary font-mono font-semibold flex-shrink-0 w-4">{i + 1}</span>
                            <span className="text-muted-foreground mono whitespace-pre-wrap break-words">{q.text}</span>
                          </div>
                        ))}
                        {libraryQuotes.length > totalVideos && (
                          <p className="text-xs text-muted-foreground/60 text-center pt-1">
                            +{libraryQuotes.length - totalVideos} more won't be used this run
                          </p>
                        )}
                      </div>
                      <button onClick={() => loadLibraryQuotes(libraryBatch)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                        <RefreshCw className="w-3 h-3" /> Refresh
                      </button>
                    </>
                  )}
                </div>
              )}
              <Separator />
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Type className="w-3 h-3" /> Font</Label>
                <FontPicker value={fontFamily} onChange={setAndSaveFontFamily} previewText={quotes} disabled={locked} />
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Size (px)</Label>
                    <Input type="number" min="12" max="300" step="1" value={fontSize}
                      onChange={e => setAndSaveFontSize(e.target.value)}
                      onBlur={e => { if (!e.target.value || isNaN(Number(e.target.value))) setFontSize('52'); }}
                      disabled={locked} className={cn("w-20", locked && "opacity-40")} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Max chars / line</Label>
                    <Input type="number" min="0" max="200" step="1" value={textMaxChars}
                      onChange={e => setAndSaveTextMaxChars(e.target.value)}
                      onBlur={e => { if (e.target.value === '' || isNaN(Number(e.target.value))) setAndSaveTextMaxChars('0'); }}
                      disabled={!!srtFile || locked} className={(srtFile || locked) ? 'opacity-40 w-20' : 'w-20'} placeholder="0 = off" />
                  </div>
                </div>
              </div>
            </CardContent>}
          </Card>

          {/* Logo */}
          <Card>
            <CardHeader className="px-4 pt-4 pb-2 cursor-pointer select-none" onClick={() => toggleRight('logo')}>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" /> Logo
                </CardTitle>
                <div className="flex items-center gap-2">
                  <CardDescription className="text-xs">Overlaid on every video</CardDescription>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200 flex-shrink-0", rightOpen.logo && "rotate-180")} />
                </div>
              </div>
            </CardHeader>
            {rightOpen.logo && <CardContent className="px-4 pb-4 pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                  {uploadingLogo ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  {logoFile ? 'Replace' : 'Upload'}
                </Button>
                {logoFile && <span className="text-xs text-green-400 flex items-center gap-1 truncate min-w-0"><Check className="w-3 h-3 flex-shrink-0" />{logoFile}</span>}
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && uploadLogo(e.target.files[0])} />
              </div>
            </CardContent>}
          </Card>

          {/* Subtitles / SRT */}
          <Card className={cn(srtFile && "border-yellow-500/30")}>
            <CardHeader className="px-4 pt-4 pb-2 cursor-pointer select-none" onClick={() => toggleRight('subtitles')}>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <CardTitle className="text-base flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-primary flex-shrink-0" /> Subtitles
                  </CardTitle>
                  {srtFile && <Badge className="text-xs bg-yellow-500/20 text-yellow-400 border-yellow-500/30 flex-shrink-0">Active</Badge>}
                </div>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200 flex-shrink-0", rightOpen.subtitles && "rotate-180")} />
              </div>
              <CardDescription>SRT overrides quote text</CardDescription>
            </CardHeader>
            {rightOpen.subtitles && <CardContent className="px-4 pb-4 pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => srtInputRef.current?.click()} disabled={uploadingSrt}>
                  {uploadingSrt ? <RefreshCw className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                  {srtFile ? 'Replace' : 'Upload .srt'}
                </Button>
                {srtFile && (
                  <>
                    <span className="text-xs text-yellow-400 flex items-center gap-1 truncate min-w-0"><Check className="w-3 h-3 flex-shrink-0" />{srtFile}</span>
                    <button onClick={() => removeOverlay('srt')} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </>
                )}
                <input ref={srtInputRef} type="file" accept=".srt" className="hidden" onChange={e => e.target.files[0] && uploadSrt(e.target.files[0])} />
              </div>
            </CardContent>}
          </Card>

    </>
  );

  const audioCard = (
          <Card className={cn((audioFile || selectedAudioFiles.length > 0) && "border-primary/30")}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Music className="w-4 h-4 text-primary flex-shrink-0" />
                  <CardTitle className="text-base truncate">Background Audio</CardTitle>
                  <Badge variant="secondary" className="text-xs flex-shrink-0">Optional</Badge>
                  {audioMode === 'manual' && audioFile && <Badge className="text-xs bg-primary/20 text-primary border-primary/30 flex-shrink-0">Active</Badge>}
                  {audioMode === 'batch' && selectedAudioFiles.length > 0 && <Badge className="text-xs bg-primary/20 text-primary border-primary/30 flex-shrink-0">{selectedAudioFiles.length} sel.</Badge>}
                </div>
                <button onClick={() => toggleRight('audio')} className="p-0.5 text-muted-foreground hover:text-foreground transition-colors rounded flex-shrink-0">
                  <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", rightOpen.audio && "rotate-180")} />
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <CardDescription className="text-xs">{audioMode === 'batch' ? 'Random per video from selected' : 'MP3 mixed into output'}</CardDescription>
                {/* Mode toggle */}
                <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5 flex-shrink-0">
                  <button onClick={() => switchAudioMode('manual')}
                    className={cn("px-2 py-1 rounded-md text-xs font-medium transition-all", audioMode === 'manual' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                    Manual
                  </button>
                  <button onClick={() => switchAudioMode('batch')}
                    className={cn("px-2 py-1 rounded-md text-xs font-medium transition-all", audioMode === 'batch' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                    Batch
                  </button>
                </div>
              </div>
            </CardHeader>
            {rightOpen.audio && <CardContent className="space-y-4">
              {/* Batch mode UI */}
              {audioMode === 'batch' && (
                <div className="space-y-3">
                  {/* Batch selector */}
                  {audioBatches.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-1">No audio batches yet — create one in the <strong>Audio</strong> tab.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {audioBatches.map(b => (
                        <button key={b.id} onClick={() => selectAudioBatch(selectedAudioBatch === b.id ? null : b.id)}
                          className={cn("px-2.5 py-1 rounded-md border text-xs font-medium transition-all", selectedAudioBatch === b.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                          {b.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* File selector */}
                  {selectedAudioBatch && (
                    loadingAudioBatch ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                        <RefreshCw className="w-3 h-3 animate-spin" /> Loading files…
                      </div>
                    ) : audioBatchFiles.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No audio files in this batch.</p>
                    ) : (
                      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-muted-foreground">{selectedAudioFiles.length} / {audioBatchFiles.length} selected — one picked randomly per video</p>
                          <button onClick={() => setSelectedAudioFiles(selectedAudioFiles.length === audioBatchFiles.length ? [] : [...audioBatchFiles])}
                            className="text-[10px] text-primary hover:underline">
                            {selectedAudioFiles.length === audioBatchFiles.length ? 'Deselect all' : 'Select all'}
                          </button>
                        </div>
                        {audioBatchFiles.map(f => (
                          <button key={f} onClick={() => toggleAudioFile(f)}
                            className={cn("w-full flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs text-left transition-all",
                              selectedAudioFiles.includes(f) ? "border-primary/50 bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
                            <div className={cn("w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center",
                              selectedAudioFiles.includes(f) ? "border-primary bg-primary" : "border-border")}>
                              {selectedAudioFiles.includes(f) && <Check className="w-2 h-2 text-primary-foreground" />}
                            </div>
                            <Music className="w-3 h-3 flex-shrink-0 opacity-50" />
                            <span className="font-mono truncate">{f}</span>
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}
              {audioMode === 'manual' && <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => audioInputRef.current?.click()} disabled={uploadingAudio}>
                    {uploadingAudio ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Music className="w-3 h-3" />}
                    {audioFile ? 'Replace .mp3' : 'Upload .mp3'}
                  </Button>
                  {audioFile && (
                    <>
                      <span className="text-xs text-green-400 flex items-center gap-1 truncate max-w-[160px]"><Check className="w-3 h-3 flex-shrink-0" />{audioFile}</span>
                      <button onClick={() => removeOverlay('audio')} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                  <input ref={audioInputRef} type="file" accept=".mp3,.m4a,.wav" className="hidden"
                    onChange={e => { if (e.target.files[0]) { audioPreviewRef.current?.pause(); setIsPlaying(false); uploadAudio(e.target.files[0]); } }} />
                </div>
              {audioFile && (
                <>
                  <audio ref={audioPreviewRef} src={`${API}/overlays/${audioFile}`} preload="metadata"
                    onLoadedMetadata={e => setAudioDuration(e.target.duration || 0)}
                    onEnded={() => setIsPlaying(false)} />
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border">
                    <button
                      onClick={() => {
                        const el = audioPreviewRef.current;
                        if (!el) return;
                        if (isPlaying) { el.pause(); setIsPlaying(false); }
                        else {
                          el.volume = audioVolume / 100;
                          const effEnd = audioEnd > 0 ? audioEnd : audioDuration;
                          if (el.currentTime < audioStart || el.currentTime >= effEnd) el.currentTime = audioStart || 0;
                          el.play(); setIsPlaying(true);
                        }
                      }}
                      className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:opacity-90 transition-opacity flex-shrink-0">
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                    </button>
                    <button
                      onClick={() => { const next = audioVolume === 0 ? 80 : 0; setAudioVolume(next); if (audioPreviewRef.current) audioPreviewRef.current.volume = next / 100; }}
                      className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                      {audioVolume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input type="range" min="0" max="100" step="1" value={audioVolume}
                      onChange={e => { const v = Number(e.target.value); setAudioVolume(v); if (audioPreviewRef.current) audioPreviewRef.current.volume = v / 100; }}
                      className="flex-1 h-1.5 accent-primary cursor-pointer" />
                    <span className="text-xs font-mono text-muted-foreground w-9 text-right flex-shrink-0">{audioVolume}%</span>
                  </div>
                  <AudioClip audioSrc={`${API}/overlays/${audioFile}`} audioRef={audioPreviewRef}
                    duration={audioDuration} start={audioStart} end={audioEnd}
                    onStartChange={setAudioStart} onEndChange={setAudioEnd} onPause={() => setIsPlaying(false)} />
                </>
              )}
              {audioFile && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground">Lyrics / Karaoke</Label>
                      {srtFile && <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>}
                    </div>
                    <LyricsPanel sessionToken={SESSION_TOKEN} audioFile={audioFile}
                      onSrtReady={(ready) => {
                        if (ready) {
                          fetch(`${API}/api/assets/overlays/${SESSION_TOKEN}`).then(r => r.json()).then(d => setSrtFile(d.srt || null));
                        } else { setSrtFile(null); }
                      }} />
                  </div>
                </>
              )}
              </>}
            </CardContent>}
          </Card>
  );

  return (
    <div className="flex flex-col xl:h-[calc(100vh-5rem)] gap-3">

      {/* ── 3-column layout: Batches | Layout Editor | Config ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr_380px] gap-4 flex-1 min-h-0">

        {/* ── LEFT col (DOM first): Presets, banner, batch, files, log ── */}
        <div className="flex flex-col gap-2 xl:order-1 col-scroll min-h-0 [will-change:transform]">

          {/* Preset picker */}
          {presets && presets.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-primary" /> Presets
                </CardTitle>
                <CardDescription>Select a preset to load its settings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-1.5">
                  {presets.map(p => (
                    <button
                      key={p.id}
                      onClick={() => onApplyPreset?.(p)}
                      className={cn(
                        "flex items-center justify-between px-3 py-2.5 rounded-lg border text-left text-sm transition-all",
                        activePreset?.id === p.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/40 hover:bg-secondary/50"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {activePreset?.id === p.id
                          ? <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                          : <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30 flex-shrink-0" />
                        }
                        <span className={cn("font-medium truncate", activePreset?.id === p.id && "text-primary")}>{p.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        <Badge variant="secondary" className="text-xs mono">{p.resolution}</Badge>
                        {p.locked && <Lock className="w-3 h-3 text-yellow-400" />}
                      </div>
                    </button>
                  ))}
                </div>
                {activePreset && (
                  <button onClick={onClearPreset} className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Clear selection ×
                  </button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Active preset banner */}
          {activePreset && (
            <div className={cn(
              "rounded-lg border px-4 py-3 flex items-center justify-between",
              locked ? "border-yellow-500/30 bg-yellow-500/10" : "border-primary/30 bg-primary/10"
            )}>
              <div className="flex items-center gap-2 min-w-0">
                {locked ? <Lock className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" /> : <Sliders className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                <span className="text-sm font-semibold truncate">{activePreset.name}</span>
                <Badge className={cn("text-xs flex-shrink-0", locked
                  ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                  : "bg-primary/20 text-primary border-primary/30"
                )}>
                  {locked ? 'Locked' : 'Auto-saving'}
                </Badge>
              </div>
              <button onClick={onClearPreset} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 ml-2">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Batch picker */}
          <Card className={cn(!selectedBatch && "ring-1 ring-primary/40 glow-orange-sm")}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clapperboard className="w-4 h-4 text-primary" /> Batch
              </CardTitle>
              <CardDescription>Choose which batch of media files to use</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedBatch ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                    <span className="font-mono font-semibold text-sm text-primary truncate">{selectedBatch}</span>
                    {batchFiles.videos.length > 0 && <Badge variant="secondary" className="text-xs flex-shrink-0">{batchFiles.videos.length}v</Badge>}
                    {batchFiles.images.length > 0 && <Badge variant="secondary" className="text-xs flex-shrink-0">{batchFiles.images.length}i</Badge>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    <button onClick={() => setShowBatchPicker(true)} className="text-xs text-muted-foreground hover:text-primary transition-colors border border-border hover:border-primary/40 rounded-md px-2.5 py-1">
                      Switch
                    </button>
                    <button onClick={() => onSelectBatch(null)} className="text-xs text-muted-foreground hover:text-destructive transition-colors border border-border hover:border-destructive/40 rounded-md px-2.5 py-1">
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowBatchPicker(true)} className="w-full flex items-center justify-center gap-2 h-12 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/70 transition-all text-primary font-semibold text-sm">
                  <Clapperboard className="w-4 h-4" /> Select a Batch
                </button>
              )}
            </CardContent>
          </Card>

          {/* File pool */}
          {selectedBatch && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="text-primary font-mono text-xs">{selectedBatch}</span> — Files
                  </CardTitle>
                  <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-1">
                    <button onClick={() => setFileViewMode('list')}
                      className={cn("flex items-center justify-center w-7 h-7 rounded-md transition-all",
                        fileViewMode === 'list' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                      title="List view"><List className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setFileViewMode('grid')}
                      className={cn("flex items-center justify-center w-7 h-7 rounded-md transition-all",
                        fileViewMode === 'grid' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                      title="Grid view"><LayoutGrid className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {batchFiles.videos.length > 0 && batchType !== 'image' && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground">Videos</Label>
                      <div className="flex gap-2">
                        <button onClick={() => setAndSaveVideos(batchFiles.videos)} className="text-xs text-primary hover:underline">All</button>
                        <span className="text-muted-foreground text-xs">·</span>
                        <button onClick={() => setAndSaveVideos([])} className="text-xs text-muted-foreground hover:text-foreground">None</button>
                      </div>
                    </div>
                    {fileViewMode === 'list' ? (
                      <div className="grid gap-1">
                        {pagedVideos.map(f => (
                          <FileToggle key={f} name={f} selected={selectedVideos.includes(f)}
                            onToggle={() => setAndSaveVideos(selectedVideos.includes(f) ? selectedVideos.filter(x => x !== f) : [...selectedVideos, f])}
                            color="blue" />
                        ))}
                      </div>
                    ) : (
                      <div style={{ columns: '3 80px', columnGap: 6 }}>
                        {pagedVideos.map(f => (
                          <div key={f} style={{ breakInside: 'avoid', marginBottom: 6 }}>
                            <BatchFileGridCell name={f}
                              src={`${API}/batches-media/${selectedBatch}/videos/${encodeURIComponent(f)}`}
                              isVideo selected={selectedVideos.includes(f)}
                              onToggle={() => setAndSaveVideos(selectedVideos.includes(f) ? selectedVideos.filter(x => x !== f) : [...selectedVideos, f])}
                              onPreview={() => setFileLightboxSrc(`${API}/batches-media/${selectedBatch}/videos/${encodeURIComponent(f)}`)} />
                          </div>
                        ))}
                      </div>
                    )}
                    {videoPageCount > 1 && (
                      <FilePagination page={videoFilePage} pageCount={videoPageCount} onPage={setVideoFilePage} total={batchFiles.videos.length} />
                    )}
                  </div>
                )}
                {batchFiles.images.length > 0 && batchType !== 'video' && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground">Images</Label>
                      <div className="flex gap-2">
                        <button onClick={() => setAndSaveImages(batchFiles.images)} className="text-xs text-primary hover:underline">All</button>
                        <span className="text-muted-foreground text-xs">·</span>
                        <button onClick={() => setAndSaveImages([])} className="text-xs text-muted-foreground hover:text-foreground">None</button>
                      </div>
                    </div>
                    {fileViewMode === 'list' ? (
                      <div className="grid gap-1">
                        {pagedImages.map(f => (
                          <FileToggle key={f} name={f} selected={selectedImages.includes(f)}
                            onToggle={() => setAndSaveImages(selectedImages.includes(f) ? selectedImages.filter(x => x !== f) : [...selectedImages, f])}
                            color="purple" />
                        ))}
                      </div>
                    ) : (
                      <div style={{ columns: '3 80px', columnGap: 6 }}>
                        {pagedImages.map(f => (
                          <div key={f} style={{ breakInside: 'avoid', marginBottom: 6 }}>
                            <BatchFileGridCell name={f}
                              src={`${API}/batches-media/${selectedBatch}/images/${encodeURIComponent(f)}`}
                              isVideo={false} selected={selectedImages.includes(f)}
                              onToggle={() => setAndSaveImages(selectedImages.includes(f) ? selectedImages.filter(x => x !== f) : [...selectedImages, f])}
                              onPreview={() => setFileLightboxSrc(`${API}/batches-media/${selectedBatch}/images/${encodeURIComponent(f)}`)} />
                          </div>
                        ))}
                      </div>
                    )}
                    {imagePageCount > 1 && (
                      <FilePagination page={imageFilePage} pageCount={imagePageCount} onPage={setImageFilePage} total={batchFiles.images.length} />
                    )}
                  </div>
                )}
                {batchFiles.videos.length === 0 && batchFiles.images.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No files in this batch yet.</p>
                )}
              </CardContent>
            </Card>
          )}

          {fileLightboxSrc && (
            <MediaLightbox src={fileLightboxSrc} onClose={() => setFileLightboxSrc(null)} />
          )}

        </div>{/* end LEFT col */}

        {/* ── CENTER col: Layout Editor ── */}
        <div className="min-w-0 xl:order-2 overflow-hidden flex flex-col gap-2 min-h-0">
          {selectedResolutions.length > 1 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {selectedResolutions.map(res => (
                <button key={res} onClick={() => setActiveLayoutRes(res)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-mono font-semibold transition-all border",
                    activeLayoutRes === res
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-muted-foreground border-border hover:text-foreground hover:border-primary/40"
                  )}>
                  {RESOLUTION_ICONS[res] && <span className="mr-1">{RESOLUTION_ICONS[res]}</span>}{res}
                </button>
              ))}
            </div>
          )}
          <LayoutEditor
            key={activeLayoutRes}
            preset={layoutPreset}
            onLayoutChange={handleLayoutChange}
            onFontChange={(patch) => { if (patch.fontFamily) { setAndSaveFontFamily(patch.fontFamily); } }}
            previewBgUrl={previewBgUrl}
            previewBgIsVideo={previewBgIsVideo}
            locked={locked}
            previewText={quotesMode === 'library' ? libraryQuotes[0]?.text : quotes.split('\n').find(l => l.trim())}
            imageFilter={imageFilter}
            sidebarDefaultOpen={false}
            generateButton={
              <Button className="w-full h-14 text-base font-bold gap-2 shadow-lg"
                onClick={generate} disabled={generating || !hasContent}>
                {generating ? (
                  <><RefreshCw className="w-5 h-5 animate-spin" /> Generating…</>
                ) : (
                  <><Play className="w-5 h-5" /> Generate {totalVideos > 1 ? `${totalVideos} Videos` : 'Video'}</>
                )}
              </Button>
            }
          />
        </div>{/* end CENTER col */}

        {/* ── RIGHT col: Configuration parameters ── */}
        <div className="flex flex-col gap-2 xl:order-3 col-scroll min-h-0">
          {layoutSidebarContent}
          {audioCard}
        </div>{/* end RIGHT col */}

      </div>{/* end grid */}

      {/* ── Generation log — full width below both columns ── */}
      <div className={cn("flex-shrink-0 rounded-xl border border-border overflow-hidden bg-card flex flex-col", logOpen && "h-52")}>
        <button onClick={() => setLogOpen(v => !v)} className="px-4 py-2.5 flex items-center justify-between w-full text-left hover:bg-secondary/20 transition-colors">
          <div className="flex items-center gap-2">
            <Clapperboard className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Generation Log</span>
          </div>
          <div className="flex items-center gap-2">
            {jobs.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {jobs.filter(j => j.status === 'running').length > 0
                  ? `${jobs.filter(j => j.status === 'running').length} running`
                  : `${jobs.length} job${jobs.length !== 1 ? 's' : ''}`}
              </Badge>
            )}
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", logOpen && "rotate-180")} />
          </div>
        </button>
        {logOpen && (jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 px-6 text-center border-t border-border">
            <div className="w-10 h-10 rounded-full bg-secondary/50 flex items-center justify-center mb-3">
              <Play className="w-4 h-4 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Ready to generate</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {!selectedBatch ? 'Select a batch to get started' : !hasContent ? 'Select files from the batch' : 'Click Generate when ready'}
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-3 overflow-y-auto flex-1 border-t border-border">
            {jobs.map(j => <JobStatus key={j.id} job={j} />)}
          </div>
        ))}
      </div>

      {showBatchPicker && (
        <BatchPickerModal
          batches={batches}
          onSelect={onSelectBatch}
          onClose={() => setShowBatchPicker(false)}
        />
      )}
    </div>
  );
}

function formatTime(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function AudioClip({ audioSrc, audioRef, duration, start, end, onStartChange, onEndChange, onPause }) {
  const canvasRef          = useRef(null);
  const containerRef       = useRef(null);
  const draggingRef        = useRef(null);
  const playheadHandleRef  = useRef(null); // draggable playhead div
  const playheadLabelRef   = useRef(null); // floating time label
  const drawRef            = useRef(null); // always points to latest draw fn
  const latestRef          = useRef({});   // always holds latest props/state

  const [waveform, setWaveform] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [dragging, setDragging] = useState(null);

  const effectiveEnd = end > 0 ? end : duration;
  const startPct     = duration > 0 ? (start / duration) * 100 : 0;
  const endPct       = duration > 0 ? (effectiveEnd / duration) * 100 : 100;
  const hasClip      = start > 0 || (end > 0 && end < duration);

  // Always keep the latest values accessible inside the rAF loop
  latestRef.current = { waveform, start, end, duration, onPause };

  // ── Draw fn assigned to ref — rAF calls drawRef.current() so it's always fresh ──
  drawRef.current = () => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    const { waveform, start, end, duration, onPause } = latestRef.current;
    if (!canvas || !container || !waveform) return;

    const dpr  = window.devicePixelRatio || 1;
    const W    = container.clientWidth;
    const H    = container.clientHeight;

    // Resize canvas only when dimensions actually changed
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const primary      = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
    const effectiveEnd = end > 0 ? end : duration;
    const startRatio   = duration > 0 ? start / duration : 0;
    const endRatio     = duration > 0 ? effectiveEnd / duration : 1;
    const barW         = W / waveform.length;

    // Waveform bars
    waveform.forEach((amp, i) => {
      const ratio   = i / waveform.length;
      const x       = ratio * W;
      const bH      = Math.max(2, amp * H * 0.88);
      const y       = (H - bH) / 2;
      const inRange = ratio >= startRatio && ratio <= endRatio;
      ctx.fillStyle = inRange ? `hsl(${primary})` : `hsl(${primary} / 0.18)`;
      ctx.fillRect(x + 0.5, y, Math.max(1, barW - 1), bH);
    });

    // Stop playback at clip end
    const el = audioRef?.current;
    if (el && !el.paused && end > 0 && el.currentTime >= end) {
      el.pause();
      onPause?.();
    }

    // Playhead — always draw when audio is loaded
    if (el && duration > 0 && el.readyState >= 1) {
      const ct = el.currentTime;
      const px = (ct / duration) * W;

      // Thin white line on canvas
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(px - 1, 0, 2, H);

      // Position draggable handle div via direct DOM — no React re-render at 60fps
      if (playheadHandleRef.current) {
        playheadHandleRef.current.style.left    = `${px - 6}px`;
        playheadHandleRef.current.style.display = '';
      }

      // Update playhead label via direct DOM manipulation — avoids 60fps re-renders
      if (playheadLabelRef.current) {
        playheadLabelRef.current.textContent = formatTime(ct);
        playheadLabelRef.current.style.display = '';
        // Position the label under the playhead, clamped to container edges
        const labelW = 36;
        const left   = Math.max(0, Math.min(px - labelW / 2, W - labelW));
        playheadLabelRef.current.style.left = `${left}px`;
      }
      // Hide label when paused
      if (el.paused && playheadLabelRef.current) playheadLabelRef.current.style.display = 'none';
    } else {
      if (playheadHandleRef.current) playheadHandleRef.current.style.display = 'none';
      if (playheadLabelRef.current)  playheadLabelRef.current.style.display  = 'none';
    }
  };

  // ── Single persistent rAF loop — setup once, never re-created ───────────────
  useEffect(() => {
    let raf;
    const loop = () => { drawRef.current?.(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line

  // ── ResizeObserver ───────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => drawRef.current?.());
    ro.observe(container);
    return () => ro.disconnect();
  }, []); // eslint-disable-line

  // ── Decode audio → waveform peaks ───────────────────────────────────────────
  useEffect(() => {
    if (!audioSrc) return;
    let cancelled = false;
    setLoading(true);
    setWaveform(null);

    const actx = new (window.AudioContext || window.webkitAudioContext)();
    fetch(audioSrc)
      .then(r => r.arrayBuffer())
      .then(buf => actx.decodeAudioData(buf))
      .then(decoded => {
        if (cancelled) return;
        const raw   = decoded.getChannelData(0);
        const BINS  = 220;
        const block = Math.floor(raw.length / BINS);
        const peaks = Array.from({ length: BINS }, (_, i) => {
          let max = 0;
          for (let j = 0; j < block; j++) {
            const v = Math.abs(raw[i * block + j]);
            if (v > max) max = v;
          }
          return max;
        });
        const globalMax = Math.max(...peaks, 0.001);
        setWaveform(peaks.map(p => p / globalMax));
      })
      .catch(() => {})
      .finally(() => { setLoading(false); actx.close().catch(() => {}); });

    return () => { cancelled = true; };
  }, [audioSrc]);

  // ── Drag logic ───────────────────────────────────────────────────────────────
  const getTime = useCallback((clientX) => {
    const rect  = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * latestRef.current.duration;
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      const h = draggingRef.current;
      if (!h) return;
      const { start, end, duration } = latestRef.current;
      const effEnd = end > 0 ? end : duration;
      const t = getTime(e.clientX);
      if (h === 'start') {
        onStartChange(Math.max(0, Math.min(t, effEnd - 0.5)));
      } else if (h === 'end') {
        onEndChange(Math.max(start + 0.5, Math.min(t, duration)));
      } else if (h === 'playhead') {
        const el = audioRef?.current;
        if (el) el.currentTime = Math.max(start, Math.min(t, effEnd));
      }
    };
    const onUp = () => { draggingRef.current = null; setDragging(null); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [getTime, onStartChange, onEndChange]);

  const startDrag = (handle) => (e) => {
    e.preventDefault();
    draggingRef.current = handle;
    setDragging(handle);
  };

  return (
    <div className="space-y-2 p-3 rounded-lg bg-secondary/50 border border-border">

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
          <Scissors className="w-3.5 h-3.5" /> Clip Range
        </span>
        <div className="flex items-center gap-3">
          {hasClip && (
            <span className="text-xs font-mono text-primary">
              {formatTime(effectiveEnd - start)} selected
            </span>
          )}
          <span className="text-xs text-muted-foreground font-mono">{formatTime(duration)}</span>
          {hasClip && (
            <button
              onClick={() => { onStartChange(0); onEndChange(0); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Waveform canvas + handles */}
      <div
        ref={containerRef}
        className="relative h-16 rounded-md overflow-hidden bg-muted/30"
        style={{ cursor: dragging ? 'ew-resize' : 'crosshair' }}
        onMouseDown={(e) => {
          // Skip if clicking on a drag handle
          if (e.target.closest('[data-handle]')) return;
          const el = audioRef?.current;
          if (!el || !latestRef.current.duration) return;
          const { start, end, duration: dur } = latestRef.current;
          const effEnd = end > 0 ? end : dur;
          const rect   = containerRef.current.getBoundingClientRect();
          const ratio  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          el.currentTime = Math.max(start, Math.min(ratio * dur, effEnd));
        }}
      >
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analyzing audio…
          </div>
        ) : (
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        )}

        {/* Shaded regions outside selection */}
        {!loading && (
          <>
            <div className="absolute inset-y-0 left-0 bg-background/50 pointer-events-none"
              style={{ width: `${startPct}%` }} />
            <div className="absolute inset-y-0 right-0 bg-background/50 pointer-events-none"
              style={{ left: `${endPct}%` }} />
          </>
        )}

        {/* Start handle */}
        {!loading && (
          <div
            data-handle
            className="absolute inset-y-0 z-10 flex items-center justify-center cursor-ew-resize"
            style={{ left: `calc(${startPct}% - 6px)`, width: 12 }}
            onMouseDown={startDrag('start')}
          >
            <div className="w-[2px] h-full bg-primary" />
            <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-7 bg-primary rounded flex items-center justify-center gap-[2px] shadow-md">
              <div className="w-px h-3 bg-primary-foreground/60 rounded-full" />
              <div className="w-px h-3 bg-primary-foreground/60 rounded-full" />
            </div>
          </div>
        )}

        {/* End handle */}
        {!loading && (
          <div
            data-handle
            className="absolute inset-y-0 z-10 flex items-center justify-center cursor-ew-resize"
            style={{ left: `calc(${endPct}% - 6px)`, width: 12 }}
            onMouseDown={startDrag('end')}
          >
            <div className="w-[2px] h-full bg-primary" />
            <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-7 bg-primary rounded flex items-center justify-center gap-[2px] shadow-md">
              <div className="w-px h-3 bg-primary-foreground/60 rounded-full" />
              <div className="w-px h-3 bg-primary-foreground/60 rounded-full" />
            </div>
          </div>
        )}

        {/* Draggable playhead handle — positioned via direct DOM ref in rAF loop */}
        <div
          ref={playheadHandleRef}
          data-handle
          onMouseDown={startDrag('playhead')}
          className="absolute inset-y-0 z-20 flex items-center justify-center cursor-grab active:cursor-grabbing"
          style={{ width: 12, display: 'none' }}
        >
          <div className="w-3 h-3 rounded-full bg-white shadow-md border border-white/40 mt-[-20px] relative top-0" style={{ marginTop: 4 }} />
        </div>

        {/* Playhead time label — positioned absolutely, updated via direct DOM ref */}
        <span
          ref={playheadLabelRef}
          className="absolute bottom-1 text-[10px] font-mono font-semibold text-white drop-shadow pointer-events-none z-20"
          style={{ display: 'none' }}
        />
      </div>

      {/* Start / end time labels */}
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-primary">{formatTime(start)}</span>
        <span className="text-muted-foreground">{formatTime(effectiveEnd)}</span>
      </div>
    </div>
  );
}

function BatchFileGridCell({ name, src, isVideo, selected, onToggle, onPreview }) {
  const [hovered, setHovered] = useState(false);
  const videoRef      = useRef(null);
  const playPromise   = useRef(null);

  const handleMouseEnter = () => {
    setHovered(true);
    if (isVideo && videoRef.current) {
      videoRef.current.currentTime = 0;
      playPromise.current = videoRef.current.play().catch(() => {});
    }
  };
  const handleMouseLeave = () => {
    setHovered(false);
    if (isVideo && videoRef.current) {
      const v = videoRef.current;
      if (playPromise.current) {
        playPromise.current.then(() => { v.pause(); v.currentTime = 0; }).catch(() => {});
        playPromise.current = null;
      } else {
        v.pause();
        v.currentTime = 0;
      }
    }
  };

  return (
    <div
      className={cn(
        "relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all",
        selected ? "border-primary" : "border-border"
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onToggle}
    >
      {isVideo ? (
        <video ref={videoRef} src={src} className="w-full h-auto block" preload="metadata" muted loop playsInline />
      ) : (
        <img src={src} alt={name} className="w-full h-auto block" loading="lazy" />
      )}

      {/* Selected checkmark */}
      {selected && (
        <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center pointer-events-none">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Hover overlay */}
      <div className={cn(
        "absolute inset-0 bg-black/50 flex flex-col justify-between p-1.5 transition-opacity",
        hovered ? "opacity-100" : "opacity-0"
      )}>
        <div className="flex justify-end">
          <button
            onClick={e => { e.stopPropagation(); onPreview(); }}
            className="w-6 h-6 rounded-md bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
            title="Preview"
          >
            <Eye className="w-3 h-3 text-white" />
          </button>
        </div>
        <p className="text-[9px] text-white font-mono leading-tight line-clamp-2 break-all">{name}</p>
      </div>
    </div>
  );
}

function FilePagination({ page, pageCount, onPage, total }) {
  return (
    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
      <button
        onClick={() => onPage(p => Math.max(0, p - 1))}
        disabled={page === 0}
        className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded border border-border hover:border-primary/40 transition-all"
      >← Prev</button>
      <span className="text-xs text-muted-foreground">
        {page + 1} / {pageCount} <span className="text-muted-foreground/50">({total})</span>
      </span>
      <button
        onClick={() => onPage(p => Math.min(pageCount - 1, p + 1))}
        disabled={page === pageCount - 1}
        className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded border border-border hover:border-primary/40 transition-all"
      >Next →</button>
    </div>
  );
}

function FileToggle({ name, selected, onToggle, color }) {
  const colorMap = {
    blue: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
    purple: 'border-purple-500/40 bg-purple-500/10 text-purple-300',
  };
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md border text-xs transition-all text-left w-full",
        selected ? colorMap[color] : "border-border bg-transparent text-muted-foreground hover:border-border/80"
      )}
    >
      <div className={cn("w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0",
        selected ? "border-current bg-current/20" : "border-muted-foreground/40")}>
        {selected && <Check className="w-2.5 h-2.5" />}
      </div>
      <span className="mono truncate">{name}</span>
    </button>
  );
}

function JobStatus({ job }) {
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [aborting, setAborting] = useState(false);
  const statusColors = { queued: 'status-queued', running: 'status-running', done: 'status-done', error: 'status-error', cancelled: 'status-error' };
  const multiFile = job.status === 'done' && job.outputFiles?.length > 1;
  const singleFile = job.status === 'done' && job.outputFile && !multiFile;
  const canAbort = job.status === 'queued' || job.status === 'running';

  const abort = async () => {
    setAborting(true);
    try { await fetch(`${API}/api/jobs/${job.id}/abort`, { method: 'POST' }); } catch {}
    setAborting(false);
  };

  return (
    <>
    <Card className={cn("slide-up", job.status === 'running' && 'glow-orange-sm')}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {job.status === 'running'   && <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />}
            {job.status === 'queued'    && <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />}
            {job.status === 'done'      && <Check className="w-3.5 h-3.5 text-green-400" />}
            {job.status === 'error'     && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
            {job.status === 'cancelled' && <StopCircle className="w-3.5 h-3.5 text-red-400" />}
            <span className="text-sm font-semibold">Job {job.id.slice(0, 8)}...</span>
            {job.resolution && (
              <Badge variant="secondary" className="text-xs mono">{job.resolution}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canAbort && (
              <button
                onClick={abort}
                disabled={aborting}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 border border-border hover:border-red-500/40 rounded px-1.5 py-0.5 transition-colors"
              >
                <StopCircle className="w-3 h-3" /> {aborting ? 'Aborting…' : 'Abort'}
              </button>
            )}
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold", statusColors[job.status])}>
              {job.status.toUpperCase()}
            </span>
          </div>
        </div>

        {(job.status === 'running' || job.status === 'done') && <Progress value={job.progress} className="h-1.5" />}

        {job.log?.length > 0 && (
          <div className="bg-muted rounded-md p-3 max-h-32 overflow-y-auto">
            {job.log.map((line, i) => (
              <div key={i} className={cn("text-xs mono", line.startsWith('ERROR') ? 'text-red-400' : 'text-muted-foreground')}>{line}</div>
            ))}
          </div>
        )}

        {/* Multi-video outputs */}
        {multiFile && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">
              {job.outputFiles.length} videos generated{job.outputFolder ? ` → ${job.outputFolder}/` : ''}
            </p>
            {job.outputFiles.map((f) => (
              <div key={f} className="space-y-0">
                <div className="flex gap-1">
                  <button
                    onClick={() => setLightboxSrc(`http://localhost:5001/outputs/${f}`)}
                    className="flex items-center justify-center px-2 h-9 rounded-md bg-green-500/20 border border-green-500/40 text-green-400 hover:bg-green-500/30 transition-colors flex-shrink-0"
                    title="Preview"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={`http://localhost:5001/outputs/${f}`}
                    download
                    className="flex items-center justify-between gap-2 flex-1 px-3 h-9 rounded-md bg-green-500/20 border border-green-500/40 text-green-400 text-xs font-semibold hover:bg-green-500/30 transition-colors"
                  >
                    <span className="mono truncate">{f.split('/').pop()}</span>
                    <Download className="w-3.5 h-3.5 flex-shrink-0" />
                  </a>
                </div>
                <VideoMetadataPanel
                  jobId={job.id}
                  file={f}
                  resolution={job.resolution}
                  initialMetadata={job.videoMetadata?.[f] || null}
                  initialQuote={(job.videoQuotes || []).find(v => v.file === f)?.quote || ''}
                />
              </div>
            ))}
          </div>
        )}

        {/* Single-video output */}
        {singleFile && (
          <div className="space-y-0">
            <div className="flex gap-1">
              <button
                onClick={() => setLightboxSrc(`http://localhost:5001/outputs/${job.outputFile}`)}
                className="flex items-center justify-center px-3 h-10 rounded-md bg-green-500/20 border border-green-500/40 text-green-400 hover:bg-green-500/30 transition-colors flex-shrink-0"
                title="Preview"
              >
                <Play className="w-4 h-4" />
              </button>
              <a
                href={`http://localhost:5001/outputs/${job.outputFile}`}
                download
                className="flex items-center justify-center gap-2 flex-1 h-10 rounded-md bg-green-500/20 border border-green-500/40 text-green-400 text-sm font-semibold hover:bg-green-500/30 transition-colors"
              >
                <Download className="w-4 h-4" /> Download {job.outputFile}
              </a>
            </div>
            <VideoMetadataPanel
              jobId={job.id}
              file={job.outputFile}
              resolution={job.resolution}
              initialMetadata={job.videoMetadata?.[job.outputFile] || null}
              initialQuote={(job.videoQuotes || []).find(v => v.file === job.outputFile)?.quote || ''}
            />
          </div>
        )}
      </CardContent>
    </Card>

    {lightboxSrc && (
      <MediaLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    )}
    </>
  );
}
