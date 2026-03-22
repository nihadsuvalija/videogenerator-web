import React, { useState } from 'react';
import {
  Sparkles, RefreshCw, Copy, Check, Hash, Tag, FileText, Type,
  AlertCircle, Youtube, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Badge } from './ui-primitives';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';

const TONES = ['Engaging & Casual', 'Professional', 'Inspirational', 'Bold & Direct'];

// Inline platform icons
function InstagramIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <circle cx="12" cy="12" r="4"/>
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
    </svg>
  );
}
function TikTokIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/>
    </svg>
  );
}

const PLATFORM_CONFIG = {
  youtube: {
    label: 'YouTube', icon: Youtube,
    color: 'from-red-500 to-red-700',
    badgeClass: 'bg-red-500/10 border-red-500/20 text-red-300',
    tagClass:   'bg-red-500/10 border-red-500/20 text-red-300 hover:bg-red-500/20',
  },
  instagram: {
    label: 'Instagram', icon: InstagramIcon,
    color: 'from-pink-500 to-purple-600',
    badgeClass: 'bg-pink-500/10 border-pink-500/20 text-pink-300',
    tagClass:   'bg-pink-500/10 border-pink-500/20 text-pink-300 hover:bg-pink-500/20',
  },
  tiktok: {
    label: 'TikTok', icon: TikTokIcon,
    color: 'from-cyan-400 to-pink-500',
    badgeClass: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300',
    tagClass:   'bg-cyan-500/10 border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20',
  },
};

/**
 * VideoMetadataPanel
 * Props:
 *   jobId          — MongoDB job id
 *   file           — output filename (e.g. "output_xxx.mp4" or "FOLDER/output_1.mp4")
 *   resolution     — e.g. "1920x1080"
 *   initialMetadata — cached per-file results from job.videoMetadata[file] (optional)
 *   initialQuote   — the quote already stored on the job (optional)
 */
