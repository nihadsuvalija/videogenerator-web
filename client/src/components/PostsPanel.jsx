import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ImagePlus, Play, RefreshCw, Check, AlertCircle, Download,
  Lock, Sliders, X, FileText,
  Image, Trash2, Upload, Hash, Type, Sparkles, LayoutGrid, List, Eye,
} from 'lucide-react';
import FontPicker from './FontPicker';
import { Button } from './ui-button';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
  Input, Label, Badge, Separator
} from './ui-primitives';
import LayoutEditor from './LayoutEditor';
import MediaLightbox from './MediaLightbox';
import BatchPickerModal from './BatchPickerModal';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';

const RESOLUTION_ICONS = {
  '1920x1080': '🖥️',
  '1080x1080': '⬛',
  '1080x1920': '📱',
};

const RESOLUTION_OPTIONS = [
  { key: '1080x1080', label: '1080×1080', sub: '1:1 Square — Feed' },
  { key: '1080x1920', label: '1080×1920', sub: '9:16 Portrait — Stories / Reels' },
  { key: '1920x1080', label: '1920×1080', sub: '16:9 Landscape' },
];

const DEFAULT_POST_LAYOUT = {
  logo:          { x: 50, y: 88, w: 15, enabled: true },
  subtitles:     { x: 50, y: 50, fontSize: 64, enabled: true },
  overlays:      [],
  dimBackground: 0,
};

