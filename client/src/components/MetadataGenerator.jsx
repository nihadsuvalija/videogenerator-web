import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, Instagram, Youtube, Copy, Check, RefreshCw,
  AlertCircle, ChevronDown, ChevronUp, Hash, Tag, FileText, Type, Zap
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

const PLATFORMS = [
  {
    id: 'instagram',
    label: 'Instagram',
    icon: Instagram,
    color: 'from-pink-500 to-purple-600',
    accent: 'pink',
    fields: ['title', 'caption', 'hashtags'],
  },
  {
    id: 'youtube',
    label: 'YouTube',
    icon: Youtube,
    color: 'from-red-500 to-red-700',
    accent: 'red',
    fields: ['title', 'description', 'tags', 'hashtags'],
  },
];

export default function MetadataGenerator() {
  const [ollamaStatus, setOllamaStatus] = useState(null); // null | {running, models, hasLlama}
  const [checkingOllama, setCheckingOllama] = useState(false);
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState(TONES[0]);
  const [extraContext, setExtraContext] = useState('');
  const [selectedModel, setSelectedModel] = useState('llama2');
  const [activePlatform, setActivePlatform] = useState('instagram');
  const [results, setResults] = useState({}); // { instagram: {...}, youtube: {...} }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const [expandedField, setExpandedField] = useState(null);

  const checkOllama = useCallback(async () => {
    setCheckingOllama(true);
    try {
      const res = await fetch(`${API}/api/ollama/status`);
      const data = await res.json();
      setOllamaStatus(data);
      if (data.models?.length > 0) {
        const llama = data.models.find(m => m.includes('llama2') || m.includes('llama'));
        if (llama) setSelectedModel(llama);
      }
    } catch {
      setOllamaStatus({ running: false });
    } finally {
      setCheckingOllama(false);
    }
  }, []);

  useEffect(() => { checkOllama(); }, [checkOllama]);

  const generate = async (platform) => {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setActivePlatform(platform);
    try {
      const res = await fetch(`${API}/api/metadata/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, topic, tone, extraContext, model: selectedModel })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(prev => ({ ...prev, [platform]: data.metadata }));
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
    for (const p of PLATFORMS) {
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

  const formatForCopy = (platform, metadata) => {
    if (!metadata) return '';
    if (platform === 'instagram') {
      return `${metadata.title}\n\n${metadata.caption}\n\n${(metadata.hashtags || []).map(h => `#${h.replace(/^#/, '')}`).join(' ')}`;
    }
    if (platform === 'youtube') {
      return `TITLE:\n${metadata.title}\n\nDESCRIPTION:\n${metadata.description}\n\nTAGS:\n${(metadata.tags || []).join(', ')}\n\nHASHTAGS:\n${(metadata.hashtags || []).map(h => `#${h.replace(/^#/, '')}`).join(' ')}`;
    }
    return '';
  };

  return (
    <div className="space-y-6">
      {/* Ollama Status Banner */}
      <OllamaStatusBanner
        status={ollamaStatus}
        checking={checkingOllama}
        onRecheck={checkOllama}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
      />

      {/* Input Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            Metadata Generator
          </CardTitle>
          <CardDescription>
            Describe your video and Llama 2 will generate platform-optimized metadata
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Video Topic / Description <span className="text-destructive">*</span></Label>
            <Input
              placeholder="e.g. Morning workout routine for beginners at home"
              value={topic}
              onChange={e => setTopic(e.target.value)}
            />
          </div>

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

          <div className="space-y-1.5">
            <Label className="text-xs">Extra Context (optional)</Label>
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
              disabled={loading || !topic.trim() || !ollamaStatus?.running}
            >
              {loading ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Generating for {activePlatform}...</>
              ) : (
                <><Zap className="w-4 h-4" /> Generate for All Platforms</>
              )}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              {PLATFORMS.map(p => (
                <Button
                  key={p.id}
                  variant="outline"
                  onClick={() => generate(p.id)}
                  disabled={loading || !topic.trim() || !ollamaStatus?.running}
                  className="h-9 text-xs"
                >
                  {loading && activePlatform === p.id
                    ? <RefreshCw className="w-3 h-3 animate-spin" />
                    : <p.icon className="w-3.5 h-3.5" />
                  }
                  {p.label} Only
                </Button>
              ))}
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
      {PLATFORMS.map(platform => {
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
            expandedField={expandedField}
            onToggleField={setExpandedField}
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
            ⚠️ No Llama model found. Run: <code className="bg-secondary px-1 rounded">ollama pull llama2</code>
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
      <p className="text-xs text-muted-foreground">Ollama must be running locally to use metadata generation.</p>
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
          <SetupStep step={3} label="Pull Llama 2 model" code="ollama pull llama2" note="~3.8GB download" />
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
function PlatformResult({ platform, metadata, onCopyAll, copied, onCopy, expandedField, onToggleField }) {
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
          <Button
            variant="outline"
            size="sm"
            onClick={onCopyAll}
            className="h-7 text-xs gap-1"
          >
            {copied === `all-${platform.id}`
              ? <><Check className="w-3 h-3 text-green-400" /> Copied!</>
              : <><Copy className="w-3 h-3" /> Copy All</>
            }
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Title */}
        {metadata.title && (
          <MetadataField
            icon={Type}
            label="Title"
            value={metadata.title}
            copyKey={`${platform.id}-title`}
            copied={copied}
            onCopy={onCopy}
          />
        )}

        {/* Caption / Description */}
        {(metadata.caption || metadata.description) && (
          <MetadataField
            icon={FileText}
            label={platform.id === 'instagram' ? 'Caption' : 'Description'}
            value={metadata.caption || metadata.description}
            copyKey={`${platform.id}-desc`}
            copied={copied}
            onCopy={onCopy}
            multiline
          />
        )}

        {/* Tags (YouTube) */}
        {metadata.tags && metadata.tags.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Tag className="w-3 h-3" /> Tags
                <Badge variant="secondary" className="text-xs">{metadata.tags.length}</Badge>
              </span>
              <CopyButton
                value={metadata.tags.join(', ')}
                copyKey={`${platform.id}-tags`}
                copied={copied}
                onCopy={onCopy}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {metadata.tags.map((tag, i) => (
                <span
                  key={i}
                  onClick={() => onCopy(tag, `tag-${i}`)}
                  className="cursor-pointer px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-300 text-xs hover:bg-red-500/20 transition-colors"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Hashtags */}
        {metadata.hashtags && metadata.hashtags.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Hash className="w-3 h-3" /> Hashtags
                <Badge variant="secondary" className="text-xs">{metadata.hashtags.length}</Badge>
              </span>
              <CopyButton
                value={metadata.hashtags.map(h => `#${h.replace(/^#/, '')}`).join(' ')}
                copyKey={`${platform.id}-hashtags`}
                copied={copied}
                onCopy={onCopy}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {metadata.hashtags.map((tag, i) => {
                const clean = `#${tag.replace(/^#/, '')}`;
                const colorClass = platform.id === 'instagram'
                  ? 'bg-pink-500/10 border-pink-500/20 text-pink-300 hover:bg-pink-500/20'
                  : 'bg-red-500/10 border-red-500/20 text-red-300 hover:bg-red-500/20';
                return (
                  <span
                    key={i}
                    onClick={() => onCopy(clean, `htag-${platform.id}-${i}`)}
                    className={cn("cursor-pointer px-2 py-0.5 rounded border text-xs transition-colors", colorClass)}
                  >
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
