'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BellRing, Bot, MessagesSquare, Search, UserRoundCheck } from 'lucide-react';
import { Chip } from '@/components/ui/chip';
import { useApi } from '@/lib/hooks';
import type { HealthResponse, NotificationDTO } from '@zk/shared';

const ITEMS = [
  { href: '/chats', label: 'Chats', icon: MessagesSquare, hint: 'All conversations' },
  { href: '/chats?filter=needs_human', label: 'Needs Human', icon: UserRoundCheck, hint: 'Tagged for you' },
  { href: '/autopilot', label: 'Autopilot Rules', icon: Bot, hint: 'Mode and limits' },
  { href: '/dashboard#notifications', label: 'Notifications', icon: BellRing, hint: 'Recent alerts' },
] as const;

export function SecondaryNav() {
  const pathname = usePathname();
  const health = useApi<HealthResponse>('/api/health', { intervalMs: 20000 });
  const notifications = useApi<{ items: NotificationDTO[]; unread: number }>(
    '/api/notifications',
    { intervalMs: 30000 },
  );

  const connected = health.data?.wa === 'CONNECTED';
  const unread = notifications.data?.unread ?? 0;

  return (
    <aside aria-label="Secondary" className="glass-panel hidden h-fit p-4 lg:block">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
          aria-hidden
        />
        <input
          className="glass-input pl-9"
          placeholder="Search chats, rules…"
          aria-label="Search chats and rules"
        />
      </div>

      <nav className="mt-4 space-y-1" aria-label="Chat filters">
        {ITEMS.map(({ href, label, icon: Icon, hint }) => {
          const base = href.split('?')[0] ?? href;
          const active = href.includes('?')
            ? false
            : pathname === base || pathname.startsWith(`${base}/`);
          return (
            <Link
              key={href}
              href={href}
              className="nav-item"
              data-active={active}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {label === 'Notifications' && unread > 0 ? (
                <span className="tabular rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold">
                  {unread}
                </span>
              ) : (
                <span className="hidden truncate text-[10px] font-normal opacity-60 xl:inline">
                  {hint}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 rounded-2xl border border-white/80 bg-white/60 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          WhatsApp status
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Chip tone={connected ? 'green' : 'yellow'} dot>
            {connected ? 'Connected' : (health.data?.wa ?? 'Checking')}
          </Chip>
          {health.data?.aiConfigured ? (
            <Chip tone="blue">AI ready</Chip>
          ) : (
            <Chip tone="red">No API key</Chip>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
          {connected
            ? 'Messages are syncing through the official web session.'
            : 'Link a number on WhatsApp Connect to start receiving chats.'}
        </p>
        <Link
          href="/connect"
          className="mt-2 inline-block text-[11px] font-semibold text-brand hover:underline"
        >
          Open WhatsApp Connect →
        </Link>
      </div>
    </aside>
  );
}
