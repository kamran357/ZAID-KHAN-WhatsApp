'use client';

import { QrCode, RefreshCw, ShieldAlert } from 'lucide-react';
import type { WaStatusPayload } from '@zk/shared';
import { CardHeader, GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { useApi } from '@/lib/hooks';

export default function ConnectPage() {
  const wa = useApi<WaStatusPayload>('/api/wa/status', { intervalMs: 10000 });
  const connected = wa.data?.status === 'CONNECTED';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-navy md:text-2xl">
            WhatsApp Connect
          </h1>
          <p className="mt-1 text-xs text-ink-muted">
            Scan once with your phone. The session is saved so a restart never asks again.
          </p>
        </div>
        <Chip tone={connected ? 'green' : 'yellow'} dot>
          {wa.data?.status ?? 'DISCONNECTED'}
        </Chip>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <GlassCard>
          <CardHeader
            title="Pair this device"
            subtitle="QR refreshes automatically until it is scanned"
            action={
              <Button variant="ghost" size="sm" disabled>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Refresh
              </Button>
            }
          />
          <div className="mt-4 grid aspect-square w-full place-items-center rounded-2xl border border-dashed border-navy/15 bg-white/60">
            <div className="flex flex-col items-center gap-2 text-center">
              <QrCode className="h-10 w-10 text-navy/30" aria-hidden />
              <p className="text-xs font-semibold text-navy">QR linking arrives in phase 2</p>
              <p className="max-w-[240px] text-[11px] leading-relaxed text-ink-muted">
                The Baileys session manager renders this from the live connection event — no
                terminal-only QR.
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-ink-muted">
            <span>Session: {connected ? 'saved' : 'not linked'}</span>
            <span>{wa.data?.phoneNumber ?? 'no number'}</span>
          </div>
        </GlassCard>

        <div className="space-y-4">
          <GlassCard>
            <CardHeader title="How linking works" />
            <ol className="mt-4 space-y-2.5 text-xs leading-relaxed text-ink-muted">
              <li>
                <span className="font-semibold text-navy">1.</span> Open WhatsApp on your phone →
                Settings → Linked devices.
              </li>
              <li>
                <span className="font-semibold text-navy">2.</span> Tap “Link a device” and scan the QR
                from this screen.
              </li>
              <li>
                <span className="font-semibold text-navy">3.</span> Credentials are stored in{' '}
                <code className="rounded bg-white/70 px-1 py-0.5 text-[11px]">apps/server/data/baileys</code>{' '}
                so restarts keep the session.
              </li>
              <li>
                <span className="font-semibold text-navy">4.</span> Use a secondary number first — this
                uses an unofficial client.
              </li>
            </ol>
          </GlassCard>

          <GlassCard className="border-amber-200/70 bg-amber-50/60">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-amber-800">Ban risk is real</p>
                <p className="mt-1 text-[11px] leading-relaxed text-amber-700">
                  Baileys is not an official API. The app mitigates it with a random 4–12 s delay,
                  typing presence, a daily reply cap and no bulk messaging — but no mitigation is a
                  guarantee. Never use your primary business number while testing.
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
