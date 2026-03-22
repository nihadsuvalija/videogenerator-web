import React, { useState, useRef, useCallback } from 'react';
import {
  FolderPlus, Upload, Trash2, Film, Image, ChevronRight,
  RefreshCw, FolderOpen, LayoutGrid, List, Play,
} from 'lucide-react';
import { Button } from './ui-button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Input, Badge, Separator } from './ui-primitives';
import { cn } from '../lib/utils';
import MediaLightbox from './MediaLightbox';

const API = 'http://localhost:5001';

const isVideo = (f) => /\.(mp4|mov|avi|mkv|webm)$/i.test(f);

export default function BatchManager({ batches, onRefresh, onSelectBatch, selectedBatch, onFilesChanged }) {
  const [newBatchName, setNewBatchName] = useState('');
  const [creating, setCreating]         = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [dragOver, setDragOver]         = useState(null);
  const [batchFiles, setBatchFiles]     = useState({ videos: [], images: [] });
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [viewMode, setViewMode]         = useState('list'); // 'list' | 'grid'
  const [lightboxSrc, setLightboxSrc]   = useState(null);
  const videoInputRef = useRef();
  const imageInputRef = useRef();

  const createBatch = async () => {
    if (!newBatchName.trim()) return;
    setCreating(true);
    try {
      await fetch(`${API}/api/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBatchName.trim() })
      });
      setNewBatchName('');
      onRefresh();
    } finally { setCreating(false); }
  };

  const loadBatchFiles = useCallback(async (batchName) => {
    setLoadingFiles(true);
    try {
      const res  = await fetch(`${API}/api/batches/${batchName}/files`);
      const data = await res.json();
      setBatchFiles(data);
    } finally { setLoadingFiles(false); }
  }, []);

  const selectBatch = (name) => {
    onSelectBatch(name);
    loadBatchFiles(name);
  };

  const uploadFiles = async (files, type) => {
    if (!selectedBatch || !files.length) return;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach(f => formData.append('files', f));
      await fetch(`${API}/api/batches/${selectedBatch}/upload/${type}`, {
        method: 'POST', body: formData,
      });
      loadBatchFiles(selectedBatch);
      onFilesChanged?.();
    } finally { setUploading(false); }
  };

  const deleteFile = async (type, filename) => {
    if (!selectedBatch) return;
    await fetch(`${API}/api/batches/${selectedBatch}/${type}/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    loadBatchFiles(selectedBatch);
    onFilesChanged?.();
  };

  const handleDrop = (e, type) => {
    e.preventDefault();
    setDragOver(null);
    const files = e.dataTransfer.files;
    if (files.length) uploadFiles(files, type);
  };

  const fileUrl = (type, filename) =>
    `${API}/batches-media/${selectedBatch}/${type}/${encodeURIComponent(filename)}`;

  return (
    <div className="space-y-6">
      {/* Create batch */}
      <Card className="glow-orange-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderPlus className="w-4 h-4 text-primary" /> New Batch
          </CardTitle>
          <CardDescription>Create a named batch folder for your media pool</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs mono">BATCH_</span>
              <Input
                className="pl-16"
                placeholder="001"
                value={newBatchName}
                onChange={e => setNewBatchName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createBatch()}
              />
            </div>
            <Button onClick={createBatch} disabled={creating || !newBatchName.trim()}>
              {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Create'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Batch list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="w-4 h-4 text-primary" /> Batches
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onRefresh} className="h-7 w-7">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {batches.length === 0 ? (
            <div className="px-6 pb-6 text-center text-muted-foreground text-sm py-8">
              No batches yet. Create one above.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {batches.map(batch => (
                <button
                  key={batch.name}
                  onClick={() => selectBatch(batch.name)}
                  className={cn(
                    "w-full flex items-center justify-between px-6 py-3.5 hover:bg-secondary/50 transition-colors text-left group",
                    selectedBatch === batch.name && "bg-secondary"
                  )}
                >
                  <div>
                    <div className="font-mono text-sm font-semibold text-foreground">{batch.name}</div>
                    <div className="flex gap-3 mt-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Film className="w-3 h-3" /> {batch.videoCount} videos
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Image className="w-3 h-3" /> {batch.imageCount} images
                      </span>
                    </div>
                  </div>
                  <ChevronRight className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform",
                    selectedBatch === batch.name && "text-primary rotate-90"
                  )} />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* File manager for selected batch */}
      {selectedBatch && (
        <Card className="slide-up">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                <span className="text-primary font-mono">{selectedBatch}</span>
                <span className="text-muted-foreground font-normal"> / Files</span>
              </CardTitle>
              {/* View toggle */}
              <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-1">
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-md transition-all",
                    viewMode === 'list'
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title="List view"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-md transition-all",
                    viewMode === 'grid'
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Grid view"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Video pool */}
            <MediaSection
              label="Video Pool"
              icon={<Film className="w-3.5 h-3.5 text-blue-400" />}
              files={batchFiles.videos}
              type="videos"
              viewMode={viewMode}
              dragOver={dragOver === 'videos'}
              uploading={uploading}
              loadingFiles={loadingFiles}
              emptyHint="Drop video files here or click Upload"
              onUploadClick={() => videoInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver('videos'); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => handleDrop(e, 'videos')}
              onDelete={f => deleteFile('videos', f)}
              fileUrl={f => fileUrl('videos', f)}
              onPreview={src => setLightboxSrc(src)}
            />
            <input ref={videoInputRef} type="file" multiple accept="video/*" className="hidden"
              onChange={e => uploadFiles(e.target.files, 'videos')} />

            <Separator />

            {/* Image pool */}
            <MediaSection
              label="Image Pool"
              icon={<Image className="w-3.5 h-3.5 text-purple-400" />}
              files={batchFiles.images}
              type="images"
              viewMode={viewMode}
              dragOver={dragOver === 'images'}
              uploading={uploading}
              loadingFiles={loadingFiles}
              emptyHint="Drop image files here or click Upload"
              onUploadClick={() => imageInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver('images'); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => handleDrop(e, 'images')}
              onDelete={f => deleteFile('images', f)}
              fileUrl={f => fileUrl('images', f)}
              onPreview={src => setLightboxSrc(src)}
            />
            <input ref={imageInputRef} type="file" multiple accept="image/*" className="hidden"
              onChange={e => uploadFiles(e.target.files, 'images')} />

            {uploading && (
              <div className="text-center text-xs text-primary animate-pulse">Uploading files…</div>
            )}
          </CardContent>
        </Card>
      )}

      {lightboxSrc && (
        <MediaLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}

// ── Media section (video pool or image pool) ───────────────────────────────────
function MediaSection({
  label, icon, files, type, viewMode,
  dragOver, uploading, loadingFiles, emptyHint,
  onUploadClick, onDragOver, onDragLeave, onDrop,
  onDelete, fileUrl, onPreview,
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold flex items-center gap-1.5">
          {icon} {label}
          <Badge variant="secondary" className="ml-1">{files.length}</Badge>
        </span>
        <Button size="sm" variant="outline" onClick={onUploadClick} disabled={uploading}>
          <Upload className="w-3 h-3" /> Upload
        </Button>
      </div>

      <div
        className={cn("drop-zone rounded-lg", dragOver && 'dragging',
          viewMode === 'list' ? "p-2 min-h-[80px]" : "p-3 min-h-[80px]"
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {loadingFiles ? (
          <div className="h-16 flex items-center justify-center gap-2 text-muted-foreground text-xs">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        ) : files.length === 0 ? (
          <div className="h-16 flex items-center justify-center text-muted-foreground text-xs">
            {emptyHint}
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-0.5">
            {files.map(f => (
              <FileRow key={f} name={f} onDelete={() => onDelete(f)} />
            ))}
          </div>
        ) : (
          <div style={{ columns: '3 110px', columnGap: 8 }}>
            {files.map(f => (
              <div key={f} style={{ breakInside: 'avoid', marginBottom: 8 }}>
                <GridCell
                  name={f}
                  src={fileUrl(f)}
                  isVideo={type === 'videos'}
                  onDelete={() => onDelete(f)}
                  onPreview={() => onPreview(fileUrl(f))}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── List row ───────────────────────────────────────────────────────────────────
function FileRow({ name, onDelete }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-secondary/50 group">
      <span className="text-xs text-muted-foreground mono truncate">{name}</span>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80 flex-shrink-0 ml-2"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Grid cell ──────────────────────────────────────────────────────────────────
function GridCell({ name, src, isVideo, onDelete, onPreview }) {
  const [hovered, setHovered] = useState(false);
  const videoRef = useRef(null);

  const handleMouseEnter = () => {
    setHovered(true);
    if (isVideo && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleMouseLeave = () => {
    setHovered(false);
    if (isVideo && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <div
      className="relative rounded-lg overflow-hidden border border-border bg-muted group cursor-pointer"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onPreview}
    >
      {/* Media — natural aspect ratio */}
      <div className="w-full overflow-hidden bg-muted">
        {isVideo ? (
          <video
            ref={videoRef}
            src={src}
            className="w-full h-auto block"
            preload="metadata"
            muted
            loop
            playsInline
          />
        ) : (
          <img
            src={src}
            alt={name}
            className="w-full h-auto block"
            loading="lazy"
          />
        )}
      </div>

      {/* Play indicator on video hover */}
      {isVideo && !hovered && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
            <Play className="w-3.5 h-3.5 text-white ml-0.5" />
          </div>
        </div>
      )}

      {/* Overlay on hover: filename + delete */}
      <div className={cn(
        "absolute inset-0 bg-black/60 flex flex-col justify-between p-2 transition-opacity",
        hovered ? "opacity-100" : "opacity-0"
      )}>
        <div className="flex justify-end">
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="w-6 h-6 rounded-md bg-destructive/80 hover:bg-destructive flex items-center justify-center transition-colors"
          >
            <Trash2 className="w-3 h-3 text-white" />
          </button>
        </div>
        <p className="text-[10px] text-white font-mono leading-tight line-clamp-2 break-all">
          {name}
        </p>
      </div>
    </div>
  );
}
