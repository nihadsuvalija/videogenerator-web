import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Music, Mic, Upload, RefreshCw, Check, AlertCircle,
  FileText, Trash2, Edit3, Save, Eye, ChevronDown, Info
} from 'lucide-react';
import { Button } from './ui-button';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
  Input, Label, Badge, Progress, Separator
} from './ui-primitives';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';

const WHISPER_MODELS = [
  { id: 'tiny',   label: 'Tiny',   note: 'Fastest, least accurate (~75MB)' },
  { id: 'base',   label: 'Base',   note: 'Good balance (~150MB) — recommended' },
  { id: 'small',  label: 'Small',  note: 'Better accuracy (~500MB)' },
  { id: 'medium', label: 'Medium', note: 'High accuracy (~1.5GB)' },
  { id: 'large',  label: 'Large',  note: 'Best accuracy (~3GB, slow)' },
];

export default function LyricsPanel({ sessionToken, audioFile, onSrtReady }) {
  const [whisperModel, setWhisperModel]     = useState('base');
  const [transcribing, setTranscribing]     = useState(false);
  const [transcribeJob, setTranscribeJob]   = useState(null); // {status, progress, error, srtFile}
  const [srtContent, setSrtContent]         = useState('');
  const [editedSrt, setEditedSrt]           = useState('');
  const [editing, setEditing]               = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [showSetup, setShowSetup]           = useState(false);
  const [srtExists, setSrtExists]           = useState(false);
  const srtInputRef = useRef();
  const pollRef     = useRef();

  // Load SRT content if one already exists for this session
  const loadSrt = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/lyrics/srt/${sessionToken}`);
      if (res.ok) {
        const text = await res.text();
        setSrtContent(text);
        setEditedSrt(text);
        setSrtExists(true);
        onSrtReady?.(true);
      }
    } catch {}
  }, [sessionToken, onSrtReady]);

  useEffect(() => { loadSrt(); }, [loadSrt]);

  // Poll transcription status
  const pollStatus = useCallback(async () => {
    const res = await fetch(`${API}/api/lyrics/status/${sessionToken}`);
    const job = await res.json();
    setTranscribeJob(job);
    if (job.status === 'running') {
      pollRef.current = setTimeout(pollStatus, 1000);
    } else if (job.status === 'done') {
      setTranscribing(false);
      loadSrt();
    } else if (job.status === 'error') {
      setTranscribing(false);
    }
  }, [sessionToken, loadSrt]);

  useEffect(() => () => clearTimeout(pollRef.current), []);

  const startTranscription = async () => {
    if (!audioFile) return;
    setTranscribing(true);
    setTranscribeJob({ status: 'running', progress: 0 });
    try {
      await fetch(`${API}/api/lyrics/transcribe/${sessionToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: whisperModel })
      });
      pollRef.current = setTimeout(pollStatus, 1000);
    } catch (e) {
      setTranscribing(false);
      setTranscribeJob({ status: 'error', error: e.message });
    }
  };

  const uploadManualSrt = async (file) => {
    const text = await file.text();
    setSaving(true);
    try {
      await fetch(`${API}/api/lyrics/srt/${sessionToken}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: text
      });
      setSrtContent(text);
      setEditedSrt(text);
      setSrtExists(true);
      onSrtReady?.(true);
    } finally { setSaving(false); }
  };

  const saveEdits = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/api/lyrics/srt/${sessionToken}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: editedSrt
      });
      setSrtContent(editedSrt);
      setEditing(false);
    } finally { setSaving(false); }
  };

  const removeSrt = async () => {
    await fetch(`${API}/api/assets/overlays/${sessionToken}/srt`, { method: 'DELETE' });
    setSrtContent('');
    setEditedSrt('');
    setSrtExists(false);
    setTranscribeJob(null);
    onSrtReady?.(false);
  };

  const parseSrtPreview = (srt) => {
    if (!srt) return [];
    const blocks = srt.trim().split(/\n\n+/);
    return blocks.slice(0, 6).map(block => {
      const lines = block.split('\n');
      const time = lines[1] || '';
      const text = lines.slice(2).join(' ');
      return { time, text };
    });
  };

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="rounded-lg border border-border bg-muted/30 p-3 flex gap-2">
        <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Lyrics are synced to your audio and displayed <span className="text-foreground font-medium">karaoke-style</span> — one line at a time, centered on screen, in large bold white text.</p>
          <p>Upload an MP3 first in the Config tab, then auto-transcribe or upload a manual <code className="bg-secondary px-1 rounded">.srt</code> file.</p>
        </div>
      </div>

      {/* Auto-transcribe with Whisper */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mic className="w-4 h-4 text-primary" />
            Auto-transcribe with Whisper
          </CardTitle>
          <CardDescription>
            AI speech-to-text — automatically generates synced lyrics from your audio
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!audioFile ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-muted-foreground text-sm">
              <Music className="w-6 h-6 mx-auto mb-2 opacity-30" />
              Upload an MP3 in the Config tab first
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-green-400">
                <Check className="w-3.5 h-3.5" />
                Audio ready: <span className="mono text-xs">{audioFile}</span>
              </div>

              {/* Model selector */}
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Whisper Model</Label>
                <div className="space-y-1">
                  {WHISPER_MODELS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setWhisperModel(m.id)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left text-sm transition-all",
                        whisperModel === m.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-border/80 text-muted-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {whisperModel === m.id
                          ? <Check className="w-3.5 h-3.5 text-primary" />
                          : <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/40" />
                        }
                        <span className={cn("font-semibold", whisperModel === m.id && "text-primary")}>{m.label}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{m.note}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Button
                className="w-full"
                onClick={startTranscription}
                disabled={transcribing}
              >
                {transcribing
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Transcribing...</>
                  : <><Mic className="w-4 h-4" /> Transcribe Audio</>
                }
              </Button>

              {/* Transcription progress */}
              {transcribeJob && transcribeJob.status === 'running' && (
                <div className="space-y-2 slide-up">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-blue-400 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Running Whisper...
                    </span>
                    <span className="text-muted-foreground">{transcribeJob.progress || 0}%</span>
                  </div>
                  <Progress value={transcribeJob.progress || 0} />
                  <p className="text-xs text-muted-foreground">This may take 1–3 minutes depending on audio length and model size.</p>
                </div>
              )}

              {transcribeJob?.status === 'error' && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 space-y-2">
                  <div className="flex items-start gap-2 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{transcribeJob.error}</span>
                  </div>
                  {transcribeJob.error?.includes('not installed') && (
                    <button
                      onClick={() => setShowSetup(!showSetup)}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <ChevronDown className={cn("w-3 h-3 transition-transform", showSetup && "rotate-180")} />
                      Setup instructions
                    </button>
                  )}
                  {showSetup && (
                    <div className="space-y-2 pt-1 slide-up">
                      <SetupStep n={1} cmd="pip install openai-whisper" label="Install Whisper" />
                      <SetupStep n={2} cmd="pip install ffmpeg-python" label="Install ffmpeg-python" />
                      <SetupStep n={3} label="Restart the server, then try again" />
                    </div>
                  )}
                </div>
              )}

              {transcribeJob?.status === 'done' && (
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <Check className="w-4 h-4" /> Transcription complete!
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Manual SRT upload */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            Manual Upload
          </CardTitle>
          <CardDescription>Already have a synced .srt file? Upload it directly</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => srtInputRef.current?.click()}>
              <FileText className="w-3.5 h-3.5" /> Upload .srt
            </Button>
            {srtExists && (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <Check className="w-3 h-3" /> SRT loaded
              </span>
            )}
            <input
              ref={srtInputRef}
              type="file"
              accept=".srt"
              className="hidden"
              onChange={e => e.target.files[0] && uploadManualSrt(e.target.files[0])}
            />
          </div>
        </CardContent>
      </Card>

      {/* SRT Preview + Editor */}
      {srtExists && srtContent && (
        <Card className="slide-up">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Lyrics Preview
                <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                {!editing ? (
                  <>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setEditing(true); setEditedSrt(srtContent); }}>
                      <Edit3 className="w-3 h-3" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={removeSrt}>
                      <Trash2 className="w-3 h-3" /> Remove
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" className="h-7 text-xs gap-1" onClick={saveEdits} disabled={saving}>
                      {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditing(false); setEditedSrt(srtContent); }}>
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {editing ? (
              <textarea
                value={editedSrt}
                onChange={e => setEditedSrt(e.target.value)}
                className="w-full h-64 bg-muted rounded-md p-3 text-xs mono text-foreground border border-border resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                spellCheck={false}
              />
            ) : (
              <div className="space-y-2">
                {parseSrtPreview(srtContent).map((entry, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="text-xs mono text-muted-foreground flex-shrink-0 pt-0.5 w-36">{entry.time.split(' --> ')[0]}</span>
                    <span className="text-sm text-foreground">{entry.text}</span>
                  </div>
                ))}
                {srtContent.trim().split(/\n\n+/).length > 6 && (
                  <p className="text-xs text-muted-foreground pt-1">
                    +{srtContent.trim().split(/\n\n+/).length - 6} more lines — click Edit to see all
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Karaoke style info */}
      {srtExists && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
          <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
            <Music className="w-3.5 h-3.5" /> Karaoke Style Active
          </p>
          <p className="text-xs text-muted-foreground">
            Lyrics will appear centered on screen in large bold white text with black outline — one line at a time, timed to your audio.
          </p>
        </div>
      )}
    </div>
  );
}

function SetupStep({ n, cmd, label }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { if (!cmd) return; navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className="flex items-start gap-2">
      <div className="w-4 h-4 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 font-bold">{n}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        {cmd && (
          <div className="flex items-center gap-2 mt-0.5">
            <code className="text-xs bg-secondary px-2 py-0.5 rounded mono">{cmd}</code>
            <button onClick={copy} className="text-muted-foreground hover:text-primary">
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <span className="text-xs">copy</span>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
