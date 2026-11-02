import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: 'brand' | 'mint' | 'navy' | 'amber';
  className?: string;
}) {
  const chip = {
    brand: 'bg-brand/12 text-brand',
    mint: 'bg-mint/18 text-emerald-700',
    navy: 'bg-navy/8 text-navy',
    amber: 'bg-amber-100 text-amber-700',
  }[tone];

  return (
    <div className={cn('glass-card flex items-start gap-3 p-4', className)}>
      {icon ? (
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-2xl', chip)}>
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
        <p className="tabular mt-1 text-2xl font-extrabold leading-none tracking-tight text-navy">
          {value}
        </p>
        {hint ? <p className="mt-1.5 text-[11px] leading-snug text-ink-muted">{hint}</p> : null}
      </div>
    </div>
  );
}
