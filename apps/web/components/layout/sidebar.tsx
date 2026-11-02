'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  BookOpen,
  Bot,
  LayoutDashboard,
  MessagesSquare,
  QrCode,
  Settings,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/cn';

const ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/chats', label: 'Chats', icon: MessagesSquare },
  { href: '/autopilot', label: 'Autopilot', icon: Bot },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/connect', label: 'WhatsApp Connect', icon: QrCode },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Primary"
      className="glass-panel fixed bottom-4 left-4 top-4 z-30 hidden w-[76px] flex-col items-center gap-1.5 rounded-full py-5 md:flex"
    >
      <Link
        href="/dashboard"
        aria-label="ZAID KHAN home"
        className="mb-2 grid h-11 w-11 place-items-center rounded-full bg-navy text-[13px] font-extrabold tracking-tight text-white shadow-[0_14px_26px_-14px_rgba(11,20,55,0.9)]"
      >
        ZK
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-1.5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group relative grid h-11 w-11 place-items-center rounded-full transition',
                active
                  ? 'bg-brand text-white shadow-[0_14px_26px_-14px_rgba(59,142,240,0.95)]'
                  : 'text-ink-muted hover:bg-white hover:text-navy',
              )}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden />
              <span className="pointer-events-none absolute left-[calc(100%+12px)] z-40 whitespace-nowrap rounded-full bg-navy px-3 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

/** Mobile: the sidebar becomes a bottom bar with the five most used screens. */
export function MobileBar() {
  const pathname = usePathname();
  const items = [ITEMS[0], ITEMS[1], ITEMS[2], ITEMS[5], ITEMS[6]];

  return (
    <nav
      aria-label="Primary"
      className="glass-panel fixed inset-x-3 bottom-3 z-30 flex items-center justify-between px-3 py-2 md:hidden"
    >
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'grid h-11 w-11 place-items-center rounded-full transition',
              active ? 'bg-brand text-white' : 'text-ink-muted',
            )}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden />
          </Link>
        );
      })}
    </nav>
  );
}
