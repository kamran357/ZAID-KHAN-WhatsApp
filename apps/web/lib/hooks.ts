'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiGet } from './api';

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * Polling keeps the dashboard fresh until the WhatsApp socket lands in phase 3,
 * at which point the same hooks get socket-driven updates on top.
 */
export function useApi<T>(path: string | null, options: { intervalMs?: number } = {}): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [nonce, setNonce] = useState(0);
  const mounted = useRef(true);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const result = await apiGet<T>(path, controller.signal);
        if (!mounted.current) return;
        setData(result);
        setError(null);
      } catch (caught) {
        if (controller.signal.aborted || !mounted.current) return;
        if (caught instanceof ApiError && caught.status === 401) return;
        setError(caught instanceof Error ? caught.message : 'Request failed');
      } finally {
        if (mounted.current) setLoading(false);
      }
    };

    void load();

    if (options.intervalMs) {
      timer = setInterval(() => void load(), options.intervalMs);
    }

    return () => {
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [path, nonce, options.intervalMs]);

  return { data, error, loading, refresh };
}
