import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, AlertCircle, Check, Clock, ChevronDown, Pencil, Film, Image } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Progress } from './ui-primitives';
import { Button } from './ui-button';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';

const isImage = (f) => /\.(jpe?g|png|webp|gif)$/i.test(f);

export default function JobHistory({ onOpenEditor }) {
  const [jobs, setJobs]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/jobs`);
      setJobs(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, []);

  const statusIcon = (s) => {
    if (s === 'running') return <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />;
    if (s === 'done')    return <Check className="w-4 h-4 text-green-400" />;
    if (s === 'error')   return <AlertCircle className="w-4 h-4 text-red-400" />;
    return <Clock className="w-4 h-4 text-yellow-400" />;
  };

  const statusLabel = { queued: 'status-queued', running: 'status-running', done: 'status-done', error: 'status-error' };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Job History</CardTitle>
          <Button variant="ghost" size="icon" onClick={load} className="h-7 w-7">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {jobs.length === 0 ? (
          <div className="px-6 pb-6 text-center text-muted-foreground text-sm py-8">
            No jobs yet. Generate your first video!
          </div>
        ) : (
          <div className="divide-y divide-border">
            {jobs.map(job => {
              const files = job.outputFiles?.length > 0 ? job.outputFiles : (job.outputFile ? [job.outputFile] : []);
              const isOpen = expanded === job.id;

              return (
                <div key={job.id} className="px-6 py-3">
                  {/* Row header */}
                  <div
                    className="flex items-center gap-3 cursor-pointer"
                    onClick={() => setExpanded(isOpen ? null : job.id)}
                  >
                    {statusIcon(job.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold font-mono">{job.batchName}</span>
                        <span className={cn("text-xs px-1.5 py-0.5 rounded-full", statusLabel[job.status])}>
                          {job.status}
                        </span>
                        {files.length > 1 && (
                          <span className="text-xs text-muted-foreground">
                            {files.length} {job.type === 'posts' ? 'posts' : 'videos'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mono mt-0.5">
                        {job.id.slice(0, 12)}... · {new Date(job.createdAt).toLocaleString()}
                      </div>
                      {job.status === 'running' && <Progress value={job.progress} className="h-1 mt-2" />}
                    </div>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      {job.status === 'done' && job.outputFile && job.type !== 'posts' && (
                        <button
                          onClick={() => onOpenEditor && onOpenEditor(job.id)}
                          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 border border-primary/30 rounded px-2 py-1 transition-colors"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                      )}
                      {job.status === 'done' && files.length === 1 && (
                        <a
                          href={`${API}/outputs/${files[0]}`}
                          download
                          className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 border border-green-500/30 rounded px-2 py-1"
                        >
                          <Download className="w-3 h-3" /> Download
                        </a>
                      )}
                    </div>
                    <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform flex-shrink-0", isOpen && "rotate-180")} />
                  </div>

                  {/* Expanded panel */}
                  {isOpen && (
                    <div className="mt-3 space-y-3 slide-up">

                      {/* Output files preview grid */}
                      {files.length > 0 && job.status === 'done' && (
                        <div>
                          {files.length > 1 && job.outputFolder && (
                            <p className="text-xs text-muted-foreground mb-2 mono">
                              Folder: <span className="text-foreground">{job.outputFolder}/</span>
                            </p>
                          )}
                          <div className={cn(
                            "grid gap-2",
                            files.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"
                          )}>
                            {files.map((file, i) => (
                              <FilePreview
                                key={file}
                                file={file}
                                index={i}
                                jobId={job.id}
                                jobType={job.type}
                                onOpenEditor={onOpenEditor}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Log */}
                      {job.log?.length > 0 && (
                        <details className="group">
                          <summary className="text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors list-none flex items-center gap-1">
                            <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                            Show logs ({job.log.length} lines)
                          </summary>
                          <div className="mt-2 bg-muted rounded-md p-3 max-h-40 overflow-y-auto">
                            {job.log.map((line, i) => (
                              <div key={i} className={cn("text-xs mono", line.startsWith('ERROR') ? 'text-red-400' : 'text-muted-foreground')}>
                                {line}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FilePreview({ file, index, jobId, jobType, onOpenEditor }) {
  const url = `${API}/outputs/${file}`;
  const name = file.split('/').pop();
  const img = isImage(file);

  return (
    <div className={cn(
      "group relative rounded-lg overflow-hidden border border-border bg-muted",
      img ? "aspect-square" : "aspect-video"
    )}>
      {img ? (
        <img
          src={url}
          alt={name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <video
          src={url}
          className="w-full h-full object-cover"
          preload="metadata"
          muted
          onMouseEnter={e => e.currentTarget.play()}
          onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
        />
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        {!img && index === 0 && jobType !== 'posts' && (
          <button
            onClick={() => onOpenEditor && onOpenEditor(jobId)}
            className="flex items-center gap-1 text-xs bg-primary/90 hover:bg-primary text-primary-foreground rounded px-2.5 py-1.5 font-semibold transition-colors"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        )}
        <a
          href={url}
          download={name}
          className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded px-2.5 py-1.5 font-semibold transition-colors"
          onClick={e => e.stopPropagation()}
        >
          <Download className="w-3 h-3" /> Save
        </a>
      </div>

      {/* File name label */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-xs text-white mono truncate">{name}</p>
      </div>

      {/* Type badge */}
      <div className="absolute top-1.5 left-1.5">
        {img
          ? <Image className="w-3.5 h-3.5 text-white drop-shadow" />
          : <Film className="w-3.5 h-3.5 text-white drop-shadow" />
        }
      </div>
    </div>
  );
}
