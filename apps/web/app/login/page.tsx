'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { apiSend } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiSend<{ ok: boolean }>('/api/auth/login', 'POST', { password });
      // Read the target from the URL at submit time — avoids a Suspense-boundary
      // requirement for useSearchParams during static prerendering.
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next && next.startsWith('/') ? next : '/dashboard');
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not sign in';
      setError(message);
      toast.push({ level: 'error', title: 'Sign in failed', message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-navy text-sm font-extrabold text-white">
            ZK
          </span>
          <div>
            <p className="text-base font-extrabold tracking-tight text-navy">ZAID KHAN</p>
            <p className="text-[11px] font-medium text-ink-muted">WhatsApp AI Autopilot</p>
          </div>
        </div>

        <section className="glass-panel p-6">
          <h1 className="text-lg font-bold tracking-tight text-navy">Welcome back</h1>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            This dashboard controls a live WhatsApp number. It is protected by a single operator
            password.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <PasswordInput
              label="Operator password"
              placeholder="••••••••"
              value={password}
              autoFocus
              onChange={(event) => setPassword(event.target.value)}
              error={error}
              hint="Set with AUTH_PASSWORD in apps/server/.env"
            />
            <Button type="submit" variant="navy" size="lg" className="w-full" disabled={busy || !password}>
              {busy ? 'Signing in…' : 'Enter dashboard'}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </form>

          <div className="mt-5 flex items-start gap-2 rounded-2xl border border-white/80 bg-white/55 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-mint-dark" aria-hidden />
            <p className="text-[11px] leading-relaxed text-ink-muted">
              OTPs, passwords and card details are never requested or stored. AI replies stop and the
              chat is tagged <span className="font-semibold text-navy">Needs human</span> when a
              customer sends them.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
