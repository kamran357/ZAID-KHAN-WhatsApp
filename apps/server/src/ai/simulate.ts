import { env } from '../config/env.js';

/**
 * Dev-only fault injection so you can watch rate-limit behaviour without waiting
 * for a real 429. Disabled in production; driven by POST /api/dev/simulate/rate-limit.
 */
let remainingFailures = 0;

export function armRateLimit(failures = 1): void {
  if (env.NODE_ENV === 'production') return;
  remainingFailures = Math.max(0, Math.min(10, Math.trunc(failures)));
}

export function clearRateLimit(): void {
  remainingFailures = 0;
}

export function peekRateLimit(): number {
  return remainingFailures;
}

/** Consumed once per outbound Groq call. */
export function consumeRateLimit(): boolean {
  if (env.NODE_ENV === 'production') return false;
  if (remainingFailures <= 0) return false;
  remainingFailures -= 1;
  return true;
}
