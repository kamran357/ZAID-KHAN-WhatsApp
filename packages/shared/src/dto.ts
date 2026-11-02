import type {
  AiLimitKind,
  AutopilotMode,
  BudgetPolicy,
  HandoffReason,
  MessageKind,
  MessageStatus,
  NotificationType,
  UsageLevel,
  WaStatus,
} from './enums.js';

/* ------------------------------------------------------------------ settings */

export interface SettingsDTO {
  aiModel: string;
  fallbackModel: string | null;
  transcriptionModel: string;
  autopilotMode: AutopilotMode;
  businessName: string;
  persona: string | null;

  workingHoursEnabled: boolean;
  workingDays: number[];
  workingStart: string;
  workingEnd: string;
  timezone: string;
  outOfHoursMessage: string | null;

  replyDelayMinSec: number;
  replyDelayMaxSec: number;
  dailyReplyLimit: number;
  maxConsecutiveAi: number;
  sendTypingPresence: boolean;
  confidenceThreshold: number;

  maxOutputTokens: number;
  skipTrivialMessages: boolean;
  cacheReuseEnabled: boolean;

  dailyRequestBudget: number;
  dailyTokenBudget: number;
  budgetPolicy: BudgetPolicy;
  outOfLimitAutoReply: boolean;

  groqKeyConfigured: boolean;
  groqKeyLast4: string | null;

  updatedAt: string;
}

export type SettingsPatch = Partial<
  Omit<SettingsDTO, 'groqKeyConfigured' | 'groqKeyLast4' | 'updatedAt'>
>;

/* ----------------------------------------------------------------- AI models */

export interface ModelInfo {
  id: string;
  ownedBy: string | null;
  contextWindow: number | null;
  /** true for ids that look like Whisper/audio models, filtered out of the chat picker */
  audio: boolean;
}

export interface AiModelsResponse {
  models: ModelInfo[];
  selected: string;
  fallback: string | null;
  source: 'groq' | 'static';
  fetchedAt: string;
  warning?: string;
}

/* -------------------------------------------------------------- rate limits */

export interface RateLimitWindow {
  limit: number | null;
  remaining: number | null;
  /** ISO timestamp derived from Groq's reset header (e.g. "2m59.56s"). */
  resetAt: string | null;
}

export interface RateLimitSnapshot {
  requests: RateLimitWindow;
  tokens: RateLimitWindow;
  retryAfterSec: number | null;
  updatedAt: string | null;
}

/* ------------------------------------------------------------------- usage */

export interface AiUsageCounters {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  rateLimitHits: number;
  errors: number;
}

export interface AiUsageByModel extends AiUsageCounters {
  model: string;
}

export interface AiBudgetView {
  maxRequests: number;
  maxTokens: number;
  /** 0..100+ ; values above 100 mean the budget is already spent. */
  requestPct: number;
  tokenPct: number;
  /** worst of the two */
  pct: number;
  level: UsageLevel;
  policy: BudgetPolicy;
  paused: boolean;
}

export interface AiUsageSnapshot {
  date: string;
  today: AiUsageCounters;
  byModel: AiUsageByModel[];
  budget: AiBudgetView;
  rateLimits: RateLimitSnapshot;
  /** messages waiting for the AI (queue + retry queue) */
  queueDepth: number;
  retryQueueDepth: number;
  nextResetAt: string | null;
  updatedAt: string;
}

export interface AiLimitEvent {
  kind: AiLimitKind;
  message: string;
  waiting: number;
  at: string;
  nextResetAt: string | null;
  policy: BudgetPolicy;
}

/* ---------------------------------------------------------------- dashboard */

export interface DashboardKpis {
  aiRepliesToday: number;
  humanRepliesToday: number;
  inboundToday: number;
  draftsPending: number;
  needsHuman: number;
  avgResponseMs: number;
  handoffsToday: number;
}

export interface DailyPoint {
  date: string;
  inbound: number;
  aiReplies: number;
  humanReplies: number;
  handoffs: number;
  aiRequests: number;
  aiTokens: number;
}

export interface AnalyticsSummary {
  range: '7d' | '30d' | '90d';
  kpis: DashboardKpis;
  series: DailyPoint[];
  handoffReasons: { reason: HandoffReason; count: number }[];
  usage: AiUsageSnapshot;
}

/* ------------------------------------------------------------------- chats */

export interface ChatSummary {
  id: string;
  name: string;
  phone: string | null;
  isGroup: boolean;
  unreadCount: number;
  needsHuman: boolean;
  autopilotEnabled: boolean | null;
  isWhitelisted: boolean;
  isBlacklisted: boolean;
  isExcluded: boolean;
  tags: string[];
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
}

export interface MessageDTO {
  id: string;
  chatId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  author: 'CUSTOMER' | 'AI' | 'HUMAN' | 'SYSTEM';
  kind: MessageKind;
  text: string | null;
  draftText: string | null;
  transcript: string | null;
  status: MessageStatus;
  skipReason: string | null;
  handoffReason: HandoffReason | null;
  confidence: number | null;
  createdAt: string;
  sentAt: string | null;
}

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  contactId: string | null;
  read: boolean;
  createdAt: string;
}

/* ------------------------------------------------------------------- misc */

export interface WaStatusPayload {
  status: WaStatus;
  phoneNumber: string | null;
  pushName: string | null;
  lastDisconnectCode: number | null;
}

export interface ToastPayload {
  level: 'info' | 'success' | 'warn' | 'error';
  title: string;
  message: string;
}

export interface HealthResponse {
  ok: boolean;
  version: string;
  db: 'ok' | 'error';
  wa: WaStatus;
  aiConfigured: boolean;
}
