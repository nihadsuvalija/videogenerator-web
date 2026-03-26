import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Trash2, RefreshCw, Music, Upload, Check, X, Pencil, Play, Pause, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Label, Badge } from './ui-primitives';
import { Button } from './ui-button';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';
const AUDIO_EXT = /\.(mp3|m4a|wav|aac|ogg|flac)$/i;

export default function AudioBatchesPanel() {
  const { token } = useAuth();
  const [batches, setBatches]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [creatingName, setCreatingName] = useState('');
  const [creating, setCreating]         = useState(false);
  const createInputRef = useRef();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/audio-batches`, { headers: { Authorization: `Bearer ${token}` } });
      setBatches(await res.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (creating) createInputRef.current?.focus(); }, [creating]);

  const createBatch = async () => {
    if (!creatingName.trim()) return;
    const res = await fetch(`${API}/api/audio-batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: creatingName.trim() }),
    });
    const b = await res.json();
    setBatches(prev => [...prev, { ...b, _files: [], _open: true }]);
    setCreatingName('');
    setCreating(false);
  };

  const renameBatch = async (id, name) => {
    const res = await fetch(`${API}/api/audio-batches/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    });
    const b = await res.json();
    setBatches(prev => prev.map(x => x.id === id ? { ...x, name: b.name } : x));
  };

  const deleteBatch = async (id) => {
    await fetch(`${API}/api/audio-batches/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setBatches(prev => prev.filter(x => x.id !== id));
  };

  const uploadFiles = async (id, files) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    const res = await fetch(`${API}/api/audio-batches/${id}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const { uploaded } = await res.json();
    setBatches(prev => prev.map(b => b.id === id ? { ...b, _files: [...(b._files || []), ...uploaded] } : b));
  };

  const deleteFile = async (batchId, filename) => {
    await fetch(`${API}/api/audio-batches/${batchId}/files/${encodeURIComponent(filename)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    setBatches(prev => prev.map(b => b.id === batchId ? { ...b, _files: (b._files || []).filter(f => f !== filename) } : b));
  };

  const loadFiles = async (id) => {
    const res = await fetch(`${API}/api/audio-batches/${id}/files`, { headers: { Authorization: `Bearer ${token}` } });
    const files = await res.json();
    setBatches(prev => prev.map(b => b.id === id ? { ...b, _files: files, _loaded: true } : b));
  };

  const toggleOpen = (id) => {
    setBatches(prev => prev.map(b => {
      if (b.id !== id) return b;
      if (!b._loaded) loadFiles(id);
      return { ...b, _open: !b._open };
    }));
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{batches.length} audio batch{batches.length !== 1 ? 'es' : ''}</p>
        {creating ? (
          <div className="flex items-center gap-1.5">
            <input
              ref={createInputRef}
              value={creatingName}
              onChange={e => setCreatingName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createBatch(); if (e.key === 'Escape') { setCreating(false); setCreatingName(''); } }}
              placeholder="Batch name…"
              className="h-8 w-40 px-2.5 text-sm rounded-md border border-primary bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button onClick={createBatch} className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => { setCreating(false); setCreatingName(''); }} className="w-8 h-8 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New Batch
          </Button>
        )}
      </div>

      {batches.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-secondary/50 flex items-center justify-center mb-3">
            <Music className="w-6 h-6 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground">No audio batches yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Create a batch to upload and organise your audio files.</p>
        </div>
      )}

      {batches.map(batch => (
        <AudioBatchCard
          key={batch.id}
          batch={batch}
          onToggle={() => toggleOpen(batch.id)}
          onRename={name => renameBatch(batch.id, name)}
          onDelete={() => deleteBatch(batch.id)}
          onUpload={files => uploadFiles(batch.id, files)}
          onDeleteFile={filename => deleteFile(batch.id, filename)}
          token={token}
        />
      ))}
    </div>
  );
}

function AudioBatchCard({ batch, onToggle, onRename, onDelete, onUpload, onDeleteFile, token }) {
  const [editing, setEditing]           = useState(false);
  const [editName, setEditName]         = useState(batch.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading]       = useState(false);
  const fileInputRef = useRef();
  const editInputRef = useRef();

  useEffect(() => { if (editing) editInputRef.current?.focus(); }, [editing]);

  const commitRename = () => {
    if (editName.trim() && editName.trim() !== batch.name) onRename(editName.trim());
    setEditing(false);
  };

  const handleUpload = async (files) => {
    setUploading(true);
    try { await onUpload(Array.from(files)); }
    finally { setUploading(false); }
  };

  const files = batch._files || [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <button onClick={onToggle} className="flex items-center gap-2 min-w-0 flex-1 text-left">
            {batch._open ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
            <Music className="w-4 h-4 text-primary flex-shrink-0" />
            {editing ? (
              <input
                ref={editInputRef}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditing(false); setEditName(batch.name); } }}
                onBlur={commitRename}
                onClick={e => e.stopPropagation()}
                className="flex-1 h-7 px-2 text-sm rounded border border-primary bg-background focus:outline-none"
              />
            ) : (
              <span className="font-semibold text-sm truncate">{batch.name}</span>
            )}
            <Badge variant="secondary" className="text-xs flex-shrink-0">{files.length} file{files.length !== 1 ? 's' : ''}</Badge>
          </button>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setEditing(true)} className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <Pencil className="w-3 h-3" />
            </button>
            {confirmDelete ? (
              <>
                <button onClick={onDelete} className="h-7 px-2 rounded text-[10px] font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">Delete</button>
                <button onClick={() => setConfirmDelete(false)} className="h-7 px-2 rounded text-[10px] text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </CardHeader>

      {batch._open && (
        <CardContent className="pt-0 space-y-3">
          {/* Upload */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="gap-1.5">
              {uploading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              {uploading ? 'Uploading…' : 'Upload Audio'}
            </Button>
            <span className="text-xs text-muted-foreground">MP3, M4A, WAV, AAC, OGG, FLAC</span>
            <input ref={fileInputRef} type="file" multiple accept=".mp3,.m4a,.wav,.aac,.ogg,.flac" className="hidden"
              onChange={e => e.target.files.length && handleUpload(e.target.files)} />
          </div>

          {files.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No files yet — upload some audio above.</p>
          ) : (
            <div className="space-y-1.5">
              {files.map(filename => (
                <AudioFileRow
                  key={filename}
                  filename={filename}
                  src={`${API}/audio-batches/${batch.id}/${encodeURIComponent(filename)}`}
                  onDelete={() => onDeleteFile(filename)}
                />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function AudioFileRow({ filename, src, onDelete }) {
  const [playing, setPlaying]           = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const audioRef = useRef();

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play(); setPlaying(true); }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-secondary/20 text-sm group">
      <button onClick={togglePlay} className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors flex-shrink-0">
        {playing ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5 ml-0.5" />}
      </button>
      <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} className="hidden" />
      <span className="flex-1 truncate text-xs font-mono">{filename}</span>
      {confirmDelete ? (
        <>
          <button onClick={onDelete} className="h-6 px-2 rounded text-[10px] font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">Delete</button>
          <button onClick={() => setConfirmDelete(false)} className="h-6 px-2 rounded text-[10px] text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
        </>
      ) : (
        <button onClick={() => setConfirmDelete(true)} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
