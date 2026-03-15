import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Move, Image, Type, Upload, Trash2, RefreshCw, Check,
  Eye, EyeOff, Lock, Unlock, Plus, X, ChevronDown
} from 'lucide-react';
import { Button } from './ui-button';
import { Label, Badge, Separator } from './ui-primitives';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';

// Aspect ratios for canvas display
const ASPECT_RATIOS = {
  '1920x1080': 16 / 9,
  '1080x1080': 1,
  '1080x1920': 9 / 16,
  '3840x2160': 16 / 9,
  '2160x3840': 9 / 16,
};

const CANVAS_W = 640; // display width in px

function getCanvasH(resolution) {
  const ratio = ASPECT_RATIOS[resolution] || (16 / 9);
  return Math.round(CANVAS_W / ratio);
}

// Element types rendered on canvas
// type: 'logo' | 'subtitle' | 'overlay'
// x, y: 0-100% of canvas (center point)
// w: 0-100% of canvas width

export default function LayoutEditor({ preset, onLayoutChange }) {
  const resolution = preset?.resolution || '1920x1080';
  const layout     = preset?.layout || {};
  const canvasH    = getCanvasH(resolution);

  // Local element state derived from preset layout
  const [elements, setElements] = useState(() => buildElements(layout, preset));
  const [selected, setSelected]  = useState(null);  // element id
  const [dragging, setDragging]  = useState(null);  // { id, startMouseX, startMouseY, startX, startY }
  const [resizing, setResizing]  = useState(null);  // { id, startMouseX, startW }
  const [uploadingOverlay, setUploadingOverlay] = useState(false);
  const canvasRef    = useRef();
  const fileInputRef = useRef();
  const saveTimeout  = useRef();

  // Rebuild elements when preset changes externally
  useEffect(() => {
    setElements(buildElements(layout, preset));
  }, [preset?.id]);

  // Debounced save back to parent
  const scheduleLayout = useCallback((newElements) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      onLayoutChange(elementsToLayout(newElements, preset));
    }, 400);
  }, [onLayoutChange, preset]);

  const updateElement = useCallback((id, patch) => {
    setElements(prev => {
      const next = prev.map(el => el.id === id ? { ...el, ...patch } : el);
      scheduleLayout(next);
      return next;
    });
  }, [scheduleLayout]);

  // ── Mouse drag on canvas ────────────────────────────────────────────────────
  const onMouseDown = useCallback((e, id, mode = 'drag') => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(id);
    const el = elements.find(x => x.id === id);
    if (!el || el.locked) return;
    if (mode === 'drag') {
      setDragging({ id, startMouseX: e.clientX, startMouseY: e.clientY, startX: el.x, startY: el.y });
    } else {
      setResizing({ id, startMouseX: e.clientX, startW: el.w });
    }
  }, [elements]);

  const onMouseMove = useCallback((e) => {
    if (dragging) {
      const dxPct = ((e.clientX - dragging.startMouseX) / CANVAS_W) * 100;
      const dyPct = ((e.clientY - dragging.startMouseY) / canvasH) * 100;
      const newX = Math.max(0, Math.min(100, dragging.startX + dxPct));
      const newY = Math.max(0, Math.min(100, dragging.startY + dyPct));
      updateElement(dragging.id, { x: parseFloat(newX.toFixed(2)), y: parseFloat(newY.toFixed(2)) });
    }
    if (resizing) {
      const dxPct = ((e.clientX - resizing.startMouseX) / CANVAS_W) * 100;
      const newW = Math.max(5, Math.min(80, resizing.startW + dxPct));
      updateElement(resizing.id, { w: parseFloat(newW.toFixed(2)) });
    }
  }, [dragging, resizing, canvasH, updateElement]);

  const onMouseUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  // ── Overlay image upload ────────────────────────────────────────────────────
  const uploadOverlay = async (file) => {
    setUploadingOverlay(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(`${API}/api/presets/${preset.id}/overlays`, { method: 'POST', body: fd });
      const { overlay } = await res.json();
      const newEl = {
        id:     overlay.id,
        type:   'overlay',
        label:  file.name,
        x:      overlay.x,
        y:      overlay.y,
        w:      overlay.w,
        h:      overlay.h,
        file:   overlay.file,
        locked: false,
        visible: true,
        src:    `${API}/preset-overlays/${preset.id}/${overlay.file}`,
      };
      setElements(prev => {
        const next = [...prev, newEl];
        scheduleLayout(next);
        return next;
      });
      setSelected(overlay.id);
    } finally { setUploadingOverlay(false); }
  };

  const removeOverlayEl = async (el) => {
    await fetch(`${API}/api/presets/${preset.id}/overlays/${el.id}`, { method: 'DELETE' });
    setElements(prev => {
      const next = prev.filter(x => x.id !== el.id);
      scheduleLayout(next);
      return next;
    });
    setSelected(null);
  };

  const selectedEl = elements.find(el => el.id === selected);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="mono text-xs">{resolution}</Badge>
          <span className="text-xs text-muted-foreground">Drag elements to reposition · Drag handle to resize</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingOverlay || !preset}
          >
            {uploadingOverlay
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <Plus className="w-3.5 h-3.5" />
            }
            Add Image
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => e.target.files[0] && uploadOverlay(e.target.files[0])}
          />
        </div>
      </div>

      <div className="flex gap-4">
        {/* Canvas */}
        <div
          ref={canvasRef}
          className="relative flex-shrink-0 rounded-lg overflow-hidden border border-border bg-black select-none"
          style={{ width: CANVAS_W, height: canvasH }}
          onClick={() => setSelected(null)}
        >
          {/* Grid overlay */}
          <div className="absolute inset-0 pointer-events-none opacity-10"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)',
              backgroundSize: `${CANVAS_W / 6}px ${canvasH / 6}px`,
            }}
          />
          {/* Center crosshair */}
          <div className="absolute inset-0 pointer-events-none opacity-20">
            <div className="absolute top-1/2 left-0 right-0 h-px bg-white" />
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white" />
          </div>

          {/* Elements */}
          {elements.filter(el => el.visible !== false).map(el => (
            <CanvasElement
              key={el.id}
              el={el}
              canvasW={CANVAS_W}
              canvasH={canvasH}
              selected={selected === el.id}
              onMouseDown={onMouseDown}
            />
          ))}
        </div>

        {/* Side panel */}
        <div className="flex-1 space-y-3 min-w-0">
          {/* Element list */}
          <div className="space-y-1">
            {elements.map(el => (
              <ElementRow
                key={el.id}
                el={el}
                selected={selected === el.id}
                onSelect={() => setSelected(el.id)}
                onToggleVisible={() => updateElement(el.id, { visible: !(el.visible !== false) })}
                onToggleLock={() => updateElement(el.id, { locked: !el.locked })}
                onRemove={el.type === 'overlay' ? () => removeOverlayEl(el) : null}
              />
            ))}
          </div>

          {/* Selected element controls */}
          {selectedEl && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3 slide-up">
              <p className="text-xs font-semibold text-primary">{selectedEl.label}</p>

              <div className="grid grid-cols-2 gap-2">
                <NumInput label="X %" value={selectedEl.x}
                  onChange={v => updateElement(selectedEl.id, { x: v })} min={0} max={100} />
                <NumInput label="Y %" value={selectedEl.y}
                  onChange={v => updateElement(selectedEl.id, { y: v })} min={0} max={100} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumInput label="Width %" value={selectedEl.w}
                  onChange={v => updateElement(selectedEl.id, { w: v })} min={5} max={80} />
                {selectedEl.type === 'subtitle' && (
                  <NumInput label="Font size" value={selectedEl.fontSize || 52}
                    onChange={v => updateElement(selectedEl.id, { fontSize: v })} min={16} max={120} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Canvas draggable element ───────────────────────────────────────────────────
function CanvasElement({ el, canvasW, canvasH, selected, onMouseDown }) {
  const wPx = (el.w / 100) * canvasW;
  const hPx = el.type === 'subtitle' ? 36 : (el.h ? (el.h / 100) * canvasH : wPx * 0.5);
  const left = (el.x / 100) * canvasW - wPx / 2;
  const top  = (el.y / 100) * canvasH - hPx / 2;

  const baseStyle = {
    position: 'absolute',
    left,
    top,
    width: wPx,
    height: hPx,
    cursor: el.locked ? 'not-allowed' : 'grab',
    userSelect: 'none',
  };

  return (
    <div
      style={baseStyle}
      onMouseDown={e => onMouseDown(e, el.id, 'drag')}
      className={cn(
        "rounded border-2 transition-all",
        selected ? "border-primary shadow-lg shadow-primary/20" : "border-white/30 hover:border-white/60",
        el.locked && "opacity-70"
      )}
    >
      {/* Content */}
      {el.type === 'logo' && (
        <div className="w-full h-full flex items-center justify-center bg-white/10 rounded">
          <span className="text-white/70 text-xs font-bold tracking-wide">LOGO</span>
        </div>
      )}
      {el.type === 'subtitle' && (
        <div className="w-full h-full flex items-center justify-center bg-black/50 rounded px-2">
          <span className="text-white text-xs font-bold truncate" style={{ fontSize: Math.max(8, (el.fontSize || 52) * (canvasW / 1920)) }}>
            Subtitle text here
          </span>
        </div>
      )}
      {el.type === 'overlay' && el.src && (
        <img src={el.src} alt={el.label} className="w-full h-full object-contain" draggable={false} />
      )}
      {el.type === 'overlay' && !el.src && (
        <div className="w-full h-full flex items-center justify-center bg-purple-500/20 rounded">
          <Image className="w-4 h-4 text-purple-300" />
        </div>
      )}

      {/* Resize handle */}
      {selected && !el.locked && (
        <div
          className="absolute right-0 bottom-0 w-4 h-4 bg-primary rounded-tl cursor-se-resize flex items-center justify-center"
          onMouseDown={e => { e.stopPropagation(); onMouseDown(e, el.id, 'resize'); }}
        >
          <Move className="w-2.5 h-2.5 text-primary-foreground" />
        </div>
      )}

      {/* Lock indicator */}
      {el.locked && selected && (
        <div className="absolute top-0 right-0 w-4 h-4 bg-yellow-500 rounded-bl flex items-center justify-center">
          <Lock className="w-2.5 h-2.5 text-black" />
        </div>
      )}
    </div>
  );
}

// ── Side panel row ─────────────────────────────────────────────────────────────
function ElementRow({ el, selected, onSelect, onToggleVisible, onToggleLock, onRemove }) {
  const icons = { logo: '🖼', subtitle: '💬', overlay: '📌' };
  const visible = el.visible !== false;
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-all border",
        selected ? "border-primary bg-primary/10" : "border-border hover:bg-secondary/50"
      )}
    >
      <span className="flex items-center gap-2">
        <span>{icons[el.type]}</span>
        <span className={cn("font-medium", !visible && "opacity-40")}>{el.label}</span>
      </span>
      <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <button onClick={onToggleVisible} className={cn("p-1 rounded hover:bg-secondary", !visible && "text-muted-foreground")}>
          {visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        </button>
        <button onClick={onToggleLock} className={cn("p-1 rounded hover:bg-secondary", el.locked && "text-yellow-400")}>
          {el.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
        </button>
        {onRemove && (
          <button onClick={onRemove} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </span>
    </button>
  );
}

function NumInput({ label, value, onChange, min, max }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <input
        type="number"
        min={min} max={max} step="0.5"
        value={Math.round(value * 10) / 10}
        onChange={e => onChange(Math.max(min, Math.min(max, parseFloat(e.target.value) || 0)))}
        className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function buildElements(layout, preset) {
  const elements = [];

  // Logo element (always present, toggle enabled)
  elements.push({
    id:      'logo',
    type:    'logo',
    label:   'Logo',
    x:       layout?.logo?.x  ?? 50,
    y:       layout?.logo?.y  ?? 90,
    w:       layout?.logo?.w  ?? 18,
    h:       layout?.logo?.w  ?? 18, // maintain ratio
    locked:  false,
    visible: layout?.logo?.enabled !== false,
  });

  // Subtitle element
  elements.push({
    id:       'subtitle',
    type:     'subtitle',
    label:    'Subtitles / Text',
    x:        layout?.subtitles?.x        ?? 50,
    y:        layout?.subtitles?.y        ?? 50,
    w:        layout?.subtitles?.w        ?? 60,
    fontSize: layout?.subtitles?.fontSize ?? 52,
    locked:   false,
    visible:  layout?.subtitles?.enabled !== false,
  });

  // Static image overlays from preset
  if (preset?.id && layout?.overlays) {
    for (const ov of layout.overlays) {
      elements.push({
        id:      ov.id,
        type:    'overlay',
        label:   ov.file,
        x:       ov.x ?? 10,
        y:       ov.y ?? 10,
        w:       ov.w ?? 20,
        h:       ov.h ?? 20,
        file:    ov.file,
        locked:  false,
        visible: true,
        src:     `${API}/preset-overlays/${preset.id}/${ov.file}`,
      });
    }
  }

  return elements;
}

function elementsToLayout(elements, preset) {
  const logo     = elements.find(el => el.id === 'logo');
  const subtitle = elements.find(el => el.id === 'subtitle');
  const overlays = elements.filter(el => el.type === 'overlay').map(el => ({
    id:   el.id,
    file: el.file,
    x:    el.x,
    y:    el.y,
    w:    el.w,
    h:    el.h,
  }));

  return {
    layout: {
      logo: {
        x:       logo?.x  ?? 50,
        y:       logo?.y  ?? 90,
        w:       logo?.w  ?? 18,
        enabled: logo?.visible !== false,
      },
      subtitles: {
        x:        subtitle?.x        ?? 50,
        y:        subtitle?.y        ?? 50,
        w:        subtitle?.w        ?? 60,
        fontSize: subtitle?.fontSize ?? 52,
        enabled:  subtitle?.visible !== false,
      },
      overlays,
    }
  };
}
