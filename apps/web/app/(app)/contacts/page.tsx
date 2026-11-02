'use client';

import { Users } from 'lucide-react';
import { CardHeader, EmptyState, GlassCard } from '@/components/ui/glass-card';
import { Chip } from '@/components/ui/chip';

export default function ContactsPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-navy md:text-2xl">Contacts</h1>
          <p className="mt-1 text-xs text-ink-muted">
            Whitelist, blacklist and per-contact autopilot overrides.
          </p>
        </div>
        <Chip tone="yellow" dot>
          Phase 4
        </Chip>
      </div>

      <GlassCard>
        <CardHeader title="Contact rules" subtitle="Stored per contact in the Contact table" />
        <div className="mt-4">
          <EmptyState
            icon={<Users className="h-6 w-6" aria-hidden />}
            title="No contacts yet"
            message="Contacts are created automatically from inbound chats. Once phase 2 lands you can exclude family, whitelist VIPs and override the global mode per person."
          />
        </div>
      </GlassCard>
    </div>
  );
}
