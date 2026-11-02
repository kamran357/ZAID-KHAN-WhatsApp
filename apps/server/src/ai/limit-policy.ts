import type { AutopilotMode } from '@zk/shared';
import { OUT_OF_LIMIT_REPLY_TEXT } from '@zk/shared';

export interface RateLimitOutcome {
  /** The inbound message is never left in a "sent" state and never carries a broken reply. */
  messageStatus: 'AI_RATE_LIMITED';
  handoff: 'AI_RATE_LIMITED';
  needsHuman: true;
  keepDraft: false;
  notification: { title: string; body: string; type: 'LIMIT_REACHED' };
  /** Optional courtesy message, only when explicitly enabled and outside the cooldown. */
  autoReply: { text: string } | null;
}

/**
 * What happens when the primary model *and* the fallback are rate limited.
 * Pure so the policy is unit tested without a database or network.
 */
export function decideRateLimitOutcome(input: {
  mode: AutopilotMode;
  queuedCount: number;
  outOfLimitAutoReply: boolean;
  lastAutoReplyAt: Date | null;
  cooldownHours: number;
  now?: Date;
}): RateLimitOutcome {
  const now = input.now ?? new Date();
  const coolingDown =
    input.lastAutoReplyAt !== null &&
    now.getTime() - input.lastAutoReplyAt.getTime() < input.cooldownHours * 3600 * 1000;

  const waiting = Math.max(1, input.queuedCount);
  return {
    messageStatus: 'AI_RATE_LIMITED',
    handoff: 'AI_RATE_LIMITED',
    needsHuman: true,
    keepDraft: false,
    notification: {
      type: 'LIMIT_REACHED',
      title: 'AI limit reached',
      body: `${waiting} chat${waiting === 1 ? '' : 's'} waiting for a reply. They are tagged Needs human and queued for retry.`,
    },
    autoReply:
      input.outOfLimitAutoReply && !coolingDown ? { text: OUT_OF_LIMIT_REPLY_TEXT } : null,
  };
}

/** Full-auto retries only send if the customer's message is still fresh. */
export function canSendStaleRetry(receivedAt: Date, now: Date, maxAgeMinutes: number): boolean {
  return now.getTime() - receivedAt.getTime() <= maxAgeMinutes * 60 * 1000;
}
