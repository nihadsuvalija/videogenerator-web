import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, Youtube, Copy, Check, RefreshCw,
  AlertCircle, ChevronDown, ChevronUp, Hash, Tag, FileText, Type, Zap,
  Monitor, Smartphone,
} from 'lucide-react';
import { Button } from './ui-button';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
  Input, Label, Badge, Separator
} from './ui-primitives';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';

const TONES = [
  'Engaging & Casual', 'Professional', 'Humorous & Fun',
  'Inspirational', 'Educational', 'Bold & Direct'
];

// Custom icons for platforms without Lucide equivalents
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

const ALL_PLATFORMS = [
  {
    id: 'youtube',
    label: 'YouTube',
    icon: Youtube,
    color: 'from-red-500 to-red-700',
    accentClasses: {
      tag:     'bg-red-500/10 border-red-500/20 text-red-300 hover:bg-red-500/20',
      hashtag: 'bg-red-500/10 border-red-500/20 text-red-300 hover:bg-red-500/20',
    },
    orientations: ['horizontal', 'vertical'],
    fields: ['title', 'description', 'tags', 'hashtags'],
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: InstagramIcon,
    color: 'from-pink-500 to-purple-600',
    accentClasses: {
      tag:     'bg-pink-500/10 border-pink-500/20 text-pink-300 hover:bg-pink-500/20',
      hashtag: 'bg-pink-500/10 border-pink-500/20 text-pink-300 hover:bg-pink-500/20',
    },
    orientations: ['vertical', 'horizontal'],
    fields: ['title', 'caption', 'hashtags'],
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: TikTokIcon,
    color: 'from-cyan-400 to-pink-500',
    accentClasses: {
      tag:     'bg-cyan-500/10 border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20',
      hashtag: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20',
    },
    orientations: ['vertical', 'horizontal'],
    fields: ['title', 'caption', 'hashtags'],
  },
];

