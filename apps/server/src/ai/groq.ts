import { AI_MAX_RETRIES, AI_RETRY_BASE_DELAY_MS, GROQ_API_BASE } from '@zk/shared';
import type { RateLimitSnapshot } from '@zk/shared';
import { emptyRateLimits, parseRateLimits } from './rate-limits.js';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  apiKey: string;
  model: string;
  fallbackModel?: string | null;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  json?: boolean;
  signal?: AbortSignal;
}

export interface ChatSuccess {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  usedFallback: boolean;
  attempts: number;
  rateLimits: RateLimitSnapshot;
}

export type GroqFailureKind = 'rate_limited' | 'auth' | 'server' | 'network' | 'bad_response';

export class GroqError extends Error {
  readonly kind: GroqFailureKind;
  readonly status: number | null;
  readonly retryAfterSec: number | null;

  constructor(
    kind: GroqFailureKind,
    message: string,
    options: { status?: number | null; retryAfterSec?: number | null } = {},
  ) {
    super(message);
    this.name = 'GroqError';
    this.kind = kind;
    this.status = options.status ?? null;
    this.retryAfterSec = options.retryAfterSec ?? null;
  }
}

export interface GroqClientOptions {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  random?: () => number;
  maxRetries?: number;
  baseDelayMs?: number;
  /** Longest wait we are willing to block a single call for before handing the job to the retry queue. */
  maxInlineWaitMs?: number;
  onRateLimits?: (snapshot: RateLimitSnapshot) => void;
  onRateLimitHit?: (info: { model: string; retryAfterSec: number | null }) => void;
  /** Dev-only hook used by the 429 simulator. */
  shouldForceRateLimit?: () => boolean;
}

export interface ModelListEntry {
  id: string;
  ownedBy: string | null;
  contextWindow: number | null;
  audio: boolean;
}

const AUDIO_MODEL = /(whisper|tts|audio|speech|playai)/i;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createGroqClient(options: GroqClientOptions = {}) {
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? (() => new Date());
  const random = options.random ?? Math.random;
  const maxRetries = Math.max(1, options.maxRetries ?? AI_MAX_RETRIES);
  const baseDelayMs = options.baseDelayMs ?? AI_RETRY_BASE_DELAY_MS;
  const maxInlineWaitMs = options.maxInlineWaitMs ?? 20_000;

  async function singleAttempt(
    request: ChatRequest,
    model: string,
    usedFallback: boolean,
    attempt: number,
  ): Promise<ChatSuccess> {
    const startedAt = Date.now();
    const body: Record<string, unknown> = {
      model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.4,
    };
    if (request.json) body.response_format = { type: 'json_object' };

    if (options.shouldForceRateLimit?.()) {
      const simulated = new Headers({ 'retry-after': '2', 'x-ratelimit-remaining-requests': '0' });
      options.onRateLimits?.(parseRateLimits(simulated, now()));
      throw new GroqError('rate_limited', 'Simulated 429 (dev)', { status: 429, retryAfterSec: 2 });
    }

    let response: Response;
    try {
      response = await doFetch(`${GROQ_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${request.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch {
      throw new GroqError('network', 'Could not reach the AI provider');
    }

    const rateLimits = parseRateLimits(response.headers, now());
    if (rateLimits.updatedAt) options.onRateLimits?.(rateLimits);

    if (!response.ok) {
      const retryAfterRaw = response.headers.get('retry-after');
      const retryAfterSec = retryAfterRaw && Number.isFinite(Number(retryAfterRaw))
        ? Number(retryAfterRaw)
        : null;

      if (response.status === 429) {
        options.onRateLimitHit?.({ model, retryAfterSec });
        throw new GroqError('rate_limited', 'AI rate limit reached', {
          status: 429,
          retryAfterSec,
        });
      }
      if (response.status === 401 || response.status === 403) {
        throw new GroqError('auth', 'AI provider rejected the API key', { status: response.status });
      }
      if (response.status >= 500) {
        throw new GroqError('server', 'AI provider is unavailable', { status: response.status });
      }
      throw new GroqError('bad_response', `AI provider returned ${response.status}`, {
        status: response.status,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new GroqError('bad_response', 'AI provider returned invalid JSON');
    }

    const data = payload as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) {
      throw new GroqError('bad_response', 'AI provider returned an empty reply');
    }

    return {
      text,
      model,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - startedAt,
      usedFallback,
      attempts: attempt,
      rateLimits,
    };
  }

  function backoffMs(error: GroqError, attempt: number): number {
    if (error.retryAfterSec && error.retryAfterSec > 0) return error.retryAfterSec * 1000;
    const exponential = baseDelayMs * 2 ** (attempt - 1);
    return exponential + Math.floor(random() * 400);
  }

  async function chat(request: ChatRequest): Promise<ChatSuccess> {
    let lastError: GroqError | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        return await singleAttempt(request, request.model, false, attempt);
      } catch (error) {
        lastError = toGroqError(error);
        if (lastError.kind === 'auth' || lastError.kind === 'bad_response') throw lastError;
        if (attempt >= maxRetries) break;

        const wait = backoffMs(lastError, attempt);
        // Too long to hold this message: let the queue retry after the reset instead.
        if (wait > maxInlineWaitMs) break;
        await sleep(wait);
      }
    }

    const fallback = request.fallbackModel?.trim();
    if (fallback && fallback !== request.model && lastError) {
      try {
        return await singleAttempt(request, fallback, true, 1);
      } catch (error) {
        const fallbackError = toGroqError(error);
        // Surface the fallback failure — it carries the freshest retry-after.
        throw fallbackError;
      }
    }

    throw lastError ?? new GroqError('network', 'AI request failed');
  }

  async function listModels(
    apiKey: string,
  ): Promise<{ models: ModelListEntry[]; warning?: string }> {
    let response: Response;
    try {
      response = await doFetch(`${GROQ_API_BASE}/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
    } catch {
      return { models: [], warning: 'Could not reach Groq to list models.' };
    }

    if (response.status === 401 || response.status === 403) {
      throw new GroqError('auth', 'Groq rejected the API key', { status: response.status });
    }
    if (!response.ok) {
      return { models: [], warning: `Groq model list failed (${response.status}).` };
    }

    const payload = (await response.json()) as {
      data?: { id?: string; owned_by?: string; context_window?: number }[];
    };

    const models: ModelListEntry[] = (payload.data ?? [])
      .filter((entry): entry is { id: string; owned_by?: string; context_window?: number } =>
        typeof entry.id === 'string',
      )
      .map((entry) => ({
        id: entry.id,
        ownedBy: entry.owned_by ?? null,
        contextWindow: entry.context_window ?? null,
        audio: AUDIO_MODEL.test(entry.id),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return { models };
  }

  return { chat, listModels, emptyRateLimits };
}

function toGroqError(error: unknown): GroqError {
  if (error instanceof GroqError) return error;
  if (error instanceof Error) return new GroqError('network', error.message);
  return new GroqError('network', 'Unknown AI error');
}

export { emptyRateLimits };
