import React, { useState, useEffect, useRef, useCallback } from 'react';
import VideoMetadataPanel from './VideoMetadataPanel';
import MediaLightbox from './MediaLightbox';
import BatchPickerModal from './BatchPickerModal';
import LyricsPanel from './LyricsPanel';
import FontPicker from './FontPicker';
import LayoutEditor from './LayoutEditor';
import {
  Clapperboard, Play, Pause, Upload, RefreshCw, Check, AlertCircle,
  Download, Trash2, Music, Monitor, FileText, Sliders, Lock, X, Type, Sparkles,
  Film, Image, Volume2, VolumeX, Scissors, LayoutGrid, List, Eye, Hash,
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
  const [quotes, setQuotes]                     = useState('');
  const [fontFamily, setFontFamily]             = useState('default');
  const [fontSize, setFontSize]                 = useState('52');
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
  const [fileViewMode, setFileViewMode]         = useState('list'); // 'list' | 'grid'
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

  const [localLayouts, setLocalLayouts]         = useState({ '1920x1080': DEFAULT_VIDEO_LAYOUT });
  const [activeLayoutRes, setActiveLayoutRes]   = useState('1920x1080');

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
    try {
      const baseParams = {
        batchName: selectedBatch,
        videoFiles: selectedVideos,
        imageFiles: selectedImages,
        quotes,
        fontFamily,
        fontSize: Number(fontSize) || 52,
        textMaxChars: Number(textMaxChars) || 0,
        preferredDuration: Number(preferredDuration) || 0,
        sliceDuration: Number(sliceDuration) || 3,
        imageDuration: Number(imageDuration) || 0.2,
        audioVolume: audioVolume / 100,
        audioStart: audioStart || 0,
        audioEnd: audioEnd || 0,
        sessionToken: SESSION_TOKEN,
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
  return (
    <div className="space-y-4">

      {/* ── 3-column layout: Layout Editor | Config | Batch + Generate + Log ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(260px,1fr)] gap-5 items-start">

        {/* ── COL 1: Layout Editor (always visible) ────────────────────────── */}
        <div className="space-y-4 min-w-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Hash className="w-4 h-4 text-primary" /> Layout Editor
              </CardTitle>
              <CardDescription>
                Drag elements to reposition · Select an element to adjust alignment, font &amp; bold
                {!activePreset && ' · Changes are local until a preset is applied'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedResolutions.length > 1 && (
                <div className="flex flex-wrap gap-1 mb-3">
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
                stacked
                locked={locked}
              />
            </CardContent>
          </Card>
        </div>{/* end COL 1 */}

        {/* ── COL 2: Config ────────────────────────────────────────────────── */}
        <div className="space-y-4 min-w-0">

          {/* Resolution */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Monitor className="w-4 h-4 text-primary" /> Resolution
                {selectedResolutions.length > 1 && (
                  <Badge className="text-xs bg-primary/20 text-primary border-primary/30">{selectedResolutions.length} resolutions</Badge>
                )}
              </CardTitle>
              <CardDescription>Each selected resolution generates a separate video</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Generation Config */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Generation Config</CardTitle>
              <CardDescription>Media type and timing settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Source Media</Label>
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
            </CardContent>
          </Card>

          {/* Quotes & Text */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" /> Quotes &amp; Text
                  </CardTitle>
                  <CardDescription>One per line — each video picks one at random</CardDescription>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {srtFile && <span className="text-xs text-yellow-400 hidden sm:flex items-center gap-1"><FileText className="w-3 h-3" /> SRT overrides</span>}
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
                    className="h-7 px-2.5 text-xs gap-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-0 shadow-md shadow-violet-500/20 disabled:opacity-50"
                  >
                    {generatingQuotes ? <><RefreshCw className="w-3 h-3 animate-spin" /> AI…</> : <><Sparkles className="w-3 h-3" /> AI ({totalVideos})</>}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => quotesFileRef.current?.click()} disabled={!!srtFile} className="h-7 px-2 text-xs">
                    <Upload className="w-3 h-3" />
                  </Button>
                  <input ref={quotesFileRef} type="file" accept=".txt" className="hidden"
                    onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setAndSaveQuotes(ev.target.result); r.readAsText(f); e.target.value = ''; }} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>

          {/* Logo + Subtitles */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" /> Logo
                </CardTitle>
                <CardDescription>Overlaid on every video</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                    {uploadingLogo ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    {logoFile ? 'Replace' : 'Upload'}
                  </Button>
                  {logoFile && <span className="text-xs text-green-400 flex items-center gap-1 truncate max-w-[120px]"><Check className="w-3 h-3 flex-shrink-0" />{logoFile}</span>}
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && uploadLogo(e.target.files[0])} />
                </div>
              </CardContent>
            </Card>

            <Card className={cn(srtFile && "border-yellow-500/30")}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" /> Subtitles
                  {srtFile && <Badge className="text-xs bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Active</Badge>}
                </CardTitle>
                <CardDescription>SRT overrides quote text</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => srtInputRef.current?.click()} disabled={uploadingSrt}>
                    {uploadingSrt ? <RefreshCw className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                    {srtFile ? 'Replace' : 'Upload .srt'}
                  </Button>
                  {srtFile && (
                    <>
                      <span className="text-xs text-yellow-400 flex items-center gap-1 truncate max-w-[80px]"><Check className="w-3 h-3 flex-shrink-0" />{srtFile}</span>
                      <button onClick={() => removeOverlay('srt')} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                  <input ref={srtInputRef} type="file" accept=".srt" className="hidden" onChange={e => e.target.files[0] && uploadSrt(e.target.files[0])} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Background Audio */}
          <Card className={cn(audioFile && "border-primary/30")}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Music className="w-4 h-4 text-primary" /> Background Audio
                <Badge variant="secondary" className="text-xs">Optional</Badge>
                {audioFile && <Badge className="text-xs bg-primary/20 text-primary border-primary/30">Active</Badge>}
              </CardTitle>
              <CardDescription>MP3 mixed into the output</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>

        </div>{/* end COL 2 */}

        {/* ── COL 3: Batch + Generate + Log (sticky) ───────────────────────── */}
        <div className="space-y-4 xl:sticky xl:top-20 [will-change:transform]">

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
                  <button onClick={() => setShowBatchPicker(true)} className="text-xs text-muted-foreground hover:text-primary transition-colors border border-border hover:border-primary/40 rounded-md px-2.5 py-1 flex-shrink-0 ml-2">
                    Switch
                  </button>
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
                {batchFiles.videos.length > 0 && (
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
                      <div className="grid gap-1 max-h-40 overflow-y-auto pr-1">
                        {batchFiles.videos.map(f => (
                          <FileToggle key={f} name={f} selected={selectedVideos.includes(f)}
                            onToggle={() => setAndSaveVideos(selectedVideos.includes(f) ? selectedVideos.filter(x => x !== f) : [...selectedVideos, f])}
                            color="blue" />
                        ))}
                      </div>
                    ) : (
                      <div style={{ columns: '3 80px', columnGap: 6 }}>
                        {batchFiles.videos.map(f => (
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
                  </div>
                )}
                {batchFiles.images.length > 0 && (
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
                      <div className="grid gap-1 max-h-40 overflow-y-auto pr-1">
                        {batchFiles.images.map(f => (
                          <FileToggle key={f} name={f} selected={selectedImages.includes(f)}
                            onToggle={() => setAndSaveImages(selectedImages.includes(f) ? selectedImages.filter(x => x !== f) : [...selectedImages, f])}
                            color="purple" />
                        ))}
                      </div>
                    ) : (
                      <div style={{ columns: '3 80px', columnGap: 6 }}>
                        {batchFiles.images.map(f => (
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
                  </div>
                )}
                {batchFiles.videos.length === 0 && batchFiles.images.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No files in this batch yet.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Generate button */}
          <Button className="w-full h-14 text-base font-bold gap-2 shadow-lg"
            onClick={generate} disabled={generating || !hasContent}>
            {generating ? (
              <><RefreshCw className="w-5 h-5 animate-spin" /> Generating…</>
            ) : (
              <><Play className="w-5 h-5" /> Generate {totalVideos > 1 ? `${totalVideos} Videos` : 'Video'}</>
            )}
          </Button>

          {/* Generation log */}
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clapperboard className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Generation Log</span>
              </div>
              {jobs.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {jobs.filter(j => j.status === 'running').length > 0
                    ? `${jobs.filter(j => j.status === 'running').length} running`
                    : `${jobs.length} job${jobs.length !== 1 ? 's' : ''}`}
                </Badge>
              )}
            </div>
            {jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                <div className="w-10 h-10 rounded-full bg-secondary/50 flex items-center justify-center mb-3">
                  <Play className="w-4 h-4 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Ready to generate</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {!selectedBatch ? 'Select a batch to get started' : !hasContent ? 'Select files from the batch' : 'Click Generate when ready'}
                </p>
              </div>
            ) : (
              <div className="p-3 space-y-3 max-h-96 overflow-y-auto">
                {jobs.map(j => <JobStatus key={j.id} job={j} />)}
              </div>
            )}
          </div>

          {fileLightboxSrc && (
            <MediaLightbox src={fileLightboxSrc} onClose={() => setFileLightboxSrc(null)} />
          )}

        </div>{/* end COL 3 */}

      </div>{/* end grid */}

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
  const statusColors = { queued: 'status-queued', running: 'status-running', done: 'status-done', error: 'status-error' };
  const multiFile = job.status === 'done' && job.outputFiles?.length > 1;
  const singleFile = job.status === 'done' && job.outputFile && !multiFile;

  return (
    <>
    <Card className={cn("slide-up", job.status === 'running' && 'glow-orange-sm')}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {job.status === 'running' && <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />}
            {job.status === 'done'    && <Check className="w-3.5 h-3.5 text-green-400" />}
            {job.status === 'error'   && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
            <span className="text-sm font-semibold">Job {job.id.slice(0, 8)}...</span>
            {job.resolution && (
              <Badge variant="secondary" className="text-xs mono">{job.resolution}</Badge>
            )}
          </div>
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold", statusColors[job.status])}>
            {job.status.toUpperCase()}
          </span>
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
