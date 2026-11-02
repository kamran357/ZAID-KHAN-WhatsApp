'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  Clock3,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import type { AnalyticsSummary, SettingsDTO, WaStatusPayload } from '@zk/shared';
import { GlassCard, CardHeader, EmptyState } from '@/components/ui/glass-card';
import { PillTabs } from '@/components/ui/pill-tabs';
import { Chip } from '@/components/ui/chip';
import { Button } from '@/components/ui/button';
import { AiUsageCard } from '@/components/domain/ai-usage-card';
import { KpiCard } from '@/components/domain/kpi-card';
import { useApi } from '@/lib/hooks';
import { formatDuration, formatNumber } from '@/lib/format';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'usage', label: 'AI usage' },
  { id: 'safety', label: 'Safety' },
];

export default function DashboardPage() {
  const [tab, setTab] = useState('overview');
  const summary = useApi<AnalyticsSummary>('/api/analytics/summary?range=7d', {
    intervalMs: 30000,
  });
  const settings = useApi<SettingsDTO>('/api/settings');
  const wa = useApi<WaStatusPayload>('/api/wa/status', { intervalMs: 20000 });

  const kpis = summary.data?.kpis;
  const usage = summary.data?.usage ?? null;
  const mode = settings.data?.autopilotMode ?? 'APPROVAL';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-navy md:text-2xl">Dashboard</h1>
          <p className="mt-1 text-xs text-ink-muted">
            Live view of the autopilot, its queue, and today&apos;s AI budget.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PillTabs items={TABS} value={tab} onChange={setTab} ariaLabel="Dashboard sections" />
          <Link href="/connect" className="hidden sm:block">
            <Button variant="navy" size="sm">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Connect WhatsApp
            </Button>
          </Link>
        </div>
      </div>

      {summary.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-xs font-medium text-red-600">
          {summary.error}
        </div>
      ) : null}

      {tab === 'overview' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="AI replies today"
              value={formatNumber(kpis?.aiRepliesToday)}
              hint="Grounded in your knowledge base"
              tone="brand"
              icon={<Bot className="h-4 w-4" aria-hidden />}
            />
            <KpiCard
              label="Needs human"
              value={formatNumber(kpis?.needsHuman)}
              hint="Chats paused for you"
              tone="amber"
              icon={<UserRoundCheck className="h-4 w-4" aria-hidden />}
            />
            <KpiCard
              label="Drafts waiting"
              value={formatNumber(kpis?.draftsPending)}
              hint="Approve before sending"
              tone="mint"
              icon={<MessageSquare className="h-4 w-4" aria-hidden />}
            />
            <KpiCard
              label="Avg response"
              value={formatDuration(kpis?.avgResponseMs)}
              hint="Inbound to first reply"
              tone="navy"
              icon={<Clock3 className="h-4 w-4" aria-hidden />}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <AiUsageCard usage={usage} />
            <GlassCard>
              <CardHeader
                title="Autopilot status"
                subtitle="Safety rules run before any model call"
                action={
                  <Chip tone={mode === 'OFF' ? 'slate' : mode === 'FULL_AUTO' ? 'green' : 'blue'} dot>
                    {mode === 'OFF' ? 'Off' : mode === 'FULL_AUTO' ? 'Full auto' : 'Approval'}
                  </Chip>
                }
              />
              <dl className="mt-4 space-y-2.5">
                <Row
                  label="Reply delay"
                  value={`${settings.data?.replyDelayMinSec ?? 4}–${settings.data?.replyDelayMaxSec ?? 12} s randomized`}
                />
                <Row
                  label="Daily reply cap"
                  value={`${formatNumber(settings.data?.dailyReplyLimit ?? 200)} messages`}
                />
                <Row
                  label="Consecutive AI replies"
                  value={`max ${settings.data?.maxConsecutiveAi ?? 3} then handoff`}
                />
                <Row
                  label="Working hours"
                  value={
                    settings.data?.workingHoursEnabled
                      ? `${settings.data.workingStart}–${settings.data.workingEnd} (${settings.data.timezone})`
                      : 'Always on'
                  }
                />
                <Row
                  label="Groq key"
                  value={settings.data?.groqKeyConfigured ? `saved …${settings.data.groqKeyLast4}` : 'not configured'}
                />
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/autopilot">
                  <Button variant="outline" size="sm">
                    Autopilot rules
                  </Button>
                </Link>
                <Link href="/settings">
                  <Button variant="ghost" size="sm">
                    Settings
                  </Button>
                </Link>
              </div>
            </GlassCard>
          </div>

          <GlassCard id="notifications">
            <CardHeader
              title="Recent conversations"
              subtitle="Chats appear here as soon as the number is linked"
              action={<Chip tone={wa.data?.status === 'CONNECTED' ? 'green' : 'yellow'}>{wa.data?.status ?? 'DISCONNECTED'}</Chip>}
            />
            <div className="mt-4">
              <EmptyState
                icon={<Users className="h-6 w-6" aria-hidden />}
                title="No chats yet"
                message="Phase 2 adds the QR link and live chat list. Until then this panel shows an empty state instead of invented data."
                action={
                  <Link href="/connect">
                    <Button variant="blue" size="sm">
                      Open WhatsApp Connect
                    </Button>
                  </Link>
                }
              />
            </div>
          </GlassCard>
        </div>
      ) : null}

      {tab === 'usage' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <AiUsageCard usage={usage} />
          <GlassCard>
            <CardHeader title="How the budget works" subtitle="Derived from AiUsage, never stored twice" />
            <ul className="mt-4 space-y-2 text-xs leading-relaxed text-ink-muted">
              <li>• Soft warning at 60%, hard warning at 85%, policy applies at 100%.</li>
              <li>• Requests and tokens are counted separately; the worse one wins.</li>
              <li>• At 100% autopilot either pauses or keeps drafting, per your policy.</li>
              <li>• Rate-limit headers from Groq are stored on every call, so the reset time is real.</li>
              <li>• Prompts stay small: last 8 messages + top 4 knowledge snippets.</li>
            </ul>
          </GlassCard>
        </div>
      ) : null}

      {tab === 'safety' ? (
        <GlassCard>
          <CardHeader
            title="Safety posture"
            subtitle="These checks are never skipped, including when a fallback model is used"
            action={<Chip tone="green" dot>Enforced</Chip>}
          />
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              'OTP, password and PIN requests stop the reply before the model is called.',
              'Card, CVV, IBAN and wallet credential requests trigger a payment handoff.',
              'Blacklisted, excluded (family) and group chats are never auto-replied.',
              'Only contacts who messaged first can receive an autopilot reply.',
              'Random 4–12 s delay with a typing presence on every send.',
              'Daily reply cap and consecutive-reply limit force a human handoff.',
            ].map((rule) => (
              <li
                key={rule}
                className="flex items-start gap-2 rounded-2xl border border-white/80 bg-white/55 p-3 text-xs leading-relaxed text-ink"
              >
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-mint-dark" aria-hidden />
                {rule}
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/60 pb-2 last:border-0 last:pb-0">
      <dt className="text-[11px] font-medium text-ink-muted">{label}</dt>
      <dd className="tabular max-w-[60%] truncate text-right text-[11px] font-semibold text-navy">
        {value}
      </dd>
    </div>
  );
}
