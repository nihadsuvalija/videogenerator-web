import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Check, RotateCcw, Trash2, BookOpen, RefreshCw, Quote,
  Pencil, X, FolderOpen, CheckSquare, Square,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, Label, Badge } from './ui-primitives';
import { Button } from './ui-button';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';

export default function QuotesPanel() {
  const { token } = useAuth();

  // ── Batches ───────────────────────────────────────────────────────────────
  const [batches, setBatches]         = useState([]);
  const [activeBatch, setActiveBatch] = useState(null); // null = All
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [newBatchName, setNewBatchName]   = useState('');
  const [confirmDeleteBatch, setConfirmDeleteBatch] = useState(false);
  const newBatchInputRef = useRef();

  // ── Quotes ────────────────────────────────────────────────────────────────
  const [quotes, setQuotes]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [newText, setNewText]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [filter, setFilter]       = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);

  const loadBatches = useCallback(async () => {
    const res = await fetch(`${API}/api/quote-batches`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setBatches(await res.json());
  }, [token]);

  const loadQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/quotes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setQuotes(await res.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    loadBatches();
    loadQuotes();
  }, [loadBatches, loadQuotes]);

  useEffect(() => {
    if (creatingBatch) newBatchInputRef.current?.focus();
  }, [creatingBatch]);

  // Clear selection when batch/filter changes
  useEffect(() => { setSelectedIds(new Set()); }, [activeBatch, filter]);

  // ── Batch actions ─────────────────────────────────────────────────────────
  const createBatch = async () => {
    if (!newBatchName.trim()) return;
    const res = await fetch(`${API}/api/quote-batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newBatchName.trim() }),
    });
    const b = await res.json();
    setBatches(prev => [...prev, b]);
    setActiveBatch(b.id);
    setNewBatchName('');
    setCreatingBatch(false);
  };

  const renameBatch = async (id, name) => {
    const res = await fetch(`${API}/api/quote-batches/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    });
    const b = await res.json();
    setBatches(prev => prev.map(x => x.id === id ? b : x));
  };

  const deleteBatch = async (id) => {
    await fetch(`${API}/api/quote-batches/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setBatches(prev => prev.filter(x => x.id !== id));
    setQuotes(prev => prev.map(q => q.batchId === id ? { ...q, batchId: null } : q));
    if (activeBatch === id) setActiveBatch(null);
    setConfirmDeleteBatch(false);
  };

  // ── Quote actions ─────────────────────────────────────────────────────────
  const isBulk = newText.includes(';');
  const bulkParts = isBulk ? newText.split(';').map(s => s.trim()).filter(Boolean) : [];

  const addQuote = async () => {
    if (!newText.trim()) return;
    setSaving(true);
    try {
      if (isBulk) {
        const res = await fetch(`${API}/api/quotes/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ texts: bulkParts, batchId: activeBatch }),
        });
        const added = await res.json();
        setQuotes(prev => [...added, ...prev]);
      } else {
        const res = await fetch(`${API}/api/quotes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: newText.trim(), batchId: activeBatch }),
        });
        const q = await res.json();
        setQuotes(prev => [q, ...prev]);
      }
      setNewText('');
    } finally { setSaving(false); }
  };

  const toggle = async (id, enabled) => {
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, enabled } : q));
    await fetch(`${API}/api/quotes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ enabled, usedAt: enabled ? null : undefined }),
    });
  };

  const remove = async (id) => {
    setQuotes(prev => prev.filter(q => q.id !== id));
    setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    await fetch(`${API}/api/quotes/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  };

  const removeSelected = async () => {
    setDeletingSelected(true);
    const ids = [...selectedIds];
    setQuotes(prev => prev.filter(q => !selectedIds.has(q.id)));
    setSelectedIds(new Set());
    try {
      await Promise.all(ids.map(id =>
        fetch(`${API}/api/quotes/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      ));
    } finally { setDeletingSelected(false); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const batchQuotes = activeBatch ? quotes.filter(q => q.batchId === activeBatch) : quotes;
  const activeCount = batchQuotes.filter(q => q.enabled).length;
  const usedCount   = batchQuotes.filter(q => !q.enabled).length;

  const filtered = batchQuotes.filter(q =>
    filter === 'active' ? q.enabled :
    filter === 'used'   ? !q.enabled :
    true
  );

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filtered.map(q => q.id)));
  const clearSelection = () => setSelectedIds(new Set());
  const allSelected = filtered.length > 0 && filtered.every(q => selectedIds.has(q.id));

  const batchQuoteCount = (batchId) => quotes.filter(q => q.batchId === batchId).length;
  const activeBatchData = batches.find(b => b.id === activeBatch);

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* ── Batch tabs ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {/* All tab */}
          <button
            onClick={() => { setActiveBatch(null); setConfirmDeleteBatch(false); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-all flex-shrink-0",
              !activeBatch
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            )}>
            <BookOpen className="w-3 h-3" /> All ({quotes.length})
          </button>

          {/* Batch tabs */}
          {batches.map(b => (
            <BatchTab
              key={b.id}
              batch={b}
              count={batchQuoteCount(b.id)}
              active={activeBatch === b.id}
              onSelect={() => { setActiveBatch(b.id); setConfirmDeleteBatch(false); }}
              onRename={(name) => renameBatch(b.id, name)}
              onDelete={() => deleteBatch(b.id)}
            />
          ))}

          {/* New batch */}
          {creatingBatch ? (
            <div className="flex items-center gap-1 flex-shrink-0">
              <input
                ref={newBatchInputRef}
                value={newBatchName}
                onChange={e => setNewBatchName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') createBatch();
                  if (e.key === 'Escape') { setCreatingBatch(false); setNewBatchName(''); }
                }}
                placeholder="Batch name…"
                className="h-7 w-32 px-2 text-xs rounded-md border border-primary bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button onClick={createBatch} className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity">
                <Check className="w-3 h-3" />
              </button>
              <button onClick={() => { setCreatingBatch(false); setNewBatchName(''); }}
                className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreatingBatch(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-border/80 whitespace-nowrap transition-all flex-shrink-0">
              <Plus className="w-3 h-3" /> New Batch
            </button>
          )}
        </div>

        {/* Active batch context + delete */}
        {activeBatch && activeBatchData && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Adding quotes to <span className="font-semibold text-foreground">{activeBatchData.name}</span>
            </p>
            {confirmDeleteBatch ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Delete this batch?</span>
                <button
                  onClick={() => deleteBatch(activeBatch)}
                  className="h-6 px-2 rounded text-[10px] font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDeleteBatch(false)}
                  className="h-6 px-2 rounded text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDeleteBatch(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-3 h-3" /> Delete batch
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Active', value: activeCount, muted: false },
          { label: 'Used',   value: usedCount,   muted: true  },
          { label: 'Total',  value: batchQuotes.length, muted: false },
        ].map(s => (
          <div key={s.label} className="px-4 py-3 rounded-lg border border-border bg-card">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.label}</p>
            <p className={cn("text-2xl font-bold", s.muted && "text-muted-foreground")}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Add quote ── */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <Label className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <Plus className="w-3 h-3" /> New Quote
            {activeBatch && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold">
                → {activeBatchData?.name}
              </span>
            )}
          </Label>
          <textarea
            placeholder={"Single quote: just type it here.\n\nBulk (200 at once): separate with semicolons\nFirst quote ; Second quote ; Third quote"}
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) addQuote(); }}
            rows={4}
            className={cn(
              "w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y mono",
              isBulk ? "border-primary/50" : "border-input"
            )}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {isBulk
                ? <span className="text-primary font-medium">{bulkParts.length} quotes detected (separated by <code>;</code>)</span>
                : '⌘+Enter to save · Use ; to add many at once'}
            </p>
            <Button onClick={addQuote} disabled={saving || !newText.trim()} className="gap-2">
              {saving
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
                : isBulk
                  ? <><Plus className="w-4 h-4" /> Add {bulkParts.length} Quotes</>
                  : <><Plus className="w-4 h-4" /> Add Quote</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Filter bar + select all ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
          {['all', 'active', 'used'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium capitalize transition-all",
                filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}>
              {f === 'all' ? `All (${batchQuotes.length})` : f === 'active' ? `Active (${activeCount})` : `Used (${usedCount})`}
            </button>
          ))}
        </div>
        {filtered.length > 0 && (
          <button
            onClick={allSelected ? clearSelection : selectAll}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {allSelected
              ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
              : <Square className="w-3.5 h-3.5" />}
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        )}
      </div>

      {/* ── Bulk action bar ── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-destructive/30 bg-destructive/5">
          <span className="text-sm font-medium">
            {selectedIds.size} quote{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <button onClick={clearSelection} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Clear
            </button>
            <Button
              variant="destructive"
              size="sm"
              onClick={removeSelected}
              disabled={deletingSelected}
              className="gap-1.5 h-7 text-xs">
              {deletingSelected
                ? <><RefreshCw className="w-3 h-3 animate-spin" /> Deleting…</>
                : <><Trash2 className="w-3 h-3" /> Delete {selectedIds.size}</>}
            </Button>
          </div>
        </div>
      )}

      {/* ── Quote list ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center mb-3">
            <BookOpen className="w-5 h-5 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground">
            {filter === 'all'
              ? activeBatch ? 'No quotes in this batch yet.' : 'No quotes yet. Add your first quote above.'
              : `No ${filter} quotes.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(q => (
            <QuoteCard
              key={q.id}
              quote={q}
              batchName={q.batchId ? batches.find(b => b.id === q.batchId)?.name : null}
              showBatch={!activeBatch}
              selected={selectedIds.has(q.id)}
              onSelect={() => toggleSelect(q.id)}
              onToggle={() => toggle(q.id, !q.enabled)}
              onDelete={() => remove(q.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Batch Tab ──────────────────────────────────────────────────────────────────
function BatchTab({ batch, count, active, onSelect, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(batch.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef();

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitRename = () => {
    if (editName.trim() && editName.trim() !== batch.name) onRename(editName.trim());
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 flex-shrink-0">
        <input
          ref={inputRef}
          value={editName}
          onChange={e => setEditName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') { setEditing(false); setEditName(batch.name); }
          }}
          onBlur={commitRename}
          className="h-7 w-28 px-2 text-xs rounded-md border border-primary bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    );
  }

  return (
    <div className={cn(
      "group flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-all flex-shrink-0",
      active
        ? "border-primary bg-primary/10 text-primary"
        : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
    )}>
      <button onClick={onSelect} className="flex items-center gap-1.5">
        <FolderOpen className="w-3 h-3" />
        {batch.name}
        <span className="opacity-60">({count})</span>
      </button>
      <div className="flex items-center gap-0.5 ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setEditing(true)}
          className="w-4 h-4 rounded flex items-center justify-center hover:bg-primary/20 transition-colors">
          <Pencil className="w-2.5 h-2.5" />
        </button>
        {confirmDelete ? (
          <>
            <button onClick={onDelete}
              className="px-1 h-4 rounded text-[9px] font-semibold bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors">
              Del
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="w-4 h-4 rounded flex items-center justify-center hover:bg-secondary transition-colors">
              <X className="w-2.5 h-2.5" />
            </button>
          </>
        ) : (
          <button onClick={() => setConfirmDelete(true)}
            className="w-4 h-4 rounded flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors">
            <Trash2 className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Quote Card ─────────────────────────────────────────────────────────────────
function QuoteCard({ quote, batchName, showBatch, selected, onSelect, onToggle, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 flex items-start gap-3 transition-all group cursor-pointer",
        selected
          ? "border-primary/50 bg-primary/5"
          : quote.enabled
            ? "border-border bg-card hover:border-border/80"
            : "border-border/40 bg-secondary/10 opacity-60"
      )}
      onClick={onSelect}
    >
      {/* Checkbox */}
      <div className={cn(
        "w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-1 border transition-colors",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-transparent"
      )}>
        {selected && <Check className="w-2.5 h-2.5" />}
      </div>

      <div className={cn(
        "w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5",
        quote.enabled ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
      )}>
        <Quote className="w-3 h-3" />
      </div>

      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm whitespace-pre-wrap break-words leading-relaxed",
          !quote.enabled && "line-through text-muted-foreground"
        )}>
          {quote.text}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {showBatch && batchName && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-medium">
              {batchName}
            </span>
          )}
          {!quote.enabled && quote.usedAt && (
            <span className="text-[10px] text-muted-foreground/50">
              Used {new Date(quote.usedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          )}
        </div>
      </div>

      <div
        className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={e => e.stopPropagation()}
      >
        {!quote.enabled && (
          <Badge className="text-[10px] bg-secondary/80 text-muted-foreground border-border mr-1">Used</Badge>
        )}
        <button onClick={onToggle}
          title={quote.enabled ? 'Mark as used' : 'Re-enable'}
          className={cn(
            "w-7 h-7 rounded-md flex items-center justify-center transition-colors",
            quote.enabled
              ? "text-muted-foreground hover:text-foreground hover:bg-secondary"
              : "text-primary hover:bg-primary/10"
          )}>
          {quote.enabled ? <Check className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
        </button>
        {confirmDelete ? (
          <>
            <button onClick={onDelete}
              className="h-7 px-2 rounded-md text-[10px] font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
              Confirm
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="h-7 px-2 rounded-md text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
          </>
        ) : (
          <button onClick={() => setConfirmDelete(true)}
            title="Delete"
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
