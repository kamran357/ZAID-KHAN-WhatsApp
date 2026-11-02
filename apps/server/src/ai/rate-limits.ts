import type { RateLimitSnapshot } from '@zk/shared';

/**
 * Parses Groq's duration headers ("2m59.56s", "7.66s", "1h2m3s", or plain seconds)
 * into an absolute reset timestamp.
 */
export function parseResetDuration(value: string | null | undefined, now: Date): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const plain = Number(trimmed);
  if (Number.isFinite(plain)) return new Date(now.getTime() + plain * 1000);

  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?$/.exec(trimmed);
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  if (!hours && !minutes && !seconds) return null;
  const totalMs =
    (Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0)) * 1000;
  return new Date(now.getTime() + totalMs);
}

function num(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Reads rate-limit headers from every Groq response (success *and* 429), so the
 * dashboard can show remaining requests/tokens and the next reset without
 * spending a request to ask.
 */
export function parseRateLimits(headers: Headers, now: Date): RateLimitSnapshot {
  const retryAfterRaw = headers.get('retry-after');
  const retryAfterParsed = retryAfterRaw ? num(retryAfterRaw) : null;

  return {
    requests: {
      limit: num(headers.get('x-ratelimit-limit-requests')),
      remaining: num(headers.get('x-ratelimit-remaining-requests')),
      resetAt: parseResetDuration(headers.get('x-ratelimit-reset-requests'), now)?.toISOString() ?? null,
    },
    tokens: {
      limit: num(headers.get('x-ratelimit-limit-tokens')),
      remaining: num(headers.get('x-ratelimit-remaining-tokens')),
      resetAt: parseResetDuration(headers.get('x-ratelimit-reset-tokens'), now)?.toISOString() ?? null,
    },
    retryAfterSec: retryAfterParsed,
    updatedAt: now.toISOString(),
  };
}

export function emptyRateLimits(): RateLimitSnapshot {
  return {
    requests: { limit: null, remaining: null, resetAt: null },
    tokens: { limit: null, remaining: null, resetAt: null },
    retryAfterSec: null,
    updatedAt: null,
  };
}

/** Whichever reset comes first — used for "next reset" in the UI and retry scheduling. */
export function earliestReset(snapshot: RateLimitSnapshot): Date | null {
  const candidates = [snapshot.requests.resetAt, snapshot.tokens.resetAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));
  if (candidates.length === 0) return null;
  return candidates.reduce((earliest, current) => (current < earliest ? current : earliest));
}
