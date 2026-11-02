import { describe, expect, it, vi } from 'vitest';
import { ConcurrencyQueue, RetryQueue } from '../src/ai/queue.js';
import { decideRateLimitOutcome, canSendStaleRetry } from '../src/ai/limit-policy.js';

describe('RetryQueue', () => {
  const item = (id: string, receivedAt: Date) => ({ id, receivedAt });

  it('holds items until the reset and then reprocesses them', async () => {
    let now = new Date('2026-11-02T10:00:00Z');
    const processed: string[] = [];
    const queue = new RetryQueue({
      process: async (entry) => {
        processed.push(entry.id);
      },
      now: () => now,
    });

    queue.push(item('m1', now));
    queue.push(item('m2', now));
    queue.holdUntil(new Date('2026-11-02T10:01:00Z'));

    expect(queue.depth).toBe(2);
    expect(await queue.processDue()).toBe(0);
    expect(processed).toEqual([]);

    now = new Date('2026-11-02T10:01:05Z');
    expect(await queue.processDue()).toBe(2);
    expect(processed).toEqual(['m1', 'm2']);
    expect(queue.depth).toBe(0);
    expect(queue.nextReleaseAt).toBeNull();
  });

  it('deduplicates by id so a retry cannot double-reply', async () => {
    const now = new Date();
    const process = vi.fn(async () => undefined);
    const queue = new RetryQueue({ process, now: () => now });

    queue.push(item('m1', now));
    queue.push(item('m1', now));
    queue.holdUntil(new Date(now.getTime() + 1000));
    await queue.processDue();

    expect(process).not.toHaveBeenCalled();
    expect(queue.depth).toBe(1);
  });

  it('survives a failing item without losing the rest', async () => {
    const now = new Date();
    const seen: string[] = [];
    const queue = new RetryQueue({
      process: async (entry) => {
        if (entry.id === 'boom') throw new Error('nope');
        seen.push(entry.id);
      },
      now: () => now,
    });

    queue.push(item('boom', now));
    queue.push(item('ok', now));
    await queue.processDue();
    expect(seen).toEqual(['ok']);
  });
});

describe('ConcurrencyQueue', () => {
  it('never exceeds the configured concurrency', async () => {
    const queue = new ConcurrencyQueue(2);
    let active = 0;
    let peak = 0;

    const task = () => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    };

    queue.add({ id: 'a', run: task() });
    queue.add({ id: 'b', run: task() });
    queue.add({ id: 'c', run: task() });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(peak).toBeLessThanOrEqual(2);
    expect(queue.depth).toBe(0);
  });
});

describe('rate limit outcome', () => {
  it('marks needs-human, keeps no draft, and notifies with the queue size', () => {
    const outcome = decideRateLimitOutcome({
      mode: 'FULL_AUTO',
      queuedCount: 3,
      outOfLimitAutoReply: false,
      lastAutoReplyAt: null,
      cooldownHours: 6,
    });

    expect(outcome.messageStatus).toBe('AI_RATE_LIMITED');
    expect(outcome.handoff).toBe('AI_RATE_LIMITED');
    expect(outcome.needsHuman).toBe(true);
    expect(outcome.keepDraft).toBe(false);
    expect(outcome.notification.body).toContain('3 chats waiting');
    expect(outcome.autoReply).toBeNull();
  });

  it('sends the courtesy reply at most once per cooldown window', () => {
    const now = new Date('2026-11-02T12:00:00Z');
    const first = decideRateLimitOutcome({
      mode: 'APPROVAL',
      queuedCount: 1,
      outOfLimitAutoReply: true,
      lastAutoReplyAt: null,
      cooldownHours: 6,
      now,
    });
    expect(first.autoReply?.text).toContain('received your message');

    const tooSoon = decideRateLimitOutcome({
      mode: 'APPROVAL',
      queuedCount: 1,
      outOfLimitAutoReply: true,
      lastAutoReplyAt: new Date('2026-11-02T09:00:00Z'),
      cooldownHours: 6,
      now,
    });
    expect(tooSoon.autoReply).toBeNull();
  });

  it('only sends stale retries in full auto when the message is under 30 minutes old', () => {
    const now = new Date('2026-11-02T12:00:00Z');
    expect(canSendStaleRetry(new Date('2026-11-02T11:45:00Z'), now, 30)).toBe(true);
    expect(canSendStaleRetry(new Date('2026-11-02T11:00:00Z'), now, 30)).toBe(false);
  });
});
