import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  ImagePlus, Play, RefreshCw, Check, AlertCircle, Download,
  Lock, Sliders, X, FileText, ChevronDown,
  Image, Film, Trash2, Upload, Type, Sparkles, LayoutGrid, List, Eye, StopCircle, BookOpen,
} from 'lucide-react';
import FontPicker from './FontPicker';
import FilterPicker from './FilterPicker';
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

export default function PostsPanel({ batches, incomingPreset, onClearIncomingPreset, presets = [], onPresetsChanged }) {
  const { token } = useAuth();
  const [activePreset, setActivePreset] = useState(null);
  const [quotesMode, setQuotesMode]         = useState('manual');
  const [libraryQuotes, setLibraryQuotes]   = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryBatch, setLibraryBatch]     = useState(null);
  const [quoteBatches, setQuoteBatches]     = useState([]);

  const [selectedBatch, setSelectedBatch]   = useState(null);
  const [batchFiles, setBatchFiles]         = useState({ videos: [], images: [] });
  const [selectedImages, setSelectedImages] = useState([]);
  const [selectedVideos, setSelectedVideos] = useState([]);
  const [fileViewMode, setFileViewMode]       = useState('grid');
  const [filePage, setFilePage]               = useState(0);
  const [fileLightboxSrc, setFileLightboxSrc] = useState(null);
  const [showBatchPicker, setShowBatchPicker] = useState(false);

  const [quotes, setQuotes] = useState('');
  const txtInputRef = useRef();

  const [selectedResolutions, setSelectedResolutions] = useState(['1080x1080']);
  const [resolutionCounts, setResolutionCounts]       = useState({ '1080x1080': 10 });
  const [textMaxChars, setTextMaxChars] = useState(25);
  const [fontFamily, setFontFamily]     = useState('default');
  const [fontSize, setFontSize]         = useState('64');
  const [imageFilter, setImageFilter]   = useState('none');

  const [localLayouts, setLocalLayouts]       = useState({ '1080x1080': DEFAULT_POST_LAYOUT });
  const [activeLayoutRes, setActiveLayoutRes] = useState('1080x1080');

  const [logOpen, setLogOpen]                   = useState(false);
  const [rightOpen, setRightOpen]               = useState({ resolution: false, filter: false, quotes: false });
  const toggleRight = (key) => setRightOpen(prev => ({ ...prev, [key]: !prev[key] }));

  const [generating, setGenerating]             = useState(false);
  const [jobIds, setJobIds]                     = useState([]);
  const [jobs, setJobs]                         = useState([]);
  const [generatingQuotes, setGeneratingQuotes] = useState(false);
  const [aiQuoteError, setAiQuoteError]         = useState(null);
  const pollRef = useRef();
  const saveRef = useRef();


  useEffect(() => {
    if (!selectedBatch) return;
    fetch(`${API}/api/batches/${selectedBatch}/files`)
      .then(r => r.json())
      .then(data => {
        setBatchFiles(data);
        setFilePage(0);
        const bt = data.videos.length > 0 && data.images.length === 0 ? 'video'
          : data.images.length > 0 && data.videos.length === 0 ? 'image'
          : null;
        if (bt === 'video') { setSelectedVideos(data.videos); setSelectedImages([]); }
        else { setSelectedImages(data.images); setSelectedVideos([]); }
      })
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
    if (preset.fontFamily)  setFontFamily(preset.fontFamily);
    if (preset.imageFilter) setImageFilter(preset.imageFilter);
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
    if (!selectedBatch || activeFiles.length === 0) return;
    setGenerating(true); setJobs([]); setJobIds([]); setLogOpen(true);
    try {
      let resolvedQuotes = quotes;
      let usedQuoteIds = [];
      if (quotesMode === 'library') {
        const pool = libraryQuotes.slice(0, totalPosts);
        resolvedQuotes = pool.map(q => q.text).join('\n');
        usedQuoteIds = pool.map(q => q.id);
      }

      const mediaParam = batchType === 'video'
        ? { videoFiles: selectedVideos }
        : { imageFiles: selectedImages };
      const baseParams = { batchName: selectedBatch, ...mediaParam, quotes: resolvedQuotes, textMaxChars: Number(textMaxChars) || 25, presetId: activePreset?.id || null, fontFamily, fontSize: Number(fontSize) || 64, imageFilter };
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

  const locked = activePreset?.locked ?? false;

  // Derive batch type from loaded files
  const batchType = !selectedBatch ? null
    : batchFiles.videos.length > 0 && batchFiles.images.length === 0 ? 'video'
    : batchFiles.images.length > 0 && batchFiles.videos.length === 0 ? 'image'
    : batchFiles.videos.length > 0 && batchFiles.images.length > 0 ? 'mixed'
    : null;

  const activeFiles = batchType === 'video' ? selectedVideos : selectedImages;

  const FILE_PAGE_SIZE = 24;
  const activeFileList = batchType === 'video' ? batchFiles.videos : batchFiles.images;
  const filePageCount = Math.ceil(activeFileList.length / FILE_PAGE_SIZE);
  const pagedFiles = activeFileList.slice(filePage * FILE_PAGE_SIZE, (filePage + 1) * FILE_PAGE_SIZE);

  const layoutSidebarContent = (
    <>

          {/* Resolution */}
          <Card>
            <CardHeader className="px-4 pt-4 pb-3 cursor-pointer select-none" onClick={() => toggleRight('resolution')}>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ImagePlus className="w-4 h-4 text-primary" /> Resolution
                  {selectedResolutions.length > 1 && (
                    <Badge className="text-xs bg-primary/20 text-primary border-primary/30">{selectedResolutions.length} resolutions</Badge>
                  )}
                </CardTitle>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200 flex-shrink-0", rightOpen.resolution && "rotate-180")} />
              </div>
              <CardDescription>Set how many posts to generate per resolution</CardDescription>
            </CardHeader>
            {rightOpen.resolution && <CardContent className="px-4 pb-4">
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
              <CardDescription>Apply a cinematic tint or color grade to the images</CardDescription>
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
                <Badge variant="secondary" className="text-xs flex-shrink-0">Optional</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <CardDescription className="text-xs">
                  {quotesMode === 'library' ? 'Using quotes from library' : 'One per line — each post picks one'}
                </CardDescription>
                {quotesMode === 'manual' && (
                  <div className="flex items-center gap-1 flex-shrink-0">
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
                )}
                <button onClick={e => { e.stopPropagation(); toggleRight('quotes'); }} className="p-0.5 text-muted-foreground hover:text-foreground transition-colors rounded flex-shrink-0">
                  <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", rightOpen.quotes && "rotate-180")} />
                </button>
              </div>
            </CardHeader>
            {rightOpen.quotes && <CardContent className="px-4 pb-4 space-y-3">
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
                  {aiQuoteError && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3 flex-shrink-0" /> {aiQuoteError}</p>}
                  <textarea value={quotes} onChange={e => setQuotes(e.target.value)}
                    placeholder={"The only way to do great work is to love what you do.\nIn the middle of every difficulty lies opportunity."}
                    rows={4}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y mono disabled:opacity-50" />
                  {quoteLines.length > 0 && (
                    <p className="text-xs text-muted-foreground">{quoteLines.length} quote{quoteLines.length !== 1 ? 's' : ''}</p>
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
                          Will use <span className="font-semibold text-foreground">{Math.min(totalPosts, libraryQuotes.length)}</span> for {totalPosts} post{totalPosts !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                        {libraryQuotes.slice(0, totalPosts).map((q, i) => (
                          <div key={q.id} className="flex items-start gap-2 px-3 py-2 rounded-md bg-primary/5 border border-primary/20 text-xs">
                            <span className="text-primary font-mono font-semibold flex-shrink-0 w-4">{i + 1}</span>
                            <span className="text-muted-foreground mono whitespace-pre-wrap break-words">{q.text}</span>
                          </div>
                        ))}
                        {libraryQuotes.length > totalPosts && (
                          <p className="text-xs text-muted-foreground/60 text-center pt-1">
                            +{libraryQuotes.length - totalPosts} more won't be used this run
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
            </CardContent>}
          </Card>

    </>
  );

  return (
    <div className="flex flex-col xl:h-[calc(100vh-5rem)] gap-3">

      {/* ── 3-column layout: Batches | Layout Editor | Config ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr_360px] gap-4 flex-1 min-h-0">

        {/* ── LEFT col (DOM first): banner, batch, files, log ── */}
        <div className="flex flex-col gap-2 xl:order-1 col-scroll min-h-0 [will-change:transform]">

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
                          onPresetsChanged?.();
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
                {batchType === 'video' ? <Film className="w-4 h-4 text-primary" /> : <Image className="w-4 h-4 text-primary" />}
                {batchType === 'video' ? 'Video Batch' : 'Image Batch'}
              </CardTitle>
              <CardDescription>
                {batchType === 'video' ? 'Select a batch containing source videos' : 'Select a batch containing background images'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedBatch ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                    <span className="font-mono font-semibold text-sm text-primary truncate">{selectedBatch}</span>
                    {batchFiles.videos.length > 0 && <Badge variant="secondary" className="text-xs flex-shrink-0">{batchFiles.videos.length}v</Badge>}
                    {batchFiles.images.length > 0 && batchType !== 'video' && <Badge variant="secondary" className="text-xs flex-shrink-0">{batchFiles.images.length}i</Badge>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    <button onClick={() => setShowBatchPicker(true)}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors border border-border hover:border-primary/40 rounded-md px-2.5 py-1">
                      Switch
                    </button>
                    <button onClick={() => setSelectedBatch(null)}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors border border-border hover:border-destructive/40 rounded-md px-2.5 py-1">
                      Remove
                    </button>
                  </div>
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

          {/* File pool — shows videos or images based on batch type */}
          {selectedBatch && (batchFiles.images.length > 0 || batchFiles.videos.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {batchType === 'video'
                      ? <><Film className="w-3.5 h-3.5 text-primary" /> Video Pool</>
                      : <><Image className="w-3.5 h-3.5 text-primary" /> Image Pool</>}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-2">
                      {batchType === 'video' ? (
                        <>
                          <button onClick={() => setSelectedVideos(batchFiles.videos)} className="text-xs text-primary hover:underline">All</button>
                          <span className="text-muted-foreground text-xs">·</span>
                          <button onClick={() => setSelectedVideos([])} className="text-xs text-muted-foreground hover:text-foreground">None</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setSelectedImages(batchFiles.images)} className="text-xs text-primary hover:underline">All</button>
                          <span className="text-muted-foreground text-xs">·</span>
                          <button onClick={() => setSelectedImages([])} className="text-xs text-muted-foreground hover:text-foreground">None</button>
                        </>
                      )}
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
                <CardDescription>
                  {batchType === 'video'
                    ? `${selectedVideos.length} of ${batchFiles.videos.length} selected`
                    : `${selectedImages.length} of ${batchFiles.images.length} selected`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {batchType === 'video' ? (
                  fileViewMode === 'list' ? (
                    <div className="grid gap-1">
                      {pagedFiles.map(f => (
                        <button key={f}
                          onClick={() => setSelectedVideos(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])}
                          className={cn("flex items-center gap-2 px-3 py-2 rounded-md border text-xs transition-all text-left w-full",
                            selectedVideos.includes(f) ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-transparent text-muted-foreground hover:border-border/80")}>
                          <div className={cn("w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0",
                            selectedVideos.includes(f) ? "border-current bg-current/20" : "border-muted-foreground/40")}>
                            {selectedVideos.includes(f) && <Check className="w-2.5 h-2.5" />}
                          </div>
                          <span className="mono truncate">{f}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ columns: '3 80px', columnGap: 6 }}>
                      {pagedFiles.map(f => (
                        <div key={f} style={{ breakInside: 'avoid', marginBottom: 6 }}>
                          <PostImageGridCell
                            name={f}
                            src={`${API}/batches-media/${selectedBatch}/videos/${encodeURIComponent(f)}`}
                            selected={selectedVideos.includes(f)}
                            onToggle={() => setSelectedVideos(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])}
                            onPreview={() => setFileLightboxSrc(`${API}/batches-media/${selectedBatch}/videos/${encodeURIComponent(f)}`)}
                          />
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  fileViewMode === 'list' ? (
                  <div className="grid gap-1">
                    {pagedFiles.map(f => (
                      <button key={f}
                        onClick={() => setSelectedImages(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])}
                        className={cn("flex items-center gap-2 px-3 py-2 rounded-md border text-xs transition-all text-left w-full",
                          selectedImages.includes(f) ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-transparent text-muted-foreground hover:border-border/80")}>
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
                    {pagedFiles.map(f => (
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
                )
                )}
              {filePageCount > 1 && (
                <FilePagination page={filePage} pageCount={filePageCount} onPage={setFilePage} total={activeFileList.length} />
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
            onFontChange={(patch) => { if (patch.fontFamily) { setFontFamily(patch.fontFamily); if (activePreset) saveToPreset(patch); } }}
            previewBgUrl={selectedBatch && selectedImages[0] ? `${API}/batches-media/${selectedBatch}/images/${encodeURIComponent(selectedImages[0])}` : null}
            previewBgIsVideo={false}
            locked={locked}
            previewText={quotesMode === 'library' ? libraryQuotes[0]?.text : quotes.split('\n').find(l => l.trim())}
            imageFilter={imageFilter}
            sidebarDefaultOpen={false}
            generateButton={
              <Button className="w-full h-14 text-base font-bold gap-2 shadow-lg"
                onClick={generate} disabled={generating || activeFiles.length === 0 || !selectedBatch}>
                {generating ? (
                  <><RefreshCw className="w-5 h-5 animate-spin" /> Generating Posts…</>
                ) : (
                  <><ImagePlus className="w-5 h-5" /> Generate {totalPosts} Post{totalPosts !== 1 ? 's' : ''}</>
                )}
              </Button>
            }
          />
        </div>{/* end CENTER col */}

        {/* ── RIGHT col: Configuration parameters ── */}
        <div className="flex flex-col gap-2 xl:order-3 col-scroll min-h-0">
          {layoutSidebarContent}
        </div>{/* end RIGHT col */}

      </div>{/* end grid */}

      {/* ── Generation log — full width below both columns ── */}
      <div className={cn("flex-shrink-0 rounded-xl border border-border overflow-hidden bg-card flex flex-col", logOpen && "h-52")}>
        <button onClick={() => setLogOpen(v => !v)} className="px-4 py-2.5 flex items-center justify-between w-full text-left hover:bg-secondary/20 transition-colors">
          <div className="flex items-center gap-2">
            <ImagePlus className="w-4 h-4 text-primary" />
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
              <ImagePlus className="w-4 h-4 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Ready to generate</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {!selectedBatch ? 'Select a batch to get started' : activeFiles.length === 0 ? `Select ${batchType === 'video' ? 'videos' : 'images'} from the batch` : 'Click Generate when ready'}
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-3 overflow-y-auto flex-1 border-t border-border">
            {jobs.map(j => <PostJobStatus key={j.id} job={j} />)}
          </div>
        ))}
      </div>

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
  const [aborting, setAborting] = useState(false);
  const statusColors = { queued: 'status-queued', running: 'status-running', done: 'status-done', error: 'status-error', cancelled: 'status-error' };
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
              <span className="text-sm font-semibold">Job {job.id?.slice(0, 8)}…</span>
              {job.resolution && <Badge variant="secondary" className="text-xs mono">{job.resolution}</Badge>}
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
                {job.status?.toUpperCase()}
              </span>
            </div>
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
