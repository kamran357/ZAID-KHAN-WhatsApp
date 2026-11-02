'use client';

import type { AiUsageSnapshot } from '@zk/shared';
import { Activity, Clock3, Gauge, Layers } from 'lucide-react';
import { CardHeader, GlassCard } from '@/components/ui/glass-card';
import { Chip, type ChipTone } from '@/components/ui/chip';
import { ProgressBar } from '@/components/ui/progress';
import { formatCompact, formatNumber, formatReset } from '@/lib/format';

const LEVEL_TONE: Record<AiUsageSnapshot['budget']['level'], ChipTone> = {
  ok: 'green',
  warn: 'yellow',
  critical: 'red',
  exceeded: 'red',
};

const LEVEL_LABEL: Record<AiUsageSnapshot['budget']['level'], string> = {
  ok: 'Healthy',
  warn: 'Watch',
  critical: 'Near limit',
  exceeded: 'Budget spent',
};

/**
 * The free-tier lifeline: today's requests/tokens against your own budget, how
 * many messages are queued, and when Groq's own window resets.
 */
export function AiUsageCard({
  usage,
  className,
}: {
  usage: AiUsageSnapshot | null;
  className?: string;
}) {
  if (!usage) {
    return (
      <GlassCard className={className}>
        <CardHeader title="AI usage today" subtitle="Loading quota and queue state…" />
        <div className="mt-4 space-y-3">
          <div className="h-2 animate-pulse rounded-full bg-navy/8" />
          <div className="h-2 animate-pulse rounded-full bg-navy/8" />
        </div>
      </GlassCard>
    );
  }

  const { budget, today } = usage;
  const policyLabel =
    budget.policy === 'PAUSE_AI' ? 'Pause AI at 100%' : 'Draft only at 100%';

  return (
    <GlassCard className={className}>
      <CardHeader
        title="AI usage today"
        subtitle={`Budget policy: ${policyLabel}`}
        action={<Chip tone={LEVEL_TONE[budget.level]} dot>{LEVEL_LABEL[budget.level]}</Chip>}
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ProgressBar
          label="Requests"
          value={budget.requestPct}
          detail={`${formatNumber(today.requests)} of ${formatCompact(budget.maxRequests)}`}
        />
        <ProgressBar
          label="Tokens"
          value={budget.tokenPct}
          detail={`${formatCompact(today.totalTokens)} of ${formatCompact(budget.maxTokens)}`}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          icon={<Activity className="h-3.5 w-3.5" aria-hidden />}
          label="Rate-limit hits"
          value={formatNumber(today.rateLimitHits)}
          tone={today.rateLimitHits > 0 ? 'text-red-500' : 'text-navy'}
        />
        <Stat
          icon={<Layers className="h-3.5 w-3.5" aria-hidden />}
          label="Waiting"
          value={formatNumber(usage.queueDepth + usage.retryQueueDepth)}
          tone={usage.retryQueueDepth > 0 ? 'text-amber-600' : 'text-navy'}
        />
        <Stat
          icon={<Clock3 className="h-3.5 w-3.5" aria-hidden />}
          label="Next reset"
          value={formatReset(usage.nextResetAt)}
        />
        <Stat
          icon={<Gauge className="h-3.5 w-3.5" aria-hidden />}
          label="Remaining req"
          value={
            usage.rateLimits.requests.remaining === null
              ? '—'
              : formatNumber(usage.rateLimits.requests.remaining)
          }
        />
      </div>

      {usage.byModel.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-white/70 pt-3">
          {usage.byModel.slice(0, 3).map((model) => (
            <li key={model.model} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate font-medium text-navy">{model.model}</span>
              <span className="tabular shrink-0 text-ink-muted">
                {formatNumber(model.requests)} req · {formatCompact(model.totalTokens)} tok
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-t border-white/70 pt-3 text-[11px] text-ink-muted">
          No AI calls yet today. Send a test from Settings to confirm the key works.
        </p>
      )}

      {budget.pct >= 60 ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700">
          {budget.pct >= 100
            ? 'Budget spent — autopilot is following the policy above until the day resets.'
            : `You are at ${Math.round(budget.pct)}% of today's budget (warning starts at 60%).`}
        </p>
      ) : null}
    </GlassCard>
  );
}

function Stat({
  icon,
  label,
  value,
  tone = 'text-navy',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-white/80 bg-white/60 px-2.5 py-2">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
        {icon}
        {label}
      </p>
      <p className={`tabular mt-1 truncate text-sm font-bold ${tone}`}>{value}</p>
    </div>
  );
}
