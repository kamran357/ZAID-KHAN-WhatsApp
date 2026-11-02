'use client';

import Link from 'next/link';
import { Bot, ShieldCheck } from 'lucide-react';
import type { SettingsDTO } from '@zk/shared';
import { CardHeader, GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { useApi } from '@/lib/hooks';

export default function AutopilotPage() {
  const settings = useApi<SettingsDTO>('/api/settings');
  const mode = settings.data?.autopilotMode ?? 'APPROVAL';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-navy md:text-2xl">Autopilot</h1>
          <p className="mt-1 text-xs text-ink-muted">
            Mode, pacing and handoff rules. Everything here runs before the model is called.
          </p>
        </div>
        <Chip tone={mode === 'FULL_AUTO' ? 'green' : mode === 'OFF' ? 'slate' : 'blue'} dot>
          {mode === 'FULL_AUTO' ? 'Full auto' : mode === 'OFF' ? 'Off' : 'Approval'}
        </Chip>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <GlassCard>
          <CardHeader title="Reply pacing" subtitle="Anti-ban rules applied to every send" />
          <dl className="mt-4 space-y-2 text-xs">
            <Row label="Random delay" value={`${settings.data?.replyDelayMinSec ?? 4}–${settings.data?.replyDelayMaxSec ?? 12} seconds`} />
            <Row label="Typing presence" value={settings.data?.sendTypingPresence ? 'Shown while replying' : 'Disabled'} />
            <Row label="Daily reply cap" value={`${settings.data?.dailyReplyLimit ?? 200} replies`} />
            <Row label="Consecutive AI replies" value={`max ${settings.data?.maxConsecutiveAi ?? 3}`} />
            <Row label="Confidence threshold" value={`${Math.round((settings.data?.confidenceThreshold ?? 0.55) * 100)}%`} />
          </dl>
          <Link href="/settings" className="mt-4 inline-block">
            <Button variant="outline" size="sm">
              Edit in Settings
            </Button>
          </Link>
        </GlassCard>

        <GlassCard>
          <CardHeader title="Who the AI may answer" subtitle="Default-safe audience rules" />
          <ul className="mt-4 space-y-2">
            {[
              ['Family & friends', 'Excluded by default', 'yellow'],
              ['Blacklisted contacts', 'Never replied to', 'red'],
              ['Group chats', 'Off unless whitelisted', 'slate'],
              ['Unknown / cold outbound', 'Never messaged first', 'slate'],
              ['Whitelisted contacts', 'Autopilot allowed', 'green'],
            ].map(([label, hint, tone]) => (
              <li
                key={label}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/55 px-3 py-2"
              >
                <span className="text-xs font-medium text-navy">{label}</span>
                <Chip tone={tone as 'yellow' | 'red' | 'slate' | 'green'}>{hint}</Chip>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
            Per-contact overrides and the rule editor arrive in phase 4; the data model already stores
            them per contact.
          </p>
        </GlassCard>
      </div>

      <GlassCard>
        <CardHeader title="Handoff triggers" subtitle="Any of these stops the AI immediately" />
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            'OTP, password or PIN mentioned',
            'Card, CVV, IBAN or wallet details',
            'Angry or abusive tone',
            'Confidence below threshold',
            'Groq rate limit or budget spent',
          ].map((item) => (
            <div
              key={item}
              className="flex items-center gap-2 rounded-2xl border border-white/80 bg-white/55 px-3 py-2 text-xs text-ink"
            >
              <ShieldCheck className="h-4 w-4 shrink-0 text-mint-dark" aria-hidden />
              {item}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-muted">
          <Bot className="h-3.5 w-3.5" aria-hidden />
          Handoffs tag the chat Needs human and raise a dashboard notification.
        </div>
      </GlassCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/60 pb-2 last:border-0 last:pb-0">
      <dt className="text-[11px] text-ink-muted">{label}</dt>
      <dd className="text-[11px] font-semibold text-navy">{value}</dd>
    </div>
  );
}
