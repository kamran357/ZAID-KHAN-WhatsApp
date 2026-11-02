'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  hint,
  disabled,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options.slice(0, 60);
    return options
      .filter(
        (option) =>
          option.value.toLowerCase().includes(needle) ||
          option.label.toLowerCase().includes(needle),
      )
      .slice(0, 60);
  }, [options, query]);

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <span className="block text-xs font-semibold text-navy">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className={cn(
          'glass-input flex items-center justify-between gap-2 text-left',
          disabled && 'opacity-60',
        )}
      >
        <span className={cn('truncate', !selected && 'text-ink-muted')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
      </button>
      {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}

      {open ? (
        <div className="zk-rise absolute z-40 mt-1 w-full max-w-[420px] rounded-2xl border border-white bg-white/95 p-2 shadow-[0_24px_50px_-24px_rgba(11,20,55,0.55)] backdrop-blur-xl">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models…"
              aria-label={`Search ${label}`}
              className="w-full rounded-xl border border-line bg-white px-2.5 py-2 pl-8 text-xs outline-none focus:border-brand"
            />
          </div>
          <ul role="listbox" aria-label={label} className="scroll-slim mt-1 max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-xs text-ink-muted">No matches</li>
            ) : (
              filtered.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition hover:bg-brand/10',
                      option.value === value ? 'bg-brand/10 font-semibold text-navy' : 'text-ink',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                      {option.hint ? (
                        <span className="ml-1 text-[10px] font-normal text-ink-muted">
                          {option.hint}
                        </span>
                      ) : null}
                    </span>
                    {option.value === value ? (
                      <Check className="h-3.5 w-3.5 text-brand" aria-hidden />
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
