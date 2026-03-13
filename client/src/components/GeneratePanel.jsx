import React, { useState, useEffect, useRef } from 'react';
import LyricsPanel from './LyricsPanel';
import {
  Clapperboard, Play, Upload, RefreshCw, Check, AlertCircle,
  Download, Trash2, Music, Monitor, FileText
} from 'lucide-react';
import { Button } from './ui-button';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
  Input, Label, Progress, Badge, Separator
} from './ui-primitives';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';

// Stable session token per browser session
const SESSION_TOKEN = (() => {
  let t = sessionStorage.getItem('vg_session');
  if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('vg_session', t); }
  return t;
})();

const RESOLUTION_ICONS = {
  '1920x1080': '🖥️',
  '1080x1080': '⬛',
  '1080x1920': '📱',
  '3840x2160': '🔭',
  '2160x3840': '📲',
};

export default function GeneratePanel({ selectedBatch, fileRefreshTrigger }) {
  const [logoText, setLogoText]           = useState('');
  const [logoSubtext, setLogoSubtext]     = useState('');
  const [sliceDuration, setSliceDuration] = useState(3);
  const [imageDuration, setImageDuration] = useState(0.2);
  const [resolution, setResolution]       = useState('1920x1080');
  const [resolutions, setResolutions]     = useState([]);
  const [batchFiles, setBatchFiles]       = useState({ videos: [], images: [] });
  const [selectedVideos, setSelectedVideos] = useState([]);
  const [selectedImages, setSelectedImages] = useState([]);
  const [logoFile, setLogoFile]           = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // SRT + MP3
  const [srtFile, setSrtFile]             = useState(null);
  const [audioFile, setAudioFile]         = useState(null);
  const [uploadingSrt, setUploadingSrt]   = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);

  const [generating, setGenerating]       = useState(false);
  const [jobId, setJobId]                 = useState(null);
  const [job, setJob]                     = useState(null);
  const logoInputRef  = useRef();
  const srtInputRef   = useRef();
  const audioInputRef = useRef();
  const pollRef       = useRef();

  // Load resolutions
  useEffect(() => {
    fetch(`${API}/api/resolutions`).then(r => r.json()).then(setResolutions).catch(() => {});
  }, []);

  // Load batch files when batch changes
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
  }, [selectedBatch, fileRefreshTrigger]);

  // Load logo + overlay files
  useEffect(() => {
    fetch(`${API}/api/assets/logo`).then(r => r.json()).then(d => setLogoFile(d.logo));
    fetch(`${API}/api/assets/overlays/${SESSION_TOKEN}`).then(r => r.json()).then(d => {
      setSrtFile(d.srt || null);
      setAudioFile(d.audio || null);
    });
  }, []);

  // Poll job status
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
    } finally { setUploadingLogo(false); }
  };

  const uploadSrt = async (file) => {
    setUploadingSrt(true);
    try {
      const fd = new FormData();
      fd.append('subtitle', file);
      await fetch(`${API}/api/assets/subtitle/${SESSION_TOKEN}`, { method: 'POST', body: fd });
      setSrtFile(file.name);
    } finally { setUploadingSrt(false); }
  };

  const uploadAudio = async (file) => {
    setUploadingAudio(true);
    try {
      const fd = new FormData();
      fd.append('audio', file);
      await fetch(`${API}/api/assets/audio/${SESSION_TOKEN}`, { method: 'POST', body: fd });
      setAudioFile(file.name);
    } finally { setUploadingAudio(false); }
  };

  const removeOverlay = async (type) => {
    await fetch(`${API}/api/assets/overlays/${SESSION_TOKEN}/${type}`, { method: 'DELETE' });
    if (type === 'srt') setSrtFile(null);
    else setAudioFile(null);
  };

  const toggleVideo = f => setSelectedVideos(p => p.includes(f) ? p.filter(x => x !== f) : [...p, f]);
  const toggleImage = f => setSelectedImages(p => p.includes(f) ? p.filter(x => x !== f) : [...p, f]);

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
          logoText, logoSubtext,
          sliceDuration: Number(sliceDuration),
          imageDuration: Number(imageDuration),
          resolution,
          sessionToken: SESSION_TOKEN,
        })
      });
      const { jobId: id } = await res.json();
      setJobId(id);
    } catch { setGenerating(false); }
  };

  const hasContent = selectedVideos.length > 0 || selectedImages.length > 0;

  return (
    <div className="space-y-5">
      {!selectedBatch ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          <Clapperboard className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a batch from the left panel to configure generation</p>
        </div>
      ) : (
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
              {batchFiles.videos.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs uppercase tracking-widest text-muted-foreground">Video Pool</Label>
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedVideos(batchFiles.videos)} className="text-xs text-primary hover:underline">All</button>
                      <span className="text-muted-foreground text-xs">·</span>
                      <button onClick={() => setSelectedVideos([])} className="text-xs text-muted-foreground hover:text-foreground">None</button>
                    </div>
                  </div>
                  <div className="grid gap-1">
                    {batchFiles.videos.map(f => (
                      <FileToggle key={f} name={f} selected={selectedVideos.includes(f)} onToggle={() => toggleVideo(f)} color="blue" />
                    ))}
                  </div>
                </div>
              )}

              {batchFiles.images.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs uppercase tracking-widest text-muted-foreground">Image Pool</Label>
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedImages(batchFiles.images)} className="text-xs text-primary hover:underline">All</button>
                      <span className="text-muted-foreground text-xs">·</span>
                      <button onClick={() => setSelectedImages([])} className="text-xs text-muted-foreground hover:text-foreground">None</button>
                    </div>
                  </div>
                  <div className="grid gap-1">
                    {batchFiles.images.map(f => (
                      <FileToggle key={f} name={f} selected={selectedImages.includes(f)} onToggle={() => toggleImage(f)} color="purple" />
                    ))}
                  </div>
                </div>
              )}

              {batchFiles.videos.length === 0 && batchFiles.images.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No files in this batch yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Resolution picker */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Monitor className="w-4 h-4 text-primary" /> Resolution
              </CardTitle>
              <CardDescription>Output video dimensions — applies to both video slices and image slideshow</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-2">
                {resolutions.map(r => (
                  <button
                    key={r.key}
                    onClick={() => setResolution(r.key)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all",
                      resolution === r.key
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border hover:border-border/80 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="text-xl">{RESOLUTION_ICONS[r.key]}</span>
                    <div>
                      <div className={cn("text-sm font-semibold mono", resolution === r.key && "text-primary")}>{r.key}</div>
                      <div className="text-xs text-muted-foreground">{r.label.split('—')[1]?.trim()}</div>
                    </div>
                    {resolution === r.key && <Check className="w-4 h-4 text-primary ml-auto" />}
                  </button>
                ))}
              </div>
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
                  <Label className="text-xs">Video slice duration (sec)</Label>
                  <Input type="number" min="1" max="60" step="1" value={sliceDuration} onChange={e => setSliceDuration(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Image duration (sec)</Label>
                  <Input type="number" min="0.1" max="10" step="0.1" value={imageDuration} onChange={e => setImageDuration(e.target.value)} />
                </div>
              </div>

              <Separator />

              {/* Text overlays — only shown if no SRT uploaded */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">Text Overlay</Label>
                  {srtFile && (
                    <span className="text-xs text-yellow-400 flex items-center gap-1">
                      <FileText className="w-3 h-3" /> SRT active — text fields ignored
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  <Input
                    placeholder="Title text (e.g. My Brand)"
                    value={logoText}
                    onChange={e => setLogoText(e.target.value)}
                    disabled={!!srtFile}
                    className={srtFile ? 'opacity-40' : ''}
                  />
                  <Input
                    placeholder="Subtitle text (e.g. @handle)"
                    value={logoSubtext}
                    onChange={e => setLogoSubtext(e.target.value)}
                    disabled={!!srtFile}
                    className={srtFile ? 'opacity-40' : ''}
                  />
                </div>
              </div>

              <Separator />

              {/* Logo upload */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Logo Image</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                    {uploadingLogo ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    {logoFile ? 'Replace' : 'Upload Logo'}
                  </Button>
                  {logoFile && <span className="text-xs text-green-400 flex items-center gap-1"><Check className="w-3 h-3" />{logoFile}</span>}
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && uploadLogo(e.target.files[0])} />
                </div>
              </div>

              <Separator />

              {/* SRT subtitle upload */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">Subtitles (.srt)</Label>
                  <Badge variant="secondary" className="text-xs">Optional</Badge>
                  {srtFile && <Badge className="text-xs bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Active — overrides text</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">If uploaded, the SRT file will be burned into the video instead of the plain text above.</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => srtInputRef.current?.click()} disabled={uploadingSrt}>
                    {uploadingSrt ? <RefreshCw className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                    {srtFile ? 'Replace .srt' : 'Upload .srt'}
                  </Button>
                  {srtFile && (
                    <>
                      <span className="text-xs text-yellow-400 flex items-center gap-1"><Check className="w-3 h-3" />{srtFile}</span>
                      <button onClick={() => removeOverlay('srt')} className="text-muted-foreground hover:text-destructive transition-colors ml-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <input ref={srtInputRef} type="file" accept=".srt" className="hidden" onChange={e => e.target.files[0] && uploadSrt(e.target.files[0])} />
                </div>
              </div>

              <Separator />

              {/* MP3 audio upload */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">Background Audio (.mp3)</Label>
                  <Badge variant="secondary" className="text-xs">Optional</Badge>
                </div>
                <p className="text-xs text-muted-foreground">MP3 will be mixed into the final output. Audio ends when the shorter of video or audio finishes.</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => audioInputRef.current?.click()} disabled={uploadingAudio}>
                    {uploadingAudio ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Music className="w-3 h-3" />}
                    {audioFile ? 'Replace .mp3' : 'Upload .mp3'}
                  </Button>
                  {audioFile && (
                    <>
                      <span className="text-xs text-green-400 flex items-center gap-1"><Check className="w-3 h-3" />{audioFile}</span>
                      <button onClick={() => removeOverlay('audio')} className="text-muted-foreground hover:text-destructive transition-colors ml-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <input ref={audioInputRef} type="file" accept=".mp3,.m4a,.wav" className="hidden" onChange={e => e.target.files[0] && uploadAudio(e.target.files[0])} />
                </div>
              </div>
              {audioFile && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground">Lyrics / Subtitles</Label>
                      <Badge variant="secondary" className="text-xs">Karaoke</Badge>
                      {srtFile && <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>}
                    </div>
                    <LyricsPanel
                      sessionToken={SESSION_TOKEN}
                      audioFile={audioFile}
                      onSrtReady={(ready) => {
                        if (ready) {
                          fetch(`${API}/api/assets/overlays/${SESSION_TOKEN}`)
                            .then(r => r.json())
                            .then(d => setSrtFile(d.srt || null));
                        } else {
                          setSrtFile(null);
                        }
                      }}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          <Button className="w-full h-12 text-base font-bold" onClick={generate} disabled={generating || !hasContent}>
            {generating
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</>
              : <><Play className="w-4 h-4" /> Generate Video</>
            }
          </Button>

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
  const statusColors = { queued: 'status-queued', running: 'status-running', done: 'status-done', error: 'status-error' };
  return (
    <Card className={cn("slide-up", job.status === 'running' && 'glow-orange-sm')}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {job.status === 'running' && <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />}
            {job.status === 'done'    && <Check className="w-3.5 h-3.5 text-green-400" />}
            {job.status === 'error'   && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
            <span className="text-sm font-semibold">Job {job.id.slice(0, 8)}...</span>
          </div>
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold", statusColors[job.status])}>
            {job.status.toUpperCase()}
          </span>
        </div>

        {(job.status === 'running' || job.status === 'done') && <Progress value={job.progress} className="h-1.5" />}

        {job.log?.length > 0 && (
          <div className="bg-muted rounded-md p-3 max-h-32 overflow-y-auto">
            {job.log.map((line, i) => (
              <div key={i} className={cn("text-xs mono", line.startsWith('ERROR') ? 'text-red-400' : 'text-muted-foreground')}>{line}</div>
            ))}
          </div>
        )}

        {job.status === 'done' && job.outputFile && (
          <a
            href={`http://localhost:5001/outputs/${job.outputFile}`}
            download
            className="flex items-center justify-center gap-2 w-full h-10 rounded-md bg-green-500/20 border border-green-500/40 text-green-400 text-sm font-semibold hover:bg-green-500/30 transition-colors"
          >
            <Download className="w-4 h-4" /> Download {job.outputFile}
          </a>
        )}
      </CardContent>
    </Card>
  );
}
