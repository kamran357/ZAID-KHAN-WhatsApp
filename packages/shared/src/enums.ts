/**
 * Contract enums shared by the API server and the dashboard.
 * Kept as const tuples + union types (not TS enums) so they survive JSON and
 * match the TEXT values Prisma stores on SQLite.
 */

export const AUTOPILOT_MODES = ['OFF', 'APPROVAL', 'FULL_AUTO'] as const;
export type AutopilotMode = (typeof AUTOPILOT_MODES)[number];

/** What autopilot does once the configured daily AI budget is exhausted. */
export const BUDGET_POLICIES = ['PAUSE_AI', 'DRAFT_ONLY'] as const;
export type BudgetPolicy = (typeof BUDGET_POLICIES)[number];

export const WA_STATUSES = [
  'DISCONNECTED',
  'CONNECTING',
  'QR_PENDING',
  'CONNECTED',
  'RECONNECTING',
  'LOGGED_OUT',
  'ERROR',
] as const;
export type WaStatus = (typeof WA_STATUSES)[number];

export const MESSAGE_STATUSES = [
  'RECEIVED',
  'SKIPPED',
  'DRAFTED',
  'APPROVED',
  'REJECTED',
  'SENDING',
  'SENT',
  'FAILED',
  'AI_RATE_LIMITED',
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const HANDOFF_REASONS = [
  'LOW_CONFIDENCE',
  'ANGRY_CUSTOMER',
  'SENSITIVE_PAYMENT',
  'SENSITIVE_CREDENTIALS',
  'EXPLICIT_REQUEST',
  'UNSUPPORTED_MEDIA',
  'AI_RATE_LIMITED',
  'AI_BUDGET_EXCEEDED',
  'AI_ERROR',
  'OUT_OF_HOURS',
] as const;
export type HandoffReason = (typeof HANDOFF_REASONS)[number];

export const AUTHOR_ROLES = ['CUSTOMER', 'AI', 'HUMAN', 'SYSTEM'] as const;
export type Author = (typeof AUTHOR_ROLES)[number];

export const MESSAGE_KINDS = [
  'TEXT',
  'AUDIO',
  'IMAGE',
  'DOCUMENT',
  'STICKER',
  'REACTION',
  'OTHER',
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export type Direction = 'INBOUND' | 'OUTBOUND';

export const NOTIFICATION_TYPES = [
  'HANDOFF',
  'QR_REQUIRED',
  'LIMIT_REACHED',
  'AI_ERROR',
  'CONNECTION',
  'INFO',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Aggregate health of the daily AI budget, used for colour coding in the UI. */
export const USAGE_LEVELS = ['ok', 'warn', 'critical', 'exceeded'] as const;
export type UsageLevel = (typeof USAGE_LEVELS)[number];

export const AI_LIMIT_KINDS = ['rate_limited', 'budget_exceeded', 'recovered'] as const;
export type AiLimitKind = (typeof AI_LIMIT_KINDS)[number];
