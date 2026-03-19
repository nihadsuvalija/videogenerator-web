import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sliders, Plus, Trash2, Lock, Unlock, ChevronDown, ChevronRight,
  Zap, Check, RefreshCw, Copy, LayoutTemplate
} from 'lucide-react';
import { Button } from './ui-button';
import {
  Card, CardContent,
  Input, Label, Badge, Separator
} from './ui-primitives';
import LayoutEditor from './LayoutEditor';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';

const RESOLUTION_OPTIONS = [
  { key: '1920x1080', label: '1920×1080', sub: '16:9 Landscape' },
  { key: '1080x1080', label: '1080×1080', sub: '1:1 Square' },
  { key: '1080x1920', label: '1080×1920', sub: '9:16 Portrait' },
  { key: '3840x2160', label: '3840×2160', sub: '4K Landscape' },
  { key: '2160x3840', label: '2160×3840', sub: '4K Portrait' },
];

export default function PresetsPanel({ onApplyPreset, onPresetsChanged }) {
  const [presets, setPresets]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [creating, setCreating]     = useState(false);
  const [savingId, setSavingId]     = useState(null);
  const [savedId, setSavedId]       = useState(null);

  const loadPresets = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/presets`);
      setPresets(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadPresets(); }, [loadPresets]);

  const createPreset = async () => {
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/presets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Preset ${presets.length + 1}` })
      });
      const preset = await res.json();
      setPresets(p => [preset, ...p]);
      setExpandedId(preset.id);
      onPresetsChanged?.();
    } finally { setCreating(false); }
  };

  const updatePreset = async (id, patch) => {
    setPresets(p => p.map(pr => pr.id === id ? { ...pr, ...patch } : pr));
    setSavingId(id);
    try {
      await fetch(`${API}/api/presets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      setSavedId(id);
      setTimeout(() => setSavedId(null), 1500);
    } finally { setSavingId(null); }
  };

  const deletePreset = async (id) => {
    await fetch(`${API}/api/presets/${id}`, { method: 'DELETE' });
    setPresets(p => p.filter(pr => pr.id !== id));
    if (expandedId === id) setExpandedId(null);
    onPresetsChanged?.();
  };

  const duplicatePreset = async (preset) => {
    const res = await fetch(`${API}/api/presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...preset, name: `${preset.name} (copy)`, id: undefined, _id: undefined })
    });
    const newPreset = await res.json();
    setPresets(p => [newPreset, ...p]);
    setExpandedId(newPreset.id);
    onPresetsChanged?.();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading presets...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {presets.length === 0 ? 'No presets yet.' : `${presets.length} preset${presets.length !== 1 ? 's' : ''}`}
        </p>
        <Button onClick={createPreset} disabled={creating} size="sm">
          {creating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          New Preset
        </Button>
      </div>

      {presets.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Sliders className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm text-muted-foreground">Create a preset to save your generation settings</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Resolution, slice durations, text overlays, layout positions</p>
        </div>
      )}

      {presets.map(preset => (
        <PresetCard
          key={preset.id}
          preset={preset}
          expanded={expandedId === preset.id}
          onToggle={() => setExpandedId(expandedId === preset.id ? null : preset.id)}
          onUpdate={(patch) => updatePreset(preset.id, patch)}
          onDelete={() => deletePreset(preset.id)}
          onDuplicate={() => duplicatePreset(preset)}
          onApply={() => onApplyPreset(preset)}
          saving={savingId === preset.id}
          saved={savedId === preset.id}
        />
      ))}
    </div>
  );
}

// ── Tabs within a preset card ─────────────────────────────────────────────────
const PRESET_TABS = [
  { id: 'settings', label: 'Settings' },
  { id: 'layout',   label: 'Layout Editor', icon: LayoutTemplate },
];

