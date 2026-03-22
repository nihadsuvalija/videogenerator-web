import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Film, Image, FolderOpen } from 'lucide-react';
import { cn } from '../lib/utils';

export default function BatchPickerModal({ batches, onSelect, onClose }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        className="mx-4 rounded-xl border border-border bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Select a Batch</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Batch list */}
        <div className="overflow-y-auto flex-1">
          {batches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <FolderOpen className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No batches yet.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Create a batch in the Batches tab first.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {batches.map(batch => (
                <button
                  key={batch.name}
                  onClick={() => { onSelect(batch.name); onClose(); }}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/50 transition-colors text-left group"
                >
                  <div>
                    <div className="font-mono text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{batch.name}</div>
                    <div className="flex gap-3 mt-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Film className="w-3 h-3" /> {batch.videoCount} videos
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Image className="w-3 h-3" /> {batch.imageCount} images
                      </span>
                    </div>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
