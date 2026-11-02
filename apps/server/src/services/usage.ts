import type {
  AiUsageByModel,
  AiUsageCounters,
  RateLimitSnapshot,
} from '@zk/shared';
import { prisma } from '../db/prisma.js';
import { emptyRateLimits } from '../ai/rate-limits.js';

/** YYYY-MM-DD in the configured timezone (defaults to the business timezone). */
export function dateKey(date = new Date(), timeZone = 'Asia/Karachi'): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export interface UsageDelta {
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  rateLimitHit?: boolean;
  error?: boolean;
  timeZone?: string;
}

/** Every Groq call lands here: counts only, never prompts or replies. */
export async function recordAiUsage(delta: UsageDelta): Promise<void> {
  const day = dateKey(new Date(), delta.timeZone);
  const promptTokens = Math.max(0, delta.promptTokens ?? 0);
  const completionTokens = Math.max(0, delta.completionTokens ?? 0);

  await prisma.aiUsage.upsert({
    where: { date_model: { date: day, model: delta.model } },
    create: {
      date: day,
      model: delta.model,
      requests: 1,
      promptTokens,
      completionTokens,
      rateLimitHits: delta.rateLimitHit ? 1 : 0,
      errors: delta.error ? 1 : 0,
    },
    update: {
      requests: { increment: 1 },
      promptTokens: { increment: promptTokens },
      completionTokens: { increment: completionTokens },
      rateLimitHits: { increment: delta.rateLimitHit ? 1 : 0 },
      errors: { increment: delta.error ? 1 : 0 },
    },
  });

  await prisma.dailyStat.upsert({
    where: { date: day },
    create: { date: day, aiTokens: promptTokens + completionTokens },
    update: { aiTokens: { increment: promptTokens + completionTokens } },
  });
}

export async function getUsageForDate(day: string): Promise<{
  counters: AiUsageCounters;
  byModel: AiUsageByModel[];
}> {
  const rows = await prisma.aiUsage.findMany({ where: { date: day } });
  const counters: AiUsageCounters = {
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    rateLimitHits: 0,
    errors: 0,
  };
  const byModel: AiUsageByModel[] = rows.map((row) => ({
    model: row.model,
    requests: row.requests,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    totalTokens: row.promptTokens + row.completionTokens,
    rateLimitHits: row.rateLimitHits,
    errors: row.errors,
  }));

  for (const row of byModel) {
    counters.requests += row.requests;
    counters.promptTokens += row.promptTokens;
    counters.completionTokens += row.completionTokens;
    counters.rateLimitHits += row.rateLimitHits;
    counters.errors += row.errors;
  }
  counters.totalTokens = counters.promptTokens + counters.completionTokens;
  byModel.sort((a, b) => b.requests - a.requests);
  return { counters, byModel };
}

/** Rate-limit headers from the most recent call, persisted so restarts keep the picture. */
export async function saveRateLimitSnapshot(snapshot: RateLimitSnapshot): Promise<void> {
  const data = {
    remainingRequests: snapshot.requests.remaining,
    limitRequests: snapshot.requests.limit,
    resetRequestsAt: snapshot.requests.resetAt ? new Date(snapshot.requests.resetAt) : null,
    remainingTokens: snapshot.tokens.remaining,
    limitTokens: snapshot.tokens.limit,
    resetTokensAt: snapshot.tokens.resetAt ? new Date(snapshot.tokens.resetAt) : null,
    retryAfterSec: snapshot.retryAfterSec,
  };
  await prisma.aiRateLimitState.upsert({
    where: { id: 'current' },
    create: { id: 'current', ...data },
    update: data,
  });
}

export async function loadRateLimitSnapshot(): Promise<RateLimitSnapshot> {
  const row = await prisma.aiRateLimitState.findUnique({ where: { id: 'current' } });
  if (!row) return emptyRateLimits();
  return {
    requests: {
      limit: row.limitRequests,
      remaining: row.remainingRequests,
      resetAt: row.resetRequestsAt?.toISOString() ?? null,
    },
    tokens: {
      limit: row.limitTokens,
      remaining: row.remainingTokens,
      resetAt: row.resetTokensAt?.toISOString() ?? null,
    },
    retryAfterSec: row.retryAfterSec,
    updatedAt: row.updatedAt.toISOString(),
  };
}
