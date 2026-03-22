import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  Film, ImagePlus, Clock, RefreshCw,
  Repeat2, Sliders, ArrowRight, Download, X, Filter,
  ChevronLeft, ChevronRight, Sparkles, Info,
} from 'lucide-react';
import { cn } from '../lib/utils';
import VideoMetadataPanel from './VideoMetadataPanel';

const API = 'http://localhost:5001';
const isImage = (f) => /\.(jpe?g|png|webp|gif)$/i.test(f);

const SESSION_TOKEN = (() => {
  let t = sessionStorage.getItem('vg_session');
  if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('vg_session', t); }
  return t;
})();

const DATE_OPTIONS = [
  { value: 'all',   label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week',  label: 'This week' },
  { value: 'month', label: 'This month' },
];

function inDateRange(dateStr, range) {
  if (range === 'all') return true;
  const d = new Date(dateStr);
  const now = new Date();
  if (range === 'today') return d.toDateString() === now.toDateString();
  const ms = range === 'week' ? 7 * 86400000 : 30 * 86400000;
  return now - d <= ms;
}

export default function HomePage({ user, onNavigate }) {
  const [jobs, setJobs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailJob, setDetailJob] = useState(null);
  const pollRef               = useRef(null);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [filterDate,       setFilterDate]       = useState('all');
  const [filterType,       setFilterType]       = useState('all');
  const [filterResolution, setFilterResolution] = useState('all');
  const [filterPreset,     setFilterPreset]     = useState('all');

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/jobs?page=1&limit=100`);
      const d   = await res.json();
      setJobs(d.jobs || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // Split into active (queued/running) and done
  const activeJobs = useMemo(() => jobs.filter(j => j.status === 'queued' || j.status === 'running'), [jobs]);
  const doneJobs   = useMemo(() => jobs.filter(j => j.status === 'done'), [jobs]);

  // Poll while jobs are active
  useEffect(() => {
    clearInterval(pollRef.current);
    if (activeJobs.length === 0) return;
    pollRef.current = setInterval(loadJobs, 2000);
    return () => clearInterval(pollRef.current);
  }, [activeJobs.length, loadJobs]);

  // Replicate — re-fire the exact same generation
  const handleReplicateHere = useCallback(async (job) => {
    if (!job.generationParams) return;
    const params   = { ...job.generationParams, sessionToken: SESSION_TOKEN };
    const endpoint = job.type === 'post' ? '/api/generate-posts' : '/api/generate';
    try {
      await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      loadJobs();
    } catch {}
  }, [loadJobs]);

  // Derive unique filter options from done jobs
  const resolutionOptions = useMemo(() => {
    const seen = new Set();
    doneJobs.forEach(j => j.resolution && seen.add(j.resolution));
    return [...seen].sort();
  }, [doneJobs]);

  const presetOptions = useMemo(() => {
    const seen = new Map();
    doneJobs.forEach(j => j.presetName && seen.set(j.presetName, j.presetName));
    return [...seen.values()].sort();
  }, [doneJobs]);

  // Apply filters to done jobs
  const filteredJobs = useMemo(() => doneJobs.filter(j => {
    if (filterDate !== 'all'       && !inDateRange(j.createdAt, filterDate)) return false;
    if (filterType !== 'all'       && j.type !== filterType)                  return false;
    if (filterResolution !== 'all' && j.resolution !== filterResolution)      return false;
    if (filterPreset !== 'all') {
      if (filterPreset === '__none__' && j.presetName)                         return false;
      if (filterPreset !== '__none__' && j.presetName !== filterPreset)        return false;
    }
    return true;
  }), [doneJobs, filterDate, filterType, filterResolution, filterPreset]);

  const activeFilters = [
    filterDate !== 'all'       && { key: 'date',  label: DATE_OPTIONS.find(o => o.value === filterDate)?.label,    clear: () => setFilterDate('all') },
    filterType !== 'all'       && { key: 'type',  label: filterType === 'post' ? 'Posts' : 'Videos',               clear: () => setFilterType('all') },
    filterResolution !== 'all' && { key: 'res',   label: filterResolution,                                          clear: () => setFilterResolution('all') },
    filterPreset !== 'all'     && { key: 'pres',  label: filterPreset === '__none__' ? 'No preset' : filterPreset,  clear: () => setFilterPreset('all') },
  ].filter(Boolean);

  const clearAll = () => {
    setFilterDate('all'); setFilterType('all');
    setFilterResolution('all'); setFilterPreset('all');
  };

  return (
    <div className="space-y-8">
      {detailJob && (
        <JobDetailsModal job={detailJob} onClose={() => setDetailJob(null)} />
      )}
      {/* Welcome header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Syne' }}>
          Welcome back, <span className="text-primary">{user?.name?.split(' ')[0]}</span>
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Here's a quick overview of your recent work.</p>
      </div>

      {/* Quick-action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <QuickAction
          icon={<Film className="w-5 h-5" />}
          title="Generate Video"
          description="Create a new batch video with audio, subtitles and overlays"
          onClick={() => onNavigate('generate')}
        />
        <QuickAction
          icon={<ImagePlus className="w-5 h-5" />}
          title="Generate Posts"
          description="Create static social media posts from an image batch"
          onClick={() => onNavigate('posts')}
        />
      </div>

      {/* Recent generations */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Recent Generations
            {activeJobs.length > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-primary normal-case tracking-normal">
                <RefreshCw className="w-3 h-3 animate-spin" />
                {activeJobs.length} generating…
              </span>
            )}
          </h3>
          <button onClick={() => onNavigate('history')} className="flex items-center gap-1 text-xs text-primary hover:underline">
            View all <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* ── Filter bar ── */}
        {!loading && doneJobs.length > 0 && (
          <div className="mb-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Filter className="w-3.5 h-3.5" /> Filter:
              </div>

              <FilterSelect value={filterDate} onChange={setFilterDate} options={DATE_OPTIONS} />

              <FilterSelect
                value={filterType}
                onChange={setFilterType}
                options={[
                  { value: 'all',   label: 'All types' },
                  { value: 'video', label: 'Video' },
                  { value: 'post',  label: 'Post' },
                ]}
              />

              {resolutionOptions.length > 1 && (
                <FilterSelect
                  value={filterResolution}
                  onChange={setFilterResolution}
                  options={[
                    { value: 'all', label: 'All resolutions' },
                    ...resolutionOptions.map(r => ({ value: r, label: r.replace('x', ' × ') })),
                  ]}
                />
              )}

              {presetOptions.length > 0 && (
                <FilterSelect
                  value={filterPreset}
                  onChange={setFilterPreset}
                  options={[
                    { value: 'all',      label: 'All presets' },
                    { value: '__none__', label: 'No preset' },
                    ...presetOptions.map(p => ({ value: p, label: p })),
                  ]}
                />
              )}

              {activeFilters.length > 0 && (
                <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1">
                  Clear all
                </button>
              )}
            </div>

            {activeFilters.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {activeFilters.map(f => (
                  <span key={f.key} className="pill-in flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5">
                    {f.label}
                    <button onClick={f.clear} className="hover:text-primary/60 transition-colors"><X className="w-3 h-3" /></button>
                  </span>
                ))}
                <span className="text-xs text-muted-foreground self-center">
                  {filteredJobs.length} result{filteredJobs.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="h-1 bg-muted rounded-full overflow-hidden mb-6">
            <div className="h-full w-1/2 bg-primary rounded-full progress-indeterminate" />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2 text-xs">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        ) : activeJobs.length === 0 && filteredJobs.length === 0 ? (
          doneJobs.length === 0
            ? <EmptyState onNavigate={onNavigate} />
            : (
              <div className="flex flex-col items-center justify-center py-14 text-center text-muted-foreground border border-dashed border-border rounded-xl">
                <Filter className="w-8 h-8 mb-3 opacity-20" />
                <p className="text-sm font-medium">No results match your filters</p>
                <button onClick={clearAll} className="mt-3 text-xs text-primary hover:underline">Clear filters</button>
              </div>
            )
        ) : (
          <div style={{ columns: '260px 3', columnGap: '1rem' }}>
            {/* Active / loading cards first */}
            {activeJobs.map((job, i) => (
              <div key={job.id} className="card-in" style={{ breakInside: 'avoid', marginBottom: '1rem', animationDelay: `${i * 40}ms` }}>
                <LoadingCard job={job} />
              </div>
            ))}
            {/* Done cards */}
            {filteredJobs.map((job, i) => (
              <div
                key={job.id}
                className="card-in"
                style={{ breakInside: 'avoid', marginBottom: '1rem', animationDelay: `${(activeJobs.length + i) * 40}ms` }}
              >
                <JobCard job={job} onReplicate={handleReplicateHere} onDetails={setDetailJob} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Loading card (queued / running job) ────────────────────────────────────────
function LoadingCard({ job }) {
  const [w, h] = (job.resolution || '16x9').split('x').map(Number);
  const aspectRatio = (w && h) ? `${w} / ${h}` : '16 / 9';

  return (
    <div className="rounded-xl border border-primary/20 bg-card overflow-hidden pulse-ring">
      {/* Animated placeholder */}
      <div
        className="relative bg-muted flex items-center justify-center"
        style={{ aspectRatio }}
      >
        {/* Shimmer overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent animate-[shimmer_1.8s_infinite]" />

        <div className="flex flex-col items-center gap-2 text-muted-foreground z-10">
          <RefreshCw className="w-7 h-7 animate-spin text-primary" />
          <span className="text-xs font-semibold text-primary">
            {job.status === 'queued' ? 'Queued' : 'Generating…'}
          </span>
        </div>

        {/* Type badge */}
        <div className="absolute top-2 left-2">
          <span className={cn(
            "text-xs font-semibold px-2 py-0.5 rounded-full",
            job.type === 'post' ? "bg-purple-500/80 text-white" : "bg-primary/80 text-primary-foreground"
          )}>
            {job.type === 'post' ? 'Post' : 'Video'}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <div>
          <p className="text-sm font-semibold mono truncate">{job.batchName}</p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(job.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        {job.presetName && (
          <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 border border-primary/20 rounded-md px-2 py-1">
            <Sliders className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{job.presetName}</span>
          </div>
        )}
        {/* Progress bar */}
        {job.status === 'running' && typeof job.progress === 'number' && (
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-700"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Filter select ──────────────────────────────────────────────────────────────
function FilterSelect({ value, onChange, options }) {
  const active = value !== options[0].value;
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={cn(
        "h-7 rounded-full border text-xs px-3 pr-6 appearance-none cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-ring",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-secondary text-muted-foreground hover:text-foreground"
      )}
      style={{ backgroundImage: 'none' }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ── Quick action card ──────────────────────────────────────────────────────────
function QuickAction({ icon, title, description, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group text-left p-5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
          {icon}
        </div>
        <div>
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity self-center" />
      </div>
    </button>
  );
}

// Parse "WxH" → CSS aspect-ratio string
function resolveAspect(job) {
  const res = job.resolution;
  if (res) {
    const [w, h] = res.split('x').map(Number);
    if (w && h) return `${w} / ${h}`;
  }
  return isImage(job.outputFile || '') ? '1 / 1' : '16 / 9';
}

// ── Job card ───────────────────────────────────────────────────────────────────
function JobCard({ job, onReplicate, onDetails }) {
  const files       = job.outputFiles?.length > 0 ? job.outputFiles : (job.outputFile ? [job.outputFile] : []);
  const count       = files.length;
  const aspectRatio = resolveAspect(job);

  const [idx, setIdx]             = useState(0);
  const [replicating, setReplicating] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const videoRef                  = useRef(null);
  const current                   = files[idx];

  // Reset media-loaded state when the current file changes
  useEffect(() => { setMediaLoaded(false); }, [current]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [idx]);

  const prev = (e) => { e.stopPropagation(); setIdx(i => (i - 1 + count) % count); };
  const next = (e) => { e.stopPropagation(); setIdx(i => (i + 1) % count); };

  const handleReplicate = async () => {
    if (replicating) return;
    setReplicating(true);
    try { await onReplicate(job); } finally { setReplicating(false); }
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden group hover:border-border/80 transition-all">
      {/* Thumbnail / carousel */}
      <div className="relative bg-muted overflow-hidden" style={{ aspectRatio }}>
        {/* Media loading shimmer */}
        {current && !mediaLoaded && (
          <div className="absolute inset-0 z-10 bg-muted">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent animate-[shimmer_1.8s_infinite]" />
          </div>
        )}

        {current ? (
          isImage(current) ? (
            <img
              key={current}
              src={`${API}/outputs/${current}`}
              alt=""
              className="w-full h-auto block fade-in"
              loading="lazy"
              onLoad={() => setMediaLoaded(true)}
            />
          ) : (
            <video
              key={current}
              ref={videoRef}
              src={`${API}/outputs/${current}`}
              className="w-full h-auto block fade-in"
              preload="metadata"
              muted
              onLoadedMetadata={() => setMediaLoaded(true)}
              onMouseEnter={e => e.currentTarget.play()}
              onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
            />
          )
        ) : (
          <div className="w-full flex items-center justify-center text-muted-foreground/30 py-12">
            {job.type === 'post' ? <ImagePlus className="w-10 h-10" /> : <Film className="w-10 h-10" />}
          </div>
        )}

        {/* Type badge */}
        <div className="absolute top-2 left-2">
          <span className={cn(
            "text-xs font-semibold px-2 py-0.5 rounded-full",
            job.type === 'post' ? "bg-purple-500/80 text-white" : "bg-primary/80 text-primary-foreground"
          )}>
            {job.type === 'post' ? 'Post' : 'Video'}
          </span>
        </div>

        {/* Carousel controls */}
        {count > 1 && (
          <>
            <button onClick={prev} className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={next} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {files.map((_, i) => (
                <button key={i} onClick={e => { e.stopPropagation(); setIdx(i); }}
                  className={cn("rounded-full transition-all", i === idx ? "w-3 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/50 hover:bg-white/80")} />
              ))}
            </div>
            <span className="absolute top-2 right-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white backdrop-blur-sm">
              {idx + 1}/{count}
            </span>
          </>
        )}

        {/* Download */}
        {current && (
          <a
            href={`${API}/outputs/${current}`}
            download={current.split('/').pop()}
            onClick={e => e.stopPropagation()}
            className="absolute bottom-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
            title="Download"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <div>
          <p className="text-sm font-semibold mono truncate">{job.batchName}</p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(job.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {job.presetName && (
          <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 border border-primary/20 rounded-md px-2 py-1">
            <Sliders className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{job.presetName}</span>
          </div>
        )}

        <div className="flex gap-2">
          {job.type !== 'post' && (
            <button
              onClick={() => onDetails(job)}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold h-8 rounded-md border border-border hover:border-primary/40 hover:text-primary transition-all text-muted-foreground"
            >
              <Info className="w-3.5 h-3.5" /> Details
            </button>
          )}
          {job.generationParams && (
            <button
              onClick={handleReplicate}
              disabled={replicating}
              className={cn(
                "flex items-center justify-center gap-1.5 text-xs font-semibold h-8 rounded-md border border-border hover:border-primary/40 hover:text-primary transition-all text-muted-foreground disabled:opacity-60",
                job.type !== 'post' ? "flex-1" : "w-full"
              )}
            >
              {replicating
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Queuing…</>
                : <><Repeat2 className="w-3.5 h-3.5" /> Replicate</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Job Details Modal ──────────────────────────────────────────────────────────
function JobDetailsModal({ job, onClose }) {
  const files = job.outputFiles?.length > 0 ? job.outputFiles : (job.outputFile ? [job.outputFile] : []);

  // Close on Escape
  React.useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-8 px-4">
      <div className="w-full max-w-5xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden fade-in">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30">
          <div>
            <h2 className="text-base font-bold mono">{job.batchName}</h2>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
              <span>{new Date(job.createdAt).toLocaleString()}</span>
              {job.resolution && <span className="font-mono border border-border rounded px-1.5 py-0.5">{job.resolution}</span>}
              {job.presetName && (
                <span className="flex items-center gap-1 text-primary/80">
                  <Sliders className="w-2.5 h-2.5" />{job.presetName}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-border hover:border-primary/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Video list */}
        <div className="p-6 space-y-8">
          {files.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No output files found.</p>
          )}
          {files.map((file, i) => {
            const quote      = (job.videoQuotes || []).find(v => v.file === file)?.quote || '';
            const metadata   = job.videoMetadata?.[file] || null;
            const fileName   = file.split('/').pop();
            const isImg      = isImage(file);

            return (
              <div key={file} className="space-y-4">
                {files.length > 1 && (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <span className="text-sm font-mono font-semibold">{fileName}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,340px)_1fr] gap-5 items-start">
                  {/* Left: video preview + download */}
                  <div className="space-y-2">
                    <div className="rounded-xl overflow-hidden bg-muted border border-border">
                      {isImg ? (
                        <img src={`${API}/outputs/${file}`} alt="" className="w-full h-auto block" />
                      ) : (
                        <video
                          src={`${API}/outputs/${file}`}
                          className="w-full h-auto block"
                          preload="metadata"
                          muted
                          controls
                        />
                      )}
                    </div>
                    <a
                      href={`${API}/outputs/${file}`}
                      download={fileName}
                      className="flex items-center justify-center gap-2 w-full h-9 rounded-lg bg-green-500/20 border border-green-500/40 text-green-400 text-xs font-semibold hover:bg-green-500/30 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </a>
                    {quote && (
                      <div className="text-xs text-muted-foreground italic bg-secondary/50 border border-border rounded-lg px-3 py-2 leading-relaxed">
                        <span className="not-italic font-semibold text-foreground block mb-0.5">Quote used:</span>
                        "{quote}"
                      </div>
                    )}
                  </div>

                  {/* Right: metadata */}
                  <div>
                    <VideoMetadataPanel
                      jobId={job.id}
                      file={file}
                      resolution={job.resolution}
                      initialMetadata={metadata}
                      initialQuote={quote}
                      alwaysOpen
                    />
                  </div>
                </div>

                {i < files.length - 1 && (
                  <div className="h-px bg-border mt-2" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────
function EmptyState({ onNavigate }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground border border-dashed border-border rounded-xl">
      <Film className="w-12 h-12 mb-4 opacity-20" />
      <p className="text-sm font-medium">No generations yet</p>
      <p className="text-xs mt-1 opacity-60">Start by generating your first video or post</p>
      <div className="flex gap-3 mt-5">
        <button onClick={() => onNavigate('generate')} className="text-xs text-primary border border-primary/30 hover:border-primary rounded-md px-3 py-1.5 transition-colors">
          Generate Video
        </button>
        <button onClick={() => onNavigate('posts')} className="text-xs text-primary border border-primary/30 hover:border-primary rounded-md px-3 py-1.5 transition-colors">
          Generate Posts
        </button>
      </div>
    </div>
  );
}
