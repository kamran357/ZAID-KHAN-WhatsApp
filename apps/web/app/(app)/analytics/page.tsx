'use client';

import { useState } from 'react';
import { ChartBar, Handshake, MessageSquare, Timer } from 'lucide-react';
import type { AnalyticsSummary } from '@zk/shared';
import { CardHeader, EmptyState, GlassCard } from '@/components/ui/glass-card';
import { PillTabs } from '@/components/ui/pill-tabs';
import { Chip } from '@/components/ui/chip';
import { AiUsageCard } from '@/components/domain/ai-usage-card';
import { KpiCard } from '@/components/domain/kpi-card';
import { useApi } from '@/lib/hooks';
import { formatDuration, formatNumber } from '@/lib/format';

type Range = '7d' | '30d' | '90d';
const RANGES: { id: Range; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
];

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>('7d');
  const summary = useApi<AnalyticsSummary>(`/api/analytics/summary?range=${range}`, {
    intervalMs: 60000,
  });

  const series = summary.data?.series ?? [];
  const max = Math.max(1, ...series.map((point) => Math.max(point.aiReplies, point.humanReplies)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-navy md:text-2xl">Analytics</h1>
          <p className="mt-1 text-xs text-ink-muted">
            AI vs human replies, handoffs, and quota pressure over time.
          </p>
        </div>
        <PillTabs
          items={RANGES}
          value={range}
          onChange={(next) => setRange(next as Range)}
          ariaLabel="Date range"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="AI replies"
          value={formatNumber(summary.data?.kpis.aiRepliesToday)}
          hint="today"
          tone="brand"
          icon={<MessageSquare className="h-4 w-4" aria-hidden />}
        />
        <KpiCard
          label="Handoffs"
          value={formatNumber(summary.data?.kpis.handoffsToday)}
          hint="today"
          tone="amber"
          icon={<Handshake className="h-4 w-4" aria-hidden />}
        />
        <KpiCard
          label="Avg response"
          value={formatDuration(summary.data?.kpis.avgResponseMs)}
          hint="inbound to reply"
          tone="mint"
          icon={<Timer className="h-4 w-4" aria-hidden />}
        />
        <KpiCard
          label="Inbound"
          value={formatNumber(summary.data?.kpis.inboundToday)}
          hint="messages today"
          tone="navy"
          icon={<ChartBar className="h-4 w-4" aria-hidden />}
        />
      </div>

      <GlassCard>
        <CardHeader
          title="AI vs human replies"
          subtitle="Daily counts, filled from DailyStat"
          action={<Chip tone="blue">{range}</Chip>}
        />
        {series.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No data yet" message="Numbers appear after the number is linked and messages start flowing." />
          </div>
        ) : (
          <div className="mt-5">
            <div className="flex h-40 items-end gap-1.5">
              {series.map((point) => (
                <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div className="flex h-32 w-full items-end justify-center gap-[2px]">
                    <div
                      className="w-1/2 max-w-[10px] rounded-t-md bg-brand/75"
                      style={{ height: `${Math.max(2, (point.aiReplies / max) * 100)}%` }}
                      title={`${point.aiReplies} AI replies on ${point.date}`}
                    />
                    <div
                      className="w-1/2 max-w-[10px] rounded-t-md bg-mint"
                      style={{ height: `${Math.max(2, (point.humanReplies / max) * 100)}%` }}
                      title={`${point.humanReplies} human replies on ${point.date}`}
                    />
                  </div>
                  <span className="text-[9px] text-ink-muted">{point.date.slice(5)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-4 text-[11px] text-ink-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-brand" aria-hidden /> AI
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-mint" aria-hidden /> Human
              </span>
            </div>
          </div>
        )}
      </GlassCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <AiUsageCard usage={summary.data?.usage ?? null} />
        <GlassCard>
          <CardHeader title="Handoff reasons" subtitle="Why the AI stopped and asked for a human" />
          {summary.data?.handoffReasons.length ? (
            <ul className="mt-4 space-y-2">
              {summary.data.handoffReasons.map((row) => (
                <li key={row.reason} className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-navy">{row.reason.replaceAll('_', ' ')}</span>
                  <span className="tabular rounded-full bg-white/70 px-2 py-0.5 font-semibold text-ink-muted">
                    {row.count}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4">
              <EmptyState title="No handoffs yet" message="Every stop is recorded with a reason so you can tune the knowledge base." />
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
