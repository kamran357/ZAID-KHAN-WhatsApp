'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

type ToastLevel = 'info' | 'success' | 'warn' | 'error';

interface ToastItem {
  id: number;
  level: ToastLevel;
  title: string;
  message?: string;
}

interface ToastContextValue {
  push: (toast: { level?: ToastLevel; title: string; message?: string }) => void;
}

const ToastContext = createContext<ToastContextValue>({ push: () => undefined });

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
} as const;

const TONES: Record<ToastLevel, string> = {
  info: 'text-brand',
  success: 'text-mint-dark',
  warn: 'text-amber-500',
  error: 'text-red-500',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback<ToastContextValue['push']>(
    ({ level = 'info', title, message }) => {
      const id = Date.now() + Math.random();
      setItems((current) => [...current.slice(-3), { id, level, title, message }]);
      setTimeout(() => remove(id), 7000);
    },
    [remove],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(92vw,380px)] flex-col gap-2"
      >
        {items.map((item) => {
          const Icon = ICONS[item.level];
          return (
            <div
              key={item.id}
              className="glass-card pointer-events-auto zk-rise flex items-start gap-3 p-3.5"
              role="status"
            >
              <span className={cn('mt-0.5 shrink-0', TONES[item.level])}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                {item.message ? (
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{item.message}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label="Dismiss notification"
                className="icon-btn h-7 w-7 shrink-0"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
