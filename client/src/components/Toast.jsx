import React, { useEffect } from 'react';
import { Check, AlertCircle, X, Download } from 'lucide-react';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';

export default function Toast({ toasts, onDismiss }) {
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast: t, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, t.outputFile ? 10000 : 5000);
    return () => clearTimeout(timer);
  }, []);

  const styles = {
    success: 'border-green-500/40 bg-green-500/10',
    error:   'border-red-500/40 bg-red-500/10',
  };
  const icons = {
    success: <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />,
    error:   <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />,
  };

  return (
    <div className={cn(
      'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border',
      'bg-background/95 backdrop-blur-md shadow-xl min-w-[280px] max-w-[340px]',
      'animate-in slide-in-from-right-4 duration-300',
      styles[t.type] || styles.success
    )}>
      {icons[t.type] || icons.success}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{t.title}</p>
        {t.message && <p className="text-xs text-muted-foreground mt-0.5">{t.message}</p>}
        {t.outputFile && (
          <a
            href={`${API}/outputs/${t.outputFile}`}
            download
            className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-green-400 hover:text-green-300 transition-colors"
          >
            <Download className="w-3 h-3" /> Download video
          </a>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
