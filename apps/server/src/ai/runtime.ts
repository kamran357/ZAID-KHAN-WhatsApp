import {
  AI_QUEUE_CONCURRENCY,
  DEFAULT_AI_MODEL,
  type AiUsageSnapshot,
  type BudgetPolicy,
  type RateLimitSnapshot,
} from '@zk/shared';
import { createGroqClient } from './groq.js';
import { emptyRateLimits, earliestReset } from './rate-limits.js';
import { ConcurrencyQueue, RetryQueue, type RetryItem } from './queue.js';
import { computeBudgetView } from './budget.js';
import { consumeRateLimit } from './simulate.js';
import { getSettingsRow } from '../services/settings.js';
import {
  dateKey,
  getUsageForDate,
  loadRateLimitSnapshot,
  recordAiUsage,
  saveRateLimitSnapshot,
} from '../services/usage.js';
import { emit } from '../socket/emitter.js';
import { log } from '../logging.js';

/**
 * Process-wide AI runtime: one Groq client, bounded concurrency, one retry queue.
 * Everything that touches the model goes through here so budgets and limits are
 * enforced in exactly one place.
 */
let currentRateLimits: RateLimitSnapshot = emptyRateLimits();
let warnedToday: string | null = null;
let pausedUntil: string | null = null;

const groq = createGroqClient({
  shouldForceRateLimit: consumeRateLimit,
  onRateLimits: (snapshot) => {
    currentRateLimits = snapshot;
    void saveRateLimitSnapshot(snapshot).catch(() => undefined);
  },
  onRateLimitHit: ({ model, retryAfterSec }) => {
    log.warn('ai/rate-limited', { model, retryAfterSec });
    void recordAiUsage({ model, rateLimitHit: true }).catch(() => undefined);
  },
});

export const aiQueue = new ConcurrencyQueue(AI_QUEUE_CONCURRENCY);

type Reprocessor = (item: RetryItem) => Promise<void>;
let reprocessor: Reprocessor | null = null;

export function registerReprocessor(fn: Reprocessor): void {
  reprocessor = fn;
}

export const retryQueue = new RetryQueue<RetryItem>({
  process: async (item) => {
    if (reprocessor) await reprocessor(item);
    else log.warn('ai/retry-without-processor', { itemId: item.id });
  },
  onReleased: (count) => {
    log.info('ai/retry-released', { count });
    emit('ai:limit', {
      kind: 'recovered',
      message: `AI limits reset — processing ${count} waiting message${count === 1 ? '' : 's'}.`,
      waiting: 0,
      at: new Date().toISOString(),
      nextResetAt: null,
      policy: 'PAUSE_AI',
    });
  },
});

export { groq };

export interface AiRuntimeState {
  queueDepth: number;
  retryQueueDepth: number;
  rateLimits: RateLimitSnapshot;
}

export function runtimeState(): AiRuntimeState {
  return {
    queueDepth: aiQueue.depth,
    retryQueueDepth: retryQueue.depth,
    rateLimits: currentRateLimits,
  };
}

export function recordRateLimitSnapshot(snapshot: RateLimitSnapshot): void {
  currentRateLimits = snapshot;
}

/** Builds the payload for `ai:usage` / GET /api/ai/usage. */
export async function buildUsageSnapshot(): Promise<AiUsageSnapshot> {
  const settings = await getSettingsRow();
  const day = dateKey(new Date(), settings.timezone);
  const [{ counters, byModel }, storedLimits] = await Promise.all([
    getUsageForDate(day),
    currentRateLimits.updatedAt ? Promise.resolve(currentRateLimits) : loadRateLimitSnapshot(),
  ]);
  if (!currentRateLimits.updatedAt) currentRateLimits = storedLimits;

  const budget = computeBudgetView({
    requests: counters.requests,
    tokens: counters.totalTokens,
    maxRequests: settings.dailyRequestBudget,
    maxTokens: settings.dailyTokenBudget,
    policy: settings.budgetPolicy as BudgetPolicy,
  });

  const resetAt = earliestReset(storedLimits);
  return {
    date: day,
    today: counters,
    byModel,
    budget,
    rateLimits: storedLimits,
    queueDepth: aiQueue.depth,
    retryQueueDepth: retryQueue.depth,
    nextResetAt: resetAt ? resetAt.toISOString() : null,
    updatedAt: new Date().toISOString(),
  };
}

export async function broadcastUsage(): Promise<void> {
  try {
    emit('ai:usage', await buildUsageSnapshot());
  } catch (error) {
    log.warn('ai/usage-broadcast-failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/** Fires the 85%/100% toast once per budget window instead of on every call. */
export async function maybeWarnBudget(snapshot: AiUsageSnapshot): Promise<void> {
  const key = `${snapshot.date}:${snapshot.budget.level}`;
  if (snapshot.budget.level === 'ok' || warnedToday === key) return;
  if (snapshot.budget.level === 'warn') return;
  warnedToday = key;
  emit('toast', {
    level: snapshot.budget.level === 'exceeded' ? 'error' : 'warn',
    title: snapshot.budget.level === 'exceeded' ? 'Daily AI budget spent' : 'AI budget at 85%',
    message:
      snapshot.budget.level === 'exceeded'
        ? 'Autopilot is following your budget policy until the day resets.'
        : `${Math.round(snapshot.budget.pct)}% of today's AI budget is used.`,
  });
  emit('ai:limit', {
    kind: 'budget_exceeded',
    message: `Daily AI budget at ${Math.round(snapshot.budget.pct)}%.`,
    waiting: retryQueue.depth,
    at: new Date().toISOString(),
    nextResetAt: snapshot.nextResetAt,
    policy: snapshot.budget.policy,
  });
  await broadcastUsage();
}

export function markPaused(reason: string): void {
  pausedUntil = reason;
}

export function isPaused(): string | null {
  return pausedUntil;
}

export function defaultModel(): string {
  return DEFAULT_AI_MODEL;
}

export async function recordModelUsage(input: {
  model: string;
  promptTokens: number;
  completionTokens: number;
  timeZone?: string;
}): Promise<void> {
  await recordAiUsage(input);
  await broadcastUsage();
}
