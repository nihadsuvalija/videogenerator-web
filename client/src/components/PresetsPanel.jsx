import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sliders, Plus, Trash2, Lock, Unlock, ChevronRight,
  Zap, Check, RefreshCw, Copy, LayoutTemplate, Upload, Image,
  Film, ImagePlus, Video
} from 'lucide-react';
import { Button } from './ui-button';
import {
  Card, CardContent,
  Input, Label, Badge, Separator
} from './ui-primitives';
import LayoutEditor from './LayoutEditor';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';

export default function PresetsPanel({ onApplyPreset, onPresetsChanged }) {
  const [presets, setPresets]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [activeType, setActiveType]   = useState('video'); // 'video' | 'post'
  const [expandedId, setExpandedId]   = useState(null);
  const [creating, setCreating]       = useState(false);
  const [savingId, setSavingId]       = useState(null);
  const [savedId, setSavedId]         = useState(null);

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
      const visible = presets.filter(p => p.presetType === activeType);
      const res = await fetch(`${API}/api/presets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${activeType === 'video' ? 'Video' : 'Post'} Preset ${visible.length + 1}`, presetType: activeType })
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

  const uploadPresetLogo = async (id, file) => {
    const fd = new FormData();
    fd.append('logo', file);
    const res = await fetch(`${API}/api/presets/${id}/logo`, { method: 'POST', body: fd });
    const { logoFile } = await res.json();
    setPresets(p => p.map(pr => pr.id === id ? { ...pr, logoFile } : pr));
  };

  const deletePresetLogo = async (id) => {
    await fetch(`${API}/api/presets/${id}/logo`, { method: 'DELETE' });
    setPresets(p => p.map(pr => pr.id === id ? { ...pr, logoFile: null } : pr));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading presets...
      </div>
    );
  }

  const visiblePresets = presets.filter(p => (p.presetType || 'video') === activeType);

  return (
    <div className="space-y-4">
      {/* Type switcher */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
          <button
            onClick={() => { setActiveType('video'); setExpandedId(null); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
              activeType === 'video' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Film className="w-3.5 h-3.5" /> Video
          </button>
          <button
            onClick={() => { setActiveType('post'); setExpandedId(null); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
              activeType === 'post' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ImagePlus className="w-3.5 h-3.5" /> Post
          </button>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {visiblePresets.length === 0 ? 'No presets yet.' : `${visiblePresets.length} preset${visiblePresets.length !== 1 ? 's' : ''}`}
          </p>
          <Button onClick={createPreset} disabled={creating} size="sm">
            {creating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            New
          </Button>
        </div>
      </div>

      {visiblePresets.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          {activeType === 'video'
            ? <Film className="w-10 h-10 mx-auto mb-3 opacity-20" />
            : <ImagePlus className="w-10 h-10 mx-auto mb-3 opacity-20" />
          }
          <p className="text-sm text-muted-foreground">
            No {activeType} presets yet.
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {activeType === 'video'
              ? 'Save resolution, timing, font, and layout for video generation.'
              : 'Save resolution, font, and layout for post/image generation.'}
          </p>
        </div>
      )}

      {visiblePresets.map(preset => (
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
          onLogoUpload={(file) => uploadPresetLogo(preset.id, file)}
          onLogoDelete={() => deletePresetLogo(preset.id)}
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

function PresetCard({ preset, expanded, onToggle, onUpdate, onDelete, onDuplicate, onApply, saving, saved, onLogoUpload, onLogoDelete }) {
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
            {(preset.presetType === 'post') && (
              <Badge className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">
                <ImagePlus className="w-2.5 h-2.5 mr-1" /> Post
              </Badge>
            )}
            {(!preset.presetType || preset.presetType === 'video') && (
              <Badge className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30">
                {preset.mediaType === 'image'
                  ? <><Image className="w-2.5 h-2.5 mr-1" /> Image Batch</>
                  : <><Film className="w-2.5 h-2.5 mr-1" /> Video Batch</>
                }
              </Badge>
            )}
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
                {/* ── Video-only: Media Type ── */}
                {preset.presetType !== 'post' && (
                  <>
                    <Section title="Media Type" description="What kind of source files does this template use?">
                      <div className="flex items-center gap-2">
                        <button
                          disabled={preset.locked}
                          onClick={() => immediateUpdate('mediaType', 'video')}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                            (preset.mediaType ?? 'video') === 'video'
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-border/80",
                            preset.locked && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <Video className="w-4 h-4" /> Video Batch
                        </button>
                        <button
                          disabled={preset.locked}
                          onClick={() => immediateUpdate('mediaType', 'image')}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                            preset.mediaType === 'image'
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-border/80",
                            preset.locked && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <Image className="w-4 h-4" /> Image Batch
                        </button>
                      </div>
                    </Section>
                    <Separator />
                  </>
                )}

                {/* ── Video-only: Timing (conditional on media type) ── */}
                {preset.presetType !== 'post' && (
                  <>
                    <Section title="Timing">
                      {(preset.mediaType ?? 'video') === 'video' ? (
                        <Field label="Video slice duration (sec)">
                          <Input type="number" min="1" max="120" step="1"
                            defaultValue={preset.sliceDuration ?? 3} disabled={preset.locked}
                            className="w-28"
                            onChange={e => debouncedUpdate('sliceDuration', Number(e.target.value))} />
                        </Field>
                      ) : (
                        <Field label="Image display duration (sec)">
                          <Input type="number" min="0.1" max="30" step="0.1"
                            defaultValue={preset.imageDuration ?? 0.2} disabled={preset.locked}
                            className="w-28"
                            onChange={e => debouncedUpdate('imageDuration', Number(e.target.value))} />
                        </Field>
                      )}
                    </Section>
                    <Separator />
                  </>
                )}

                {/* Resolution (all presets) */}
                <Section title="Resolution">
                  <PresetResolutionPicker
                    preset={preset}
                    onUpdate={onUpdate}
                    locked={preset.locked}
                  />
                </Section>

                <Separator />

                {/* Logo (all presets) */}
                <Section title="Logo Image">
                  <PresetLogoUpload
                    preset={preset}
                    onUpload={onLogoUpload}
                    onDelete={onLogoDelete}
                    locked={preset.locked}
                  />
                </Section>

                {/* ── Video-only: Preferred output duration ── */}
                {preset.presetType !== 'post' && (
                  <>
                    <Separator />
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
                  </>
                )}

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
                  onFontChange={(patch) => onUpdate(patch)}
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

const ALL_RESOLUTIONS = [
  { key: '1920x1080', label: '1920×1080', sub: '16:9 Landscape' },
  { key: '1080x1080', label: '1080×1080', sub: '1:1 Square' },
  { key: '1080x1920', label: '1080×1920', sub: '9:16 Portrait' },
  { key: '3840x2160', label: '3840×2160', sub: '4K Landscape' },
  { key: '2160x3840', label: '2160×3840', sub: '4K Portrait' },
];

function PresetResolutionPicker({ preset, onUpdate, locked }) {
  const isPost = preset.presetType === 'post';

  // Derive current selections from resolutionEntries or fall back to single resolution
  const entries = preset.resolutionEntries?.length
    ? preset.resolutionEntries
    : [{ key: preset.resolution || '1920x1080', count: preset.videoCount || 1 }];

  const selectedKeys = entries.map(e => e.key);
  const getCount = (key) => (entries.find(e => e.key === key)?.count) ?? 1;

  const save = (newEntries) => {
    const totalCount = newEntries.reduce((s, e) => s + (e.count || 1), 0);
    onUpdate({
      resolutionEntries: newEntries,
      resolution: newEntries[0]?.key || '1920x1080',
      videoCount: totalCount,
    });
  };

  const toggle = (key) => {
    if (locked) return;
    if (selectedKeys.includes(key)) {
      if (selectedKeys.length === 1) return;
      save(entries.filter(e => e.key !== key));
    } else {
      save([...entries, { key, count: 1 }]);
    }
  };

  const adjustCount = (key, delta) => {
    if (locked) return;
    save(entries.map(e => e.key === key ? { ...e, count: Math.max(1, Math.min(20, e.count + delta)) } : e));
  };

  // Posts only support square/portrait resolutions
  const resolutions = isPost
    ? ALL_RESOLUTIONS.filter(r => ['1080x1080', '1080x1920', '1920x1080'].includes(r.key))
    : ALL_RESOLUTIONS;

  const countLabel = isPost ? 'posts' : 'videos';

  return (
    <div className="grid grid-cols-1 gap-1.5">
      {resolutions.map(r => {
        const selected = selectedKeys.includes(r.key);
        const count = getCount(r.key);
        return (
          <button key={r.key} disabled={locked}
            onClick={() => toggle(r.key)}
            className={cn(
              "flex items-center justify-between px-3 py-2.5 rounded-lg border text-left text-sm transition-all",
              selected ? "border-primary bg-primary/10" : "border-border hover:border-border/80 text-muted-foreground",
              locked && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-all",
                selected ? "border-primary bg-primary" : "border-muted-foreground/40"
              )}>
                {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
              </div>
              <div>
                <span className={cn("font-semibold mono text-xs", selected && "text-primary")}>{r.label}</span>
                <span className="text-xs text-muted-foreground ml-2">{r.sub}</span>
              </div>
            </div>
            {selected && (
              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                <span className="text-xs text-muted-foreground mr-1">{countLabel}:</span>
                <button
                  onClick={() => adjustCount(r.key, -1)}
                  disabled={locked || count <= 1}
                  className="w-5 h-5 rounded border border-border hover:border-primary/60 hover:bg-primary/10 text-xs font-bold flex items-center justify-center transition-all disabled:opacity-30"
                >−</button>
                <span className="w-5 text-center text-xs font-mono font-semibold text-primary">{count}</span>
                <button
                  onClick={() => adjustCount(r.key, 1)}
                  disabled={locked || count >= 20}
                  className="w-5 h-5 rounded border border-border hover:border-primary/60 hover:bg-primary/10 text-xs font-bold flex items-center justify-center transition-all disabled:opacity-30"
                >+</button>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PresetLogoUpload({ preset, onUpload, onDelete, locked }) {
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try { await onUpload(file); } finally { setUploading(false); e.target.value = ''; }
  };

  return (
    <div className="space-y-2">
      {preset.logoFile && (
        <div className="flex items-center gap-2 p-2 rounded-md border border-border bg-secondary/30">
          <img
            src={`http://localhost:5001/preset-logos/${preset.id}/${preset.logoFile}`}
            alt="Logo preview"
            className="h-8 object-contain rounded"
          />
          <span className="text-xs text-muted-foreground truncate flex-1">{preset.logoFile}</span>
          {!locked && (
            <button onClick={onDelete} className="text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading || locked}>
          {uploading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          {preset.logoFile ? 'Replace Logo' : 'Upload Logo'}
        </Button>
        {!preset.logoFile && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Image className="w-3 h-3" /> PNG, JPG, SVG
          </span>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      <p className="text-xs text-muted-foreground/60">Logo is saved per-preset and used automatically when this preset is active.</p>
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
