'use client';

import { cn } from '@/lib/cn';

export interface PillTabItem {
  id: string;
  label: string;
  badge?: number;
}

export function PillTabs({
  items,
  value,
  onChange,
  ariaLabel = 'Sections',
  className,
}: {
  items: PillTabItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex flex-wrap items-center gap-1.5 rounded-full bg-white/55 p-1.5', className)}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition',
              active
                ? 'bg-navy text-white shadow-[0_10px_22px_-14px_rgba(11,20,55,0.9)]'
                : 'text-ink-muted hover:bg-white/80 hover:text-ink',
            )}
          >
            {item.label}
            {typeof item.badge === 'number' && item.badge > 0 ? (
              <span
                className={cn(
                  'tabular rounded-full px-1.5 py-0.5 text-[10px]',
                  active ? 'bg-white/20 text-white' : 'bg-navy/10 text-navy',
                )}
              >
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
