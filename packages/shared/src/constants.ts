/** Safety-relevant constants shared by server and UI copy. */

export const DEFAULT_AI_MODEL = 'openai/gpt-oss-120b';
/** Cheap/fast model used for low-stakes tasks (language/intent) when available. */
export const FAST_AI_MODEL = 'openai/gpt-oss-20b';
export const DEFAULT_FALLBACK_MODEL = 'openai/gpt-oss-20b';
export const DEFAULT_TRANSCRIPTION_MODEL = 'whisper-large-v3-turbo';

/** Reply length cap — keeps free-tier tokens (and cost) predictable. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 300;
/** Only the tail of a conversation is sent to the model. */
export const PROMPT_HISTORY_MESSAGES = 8;
export const KB_TOP_K = 4;

export const REPLY_DELAY_MIN_SEC = 4;
export const REPLY_DELAY_MAX_SEC = 12;
export const DAILY_REPLY_LIMIT = 200;
export const MAX_CONSECUTIVE_AI_REPLIES = 3;

export const DEFAULT_DAILY_REQUEST_BUDGET = 500;
export const DEFAULT_DAILY_TOKEN_BUDGET = 200_000;
/** Soft warning at 60%, hard warning at 85%, policy kicks in at 100%. */
export const BUDGET_WARN_PCT = 60;
export const BUDGET_CRITICAL_PCT = 85;

export const AI_MAX_RETRIES = 3;
export const AI_RETRY_BASE_DELAY_MS = 1_500;
export const AI_QUEUE_CONCURRENCY = 2;

/** Send a queued full-auto reply only if the inbound message is this fresh. */
export const STALE_RETRY_SEND_MINUTES = 30;
/** Out-of-limit courtesy reply: max once per chat per this many hours. */
export const OUT_OF_LIMIT_REPLY_COOLDOWN_HOURS = 6;
export const OUT_OF_LIMIT_REPLY_TEXT =
  'We received your message and will reply soon. Thank you for your patience.';

export const GROQ_API_BASE = 'https://api.groq.com/openai/v1';
export const SESSION_COOKIE = 'zk_session';
export const SOCKET_ROOM = 'owner';