function PresetCard({ preset, expanded, onToggle, onUpdate, onDelete, onDuplicate, onApply, saving, saved }) {
  const debounceRef = useRef({});
  const [activeTab, setActiveTab] = useState('settings');

  const debouncedUpdate = useCallback((field, value) => {
    if (debounceRef.current[field]) clearTimeout(debounceRef.current[field]);
    debounceRef.current[field] = setTimeout(() => onUpdate({ [field]: value }), 700);
  }, [onUpdate]);

  const immediateUpdate = useCallback((field, value) => {
    if (debounceRef.current[field]) clearTimeout(debounceRef.current[field]);
    onUpdate({ [field]: value });
  }, [onUpdate]);

  const handleLayoutChange = useCallback((layoutPatch) => {
    onUpdate(layoutPatch);
  }, [onUpdate]);

  return (
    <Card className={cn(
      "transition-all duration-200",
      expanded && "ring-1 ring-primary/30",
      preset.locked && "border-yellow-500/30"
    )}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("transition-transform duration-200", expanded ? "rotate-90" : "rotate-0")}>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
          <input
            className="bg-transparent font-semibold text-sm text-foreground outline-none border-b border-transparent hover:border-border focus:border-primary transition-colors min-w-0 w-40"
            value={preset.name}
            onClick={e => e.stopPropagation()}
            onChange={e => onUpdate({ name: e.target.value })}
            onBlur={e => onUpdate({ name: e.target.value })}
          />
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Badge variant="secondary" className="text-xs mono">{preset.resolution}</Badge>
            {preset.locked && (
              <Badge className="text-xs bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                <Lock className="w-2.5 h-2.5 mr-1" /> Locked
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <div className="w-5 flex items-center justify-center">
            {saving && <RefreshCw className="w-3 h-3 text-muted-foreground animate-spin" />}
            {saved && !saving && <Check className="w-3 h-3 text-green-400" />}
          </div>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-primary hover:text-primary" onClick={onApply}>
            <Zap className="w-3 h-3" /> Apply
          </Button>
          <button onClick={() => immediateUpdate('locked', !preset.locked)}
            className={cn("p-1.5 rounded hover:bg-secondary transition-colors", preset.locked ? "text-yellow-400" : "text-muted-foreground")}>
            {preset.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onDuplicate} className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border">
          {/* Tab row */}
          <div className="flex border-b border-border px-4 bg-secondary/20">
            {PRESET_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-all -mb-px",
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.icon && <tab.icon className="w-3 h-3" />}
                {tab.label}
              </button>
            ))}
          </div>

          <CardContent className="pt-4">
            {activeTab === 'settings' && (
              <div className="space-y-5">
                {/* Timing */}
                <Section title="Timing">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Video slice (sec)">
                      <Input type="number" min="1" max="120" step="1"
                        defaultValue={preset.sliceDuration} disabled={preset.locked}
                        onChange={e => debouncedUpdate('sliceDuration', Number(e.target.value))} />
                    </Field>
                    <Field label="Image duration (sec)">
                      <Input type="number" min="0.1" max="30" step="0.1"
                        defaultValue={preset.imageDuration} disabled={preset.locked}
                        onChange={e => debouncedUpdate('imageDuration', Number(e.target.value))} />
                    </Field>
                  </div>
                </Section>

                <Separator />

                {/* Resolution */}
                <Section title="Resolution">
                  <div className="grid grid-cols-1 gap-1.5">
                    {RESOLUTION_OPTIONS.map(r => (
                      <button key={r.key} disabled={preset.locked}
                        onClick={() => !preset.locked && immediateUpdate('resolution', r.key)}
                        className={cn(
                          "flex items-center justify-between px-3 py-2 rounded-lg border text-left text-sm transition-all",
                          preset.resolution === r.key ? "border-primary bg-primary/10" : "border-border hover:border-border/80 text-muted-foreground",
                          preset.locked && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {preset.resolution === r.key
                            ? <Check className="w-3.5 h-3.5 text-primary" />
                            : <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/40" />}
                          <span className={cn("font-semibold mono text-xs", preset.resolution === r.key && "text-primary")}>{r.label}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{r.sub}</span>
                      </button>
                    ))}
                  </div>
                </Section>

                <Separator />

                {/* Text overlays */}
                <Section title="Text Overlay">
                  <div className="space-y-2">
                    <Input placeholder="Title text (e.g. My Brand)" defaultValue={preset.logoText}
                      disabled={preset.locked} onChange={e => debouncedUpdate('logoText', e.target.value)} />
                    <Input placeholder="Subtitle text (e.g. @handle)" defaultValue={preset.logoSubtext}
                      disabled={preset.locked} onChange={e => debouncedUpdate('logoSubtext', e.target.value)} />
                    <div className="flex items-center gap-2 pt-1">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Max chars / line</Label>
                      <Input
                        type="number" min="0" max="200" step="1"
                        defaultValue={preset.textMaxChars ?? 0}
                        disabled={preset.locked}
                        onChange={e => debouncedUpdate('textMaxChars', Number(e.target.value))}
                        className="w-24"
                        placeholder="0 = off"
                      />
                      {(preset.textMaxChars > 0) && (
                        <span className="text-xs text-muted-foreground">wraps at {preset.textMaxChars} chars</span>
                      )}
                    </div>
                  </div>
                </Section>

                <Separator />

                {/* Preferred duration */}
                <Section title="Preferred Output Duration">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" min="0" max="3600" step="1"
                      defaultValue={preset.preferredDuration ?? 20}
                      disabled={preset.locked}
                      className="w-28"
                      placeholder="0 = match audio"
                      onChange={e => debouncedUpdate('preferredDuration', Number(e.target.value) || 0)}
                      onBlur={e => { if (e.target.value === '') debouncedUpdate('preferredDuration', 0); }}
                    />
                    <span className="text-xs text-muted-foreground">seconds — 0 = match audio length</span>
                  </div>
                </Section>

                <Separator />

                {/* Number of videos */}
                <Section title="Number of Videos to Generate" description="If more than 1, all outputs are saved into a timestamped folder.">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" min="1" max="20" step="1"
                      defaultValue={preset.videoCount ?? 1}
                      disabled={preset.locked}
                      className="w-24"
                      onChange={e => debouncedUpdate('videoCount', Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                    />
                    <span className="text-xs text-muted-foreground">video{(preset.videoCount ?? 1) !== 1 ? 's' : ''} per generation run</span>
                  </div>
                </Section>

                {preset.locked && (
                  <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                    <p className="text-xs text-yellow-400">Preset is locked. Unlock to make changes.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'layout' && (
              <div>
                <p className="text-xs text-muted-foreground mb-4">
                  Drag elements on the canvas to set positions. Changes auto-save to this preset.
                </p>
                <LayoutEditor
                  preset={preset}
                  onLayoutChange={handleLayoutChange}
                />
              </div>
            )}
          </CardContent>
        </div>
      )}
    </Card>
  );
}

function Section({ title, description, children }) {
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs uppercase tracking-widest text-muted-foreground">{title}</Label>
        {description && <p className="text-xs text-muted-foreground/70 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function FileList({ label, files, color, onRemove, locked }) {
  if (files.length === 0) return null;
  const colorMap = {
    blue:   'border-blue-500/30 bg-blue-500/10 text-blue-300',
    purple: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  };
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label} ({files.length})</p>
      <div className="space-y-1">
        {files.map(f => (
          <div key={f} className={cn("flex items-center justify-between px-2 py-1 rounded border text-xs", colorMap[color])}>
            <span className="mono truncate">{f}</span>
            {!locked && (
              <button onClick={() => onRemove(f)} className="ml-2 opacity-60 hover:opacity-100 flex-shrink-0">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
