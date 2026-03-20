import React, { useState, useEffect, useRef, useCallback } from 'react';
import LyricsPanel from './LyricsPanel';
import FontPicker from './FontPicker';
import {
  Clapperboard, Play, Upload, RefreshCw, Check, AlertCircle,
  Download, Trash2, Music, Monitor, FileText, Sliders, Lock, X, Type, Sparkles,
  Film, Image
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

export default function GeneratePanel({ selectedBatch, fileRefreshTrigger, activePreset, onPresetUpdated, onClearPreset, onJobComplete, presets, onApplyPreset, onOpenBatches }) {
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
  const [logoFile, setLogoFile]                 = useState(null);
  const [uploadingLogo, setUploadingLogo]       = useState(false);

  const [srtFile, setSrtFile]                   = useState(null);
  const [audioFile, setAudioFile]               = useState(null);
  const [uploadingSrt, setUploadingSrt]         = useState(false);
  const [uploadingAudio, setUploadingAudio]     = useState(false);

  const [generating, setGenerating]             = useState(false);
  const [jobIds, setJobIds]                     = useState([]);
  const [jobs, setJobs]                         = useState([]);
  const [generatingQuotes, setGeneratingQuotes] = useState(false);
  const [aiQuoteError, setAiQuoteError]         = useState(null);
  const logoInputRef   = useRef();
  const srtInputRef    = useRef();
  const quotesFileRef  = useRef();
  const audioInputRef  = useRef();
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

  // Wrapped setters that also save back to preset
  const toggleResolution = (key) => {
    setSelectedResolutions(prev => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev;
        return prev.filter(r => r !== key);
      }
      const next = [...prev, key];
      setResolutionCounts(c => ({ ...c, [key]: c[key] ?? 1 }));
      return next;
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
        });
    }
  }, [selectedBatch, fileRefreshTrigger]);

  // Load logo + overlay files
  useEffect(() => {
    fetch(`${API}/api/assets/logo`).then(r => r.json()).then(d => setLogoFile(d.logo));
    fetch(`${API}/api/assets/overlays/${SESSION_TOKEN}`).then(r => r.json()).then(d => {
      setSrtFile(d.srt || null);
      setAudioFile(d.audio || null);
    });
  }, []);

  // Poll all active job statuses
  useEffect(() => {
    if (!jobIds.length) return;
    const poll = async () => {
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
      setAudioFile(file.name);
    } finally { setUploadingAudio(false); }
  };

  const removeOverlay = async (type) => {
    await fetch(`${API}/api/assets/overlays/${SESSION_TOKEN}/${type}`, { method: 'DELETE' });
    if (type === 'srt') setSrtFile(null);
    else setAudioFile(null);
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
        sessionToken: SESSION_TOKEN,
        presetId: activePreset?.id || null,
      };
      const ids = await Promise.all(
        selectedResolutions.map(async (res) => {
          const count = resolutionCounts[res] ?? 1;
          const r = await fetch(`${API}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...baseParams, resolution: res, videoCount: count }),
          });
          const { jobId } = await r.json();
          return jobId;
        })
      );
      setJobIds(ids);
    } catch { setGenerating(false); }
  };

  const hasContent = selectedVideos.length > 0 || selectedImages.length > 0;

  // Pre-compute generate button label (avoid IIFE in JSX)
  const totalVideos = selectedResolutions.reduce((sum, r) => sum + (resolutionCounts[r] ?? 1), 0);
  const btnResLabel = selectedResolutions.map(r => {
    const c = resolutionCounts[r] ?? 1;
    return c > 1 ? `${c}×${r}` : r;
  }).join(', ');

  return (
    <div className="space-y-4">

      {/* ── Preset picker (full width) ───────────────────────────────────────── */}
      {presets && presets.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sliders className="w-4 h-4 text-primary" /> Presets
            </CardTitle>
            <CardDescription>Select a preset to load its settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5">
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

      {/* ── Active preset banner (full width) ───────────────────────────────── */}
      {activePreset && (
        <div className={cn(
          "rounded-lg border px-4 py-3 flex items-center justify-between",
          locked ? "border-yellow-500/30 bg-yellow-500/10" : "border-primary/30 bg-primary/10"
        )}>
          <div className="flex items-center gap-2">
            {locked ? <Lock className="w-3.5 h-3.5 text-yellow-400" /> : <Sliders className="w-3.5 h-3.5 text-primary" />}
            <span className="text-sm font-semibold">{activePreset.name}</span>
            <Badge className={cn("text-xs", locked
              ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
              : "bg-primary/20 text-primary border-primary/30"
            )}>
              {locked ? 'Locked' : 'Auto-saving'}
            </Badge>
          </div>
          <button onClick={onClearPreset} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── 2-column layout ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">

        {/* ── LEFT: all settings ──────────────────────────────────────────── */}
        <div className="space-y-4 min-w-0">

          {/* Batch */}
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
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="font-mono font-semibold text-sm text-primary">{selectedBatch}</span>
                    {batchFiles.videos.length > 0 && <Badge variant="secondary" className="text-xs">{batchFiles.videos.length}v</Badge>}
                    {batchFiles.images.length > 0 && <Badge variant="secondary" className="text-xs">{batchFiles.images.length}i</Badge>}
                  </div>
                  <button onClick={onOpenBatches} className="text-xs text-muted-foreground hover:text-primary transition-colors border border-border hover:border-primary/40 rounded-md px-2.5 py-1">
                    Switch batch
                  </button>
                </div>
              ) : (
                <button onClick={onOpenBatches} className="w-full flex items-center justify-center gap-2 h-12 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/70 transition-all text-primary font-semibold text-sm">
                  <Clapperboard className="w-4 h-4" /> Select a Batch
                </button>
              )}
            </CardContent>
          </Card>

          {/* File selection */}
          {selectedBatch && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="text-primary font-mono text-sm">{selectedBatch}</span> — Files
                </CardTitle>
                <CardDescription>Select which files to include in generation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {batchFiles.videos.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground">Video Pool</Label>
                      {!locked && (
                        <div className="flex gap-2">
                          <button onClick={() => setAndSaveVideos(batchFiles.videos)} className="text-xs text-primary hover:underline">All</button>
                          <span className="text-muted-foreground text-xs">·</span>
                          <button onClick={() => setAndSaveVideos([])} className="text-xs text-muted-foreground hover:text-foreground">None</button>
                        </div>
                      )}
                    </div>
                    <div className="grid gap-1 max-h-40 overflow-y-auto pr-1">
                      {batchFiles.videos.map(f => (
                        <FileToggle key={f} name={f} selected={selectedVideos.includes(f)}
                          onToggle={() => !locked && setAndSaveVideos(selectedVideos.includes(f) ? selectedVideos.filter(x => x !== f) : [...selectedVideos, f])}
                          color="blue" locked={locked} />
                      ))}
                    </div>
                  </div>
                )}
                {batchFiles.images.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground">Image Pool</Label>
                      {!locked && (
                        <div className="flex gap-2">
                          <button onClick={() => setAndSaveImages(batchFiles.images)} className="text-xs text-primary hover:underline">All</button>
                          <span className="text-muted-foreground text-xs">·</span>
                          <button onClick={() => setAndSaveImages([])} className="text-xs text-muted-foreground hover:text-foreground">None</button>
                        </div>
                      )}
                    </div>
                    <div className="grid gap-1 max-h-40 overflow-y-auto pr-1">
                      {batchFiles.images.map(f => (
                        <FileToggle key={f} name={f} selected={selectedImages.includes(f)}
                          onToggle={() => !locked && setAndSaveImages(selectedImages.includes(f) ? selectedImages.filter(x => x !== f) : [...selectedImages, f])}
                          color="purple" locked={locked} />
                      ))}
                    </div>
                  </div>
                )}
                {batchFiles.videos.length === 0 && batchFiles.images.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No files in this batch yet.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Resolution */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Monitor className="w-4 h-4 text-primary" /> Resolution
                {selectedResolutions.length > 1 && (
                  <Badge className="text-xs bg-primary/20 text-primary border-primary/30">
                    {selectedResolutions.length} resolutions
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>Each selected resolution generates a separate video</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2">
                {availableResolutions.map(r => {
                  const selected = selectedResolutions.includes(r.key);
                  const count = resolutionCounts[r.key] ?? 1;
                  return (
                    <button key={r.key} onClick={() => !locked && toggleResolution(r.key)} disabled={locked}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all",
                        selected ? "border-primary bg-primary/10 text-foreground" : "border-border hover:border-border/80 text-muted-foreground hover:text-foreground",
                        locked && "opacity-60 cursor-not-allowed"
                      )}
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
              {/* Media type toggle */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Source Media</Label>
                <div className="flex gap-2">
                  <button
                    disabled={locked}
                    onClick={() => setAndSaveMediaType('video')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                      mediaType === 'video'
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-border/80",
                      locked && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <Film className="w-4 h-4" /> Video Batch
                  </button>
                  <button
                    disabled={locked}
                    onClick={() => setAndSaveMediaType('image')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                      mediaType === 'image'
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-border/80",
                      locked && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <Image className="w-4 h-4" /> Image Batch
                  </button>
                </div>
              </div>
              {/* Timing fields */}
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
                  <Button variant="outline" size="sm" disabled={!!srtFile || locked || generatingQuotes}
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
                  <Button variant="outline" size="sm" onClick={() => quotesFileRef.current?.click()} disabled={!!srtFile || locked} className="h-7 px-2 text-xs">
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
                disabled={!!srtFile || locked} rows={4}
                className={cn("w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y mono",
                  (srtFile || locked) && "opacity-40 cursor-not-allowed")}
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

          {/* Logo + Subtitles side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  {logoFile && <span className="text-xs text-green-400 flex items-center gap-1 truncate max-w-[140px]"><Check className="w-3 h-3 flex-shrink-0" />{logoFile}</span>}
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
                      <span className="text-xs text-yellow-400 flex items-center gap-1 truncate max-w-[100px]"><Check className="w-3 h-3 flex-shrink-0" />{srtFile}</span>
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
              <CardDescription>MP3 mixed into the output — ends with the shorter of video or audio</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => audioInputRef.current?.click()} disabled={uploadingAudio}>
                  {uploadingAudio ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Music className="w-3 h-3" />}
                  {audioFile ? 'Replace .mp3' : 'Upload .mp3'}
                </Button>
                {audioFile && (
                  <>
                    <span className="text-xs text-green-400 flex items-center gap-1 truncate max-w-[180px]"><Check className="w-3 h-3 flex-shrink-0" />{audioFile}</span>
                    <button onClick={() => removeOverlay('audio')} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </>
                )}
                <input ref={audioInputRef} type="file" accept=".mp3,.m4a,.wav" className="hidden" onChange={e => e.target.files[0] && uploadAudio(e.target.files[0])} />
              </div>
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

        </div>{/* end LEFT */}

        {/* ── RIGHT: Generate + Log (sticky) ──────────────────────────────── */}
        <div className="space-y-4 lg:sticky lg:top-20 [will-change:transform]">

          {/* Generate button */}
          <Button
            className="w-full h-14 text-base font-bold gap-2 shadow-lg"
            onClick={generate}
            disabled={generating || !hasContent}
          >
            {generating ? (
              <><RefreshCw className="w-5 h-5 animate-spin" /> Generating…</>
            ) : (
              <><Play className="w-5 h-5" /> Generate {totalVideos > 1 ? `${totalVideos} Videos` : 'Video'}{selectedResolutions.length > 1 ? ` — ${btnResLabel}` : ''}</>
            )}
          </Button>

          {/* Generation Log */}
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
              <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center mb-3">
                  <Play className="w-5 h-5 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Ready to generate</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {!selectedBatch ? 'Select a batch to get started' : !hasContent ? 'Select files from the batch' : 'Click Generate when ready'}
                </p>
              </div>
            ) : (
              <div className="p-3 space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto">
                {jobs.map(j => <JobStatus key={j.id} job={j} />)}
              </div>
            )}
          </div>

        </div>{/* end RIGHT */}

      </div>{/* end grid */}
    </div>
  );
}

function FileToggle({ name, selected, onToggle, color, locked }) {
  const colorMap = {
    blue: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
    purple: 'border-purple-500/40 bg-purple-500/10 text-purple-300',
  };
  return (
    <button
      onClick={onToggle}
      disabled={locked}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md border text-xs transition-all text-left w-full",
        selected ? colorMap[color] : "border-border bg-transparent text-muted-foreground hover:border-border/80",
        locked && "opacity-60 cursor-not-allowed"
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
  const statusColors = { queued: 'status-queued', running: 'status-running', done: 'status-done', error: 'status-error' };
  return (
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

        {job.status === 'done' && job.outputFiles && job.outputFiles.length > 1 ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">
              {job.outputFiles.length} videos generated{job.outputFolder ? ` → ${job.outputFolder}/` : ''}
            </p>
            {job.outputFiles.map((f, i) => (
              <a
                key={f}
                href={`http://localhost:5001/outputs/${f}`}
                download
                className="flex items-center justify-between gap-2 w-full px-3 h-9 rounded-md bg-green-500/20 border border-green-500/40 text-green-400 text-xs font-semibold hover:bg-green-500/30 transition-colors"
              >
                <span className="mono truncate">{f.split('/').pop()}</span>
                <Download className="w-3.5 h-3.5 flex-shrink-0" />
              </a>
            ))}
          </div>
        ) : job.status === 'done' && job.outputFile ? (
          <a
            href={`http://localhost:5001/outputs/${job.outputFile}`}
            download
            className="flex items-center justify-center gap-2 w-full h-10 rounded-md bg-green-500/20 border border-green-500/40 text-green-400 text-sm font-semibold hover:bg-green-500/30 transition-colors"
          >
            <Download className="w-4 h-4" /> Download {job.outputFile}
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}
