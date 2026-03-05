import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, AlertCircle, Check, Clock, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Progress } from './ui-primitives';
import { Button } from './ui-button';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';

export default function JobHistory() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/jobs`);
      setJobs(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, []);

  const statusIcon = (s) => {
    if (s === 'running') return <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />;
    if (s === 'done') return <Check className="w-4 h-4 text-green-400" />;
    if (s === 'error') return <AlertCircle className="w-4 h-4 text-red-400" />;
    return <Clock className="w-4 h-4 text-yellow-400" />;
  };

  const statusLabel = {
    queued: 'status-queued',
    running: 'status-running',
    done: 'status-done',
    error: 'status-error',
  };

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
            {jobs.map(job => (
              <div key={job.id} className="px-6 py-3">
                <div
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => setExpanded(expanded === job.id ? null : job.id)}
                >
                  {statusIcon(job.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold font-mono">{job.batchName}</span>
                      <span className={cn("text-xs px-1.5 py-0.5 rounded-full", statusLabel[job.status])}>
                        {job.status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mono mt-0.5">
                      {job.id.slice(0, 12)}... · {new Date(job.createdAt).toLocaleString()}
                    </div>
                    {job.status === 'running' && (
                      <Progress value={job.progress} className="h-1 mt-2" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {job.status === 'done' && job.outputFile && (
                      <a
                        href={`http://localhost:5001/outputs/${job.outputFile}`}
                        download
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 border border-green-500/30 rounded px-2 py-1"
                      >
                        <Download className="w-3 h-3" /> Download
                      </a>
                    )}
                    <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", expanded === job.id && "rotate-180")} />
                  </div>
                </div>

                {expanded === job.id && job.log && job.log.length > 0 && (
                  <div className="mt-3 bg-muted rounded-md p-3 max-h-40 overflow-y-auto slide-up">
                    {job.log.map((line, i) => (
                      <div key={i} className={cn("text-xs mono", line.startsWith('ERROR') ? 'text-red-400' : 'text-muted-foreground')}>
                        {line}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
