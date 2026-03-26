import React from 'react';
import { cn } from '../lib/utils';

export const FILTERS = [
  {
    id: 'none',
    label: 'None',
    swatch: 'bg-gradient-to-br from-gray-400 to-gray-600',
  },
  {
    id: 'bw',
    label: 'B&W',
    swatch: 'bg-gradient-to-br from-gray-100 to-gray-900',
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    swatch: 'bg-gradient-to-br from-orange-800 via-gray-700 to-blue-900',
  },
  {
    id: 'vibrant',
    label: 'Vibrant',
    swatch: 'bg-gradient-to-br from-pink-500 via-yellow-400 to-cyan-400',
  },
  {
    id: 'warm',
    label: 'Warm',
    swatch: 'bg-gradient-to-br from-yellow-400 via-orange-400 to-red-500',
  },
  {
    id: 'cool',
    label: 'Cool',
    swatch: 'bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600',
  },
  {
    id: 'faded',
    label: 'Faded',
    swatch: 'bg-gradient-to-br from-gray-300 via-gray-400 to-gray-500',
  },
  {
    id: 'sepia',
    label: 'Sepia',
    swatch: 'bg-gradient-to-br from-amber-300 via-yellow-700 to-amber-900',
  },
  {
    id: 'matte',
    label: 'Matte',
    swatch: 'bg-gradient-to-br from-slate-600 via-slate-700 to-slate-900',
  },
  {
    id: 'neon',
    label: 'Neon',
    swatch: 'bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-500',
  },
];

export default function FilterPicker({ value = 'none', onChange, disabled }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {FILTERS.map(f => {
        const active = value === f.id;
        return (
          <button
            key={f.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(f.id)}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-lg p-1.5 border-2 transition-all',
              active
                ? 'border-primary ring-1 ring-primary/30 bg-primary/5'
                : 'border-transparent hover:border-border',
              disabled && 'opacity-40 cursor-not-allowed'
            )}
          >
            <div className={cn('w-full h-8 rounded-md', f.swatch)} />
            <span className={cn(
              'text-[10px] font-medium leading-none',
              active ? 'text-primary' : 'text-muted-foreground'
            )}>
              {f.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
