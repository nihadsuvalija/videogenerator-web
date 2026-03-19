import React, { useEffect, useState, useMemo } from 'react';
import {
  Film, ImagePlus, Clock, RefreshCw,
  Repeat2, Sliders, ArrowRight, Download, X, Filter,
} from 'lucide-react';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';
const isImage = (f) => /\.(jpe?g|png|webp|gif)$/i.test(f);

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
  if (range === 'today') {
    return d.toDateString() === now.toDateString();
  }
  const ms = range === 'week' ? 7 * 86400000 : 30 * 86400000;
  return now - d <= ms;
}

export default function HomePage({ user, onNavigate, onReplicate }) {
  const [jobs, setJobs]     = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [filterDate,       setFilterDate]       = useState('all');
  const [filterType,       setFilterType]       = useState('all');
  const [filterResolution, setFilterResolution] = useState('all');
  const [filterPreset,     setFilterPreset]     = useState('all');

  useEffect(() => {
    fetch(`${API}/api/jobs?page=1&limit=100`)
      .then(r => r.json())
      .then(d => setJobs(d.jobs || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const doneJobs = useMemo(() => jobs.filter(j => j.status === 'done'), [jobs]);

  // Derive unique filter options from the data
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

  // Apply filters
  const filteredJobs = useMemo(() => doneJobs.filter(j => {
    if (filterDate !== 'all'       && !inDateRange(j.createdAt, filterDate)) return false;
    if (filterType !== 'all'       && j.type !== filterType)                  return false;
    if (filterResolution !== 'all' && j.resolution !== filterResolution)      return false;
    if (filterPreset !== 'all') {
      if (filterPreset === '__none__' && j.presetName)   return false;
      if (filterPreset !== '__none__' && j.presetName !== filterPreset) return false;
    }
    return true;
  }), [doneJobs, filterDate, filterType, filterResolution, filterPreset]);

  const activeFilters = [
    filterDate !== 'all'       && { key: 'date',       label: DATE_OPTIONS.find(o => o.value === filterDate)?.label,   clear: () => setFilterDate('all') },
    filterType !== 'all'       && { key: 'type',       label: filterType === 'post' ? 'Posts' : 'Videos',              clear: () => setFilterType('all') },
    filterResolution !== 'all' && { key: 'res',        label: filterResolution,                                         clear: () => setFilterResolution('all') },
    filterPreset !== 'all'     && { key: 'preset',     label: filterPreset === '__none__' ? 'No preset' : filterPreset, clear: () => setFilterPreset('all') },
  ].filter(Boolean);

  const clearAll = () => {
    setFilterDate('all'); setFilterType('all');
    setFilterResolution('all'); setFilterPreset('all');
  };

  return (
    <div className="space-y-8">
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
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Recent Generations</h3>
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

              {/* Date */}
              <FilterSelect
                value={filterDate}
                onChange={setFilterDate}
                options={DATE_OPTIONS}
              />

              {/* Type */}
              <FilterSelect
                value={filterType}
                onChange={setFilterType}
                options={[
                  { value: 'all',   label: 'All types' },
                  { value: 'video', label: 'Video' },
                  { value: 'post',  label: 'Post' },
                ]}
              />

              {/* Resolution */}
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

              {/* Preset */}
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
                <button
                  onClick={clearAll}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Active filter pills */}
            {activeFilters.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {activeFilters.map(f => (
                  <span
                    key={f.key}
                    className="pill-in flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5"
                  >
                    {f.label}
                    <button onClick={f.clear} className="hover:text-primary/60 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <span className="text-xs text-muted-foreground self-center">
                  {filteredJobs.length} result{filteredJobs.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : filteredJobs.length === 0 ? (
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
            {filteredJobs.map((job, i) => (
              <div
                key={job.id}
                className="card-in"
                style={{ breakInside: 'avoid', marginBottom: '1rem', animationDelay: `${i * 40}ms` }}
              >
                <JobCard job={job} onReplicate={onReplicate} />
              </div>
            ))}
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
function JobCard({ job, onReplicate }) {
  const files      = job.outputFiles?.length > 0 ? job.outputFiles : (job.outputFile ? [job.outputFile] : []);
  const preview    = files[0];
  const count      = files.length;
  const aspectRatio = resolveAspect(job);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden group hover:border-border/80 transition-all">
      {/* Thumbnail */}
      <div className="relative bg-muted overflow-hidden" style={{ aspectRatio }}>
        {preview ? (
          isImage(preview) ? (
            <img src={`${API}/outputs/${preview}`} alt="" className="w-full h-auto block" loading="lazy" />
          ) : (
            <video
              src={`${API}/outputs/${preview}`}
              className="w-full h-auto block"
              preload="metadata"
              muted
              onMouseEnter={e => e.currentTarget.play()}
              onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
            />
          )
        ) : (
          <div className="w-full flex items-center justify-center text-muted-foreground/30 py-12">
            {job.type === 'post' ? <ImagePlus className="w-10 h-10" /> : <Film className="w-10 h-10" />}
          </div>
        )}

        {/* Type + count badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <span className={cn(
            "text-xs font-semibold px-2 py-0.5 rounded-full",
            job.type === 'post' ? "bg-purple-500/80 text-white" : "bg-primary/80 text-primary-foreground"
          )}>
            {job.type === 'post' ? 'Post' : 'Video'}
          </span>
          {count > 1 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-black/50 text-white">
              {count} files
            </span>
          )}
        </div>

        {/* Download button — bottom-right corner */}
        {preview && (
          <a
            href={`${API}/outputs/${preview}`}
            download={preview.split('/').pop()}
            onClick={e => e.stopPropagation()}
            className="absolute bottom-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
            title="Download"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Per-file download list for multi-file jobs */}
      {count > 1 && (
        <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1.5 border-b border-border">
          {files.map((f, i) => (
            <a
              key={f}
              href={`${API}/outputs/${f}`}
              download={f.split('/').pop()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors border border-border hover:border-primary/40 rounded px-2 py-0.5"
              title={f.split('/').pop()}
            >
              <Download className="w-2.5 h-2.5" /> {i + 1}
            </a>
          ))}
        </div>
      )}

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

        {job.generationParams && (
          <button
            onClick={() => onReplicate(job)}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold h-8 rounded-md border border-border hover:border-primary/40 hover:text-primary transition-all text-muted-foreground"
          >
            <Repeat2 className="w-3.5 h-3.5" /> Replicate
          </button>
        )}
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
