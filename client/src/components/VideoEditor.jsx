import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Scissors, Plus,
  RefreshCw, Download, ChevronLeft, GripVertical,
  Type, Trash2, Check, AlertCircle, Move, Eye, EyeOff,
  Film, Image as ImageIcon
} from 'lucide-react';
import { Button } from './ui-button';
import { Input, Label, Badge, Separator } from './ui-primitives';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';

const ASPECT_RATIOS = {
  '1920x1080': 16/9, '1080x1080': 1, '1080x1920': 9/16,
  '3840x2160': 16/9, '2160x3840': 9/16,
};

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return `${m}:${sec}`;
}

export default function VideoEditor({ jobId, onBack }) {
  const [job, setJob]                   = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  // Playback
  const videoRef                        = useRef();
  const [playing, setPlaying]           = useState(false);
  const [currentTime, setCurrentTime]   = useState(0);
  const [duration, setDuration]         = useState(0);

  // Overlay drag state on the video frame
  const [overlays, setOverlays]         = useState([]);   // { id, type, label, x, y, visible }
  const [draggingOverlay, setDraggingOverlay] = useState(null);
  const videoContainerRef               = useRef();

  // Clips (for timeline and reorder)
  const [clips, setClips]               = useState([]);
  const [dragClip, setDragClip]         = useState(null);

  // Trim handles
  const [trimStart, setTrimStart]       = useState(0);
  const [trimEnd, setTrimEnd]           = useState(null);
  const trimDragging                    = useRef(null); // 'start' | 'end'

  // Annotations
  const [annotations, setAnnotations]   = useState([]);
  const [editingAnnotation, setEditingAnnotation] = useState(null);
  const [newAnnotation, setNewAnnotation] = useState({ text: '', x: 50, y: 80 });

  // SRT subtitles parsed for timeline
  const [subtitleCues, setSubtitleCues] = useState([]);

  // Re-render state
  const [rerendering, setRerendering]   = useState(false);
  const [rerenderJobId, setRerenderJobId] = useState(null);
  const [rerenderStatus, setRerenderStatus] = useState(null);
  const rerenderPollRef                 = useRef();

  // ── Load job ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!jobId) return;
    fetch(`${API}/api/jobs/${jobId}`)
      .then(r => r.json())
      .then(j => {
        setJob(j);
        setClips(j.clips || []);
        setAnnotations(j.annotations || []);
        setTrimEnd(j.duration || null);
        // Build overlay elements from job layout (logo pos etc.)
        setOverlays([
          { id: 'logo',     type: 'logo',     label: 'Logo',     x: 50, y: 90, visible: true },
          { id: 'subtitle', type: 'subtitle',  label: 'Subtitles', x: 50, y: 50, visible: true },
        ]);
        setLoading(false);
      })
      .catch(() => { setError('Failed to load job'); setLoading(false); });
  }, [jobId]);

  // ── Video event listeners ────────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime   = () => setCurrentTime(v.currentTime);
    const onLoaded = () => { setDuration(v.duration); setTrimEnd(prev => prev || v.duration); };
    const onEnded  = () => setPlaying(false);
    const onPlay   = () => setPlaying(true);
    const onPause  = () => setPlaying(false);
    v.addEventListener('timeupdate',  onTime);
    v.addEventListener('loadedmetadata', onLoaded);
    v.addEventListener('ended',  onEnded);
    v.addEventListener('play',   onPlay);
    v.addEventListener('pause',  onPause);
    return () => { v.removeEventListener('timeupdate', onTime); v.removeEventListener('loadedmetadata', onLoaded); v.removeEventListener('ended', onEnded); v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause); };
  }, [job]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    playing ? v.pause() : v.play();
  };

  const seekTo = useCallback((t) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration, t));
  }, [duration]);

  // ── Timeline scrubber click ──────────────────────────────────────────────────
  const timelineRef = useRef();
  const onTimelineClick = useCallback((e) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || !duration) return;
    const pct = (e.clientX - rect.left) / rect.width;
    seekTo(pct * duration);
  }, [duration, seekTo]);

  // ── Trim handle drag ─────────────────────────────────────────────────────────
  const onTrimMouseDown = useCallback((e, handle) => {
    e.stopPropagation();
    trimDragging.current = handle;
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (!trimDragging.current || !timelineRef.current || !duration) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const t    = pct * duration;
      if (trimDragging.current === 'start') setTrimStart(Math.min(t, (trimEnd || duration) - 1));
      else                                  setTrimEnd(Math.max(t, trimStart + 1));
    };
    const onUp = () => { trimDragging.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [duration, trimStart, trimEnd]);

  // ── Overlay drag on video frame ──────────────────────────────────────────────
  const onOverlayMouseDown = useCallback((e, id) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = videoContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ov = overlays.find(o => o.id === id);
    setDraggingOverlay({ id, startMouseX: e.clientX, startMouseY: e.clientY, startX: ov.x, startY: ov.y, rectW: rect.width, rectH: rect.height });
  }, [overlays]);

  useEffect(() => {
    const onMove = (e) => {
      if (!draggingOverlay) return;
      const { id, startMouseX, startMouseY, startX, startY, rectW, rectH } = draggingOverlay;
      const dxPct = ((e.clientX - startMouseX) / rectW) * 100;
      const dyPct = ((e.clientY - startMouseY) / rectH) * 100;
      const newX = Math.max(0, Math.min(100, startX + dxPct));
      const newY = Math.max(0, Math.min(100, startY + dyPct));
      setOverlays(prev => prev.map(o => o.id === id ? { ...o, x: newX, y: newY } : o));
    };
    const onUp = () => setDraggingOverlay(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [draggingOverlay]);

  // ── Clip reorder drag ────────────────────────────────────────────────────────
  const onClipDragStart = (idx) => setDragClip(idx);
  const onClipDragOver  = (e, idx) => {
    e.preventDefault();
    if (dragClip === null || dragClip === idx) return;
    setClips(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragClip, 1);
      next.splice(idx, 0, moved);
      return next.map((c, i) => ({ ...c, order: i }));
    });
    setDragClip(idx);
  };
  const onClipDragEnd = () => {
    setDragClip(null);
    saveClips();
  };

  const saveClips = useCallback(async () => {
    if (!job) return;
    await fetch(`${API}/api/jobs/${job.id}/clips`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clips })
    });
  }, [job, clips]);

  // ── Annotations ──────────────────────────────────────────────────────────────
  const addAnnotation = () => {
    const a = { id: Date.now().toString(), text: newAnnotation.text, startTime: currentTime, endTime: Math.min(duration, currentTime + 3), x: newAnnotation.x, y: newAnnotation.y };
    const next = [...annotations, a];
    setAnnotations(next);
    saveAnnotations(next);
    setNewAnnotation({ text: '', x: 50, y: 80 });
  };

  const removeAnnotation = (id) => {
    const next = annotations.filter(a => a.id !== id);
    setAnnotations(next);
    saveAnnotations(next);
  };

  const saveAnnotations = useCallback(async (ann) => {
    if (!job) return;
    await fetch(`${API}/api/jobs/${job.id}/annotations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations: ann })
    });
  }, [job]);

  // ── Re-render ────────────────────────────────────────────────────────────────
  const startRerender = async () => {
    setRerendering(true);
    setRerenderStatus('queued');
    const res = await fetch(`${API}/api/jobs/${job.id}/rerender`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clips, annotations, trimStart, trimEnd })
    });
    const { jobId: newId } = await res.json();
    setRerenderJobId(newId);
    pollRerender(newId);
  };

  const pollRerender = (id) => {
    rerenderPollRef.current = setInterval(async () => {
      const r = await fetch(`${API}/api/jobs/${id}`);
      const j = await r.json();
      setRerenderStatus(j.status);
      if (j.status === 'done' || j.status === 'error') {
        clearInterval(rerenderPollRef.current);
        setRerendering(false);
        if (j.status === 'done') setRerenderStatus('done');
      }
    }, 1500);
  };

  useEffect(() => () => clearInterval(rerenderPollRef.current), []);

  // ── Render guards ────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-24 text-muted-foreground">
      <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading editor...
    </div>
  );
  if (error || !job) return (
    <div className="text-destructive text-center py-12">{error || 'Job not found'}</div>
  );
  if (!job.outputFile) return (
    <div className="text-center py-12 text-muted-foreground">
      <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p>This job has no output file yet.</p>
    </div>
  );

  const videoSrc = `${API}/outputs/${job.outputFile}`;
  const ratio    = ASPECT_RATIOS[job.resolution] || (16/9);
  const dur      = duration || job.duration || 1;
  const tEnd     = trimEnd || dur;

  return (
    <div className="space-y-4">
      {/* Back + header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to History
        </button>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="mono text-xs">{job.resolution || '1920x1080'}</Badge>
          <Badge variant={job.status === 'done' ? 'default' : 'secondary'} className="text-xs capitalize">{job.status}</Badge>
          <a href={videoSrc} download={job.outputFile}>
            <Button variant="outline" size="sm"><Download className="w-3.5 h-3.5" /> Download</Button>
          </a>
          <Button size="sm" onClick={startRerender} disabled={rerendering}>
            {rerendering ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Scissors className="w-3.5 h-3.5" />}
            {rerendering ? `Re-rendering...` : 'Apply Edits'}
          </Button>
        </div>
      </div>

      {rerenderStatus === 'done' && rerenderJobId && (
        <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-2">
          <Check className="w-4 h-4 text-green-400" />
          <span className="text-sm text-green-400">Re-render complete!</span>
          <a href={`${API}/outputs/output_${rerenderJobId}.mp4`} download className="ml-auto">
            <Button size="sm" variant="outline"><Download className="w-3 h-3" /> Download</Button>
          </a>
        </div>
      )}

      <div className="grid grid-cols-[1fr_300px] gap-4">
        {/* ── Left: Video + Timeline ─────────────────────────────────────────── */}
        <div className="space-y-3">
          {/* Video frame with draggable overlays */}
          <div
            ref={videoContainerRef}
            className="relative bg-black rounded-lg overflow-hidden select-none"
            style={{ aspectRatio: ratio }}
          >
            <video
              ref={videoRef}
              src={videoSrc}
              className="w-full h-full object-contain"
              onClick={togglePlay}
            />

            {/* Overlay elements rendered on top of video */}
            {overlays.filter(o => o.visible).map(ov => (
              <div
                key={ov.id}
                className={cn(
                  "absolute border-2 border-dashed rounded cursor-grab active:cursor-grabbing transition-colors",
                  ov.id === 'logo'     && "border-blue-400/60 hover:border-blue-400 bg-blue-400/5",
                  ov.id === 'subtitle' && "border-yellow-400/60 hover:border-yellow-400 bg-yellow-400/5",
                )}
                style={{
                  left:      `${ov.x - 15}%`,
                  top:       `${ov.y - 5}%`,
                  width:     '30%',
                  minHeight: '32px',
                }}
                onMouseDown={e => onOverlayMouseDown(e, ov.id)}
              >
                <span className="text-xs text-white/60 px-1 select-none">{ov.label}</span>
              </div>
            ))}

            {/* Active annotations visible at current time */}
            {annotations.filter(a => currentTime >= a.startTime && currentTime <= a.endTime).map(a => (
              <div
                key={a.id}
                className="absolute pointer-events-none"
                style={{ left: `${a.x}%`, top: `${a.y}%`, transform: 'translate(-50%, -50%)' }}
              >
                <span className="text-white font-bold text-shadow px-2 py-1 bg-black/40 rounded text-sm">{a.text}</span>
              </div>
            ))}

            {/* Play/pause overlay */}
            {!playing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center">
                  <Play className="w-7 h-7 text-white ml-1" />
                </div>
              </div>
            )}
          </div>

          {/* Transport controls */}
          <div className="flex items-center gap-3 px-1">
            <button onClick={() => seekTo(0)} className="text-muted-foreground hover:text-foreground transition-colors">
              <SkipBack className="w-4 h-4" />
            </button>
            <button onClick={togglePlay} className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <button onClick={() => seekTo(dur)} className="text-muted-foreground hover:text-foreground transition-colors">
              <SkipForward className="w-4 h-4" />
            </button>
            <span className="text-xs mono text-muted-foreground">{formatTime(currentTime)} / {formatTime(dur)}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              Trim: <span className="text-primary mono">{formatTime(trimStart)} → {formatTime(tEnd)}</span>
            </span>
          </div>

          {/* ── Timeline ───────────────────────────────────────────────────── */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Timeline</span>
              <span className="text-xs text-muted-foreground mono">{formatTime(dur)}</span>
            </div>

            {/* Scrubber + trim + tracks */}
            <div className="p-3 space-y-2">
              {/* Main scrubber */}
              <div
                ref={timelineRef}
                className="relative h-8 bg-secondary rounded cursor-pointer select-none"
                onClick={onTimelineClick}
              >
                {/* Trim region */}
                <div
                  className="absolute top-0 bottom-0 bg-primary/20 border-x-2 border-primary"
                  style={{ left: `${(trimStart / dur) * 100}%`, right: `${((dur - tEnd) / dur) * 100}%` }}
                />

                {/* Trim handles */}
                <div
                  className="absolute top-0 bottom-0 w-3 bg-primary cursor-ew-resize rounded-l flex items-center justify-center z-10"
                  style={{ left: `${(trimStart / dur) * 100}%`, transform: 'translateX(-50%)' }}
                  onMouseDown={e => onTrimMouseDown(e, 'start')}
                >
                  <div className="w-0.5 h-4 bg-primary-foreground/60" />
                </div>
                <div
                  className="absolute top-0 bottom-0 w-3 bg-primary cursor-ew-resize rounded-r flex items-center justify-center z-10"
                  style={{ left: `${(tEnd / dur) * 100}%`, transform: 'translateX(-50%)' }}
                  onMouseDown={e => onTrimMouseDown(e, 'end')}
                >
                  <div className="w-0.5 h-4 bg-primary-foreground/60" />
                </div>

                {/* Playhead */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none"
                  style={{ left: `${(currentTime / dur) * 100}%` }}
                >
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white rounded-full" />
                </div>

                {/* Time ruler ticks */}
                <TimeRuler duration={dur} />
              </div>

              {/* Clip track */}
              {clips.length > 0 && (
                <div className="relative h-6 flex gap-px">
                  {clips.map((clip) => {
                    const clipW = (clip.clipDuration / dur) * 100;
                    const clipL = (clip.startTime / dur) * 100;
                    return (
                      <div
                        key={clip.id}
                        className={cn(
                          "absolute top-0 bottom-0 rounded text-xs flex items-center px-1 overflow-hidden cursor-pointer border",
                          clip.clipType === 'video'
                            ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                            : "bg-purple-500/20 border-purple-500/40 text-purple-300"
                        )}
                        style={{ left: `${clipL}%`, width: `${Math.max(clipW, 0.5)}%` }}
                        onClick={() => seekTo(clip.startTime)}
                        title={clip.src}
                      >
                        {clip.clipType === 'video' ? <Film className="w-3 h-3 flex-shrink-0" /> : <ImageIcon className="w-3 h-3 flex-shrink-0" />}
                        <span className="ml-1 truncate" style={{ fontSize: 9 }}>{clip.src}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Annotations track */}
              {annotations.length > 0 && (
                <div className="relative h-5">
                  {annotations.map(a => {
                    const aL = (a.startTime / dur) * 100;
                    const aW = ((a.endTime - a.startTime) / dur) * 100;
                    return (
                      <div
                        key={a.id}
                        className="absolute top-0 bottom-0 bg-yellow-500/30 border border-yellow-500/50 rounded text-yellow-300 flex items-center px-1 overflow-hidden cursor-pointer"
                        style={{ left: `${aL}%`, width: `${Math.max(aW, 0.5)}%` }}
                        onClick={() => seekTo(a.startTime)}
                        title={a.text}
                      >
                        <Type className="w-2.5 h-2.5 flex-shrink-0" />
                        <span className="ml-1 truncate" style={{ fontSize: 9 }}>{a.text}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right panel ────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Overlay visibility toggles */}
          <PanelSection title="Overlays">
            {overlays.map(ov => (
              <div key={ov.id} className="flex items-center justify-between px-2 py-1.5 rounded border border-border text-xs">
                <span className="text-muted-foreground">{ov.label}</span>
                <button onClick={() => setOverlays(prev => prev.map(o => o.id === ov.id ? { ...o, visible: !o.visible } : o))}
                  className={cn("transition-colors", ov.visible ? "text-primary" : "text-muted-foreground/40")}>
                  {ov.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground/60 mt-1">Drag overlays on the video frame to reposition.</p>
          </PanelSection>

          <Separator />

          {/* Clip order */}
          <PanelSection title="Clip Order">
            <div className="space-y-1">
              {clips.map((clip, idx) => (
                <div
                  key={clip.id}
                  draggable
                  onDragStart={() => onClipDragStart(idx)}
                  onDragOver={e => onClipDragOver(e, idx)}
                  onDragEnd={onClipDragEnd}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded border text-xs cursor-grab active:cursor-grabbing",
                    clip.clipType === 'video' ? "border-blue-500/30 bg-blue-500/10 text-blue-300" : "border-purple-500/30 bg-purple-500/10 text-purple-300",
                    dragClip === idx && "opacity-50"
                  )}
                >
                  <GripVertical className="w-3 h-3 flex-shrink-0 opacity-50" />
                  {clip.clipType === 'video' ? <Film className="w-3 h-3 flex-shrink-0" /> : <ImageIcon className="w-3 h-3 flex-shrink-0" />}
                  <span className="truncate flex-1 mono">{clip.src}</span>
                  <span className="text-muted-foreground flex-shrink-0">{formatTime(clip.clipDuration)}</span>
                </div>
              ))}
              {clips.length === 0 && <p className="text-xs text-muted-foreground">No clip data available.</p>}
            </div>
          </PanelSection>

          <Separator />

          {/* Text Annotations */}
          <PanelSection title="Text Annotations">
            <div className="space-y-2">
              <Input
                placeholder="Text at current time..."
                value={newAnnotation.text}
                onChange={e => setNewAnnotation(p => ({ ...p, text: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && newAnnotation.text && addAnnotation()}
              />
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <Label className="text-xs text-muted-foreground">X %</Label>
                  <input type="number" min={0} max={100} value={newAnnotation.x}
                    onChange={e => setNewAnnotation(p => ({ ...p, x: Number(e.target.value) }))}
                    className="w-full h-7 rounded border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Y %</Label>
                  <input type="number" min={0} max={100} value={newAnnotation.y}
                    onChange={e => setNewAnnotation(p => ({ ...p, y: Number(e.target.value) }))}
                    className="w-full h-7 rounded border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </div>
              <Button size="sm" className="w-full" disabled={!newAnnotation.text} onClick={addAnnotation}>
                <Plus className="w-3.5 h-3.5" /> Add at {formatTime(currentTime)}
              </Button>
            </div>

            {annotations.length > 0 && (
              <div className="mt-3 space-y-1">
                {annotations.map(a => (
                  <div key={a.id} className="flex items-start gap-2 px-2 py-1.5 rounded border border-yellow-500/20 bg-yellow-500/10 text-xs">
                    <div className="flex-1 min-w-0">
                      <p className="text-yellow-300 font-medium truncate">{a.text}</p>
                      <p className="text-muted-foreground mono">{formatTime(a.startTime)} → {formatTime(a.endTime)}</p>
                    </div>
                    <button onClick={() => removeAnnotation(a.id)} className="text-muted-foreground hover:text-destructive flex-shrink-0 mt-0.5">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </PanelSection>

          <Separator />

          {/* Trim summary */}
          <PanelSection title="Trim">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-border px-2 py-1.5">
                <p className="text-muted-foreground">In</p>
                <p className="mono font-semibold text-foreground">{formatTime(trimStart)}</p>
              </div>
              <div className="rounded border border-border px-2 py-1.5">
                <p className="text-muted-foreground">Out</p>
                <p className="mono font-semibold text-foreground">{formatTime(tEnd)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Drag the white handles on the timeline to set trim points.
            </p>
            <button
              onClick={() => { setTrimStart(0); setTrimEnd(dur); }}
              className="text-xs text-muted-foreground hover:text-foreground mt-1 transition-colors"
            >
              Reset trim
            </button>
          </PanelSection>
        </div>
      </div>
    </div>
  );
}

function PanelSection({ title, children }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-widest text-muted-foreground">{title}</Label>
      {children}
    </div>
  );
}

function TimeRuler({ duration }) {
  if (!duration) return null;
  const tickCount = Math.min(10, Math.floor(duration));
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (i / tickCount) * duration);
  return (
    <div className="absolute inset-0 pointer-events-none">
      {ticks.map((t, i) => (
        <div key={i} className="absolute top-0 bottom-0 flex flex-col justify-end" style={{ left: `${(t / duration) * 100}%` }}>
          <div className="w-px h-2 bg-white/20" />
          {i % 2 === 0 && (
            <span className="absolute bottom-0 text-white/30 transform -translate-x-1/2" style={{ fontSize: 8 }}>
              {formatTime(t)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
