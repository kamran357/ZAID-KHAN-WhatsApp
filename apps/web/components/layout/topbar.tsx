'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ChevronRight, Globe, HelpCircle, Menu } from 'lucide-react';

const LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  chats: 'Chats',
  autopilot: 'Autopilot',
  contacts: 'Contacts',
  knowledge: 'Knowledge Base',
  analytics: 'Analytics',
  settings: 'Settings',
  connect: 'WhatsApp Connect',
};

export function Topbar() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const current = LABELS[segments[0] ?? 'dashboard'] ?? 'Dashboard';

  return (
    <header className="flex items-center justify-between gap-3 px-4 py-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/dashboard"
          className="text-[15px] font-extrabold tracking-[-0.01em] text-navy md:text-base"
        >
          ZAID KHAN
        </Link>
        <span aria-hidden className="hidden h-4 w-px bg-navy/15 md:block" />
        <nav
          aria-label="Breadcrumb"
          className="hidden items-center gap-1.5 rounded-full border border-white/80 bg-white/65 px-3.5 py-1.5 text-[11px] font-medium text-ink-muted shadow-[0_6px_18px_-12px_rgba(11,20,55,0.5)] sm:flex"
        >
          <Link href="/dashboard" className="transition hover:text-navy">
            Home
          </Link>
          <ChevronRight className="h-3 w-3 opacity-60" aria-hidden />
          <span className="font-semibold text-navy" aria-current="page">
            {current}
          </span>
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" className="icon-btn hidden sm:inline-flex" aria-label="Help">
          <HelpCircle className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className="hidden items-center gap-1.5 rounded-full border border-white/80 bg-white/65 px-3 py-2 text-[11px] font-semibold text-navy sm:inline-flex"
          aria-label="Language: English"
        >
          <Globe className="h-3.5 w-3.5" aria-hidden />
          EN
        </button>
        <button type="button" className="icon-btn" aria-label="Notifications">
          <Bell className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" className="icon-btn md:hidden" aria-label="Menu">
          <Menu className="h-4 w-4" aria-hidden />
        </button>
        <div
          className="grid h-9 w-9 place-items-center rounded-full bg-navy text-[11px] font-bold text-white"
          aria-label="Signed in as Zaid Khan"
          role="img"
        >
          ZK
        </div>
      </div>
    </header>
  );
}
