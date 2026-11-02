import { cn } from '@/lib/cn';

export type ProgressTone = 'ok' | 'warn' | 'danger';

export function toneFor(pct: number): ProgressTone {
  if (pct >= 85) return 'danger';
  if (pct >= 60) return 'warn';
  return 'ok';
}

const FILL: Record<ProgressTone, string> = {
  ok: 'bg-[linear-gradient(90deg,#2ee6a6_0%,#3b8ef0_100%)]',
  warn: 'bg-[linear-gradient(90deg,#fbbf24_0%,#f59e0b_100%)]',
  danger: 'bg-[linear-gradient(90deg,#fb7185_0%,#ef4444_100%)]',
};

const TEXT: Record<ProgressTone, string> = {
  ok: 'text-mint-dark',
  warn: 'text-amber-600',
  danger: 'text-red-500',
};

export function ProgressBar({
  label,
  detail,
  value,
  tone,
  className,
}: {
  label: string;
  detail?: string;
  value: number;
  tone?: ProgressTone;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const resolved = tone ?? toneFor(value);
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-ink">{label}</span>
        <span className={cn('tabular text-xs font-semibold', TEXT[resolved])}>
          {Math.round(value)}%
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-navy/8"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', FILL[resolved])}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {detail ? <p className="tabular text-[11px] text-ink-muted">{detail}</p> : null}
    </div>
  );
}
