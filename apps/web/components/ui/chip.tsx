import { cn } from '@/lib/cn';

export type ChipTone = 'red' | 'yellow' | 'green' | 'blue' | 'purple' | 'cyan' | 'slate';

const TONES: Record<ChipTone, string> = {
  red: 'bg-red-50 text-red-600 border-red-200',
  yellow: 'bg-amber-50 text-amber-700 border-amber-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  purple: 'bg-violet-50 text-violet-700 border-violet-200',
  cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function Chip({
  tone = 'slate',
  children,
  className,
  dot,
}: {
  tone?: ChipTone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
        TONES[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}
