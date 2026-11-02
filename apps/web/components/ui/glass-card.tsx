import { cn } from '@/lib/cn';

export function GlassCard({
  children,
  className,
  id,
  as: Tag = 'section',
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  as?: 'section' | 'div' | 'article' | 'aside';
}) {
  return (
    <Tag id={id} className={cn('glass-card p-5', className)}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-bold tracking-tight text-navy">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-navy/10 bg-white/45 px-6 py-10 text-center">
      {icon ? <div className="text-brand">{icon}</div> : null}
      <p className="text-sm font-semibold text-navy">{title}</p>
      <p className="max-w-sm text-xs leading-relaxed text-ink-muted">{message}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