export default function VideoMetadataPanel({ jobId, file, resolution, initialMetadata, initialQuote, alwaysOpen = false }) {
  const [open, setOpen]       = useState(alwaysOpen || !!initialMetadata);
  const [loading, setLoading] = useState(false);
  const [tone, setTone]       = useState(TONES[0]);
  const [results, setResults] = useState(initialMetadata || null);
  const [platforms, setPlatforms] = useState(
    initialMetadata ? Object.keys(initialMetadata) : []
  );
  const [quote, setQuote]     = useState(initialQuote || '');
  const [error, setError]     = useState(null);
  const [copied, setCopied]   = useState(null);
  const [showTone, setShowTone] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/jobs/${jobId}/metadata/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, tone }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results);
      setPlatforms(data.platforms);
      setQuote(data.quote || '');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    if (!results) generate();
  };

  // Auto-generate on mount if alwaysOpen and no data yet
  React.useEffect(() => {
    if (alwaysOpen && !results && !loading) generate();
  }, []); // eslint-disable-line

  const copy = async (text, key) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatAll = (pid, metadata) => {
    if (!metadata) return '';
    const hashtags = (metadata.hashtags || []).map(h => `#${h.replace(/^#/, '')}`).join(' ');
    if (pid === 'youtube') {
      return `TITLE:\n${metadata.title}\n\nDESCRIPTION:\n${metadata.description}\n\nTAGS:\n${(metadata.tags || []).join(', ')}\n\nHASHTAGS:\n${hashtags}`;
    }
    return `${metadata.title}\n\n${metadata.caption}\n\n${hashtags}`;
  };

  // Collapsed state — just show the trigger button
  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors border border-border hover:border-primary/40 rounded-md px-2.5 py-1.5 w-full justify-center"
      >
        <Sparkles className="w-3 h-3" /> Generate Metadata
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-secondary/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/40">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Metadata</span>
          {platforms.length > 0 && (
            <div className="flex gap-1">
              {platforms.map(pid => {
                const cfg = PLATFORM_CONFIG[pid];
                if (!cfg) return null;
                const Icon = cfg.icon;
                return <Icon key={pid} className="w-3 h-3 text-muted-foreground" />;
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Tone picker toggle */}
          <button
            onClick={() => setShowTone(v => !v)}
            className="text-[10px] text-muted-foreground hover:text-foreground border border-border rounded px-1.5 py-0.5 transition-colors"
          >
            {tone.split(' ')[0]}
          </button>
          {/* Regenerate */}
          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors border border-border rounded px-1.5 py-0.5"
          >
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
            {loading ? 'Generating…' : 'Regenerate'}
          </button>
          {!alwaysOpen && (
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors ml-1">
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tone picker */}
      {showTone && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-border bg-secondary/20">
          {TONES.map(t => (
            <button
              key={t}
              onClick={() => { setTone(t); setShowTone(false); }}
              className={cn(
                "px-2 py-0.5 rounded-full text-xs border transition-all",
                tone === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="p-3 space-y-3">
        {/* Quote used */}
        {quote && (
          <div className="text-xs text-muted-foreground bg-secondary/50 rounded px-2.5 py-1.5 italic border border-border">
            Based on: <span className="text-foreground not-italic">"{quote}"</span>
          </div>
        )}

        {/* Loading */}
        {loading && !results && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating platform metadata via Llama 3…
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-2.5 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Platform results */}
        {results && platforms.map(pid => {
          const cfg = PLATFORM_CONFIG[pid];
          const meta = results[pid];
          if (!cfg || !meta) return null;
          const Icon = cfg.icon;
          return (
            <PlatformBlock
              key={pid}
              pid={pid}
              cfg={cfg}
              Icon={Icon}
              meta={meta}
              copied={copied}
              onCopy={copy}
              onCopyAll={() => copy(formatAll(pid, meta), `all-${pid}`)}
            />
          );
        })}
      </div>
    </div>
  );
}

function PlatformBlock({ pid, cfg, Icon, meta, copied, onCopy, onCopyAll }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Platform header */}
      <div className={`h-0.5 w-full bg-gradient-to-r ${cfg.color}`} />
      <div
        className="flex items-center justify-between px-3 py-2 bg-secondary/30 cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" />
          <span className="text-xs font-semibold">{cfg.label}</span>
          {meta.title && (
            <span className="text-xs text-muted-foreground truncate max-w-[180px] hidden sm:block">
              — {meta.title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); onCopyAll(); }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            {copied === `all-${pid}`
              ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied</span></>
              : <><Copy className="w-3 h-3" /><span>Copy All</span></>
            }
          </button>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          }
        </div>
      </div>

      {expanded && (
        <div className="p-3 space-y-2.5">
          {/* Title */}
          {meta.title && (
            <MetaRow icon={Type} label="Title" value={meta.title} copyKey={`${pid}-title`} copied={copied} onCopy={onCopy} />
          )}
          {/* Description / Caption */}
          {(meta.description || meta.caption) && (
            <MetaRow
              icon={FileText}
              label={pid === 'youtube' ? 'Description' : 'Caption'}
              value={meta.description || meta.caption}
              copyKey={`${pid}-desc`} copied={copied} onCopy={onCopy} multiline
            />
          )}
          {/* Tags (YouTube) */}
          {meta.tags?.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                  <Tag className="w-2.5 h-2.5" /> Tags
                  <Badge variant="secondary" className="text-[10px] h-4">{meta.tags.length}</Badge>
                </span>
                <CopyBtn value={meta.tags.join(', ')} copyKey={`${pid}-tags`} copied={copied} onCopy={onCopy} />
              </div>
              <div className="flex flex-wrap gap-1">
                {meta.tags.map((t, i) => (
                  <span key={i} onClick={() => onCopy(t, `tag-${pid}-${i}`)}
                    className={cn("cursor-pointer px-1.5 py-0.5 rounded border text-[10px] transition-colors", cfg.tagClass)}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Hashtags */}
          {meta.hashtags?.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                  <Hash className="w-2.5 h-2.5" /> Hashtags
                  <Badge variant="secondary" className="text-[10px] h-4">{meta.hashtags.length}</Badge>
                </span>
                <CopyBtn
                  value={meta.hashtags.map(h => `#${h.replace(/^#/, '')}`).join(' ')}
                  copyKey={`${pid}-hashtags`} copied={copied} onCopy={onCopy}
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {meta.hashtags.map((h, i) => {
                  const clean = `#${h.replace(/^#/, '')}`;
                  return (
                    <span key={i} onClick={() => onCopy(clean, `htag-${pid}-${i}`)}
                      className={cn("cursor-pointer px-1.5 py-0.5 rounded border text-[10px] transition-colors", cfg.tagClass)}>
                      {clean}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetaRow({ icon: Icon, label, value, copyKey, copied, onCopy, multiline }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
          <Icon className="w-2.5 h-2.5" /> {label}
        </span>
        <CopyBtn value={value} copyKey={copyKey} copied={copied} onCopy={onCopy} />
      </div>
      <div className={cn(
        "text-xs bg-secondary/50 border border-border rounded px-2.5 py-2 text-foreground",
        multiline && "whitespace-pre-wrap leading-relaxed"
      )}>
        {value}
      </div>
    </div>
  );
}

function CopyBtn({ value, copyKey, copied, onCopy }) {
  return (
    <button
      onClick={() => onCopy(value, copyKey)}
      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
    >
      {copied === copyKey
        ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied</span></>
        : <><Copy className="w-3 h-3" /><span>Copy</span></>
      }
    </button>
  );
}