export default function MetadataGenerator() {
  const [ollamaStatus, setOllamaStatus]   = useState(null);
  const [checkingOllama, setCheckingOllama] = useState(false);
  const [topic, setTopic]                 = useState('');
  const [tone, setTone]                   = useState(TONES[0]);
  const [extraContext, setExtraContext]    = useState('');
  const [selectedModel, setSelectedModel] = useState('llama3');
  const [orientation, setOrientation]     = useState('vertical'); // 'horizontal' | 'vertical'
  const [activePlatform, setActivePlatform] = useState('youtube');
  const [results, setResults]             = useState({});
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const [copied, setCopied]               = useState(null);

  // Platforms available for the current orientation
  const platforms = ALL_PLATFORMS.filter(p => p.orientations.includes(orientation));

  const checkOllama = useCallback(async () => {
    setCheckingOllama(true);
    try {
      const res = await fetch(`${API}/api/ollama/status`);
      const data = await res.json();
      setOllamaStatus(data);
      if (data.models?.length > 0) {
        const llama3 = data.models.find(m => m.includes('llama3'));
        const llama  = data.models.find(m => m.includes('llama'));
        if (llama3) setSelectedModel(llama3);
        else if (llama) setSelectedModel(llama);
      }
    } catch {
      setOllamaStatus({ running: false });
    } finally {
      setCheckingOllama(false);
    }
  }, []);

  useEffect(() => { checkOllama(); }, [checkOllama]);

  // Clear results for platforms not available in new orientation
  useEffect(() => {
    setResults(prev => {
      const validIds = new Set(ALL_PLATFORMS.filter(p => p.orientations.includes(orientation)).map(p => p.id));
      const next = {};
      for (const [k, v] of Object.entries(prev)) { if (validIds.has(k)) next[k] = v; }
      return next;
    });
  }, [orientation]);

  const generateOne = async (platformId) => {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setActivePlatform(platformId);
    try {
      const res = await fetch(`${API}/api/metadata/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: platformId, topic, tone, extraContext, model: selectedModel })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(prev => ({ ...prev, [platformId]: data.metadata }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const generateAll = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    for (const p of platforms) {
      setActivePlatform(p.id);
      try {
        const res = await fetch(`${API}/api/metadata/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: p.id, topic, tone, extraContext, model: selectedModel })
        });
        const data = await res.json();
        if (!data.error) setResults(prev => ({ ...prev, [p.id]: data.metadata }));
      } catch {}
    }
    setLoading(false);
  };

  const copyToClipboard = async (text, key) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatForCopy = (platformId, metadata) => {
    if (!metadata) return '';
    const tags = (arr) => (arr || []).map(h => `#${h.replace(/^#/, '')}`).join(' ');
    if (platformId === 'youtube') {
      return `TITLE:\n${metadata.title}\n\nDESCRIPTION:\n${metadata.description}\n\nTAGS:\n${(metadata.tags || []).join(', ')}\n\nHASHTAGS:\n${tags(metadata.hashtags)}`;
    }
    if (platformId === 'instagram' || platformId === 'tiktok') {
      return `${metadata.title}\n\n${metadata.caption}\n\n${tags(metadata.hashtags)}`;
    }
    return '';
  };

  const canGenerate = !!topic.trim() && !!ollamaStatus?.running && !loading;

  return (
    <div className="space-y-6">
      <OllamaStatusBanner
        status={ollamaStatus}
        checking={checkingOllama}
        onRecheck={checkOllama}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            Metadata Generator
          </CardTitle>
          <CardDescription>
            Describe your video — Llama 3 generates platform-optimized titles, descriptions and hashtags
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Content orientation */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Content Orientation</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setOrientation('horizontal')}
                className={cn(
                  "flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                  orientation === 'horizontal'
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                )}
              >
                <Monitor className="w-4 h-4" />
                Horizontal <span className="text-xs opacity-60">(16:9)</span>
              </button>
              <button
                onClick={() => setOrientation('vertical')}
                className={cn(
                  "flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                  orientation === 'vertical'
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                )}
              >
                <Smartphone className="w-4 h-4" />
                Vertical / Square
              </button>
            </div>
            {orientation === 'horizontal' && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                <Youtube className="w-3 h-3 text-red-400" />
                Horizontal content → YouTube only
              </p>
            )}
            {orientation === 'vertical' && (
              <p className="text-xs text-muted-foreground mt-1">
                Vertical / Square → YouTube + Instagram + TikTok
              </p>
            )}
          </div>

          <Separator />

          {/* Topic */}
          <div className="space-y-1.5">
            <Label className="text-xs">Video Topic / Description <span className="text-destructive">*</span></Label>
            <Input
              placeholder="e.g. Morning workout routine for beginners at home"
              value={topic}
              onChange={e => setTopic(e.target.value)}
            />
          </div>

          {/* Tone */}
          <div className="space-y-1.5">
            <Label className="text-xs">Tone</Label>
            <div className="flex flex-wrap gap-2">
              {TONES.map(t => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                    tone === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Extra context */}
          <div className="space-y-1.5">
            <Label className="text-xs">Extra Context <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              placeholder="e.g. targeting Gen Z, product launch, fitness brand..."
              value={extraContext}
              onChange={e => setExtraContext(e.target.value)}
            />
          </div>

          <Separator />

          {/* Generate buttons */}
          <div className="space-y-2">
            <Button
              className="w-full h-11 font-bold"
              onClick={generateAll}
              disabled={!canGenerate}
            >
              {loading ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Generating for {activePlatform}…</>
              ) : (
                <><Zap className="w-4 h-4" /> Generate for All ({platforms.map(p => p.label).join(', ')})</>
              )}
            </Button>
            <div className={cn("grid gap-2", platforms.length === 1 ? "grid-cols-1" : platforms.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
              {platforms.map(p => {
                const PIcon = p.icon;
                return (
                  <Button
                    key={p.id}
                    variant="outline"
                    onClick={() => generateOne(p.id)}
                    disabled={!canGenerate}
                    className="h-9 text-xs"
                  >
                    {loading && activePlatform === p.id
                      ? <RefreshCw className="w-3 h-3 animate-spin" />
                      : <PIcon className="w-3.5 h-3.5" />
                    }
                    {p.label}
                  </Button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {platforms.map(platform => {
        const metadata = results[platform.id];
        if (!metadata) return null;
        return (
          <PlatformResult
            key={platform.id}
            platform={platform}
            metadata={metadata}
            onCopyAll={() => copyToClipboard(formatForCopy(platform.id, metadata), `all-${platform.id}`)}
            copied={copied}
            onCopy={copyToClipboard}
          />
        );
      })}
    </div>
  );
}

// ─── Ollama Status Banner ─────────────────────────────────────────────────────
function OllamaStatusBanner({ status, checking, onRecheck, selectedModel, onModelChange }) {
  const [showSetup, setShowSetup] = useState(false);
  if (!status) return null;

  if (status.running) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm font-semibold text-green-400">Ollama Running</span>
            {selectedModel && (
              <Badge variant="secondary" className="text-xs mono">{selectedModel}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {status.models?.length > 0 && (
              <select
                value={selectedModel}
                onChange={e => onModelChange(e.target.value)}
                className="text-xs bg-secondary border border-border rounded px-2 py-1 text-foreground"
              >
                {status.models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            <Button variant="ghost" size="sm" onClick={onRecheck} className="h-7 text-xs">
              <RefreshCw className={cn("w-3 h-3", checking && "animate-spin")} />
            </Button>
          </div>
        </div>
        {!status.hasLlama && (
          <p className="text-xs text-yellow-400 mt-2">
            ⚠️ No Llama model found. Run: <code className="bg-secondary px-1 rounded">ollama pull llama3</code>
          </p>
        )}
        {status.hasLlama && !status.models?.some(m => m.includes('llama3')) && (
          <p className="text-xs text-yellow-400 mt-2">
            ⚠️ Llama 3 not found — using {selectedModel}. For best results: <code className="bg-secondary px-1 rounded">ollama pull llama3</code>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-yellow-400" />
          <span className="text-sm font-semibold text-yellow-400">Ollama Not Detected</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onRecheck} className="h-7 text-xs" disabled={checking}>
          {checking ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Recheck'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Ollama must be running locally to generate metadata.</p>
      <button
        onClick={() => setShowSetup(!showSetup)}
        className="flex items-center gap-1 text-xs text-primary hover:underline"
      >
        {showSetup ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {showSetup ? 'Hide' : 'Show'} setup instructions
      </button>
      {showSetup && (
        <div className="space-y-2 slide-up">
          <SetupStep step={1} label="Install Ollama" code="brew install ollama" />
          <SetupStep step={2} label="Start Ollama" code="ollama serve" />
          <SetupStep step={3} label="Pull Llama 3 model" code="ollama pull llama3" note="~4.7GB download" />
          <SetupStep step={4} label="Recheck connection above" />
        </div>
      )}
    </div>
  );
}

function SetupStep({ step, label, code, note }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-start gap-3">
      <div className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">
        {step}
      </div>
      <div className="flex-1">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        {code && (
          <div className="flex items-center gap-2">
            <code className="text-xs bg-secondary px-2 py-1 rounded mono text-foreground">{code}</code>
            <button onClick={copy} className="text-muted-foreground hover:text-primary transition-colors">
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            </button>
            {note && <span className="text-xs text-muted-foreground">{note}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Platform Result Card ─────────────────────────────────────────────────────
function PlatformResult({ platform, metadata, onCopyAll, copied, onCopy }) {
  const PlatformIcon = platform.icon;
  return (
    <Card className="slide-up overflow-hidden">
      <div className={`h-1 w-full bg-gradient-to-r ${platform.color}`} />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <PlatformIcon className="w-4 h-4" />
            {platform.label} Metadata
          </CardTitle>
          <Button variant="outline" size="sm" onClick={onCopyAll} className="h-7 text-xs gap-1">
            {copied === `all-${platform.id}`
              ? <><Check className="w-3 h-3 text-green-400" /> Copied!</>
              : <><Copy className="w-3 h-3" /> Copy All</>
            }
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {metadata.title && (
          <MetadataField icon={Type} label="Title" value={metadata.title}
            copyKey={`${platform.id}-title`} copied={copied} onCopy={onCopy} />
        )}
        {(metadata.caption || metadata.description) && (
          <MetadataField
            icon={FileText}
            label={platform.id === 'youtube' ? 'Description' : 'Caption'}
            value={metadata.caption || metadata.description}
            copyKey={`${platform.id}-desc`} copied={copied} onCopy={onCopy} multiline
          />
        )}
        {metadata.tags?.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Tag className="w-3 h-3" /> Tags
                <Badge variant="secondary" className="text-xs">{metadata.tags.length}</Badge>
              </span>
              <CopyButton value={metadata.tags.join(', ')} copyKey={`${platform.id}-tags`} copied={copied} onCopy={onCopy} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {metadata.tags.map((tag, i) => (
                <span key={i} onClick={() => onCopy(tag, `tag-${platform.id}-${i}`)}
                  className={cn("cursor-pointer px-2 py-0.5 rounded border text-xs transition-colors", platform.accentClasses.tag)}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
        {metadata.hashtags?.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Hash className="w-3 h-3" /> Hashtags
                <Badge variant="secondary" className="text-xs">{metadata.hashtags.length}</Badge>
              </span>
              <CopyButton
                value={metadata.hashtags.map(h => `#${h.replace(/^#/, '')}`).join(' ')}
                copyKey={`${platform.id}-hashtags`} copied={copied} onCopy={onCopy}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {metadata.hashtags.map((tag, i) => {
                const clean = `#${tag.replace(/^#/, '')}`;
                return (
                  <span key={i} onClick={() => onCopy(clean, `htag-${platform.id}-${i}`)}
                    className={cn("cursor-pointer px-2 py-0.5 rounded border text-xs transition-colors", platform.accentClasses.hashtag)}>
                    {clean}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetadataField({ icon: Icon, label, value, copyKey, copied, onCopy, multiline }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <Icon className="w-3 h-3" /> {label}
        </span>
        <CopyButton value={value} copyKey={copyKey} copied={copied} onCopy={onCopy} />
      </div>
      <div className={cn(
        "rounded-lg bg-secondary/50 border border-border px-3 py-2.5 text-sm text-foreground",
        multiline && "whitespace-pre-wrap leading-relaxed"
      )}>
        {value}
      </div>
    </div>
  );
}

function CopyButton({ value, copyKey, copied, onCopy }) {
  return (
    <button
      onClick={() => onCopy(value, copyKey)}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
    >
      {copied === copyKey
        ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied</span></>
        : <><Copy className="w-3 h-3" /><span>Copy</span></>
      }
    </button>
  );
}
