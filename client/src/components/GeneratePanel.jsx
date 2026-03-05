import React, { useState, useEffect, useRef } from 'react';
import { Clapperboard, Play, Upload, RefreshCw, Check, AlertCircle, Download } from 'lucide-react';
import { Button } from './ui-button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Input, Label, Progress, Badge } from './ui-primitives';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';

export default function GeneratePanel({ selectedBatch }) {
  const [logoText, setLogoText] = useState('');
  const [logoSubtext, setLogoSubtext] = useState('');
  const [sliceDuration, setSliceDuration] = useState(3);
  const [imageDuration, setImageDuration] = useState(0.2);
  const [batchFiles, setBatchFiles] = useState({ videos: [], images: [] });
  const [selectedVideos, setSelectedVideos] = useState([]);
  const [selectedImages, setSelectedImages] = useState([]);
  const [logoFile, setLogoFile] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const logoInputRef = useRef();
  const pollRef = useRef();

  useEffect(() => {
    if (selectedBatch) {
      fetch(`${API}/api/batches/${selectedBatch}/files`)
        .then(r => r.json())
        .then(data => {
          setBatchFiles(data);
          setSelectedVideos(data.videos);
          setSelectedImages(data.images);
        });
    }
  }, [selectedBatch]);

  useEffect(() => {
    fetch(`${API}/api/assets/logo`).then(r => r.json()).then(d => setLogoFile(d.logo));
  }, []);

  useEffect(() => {
    if (!jobId) return;
    const poll = async () => {
      const res = await fetch(`${API}/api/jobs/${jobId}`);
      const j = await res.json();
      setJob(j);
      if (j.status !== 'done' && j.status !== 'error') {
        pollRef.current = setTimeout(poll, 1200);
      } else {
        setGenerating(false);
      }
    };
    poll();
    return () => clearTimeout(pollRef.current);
  }, [jobId]);

  const uploadLogo = async (file) => {
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      await fetch(`${API}/api/assets/logo`, { method: 'POST', body: fd });
      setLogoFile(file.name);
    } finally {
      setUploadingLogo(false);
    }
  };

  const toggleVideo = (f) => setSelectedVideos(prev =>
    prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
  );
  const toggleImage = (f) => setSelectedImages(prev =>
    prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
  );

  const generate = async () => {
    if (!selectedBatch) return;
    setGenerating(true);
    setJob(null);
    try {
      const res = await fetch(`${API}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchName: selectedBatch,
          videoFiles: selectedVideos,
          imageFiles: selectedImages,
          logoText,
          logoSubtext,
          sliceDuration: Number(sliceDuration),
          imageDuration: Number(imageDuration),
        })
      });
      const { jobId: id } = await res.json();
      setJobId(id);
    } catch (e) {
      setGenerating(false);
    }
  };

  const hasContent = selectedVideos.length > 0 || selectedImages.length > 0;

  return (
    <div className="space-y-5">
      {!selectedBatch && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          <Clapperboard className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a batch from the left panel to configure generation</p>
        </div>
      )}

      {selectedBatch && (
        <>
          {/* File selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-primary font-mono">{selectedBatch}</span> — File Selection
              </CardTitle>
              <CardDescription>Choose which files to include in this generation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Video selection */}
              {batchFiles.videos.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs uppercase tracking-widest text-muted-foreground">Video Pool</Label>
                    <div className="flex gap-1">
                      <button onClick={() => setSelectedVideos(batchFiles.videos)} className="text-xs text-primary hover:underline">All</button>
                      <span className="text-muted-foreground text-xs">·</span>
                      <button onClick={() => setSelectedVideos([])} className="text-xs text-muted-foreground hover:text-foreground">None</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    {batchFiles.videos.map(f => (
                      <FileToggle key={f} name={f} selected={selectedVideos.includes(f)} onToggle={() => toggleVideo(f)} color="blue" />
                    ))}
                  </div>
                </div>
              )}

              {/* Image selection */}
              {batchFiles.images.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs uppercase tracking-widest text-muted-foreground">Image Pool</Label>
                    <div className="flex gap-1">
                      <button onClick={() => setSelectedImages(batchFiles.images)} className="text-xs text-primary hover:underline">All</button>
                      <span className="text-muted-foreground text-xs">·</span>
                      <button onClick={() => setSelectedImages([])} className="text-xs text-muted-foreground hover:text-foreground">None</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    {batchFiles.images.map(f => (
                      <FileToggle key={f} name={f} selected={selectedImages.includes(f)} onToggle={() => toggleImage(f)} color="purple" />
                    ))}
                  </div>
                </div>
              )}

              {batchFiles.videos.length === 0 && batchFiles.images.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No files in this batch yet. Add files using the Batches panel.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Config */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Generation Config</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="slice-dur" className="text-xs">Video slice duration (sec)</Label>
                  <Input id="slice-dur" type="number" min="1" max="60" step="1"
                    value={sliceDuration} onChange={e => setSliceDuration(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="img-dur" className="text-xs">Image duration (sec)</Label>
                  <Input id="img-dur" type="number" min="0.1" max="10" step="0.1"
                    value={imageDuration} onChange={e => setImageDuration(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="logo-text" className="text-xs">Overlay Title Text</Label>
                <Input id="logo-text" placeholder="e.g. My Brand" value={logoText} onChange={e => setLogoText(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="logo-sub" className="text-xs">Overlay Subtitle Text</Label>
                <Input id="logo-sub" placeholder="e.g. @handle or tagline" value={logoSubtext} onChange={e => setLogoSubtext(e.target.value)} />
              </div>

              {/* Logo upload */}
              <div className="space-y-1.5">
                <Label className="text-xs">Logo Image (overlaid on slideshow)</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                    {uploadingLogo ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    {logoFile ? 'Replace Logo' : 'Upload Logo'}
                  </Button>
                  {logoFile && (
                    <span className="text-xs text-green-400 flex items-center gap-1">
                      <Check className="w-3 h-3" /> {logoFile}
                    </span>
                  )}
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => e.target.files[0] && uploadLogo(e.target.files[0])} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Generate button */}
          <Button
            className="w-full h-12 text-base font-bold"
            onClick={generate}
            disabled={generating || !hasContent}
          >
            {generating ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</>
            ) : (
              <><Play className="w-4 h-4" /> Generate Video</>
            )}
          </Button>

          {/* Job status */}
          {job && <JobStatus job={job} />}
        </>
      )}
    </div>
  );
}

function FileToggle({ name, selected, onToggle, color }) {
  const colorMap = {
    blue: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
    purple: 'border-purple-500/40 bg-purple-500/10 text-purple-300',
  };
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md border text-xs transition-all text-left w-full",
        selected ? colorMap[color] : "border-border bg-transparent text-muted-foreground hover:border-border/80"
      )}
    >
      <div className={cn("w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0",
        selected ? "border-current bg-current/20" : "border-muted-foreground/40")}>
        {selected && <Check className="w-2.5 h-2.5" />}
      </div>
      <span className="mono truncate">{name}</span>
    </button>
  );
}

function JobStatus({ job }) {
  const statusColors = {
    queued: 'status-queued',
    running: 'status-running',
    done: 'status-done',
    error: 'status-error',
  };

  return (
    <Card className={cn("slide-up", job.status === 'running' && 'glow-orange-sm')}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {job.status === 'running' && <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />}
            {job.status === 'done' && <Check className="w-3.5 h-3.5 text-green-400" />}
            {job.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
            <span className="text-sm font-semibold">Job {job.id.slice(0, 8)}...</span>
          </div>
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold", statusColors[job.status])}>
            {job.status.toUpperCase()}
          </span>
        </div>

        {(job.status === 'running' || job.status === 'done') && (
          <Progress value={job.progress} className="h-1.5" />
        )}

        {job.log && job.log.length > 0 && (
          <div className="bg-muted rounded-md p-3 max-h-32 overflow-y-auto">
            {job.log.map((line, i) => (
              <div key={i} className={cn("text-xs mono", line.startsWith('ERROR') ? 'text-red-400' : 'text-muted-foreground')}>
                {line}
              </div>
            ))}
          </div>
        )}

        {job.status === 'done' && job.outputFile && (
          <a
            href={`http://localhost:5001/outputs/${job.outputFile}`}
            download
            className="flex items-center justify-center gap-2 w-full h-10 rounded-md bg-green-500/20 border border-green-500/40 text-green-400 text-sm font-semibold hover:bg-green-500/30 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download {job.outputFile}
          </a>
        )}
      </CardContent>
    </Card>
  );
}
