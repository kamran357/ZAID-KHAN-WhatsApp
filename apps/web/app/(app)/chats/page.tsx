'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MessagesSquare, Search, SlidersHorizontal } from 'lucide-react';
import { CardHeader, EmptyState, GlassCard } from '@/components/ui/glass-card';
import { PillTabs } from '@/components/ui/pill-tabs';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'needs_human', label: 'Needs human' },
  { id: 'autopilot', label: 'Autopilot on' },
];

export default function ChatsPage() {
  const [tab, setTab] = useState('all');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-navy md:text-2xl">Chats</h1>
          <p className="mt-1 text-xs text-ink-muted">
            Live WhatsApp conversations with per-chat autopilot control.
          </p>
        </div>
        <Chip tone="yellow" dot>
          Phase 2
        </Chip>
      </div>

      <GlassCard>
        <CardHeader
          title="Conversations"
          subtitle="Chat list, search and unread badges arrive with the WhatsApp link"
          action={
            <Button variant="ghost" size="sm">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              Filters
            </Button>
          }
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <PillTabs items={TABS} value={tab} onChange={setTab} ariaLabel="Chat filters" />
          <div className="relative min-w-[180px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            <input className="glass-input pl-9" placeholder="Search by name or number" aria-label="Search chats" />
          </div>
        </div>
        <div className="mt-4">
          <EmptyState
            icon={<MessagesSquare className="h-6 w-6" aria-hidden />}
            title="No conversations yet"
            message="Link a number, then inbound messages appear here in real time with the AI draft attached."
            action={
              <Link href="/connect">
                <Button variant="blue" size="sm">
                  Connect WhatsApp
                </Button>
              </Link>
            }
          />
        </div>
      </GlassCard>
    </div>
  );
}
