import React, { useState, useRef, useCallback } from 'react';
import { FolderPlus, Upload, Trash2, Film, Image, ChevronRight, RefreshCw, FolderOpen } from 'lucide-react';
import { Button } from './ui-button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Input, Badge, Separator } from './ui-primitives';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';

export default function BatchManager({ batches, onRefresh, onSelectBatch, selectedBatch }) {
  const [newBatchName, setNewBatchName] = useState('');
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(null); // 'videos' | 'images' | null
  const [batchFiles, setBatchFiles] = useState({ videos: [], images: [] });
  const [loadingFiles, setLoadingFiles] = useState(false);
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
    } finally {
      setCreating(false);
    }
  };

  const loadBatchFiles = useCallback(async (batchName) => {
    setLoadingFiles(true);
    try {
      const res = await fetch(`${API}/api/batches/${batchName}/files`);
      const data = await res.json();
      setBatchFiles(data);
    } finally {
      setLoadingFiles(false);
    }
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
        method: 'POST',
        body: formData
      });
      loadBatchFiles(selectedBatch);
    } finally {
      setUploading(false);
    }
  };

  const deleteFile = async (type, filename) => {
    if (!selectedBatch) return;
    await fetch(`${API}/api/batches/${selectedBatch}/${type}/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    loadBatchFiles(selectedBatch);
  };

  const handleDrop = (e, type) => {
    e.preventDefault();
    setDragOver(null);
    const files = e.dataTransfer.files;
    if (files.length) uploadFiles(files, type);
  };

  return (
    <div className="space-y-6">
      {/* Create batch */}
      <Card className="glow-orange-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderPlus className="w-4 h-4 text-primary" />
            New Batch
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
              <FolderOpen className="w-4 h-4 text-primary" />
              Batches
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
            <CardTitle className="text-base">
              <span className="text-primary font-mono">{selectedBatch}</span>
              <span className="text-muted-foreground font-normal"> / Files</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Video pool */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-blue-400" /> Video Pool
                  <Badge variant="secondary" className="ml-1">{batchFiles.videos.length}</Badge>
                </span>
                <Button size="sm" variant="outline" onClick={() => videoInputRef.current?.click()} disabled={uploading}>
                  <Upload className="w-3 h-3" /> Upload
                </Button>
                <input ref={videoInputRef} type="file" multiple accept="video/*" className="hidden"
                  onChange={e => uploadFiles(e.target.files, 'videos')} />
              </div>
              <div
                className={cn("drop-zone rounded-lg p-3 min-h-[80px]", dragOver === 'videos' && 'dragging')}
                onDragOver={e => { e.preventDefault(); setDragOver('videos'); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => handleDrop(e, 'videos')}
              >
                {batchFiles.videos.length === 0 ? (
                  <div className="h-16 flex items-center justify-center text-muted-foreground text-xs">
                    Drop video files here or click Upload
                  </div>
                ) : (
                  <div className="space-y-1">
                    {batchFiles.videos.map(f => (
                      <FileRow key={f} name={f} onDelete={() => deleteFile('videos', f)} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Image pool */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  <Image className="w-3.5 h-3.5 text-purple-400" /> Image Pool
                  <Badge variant="secondary" className="ml-1">{batchFiles.images.length}</Badge>
                </span>
                <Button size="sm" variant="outline" onClick={() => imageInputRef.current?.click()} disabled={uploading}>
                  <Upload className="w-3 h-3" /> Upload
                </Button>
                <input ref={imageInputRef} type="file" multiple accept="image/*" className="hidden"
                  onChange={e => uploadFiles(e.target.files, 'images')} />
              </div>
              <div
                className={cn("drop-zone rounded-lg p-3 min-h-[80px]", dragOver === 'images' && 'dragging')}
                onDragOver={e => { e.preventDefault(); setDragOver('images'); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => handleDrop(e, 'images')}
              >
                {batchFiles.images.length === 0 ? (
                  <div className="h-16 flex items-center justify-center text-muted-foreground text-xs">
                    Drop image files here or click Upload
                  </div>
                ) : (
                  <div className="space-y-1">
                    {batchFiles.images.map(f => (
                      <FileRow key={f} name={f} onDelete={() => deleteFile('images', f)} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {uploading && (
              <div className="text-center text-xs text-primary animate-pulse">Uploading files...</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FileRow({ name, onDelete }) {
  return (
    <div className="flex items-center justify-between px-2 py-1 rounded hover:bg-secondary/50 group">
      <span className="text-xs text-muted-foreground mono truncate max-w-[200px]">{name}</span>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