export default function PostsPanel({ batches, incomingPreset, onClearIncomingPreset }) {
  const [presets, setPresets]           = useState([]);
  const [activePreset, setActivePreset] = useState(null);

  const [selectedBatch, setSelectedBatch]   = useState(null);
  const [batchFiles, setBatchFiles]         = useState({ videos: [], images: [] });
  const [selectedImages, setSelectedImages] = useState([]);
  const [fileViewMode, setFileViewMode]       = useState('list');
  const [fileLightboxSrc, setFileLightboxSrc] = useState(null);
  const [showBatchPicker, setShowBatchPicker] = useState(false);

  const [quotes, setQuotes] = useState('');
  const txtInputRef = useRef();

  const [selectedResolutions, setSelectedResolutions] = useState(['1080x1080']);
  const [resolutionCounts, setResolutionCounts]       = useState({ '1080x1080': 10 });
  const [textMaxChars, setTextMaxChars] = useState(25);
  const [fontFamily, setFontFamily]     = useState('default');
  const [fontSize, setFontSize]         = useState('64');

  const [localLayouts, setLocalLayouts]       = useState({ '1080x1080': DEFAULT_POST_LAYOUT });
  const [activeLayoutRes, setActiveLayoutRes] = useState('1080x1080');

  const [generating, setGenerating]             = useState(false);
  const [jobIds, setJobIds]                     = useState([]);
  const [jobs, setJobs]                         = useState([]);
  const [generatingQuotes, setGeneratingQuotes] = useState(false);
  const [aiQuoteError, setAiQuoteError]         = useState(null);
  const pollRef = useRef();
  const saveRef = useRef();

  useEffect(() => {
    fetch(`${API}/api/presets?type=post`).then(r => r.json()).then(setPresets).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedBatch) return;
    fetch(`${API}/api/batches/${selectedBatch}/files`)
      .then(r => r.json())
      .then(data => { setBatchFiles(data); setSelectedImages(data.images); })
      .catch(() => {});
  }, [selectedBatch]);

  const applyPreset = useCallback((preset) => {
    setActivePreset(preset);
    if (preset.resolutionEntries?.length) {
      setSelectedResolutions(preset.resolutionEntries.map(e => e.key));
      const counts = {};
      preset.resolutionEntries.forEach(e => { counts[e.key] = e.count || 1; });
      setResolutionCounts(counts);
    } else {
      const key = preset.resolution || '1080x1080';
      setSelectedResolutions([key]);
      setResolutionCounts({ [key]: preset.videoCount || 10 });
    }
    setTextMaxChars(preset.textMaxChars ?? 25);
    if (preset.fontFamily) setFontFamily(preset.fontFamily);
    if (preset.layout?.subtitles?.fontSize) setFontSize(String(preset.layout.subtitles.fontSize));
    if (preset.layout) {
      let resKeys;
      if (preset.resolutionEntries?.length) {
        resKeys = preset.resolutionEntries.map(e => e.key);
      } else {
        resKeys = [preset.resolution || '1080x1080'];
      }
      const layouts = {};
      resKeys.forEach(res => {
        layouts[res] = { ...DEFAULT_POST_LAYOUT, ...(preset.layouts?.[res] || preset.layout) };
      });
      setLocalLayouts(layouts);
      setActiveLayoutRes(resKeys[0]);
    }
  }, []);

  useEffect(() => {
    if (incomingPreset) { applyPreset(incomingPreset); onClearIncomingPreset?.(); }
  }, [incomingPreset]);

  const saveToPreset = useCallback((patch) => {
    if (!activePreset) return;
    setActivePreset(prev => ({ ...prev, ...patch }));
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      fetch(`${API}/api/presets/${activePreset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    }, 700);
  }, [activePreset]);

  useEffect(() => {
    if (!activePreset) return;
    const entries = selectedResolutions.map(key => ({ key, count: resolutionCounts[key] ?? 1 }));
    saveToPreset({ resolution: selectedResolutions[0], resolutionEntries: entries, videoCount: entries.reduce((s, e) => s + e.count, 0) });
  }, [selectedResolutions, resolutionCounts]); // eslint-disable-line

  const handleLayoutChange = useCallback((patch) => {
    if (patch.layout) {
      setLocalLayouts(prev => {
        const updated = { ...prev, [activeLayoutRes]: patch.layout };
        if (activePreset) saveToPreset({ layout: patch.layout, layouts: updated });
        return updated;
      });
    } else {
      if (activePreset) saveToPreset(patch);
    }
  }, [activeLayoutRes, activePreset, saveToPreset]);

  const currentLayout = localLayouts[activeLayoutRes] || DEFAULT_POST_LAYOUT;
  const layoutPreset = {
    ...(activePreset || {}),
    id: activePreset?.id || null,
    resolution: activeLayoutRes,
    layout: currentLayout,
  };

  useEffect(() => {
    if (!jobIds.length) return;
    const poll = async () => {
      try {
        const results = await Promise.all(jobIds.map(id => fetch(`${API}/api/jobs/${id}`).then(r => r.json())));
        setJobs(results);
        const anyActive = results.some(j => j.status !== 'done' && j.status !== 'error');
        if (anyActive) { pollRef.current = setTimeout(poll, 1200); }
        else { setGenerating(false); }
      } catch { pollRef.current = setTimeout(poll, 1200); }
    };
    poll();
    return () => clearTimeout(pollRef.current);
  }, [jobIds]);

  const quoteLines = quotes.split('\n').map(q => q.trim()).filter(Boolean);
  const totalPosts = selectedResolutions.reduce((s, r) => s + (resolutionCounts[r] ?? 1), 0);

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
      setLocalLayouts(l => ({ ...l, [key]: l[prev[0]] ? { ...l[prev[0]] } : { ...DEFAULT_POST_LAYOUT } }));
      return [...prev, key];
    });
  };

  const adjustPostCount = (key, delta) => {
    setResolutionCounts(prev => ({ ...prev, [key]: Math.max(1, Math.min(100, (prev[key] ?? 1) + delta)) }));
  };

  const handleTxtUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => setQuotes(e.target.result || '');
    reader.readAsText(file);
  };

  const generate = async () => {
    if (!selectedBatch || selectedImages.length === 0) return;
    setGenerating(true); setJobs([]); setJobIds([]);
    try {
      const baseParams = { batchName: selectedBatch, imageFiles: selectedImages, quotes, textMaxChars: Number(textMaxChars) || 25, presetId: activePreset?.id || null, fontFamily, fontSize: Number(fontSize) || 64 };
      const ids = await Promise.all(
        selectedResolutions.map(async (res) => {
          const count = resolutionCounts[res] ?? 1;
          const layout = localLayouts[res] || (activePreset?.layout ? { ...DEFAULT_POST_LAYOUT, ...activePreset.layout } : DEFAULT_POST_LAYOUT);
          const r = await fetch(`${API}/api/generate-posts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...baseParams, resolution: res, postCount: count, layout }) });
          const { jobId } = await r.json();
          return jobId;
        })
      );
      setJobIds(ids);
    } catch { setGenerating(false); }
  };

  const locked = activePreset?.locked ?? false;

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
                onFontChange={(patch) => { if (patch.fontFamily) { setFontFamily(patch.fontFamily); if (activePreset) saveToPreset(patch); } }}
                previewBgUrl={selectedBatch && selectedImages[0] ? `${API}/batches-media/${selectedBatch}/images/${encodeURIComponent(selectedImages[0])}` : null}
                previewBgIsVideo={false}
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
                <ImagePlus className="w-4 h-4 text-primary" /> Resolution
                {selectedResolutions.length > 1 && (
                  <Badge className="text-xs bg-primary/20 text-primary border-primary/30">{selectedResolutions.length} resolutions</Badge>
                )}
              </CardTitle>
              <CardDescription>Set how many posts to generate per resolution</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {RESOLUTION_OPTIONS.map(r => {
                  const selected = selectedResolutions.includes(r.key);
                  const count = resolutionCounts[r.key] ?? 1;
                  return (
                    <button key={r.key} disabled={locked} onClick={() => !locked && toggleResolution(r.key)}
                      className={cn("flex items-center justify-between px-3 py-2.5 rounded-lg border text-left text-sm transition-all",
                        selected ? "border-primary bg-primary/10" : "border-border hover:border-border/80 text-muted-foreground",
                        locked && "opacity-50 cursor-not-allowed")}>
                      <div className="flex items-center gap-2">
                        <div className={cn("w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-all",
                          selected ? "border-primary bg-primary" : "border-muted-foreground/40")}>
                          {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                        </div>
                        <div>
                          <span className={cn("font-semibold mono text-xs", selected && "text-primary")}>{r.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">{r.sub}</span>
                        </div>
                      </div>
                      {selected && (
                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          <span className="text-xs text-muted-foreground mr-1">posts:</span>
                          <button onClick={() => adjustPostCount(r.key, -1)} disabled={locked || count <= 1}
                            className="w-5 h-5 rounded border border-border hover:border-primary/60 hover:bg-primary/10 text-xs font-bold flex items-center justify-center transition-all disabled:opacity-30">−</button>
                          <span className="w-6 text-center text-xs font-mono font-semibold text-primary">{count}</span>
                          <button onClick={() => adjustPostCount(r.key, 1)} disabled={locked || count >= 100}
                            className="w-5 h-5 rounded border border-border hover:border-primary/60 hover:bg-primary/10 text-xs font-bold flex items-center justify-center transition-all disabled:opacity-30">+</button>
                        </div>
                      )}
                    </button>
                  );
                })}
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
                    <Badge variant="secondary" className="text-xs">Optional</Badge>
                  </CardTitle>
                  <CardDescription>One per line — each post gets one quote burned in</CardDescription>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {quotes && (
                    <button onClick={() => setQuotes('')} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <Button disabled={generatingQuotes}
                    onClick={async () => {
                      setAiQuoteError(null); setGeneratingQuotes(true);
                      try {
                        const r = await fetch(`${API}/api/ai/quotes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: totalPosts }) });
                        const data = await r.json();
                        if (!r.ok) throw new Error(data.error || 'Unknown error');
                        setQuotes(data.quotes.join('\n'));
                      } catch (e) { setAiQuoteError(e.message); } finally { setGeneratingQuotes(false); }
                    }}
                    className="h-7 px-2.5 text-xs gap-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-0 shadow-md shadow-violet-500/20 disabled:opacity-50">
                    {generatingQuotes ? <><RefreshCw className="w-3 h-3 animate-spin" /> AI…</> : <><Sparkles className="w-3 h-3" /> AI ({totalPosts})</>}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => txtInputRef.current?.click()} className="h-7 px-2 text-xs">
                    <Upload className="w-3 h-3" />
                  </Button>
                  <input ref={txtInputRef} type="file" accept=".txt,text/plain" className="hidden"
                    onChange={e => e.target.files[0] && handleTxtUpload(e.target.files[0])} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {aiQuoteError && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3 flex-shrink-0" /> {aiQuoteError}</p>}
              <textarea value={quotes} onChange={e => setQuotes(e.target.value)}
                placeholder={"The only way to do great work is to love what you do.\nIn the middle of every difficulty lies opportunity."}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y mono disabled:opacity-50" />
              {quoteLines.length > 0 && (
                <p className="text-xs text-muted-foreground">{quoteLines.length} quote{quoteLines.length !== 1 ? 's' : ''}</p>
              )}
              <Separator />
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Type className="w-3 h-3" /> Font</Label>
                <FontPicker value={fontFamily} onChange={(v) => { setFontFamily(v); if (activePreset) saveToPreset({ fontFamily: v }); }} previewText={quotes} disabled={locked} />
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Size (px)</Label>
                    <Input type="number" min="12" max="300" step="1" value={fontSize}
                      onChange={e => setFontSize(e.target.value)}
                      onBlur={e => { if (!e.target.value || isNaN(Number(e.target.value))) setFontSize('64'); }}
                      disabled={locked} className="w-20" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Max chars / line</Label>
                    <Input type="number" min="10" max="80" step="1" value={textMaxChars} disabled={locked}
                      className="w-20"
                      onChange={e => setTextMaxChars(Math.max(10, Math.min(80, Number(e.target.value) || 25)))} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>{/* end COL 2 */}

        {/* ── COL 3: Batch + Generate + Log (sticky) ───────────────────────── */}
        <div className="space-y-4 xl:sticky xl:top-20 [will-change:transform]">

          {/* Preset picker */}
          {presets.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-primary" /> Presets
                </CardTitle>
                <CardDescription>Apply a preset to load layout and settings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-1.5">
                  {presets.map(p => (
                    <button key={p.id} onClick={async () => {
                        try {
                          const res = await fetch(`${API}/api/presets/${p.id}`);
                          const fresh = await res.json();
                          applyPreset(fresh);
                          setPresets(prev => prev.map(pr => pr.id === fresh.id ? fresh : pr));
                        } catch { applyPreset(p); }
                      }}
                      className={cn("flex items-center justify-between px-3 py-2.5 rounded-lg border text-left text-sm transition-all",
                        activePreset?.id === p.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40 hover:bg-secondary/50")}>
                      <div className="flex items-center gap-2 min-w-0">
                        {activePreset?.id === p.id ? <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30 flex-shrink-0" />}
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
                  <button onClick={() => { setActivePreset(null); setLocalLayouts({ '1080x1080': DEFAULT_POST_LAYOUT }); setActiveLayoutRes('1080x1080'); }}
                    className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Clear selection ×
                  </button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Active preset banner */}
          {activePreset && (
            <div className={cn("rounded-lg border px-4 py-3 flex items-center justify-between",
              locked ? "border-yellow-500/30 bg-yellow-500/10" : "border-primary/30 bg-primary/10")}>
              <div className="flex items-center gap-2 min-w-0">
                {locked ? <Lock className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" /> : <Sliders className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                <span className="text-sm font-semibold truncate">{activePreset.name}</span>
                <Badge className={cn("text-xs flex-shrink-0", locked ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : "bg-primary/20 text-primary border-primary/30")}>
                  {locked ? 'Locked' : 'Auto-saving'}
                </Badge>
              </div>
              <button onClick={() => { setActivePreset(null); setLocalLayouts({ '1080x1080': DEFAULT_POST_LAYOUT }); setActiveLayoutRes('1080x1080'); }} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 ml-2">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Batch picker */}
          <Card className={cn(!selectedBatch && "ring-1 ring-primary/40 glow-orange-sm")}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Image className="w-4 h-4 text-primary" /> Image Batch
              </CardTitle>
              <CardDescription>Select a batch containing background images</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedBatch ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                    <span className="font-mono font-semibold text-sm text-primary truncate">{selectedBatch}</span>
                    {batchFiles.images.length > 0 && <Badge variant="secondary" className="text-xs flex-shrink-0">{batchFiles.images.length} imgs</Badge>}
                  </div>
                  <button onClick={() => setShowBatchPicker(true)}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors border border-border hover:border-primary/40 rounded-md px-2.5 py-1 flex-shrink-0 ml-2">
                    Switch
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <button onClick={() => setShowBatchPicker(true)}
                    className="w-full flex items-center justify-center gap-2 h-12 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/70 transition-all text-primary font-semibold text-sm">
                    <Image className="w-4 h-4" /> Select a Batch
                  </button>
                  {batches.length > 0 && (
                    <div className="grid gap-1 max-h-40 overflow-y-auto">
                      {batches.map(b => (
                        <button key={b.name} onClick={() => setSelectedBatch(b.name)}
                          className="flex items-center justify-between px-3 py-2 rounded-lg border border-border hover:border-primary/40 hover:bg-secondary/50 text-left text-sm transition-all">
                          <span className="font-mono text-xs font-semibold">{b.name}</span>
                          <Badge variant="secondary" className="text-xs">{b.imageCount} images</Badge>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Image pool */}
          {selectedBatch && batchFiles.images.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Image className="w-3.5 h-3.5 text-primary" /> Image Pool
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedImages(batchFiles.images)} className="text-xs text-primary hover:underline">All</button>
                      <span className="text-muted-foreground text-xs">·</span>
                      <button onClick={() => setSelectedImages([])} className="text-xs text-muted-foreground hover:text-foreground">None</button>
                    </div>
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
                </div>
                <CardDescription>{selectedImages.length} of {batchFiles.images.length} selected</CardDescription>
              </CardHeader>
              <CardContent>
                {fileViewMode === 'list' ? (
                  <div className="grid gap-1 max-h-40 overflow-y-auto pr-1">
                    {batchFiles.images.map(f => (
                      <button key={f}
                        onClick={() => setSelectedImages(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])}
                        className={cn("flex items-center gap-2 px-3 py-2 rounded-md border text-xs transition-all text-left w-full",
                          selectedImages.includes(f) ? "border-purple-500/40 bg-purple-500/10 text-purple-300" : "border-border bg-transparent text-muted-foreground hover:border-border/80")}>
                        <div className={cn("w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0",
                          selectedImages.includes(f) ? "border-current bg-current/20" : "border-muted-foreground/40")}>
                          {selectedImages.includes(f) && <Check className="w-2.5 h-2.5" />}
                        </div>
                        <span className="mono truncate">{f}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ columns: '3 80px', columnGap: 6 }}>
                    {batchFiles.images.map(f => (
                      <div key={f} style={{ breakInside: 'avoid', marginBottom: 6 }}>
                        <PostImageGridCell
                          name={f}
                          src={`${API}/batches-media/${selectedBatch}/images/${encodeURIComponent(f)}`}
                          selected={selectedImages.includes(f)}
                          onToggle={() => setSelectedImages(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])}
                          onPreview={() => setFileLightboxSrc(`${API}/batches-media/${selectedBatch}/images/${encodeURIComponent(f)}`)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Generate button */}
          <Button className="w-full h-14 text-base font-bold gap-2 shadow-lg"
            onClick={generate} disabled={generating || selectedImages.length === 0 || !selectedBatch}>
            {generating ? (
              <><RefreshCw className="w-5 h-5 animate-spin" /> Generating Posts…</>
            ) : (
              <><ImagePlus className="w-5 h-5" /> Generate {totalPosts} Post{totalPosts !== 1 ? 's' : ''}</>
            )}
          </Button>

          {/* Generation log */}
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImagePlus className="w-4 h-4 text-primary" />
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
                  <ImagePlus className="w-4 h-4 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Ready to generate</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {!selectedBatch ? 'Select a batch to get started' : selectedImages.length === 0 ? 'Select images from the batch' : 'Click Generate when ready'}
                </p>
              </div>
            ) : (
              <div className="p-3 space-y-3 max-h-96 overflow-y-auto">
                {jobs.map(j => <PostJobStatus key={j.id} job={j} />)}
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
          onSelect={setSelectedBatch}
          onClose={() => setShowBatchPicker(false)}
        />
      )}
    </div>
  );
}

// ── Image grid cell (selection + preview) ─────────────────────────────────────
function PostImageGridCell({ name, src, selected, onToggle, onPreview }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={cn("relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all",
        selected ? "border-primary" : "border-border")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onToggle}
    >
      <img src={src} alt={name} className="w-full h-auto block" loading="lazy" />
      {selected && (
        <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center pointer-events-none">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
      <div className={cn("absolute inset-0 bg-black/50 flex flex-col justify-between p-1.5 transition-opacity", hovered ? "opacity-100" : "opacity-0")}>
        <div className="flex justify-end">
          <button onClick={e => { e.stopPropagation(); onPreview(); }}
            className="w-6 h-6 rounded-md bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors" title="Preview">
            <Eye className="w-3 h-3 text-white" />
          </button>
        </div>
        <p className="text-[9px] text-white font-mono leading-tight line-clamp-2 break-all">{name}</p>
      </div>
    </div>
  );
}

// ── Job status for post generation ────────────────────────────────────────────
function PostJobStatus({ job }) {
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const statusColors = { queued: 'status-queued', running: 'status-running', done: 'status-done', error: 'status-error' };

  return (
    <>
      <Card className={cn("slide-up", job.status === 'running' && 'glow-orange-sm')}>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {job.status === 'running'  && <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />}
              {job.status === 'done'     && <Check className="w-3.5 h-3.5 text-green-400" />}
              {job.status === 'error'    && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
              <span className="text-sm font-semibold">Job {job.id?.slice(0, 8)}…</span>
              {job.resolution && <Badge variant="secondary" className="text-xs mono">{job.resolution}</Badge>}
            </div>
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold", statusColors[job.status])}>
              {job.status?.toUpperCase()}
            </span>
          </div>

          {(job.status === 'running' || job.status === 'done') && (
            <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${job.progress || 0}%` }} />
            </div>
          )}

          {job.log?.length > 0 && (
            <div className="bg-muted rounded-md p-3 max-h-32 overflow-y-auto">
              {job.log.map((line, i) => (
                <div key={i} className={cn("text-xs mono", line.startsWith('ERROR') || line.startsWith('  WARNING') ? 'text-red-400' : 'text-muted-foreground')}>{line}</div>
              ))}
            </div>
          )}

          {job.status === 'done' && job.outputFiles?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">
                {job.outputFiles.length} post{job.outputFiles.length !== 1 ? 's' : ''} generated
                {job.outputFolder ? ` → ${job.outputFolder}/` : ''}
              </p>
              <div style={{ columns: '3 80px', columnGap: 6 }}>
                {job.outputFiles.map(f => (
                  <div key={f} style={{ breakInside: 'avoid', marginBottom: 6 }}>
                    <OutputImageCell
                      src={`http://localhost:5001/outputs/${f}`}
                      href={`http://localhost:5001/outputs/${f}`}
                      onPreview={() => setLightboxSrc(`http://localhost:5001/outputs/${f}`)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {lightboxSrc && <MediaLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </>
  );
}

function OutputImageCell({ src, href, onPreview }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="relative rounded-lg overflow-hidden border border-border cursor-pointer"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onClick={onPreview}>
      <img src={src} alt="" className="w-full h-auto block" loading="lazy" />
      <div className={cn("absolute inset-0 bg-black/50 flex items-center justify-center gap-2 transition-opacity", hovered ? "opacity-100" : "opacity-0")}>
        <button onClick={e => { e.stopPropagation(); onPreview(); }}
          className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors">
          <Eye className="w-3.5 h-3.5 text-white" />
        </button>
        <a href={href} download onClick={e => e.stopPropagation()}
          className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors">
          <Download className="w-3.5 h-3.5 text-white" />
        </a>
      </div>
    </div>
  );
}
