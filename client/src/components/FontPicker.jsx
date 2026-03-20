import React, { useEffect, useState, useRef } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';

// Google Fonts CSS names (for @import preview loading)
const GOOGLE_FAMILIES = [
  'Roboto:wght@700',
  'Open+Sans:wght@700',
  'Lato:wght@700',
  'Montserrat:wght@700',
  'Oswald:wght@700',
  'Raleway:wght@700',
  'Poppins:wght@700',
  'Nunito:wght@700',
  'Inter:wght@700',
  'Ubuntu:wght@700',
  'Playfair+Display:wght@700',
  'Merriweather:wght@700',
  'Bebas+Neue:wght@400',
  'Anton:wght@400',
  'Pacifico:wght@400',
  'Dancing+Script:wght@700',
  'Lobster:wght@400',
  'Righteous:wght@400',
  'Orbitron:wght@700',
  'Russo+One:wght@400',
  'Permanent+Marker:wght@400',
  'Special+Elite:wght@400',
];

// Map from font id → CSS font-family name
const CSS_FAMILY_MAP = {
  'default':          'inherit',
  'roboto':           'Roboto',
  'open-sans':        '"Open Sans"',
  'lato':             'Lato',
  'montserrat':       'Montserrat',
  'oswald':           'Oswald',
  'raleway':          'Raleway',
  'poppins':          'Poppins',
  'nunito':           'Nunito',
  'inter':            'Inter',
  'ubuntu':           'Ubuntu',
  'playfair-display': '"Playfair Display"',
  'merriweather':     'Merriweather',
  'bebas-neue':       '"Bebas Neue"',
  'anton':            'Anton',
  'pacifico':         'Pacifico',
  'dancing-script':   '"Dancing Script"',
  'lobster':          'Lobster',
  'righteous':        'Righteous',
  'orbitron':         'Orbitron',
  'russo-one':        '"Russo One"',
  'permanent-marker': '"Permanent Marker"',
  'special-elite':    '"Special Elite"',
};

let fontsLoaded = false;

function loadGoogleFonts() {
  if (fontsLoaded || typeof document === 'undefined') return;
  fontsLoaded = true;
  const link = document.createElement('link');
  link.rel  = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${GOOGLE_FAMILIES.map(f => `family=${f}`).join('&')}&display=swap`;
  document.head.appendChild(link);
}

export default function FontPicker({ value = 'default', onChange, previewText, disabled }) {
  const [fonts, setFonts]   = useState([]);
  const [open, setOpen]     = useState(false);
  const [filter, setFilter] = useState('');
  const dropRef             = useRef(null);

  useEffect(() => {
    loadGoogleFonts();
    fetch(`${API}/api/fonts`)
      .then(r => r.json())
      .then(setFonts)
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current   = fonts.find(f => f.id === value) || { id: 'default', name: 'Default' };
  const preview   = previewText?.split('\n').find(l => l.trim()) || 'The quick brown fox';
  const filtered  = fonts.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="relative" ref={dropRef}>
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen(v => !v); }}
        className={cn(
          "w-full flex items-center justify-between gap-2 h-9 rounded-md border border-input bg-background px-3 text-sm transition-colors",
          "hover:border-primary/40 focus:outline-none focus:ring-1 focus:ring-ring",
          disabled && "opacity-40 cursor-not-allowed",
          open && "border-primary ring-1 ring-ring"
        )}
      >
        <span
          className="truncate font-medium"
          style={{ fontFamily: CSS_FAMILY_MAP[value] || 'inherit' }}
        >
          {current.name}
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-lg border border-border bg-card shadow-xl overflow-hidden dropdown-in">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              type="text"
              placeholder="Search fonts…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="w-full h-7 rounded-md bg-background border border-border px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Font list */}
          <div className="max-h-72 overflow-y-auto">
            {filtered.map(font => {
              const cssFamily = CSS_FAMILY_MAP[font.id] || 'inherit';
              const isSelected = font.id === value;
              return (
                <button
                  key={font.id}
                  type="button"
                  onClick={() => { onChange(font.id); setOpen(false); setFilter(''); }}
                  className={cn(
                    "w-full flex flex-col px-3 py-2 text-left hover:bg-secondary/60 transition-colors",
                    isSelected && "bg-primary/10"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-sm font-semibold leading-tight"
                      style={{ fontFamily: cssFamily }}
                    >
                      {font.name}
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {!font.available && (
                        <span className="text-xs text-yellow-500/70">↓ needed</span>
                      )}
                      <span className="text-xs text-muted-foreground/50 capitalize">{font.category}</span>
                      {isSelected && <Check className="w-3 h-3 text-primary" />}
                    </div>
                  </div>
                  {/* Quote preview in the font */}
                  {font.id !== 'default' && (
                    <span
                      className="text-xs text-muted-foreground mt-0.5 truncate block"
                      style={{ fontFamily: cssFamily }}
                    >
                      {preview}
                    </span>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No fonts match</p>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-1.5 border-t border-border bg-secondary/20">
            <p className="text-xs text-muted-foreground/60">
              Run <code className="mono text-xs">node server/scripts/downloadFonts.js</code> to download missing fonts
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
