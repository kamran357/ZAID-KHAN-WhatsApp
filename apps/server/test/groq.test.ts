import { describe, expect, it, vi } from 'vitest';
import { createGroqClient, GroqError } from '../src/ai/groq.js';
import { parseResetDuration } from '../src/ai/rate-limits.js';

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

/** A Response body can only be read once, so every stub must be fresh. */
const jsonSuccess = () =>
  jsonResponse(
    {
      choices: [{ message: { content: 'Sure — it is 1500 PKR.' } }],
      usage: { prompt_tokens: 120, completion_tokens: 30 },
    },
    {
      headers: {
        'x-ratelimit-remaining-requests': '42',
        'x-ratelimit-limit-requests': '1000',
        'x-ratelimit-reset-requests': '2m59.56s',
        'x-ratelimit-remaining-tokens': '7000',
      },
    },
  );

const rateLimited = (_retryAfter = '2') =>
  jsonResponse({ error: { message: 'rate limit' } }, {
    status: 429,
    headers: { 'retry-after': String(_retryAfter), 'x-ratelimit-remaining-requests': '0' },
  });

const request = {
  apiKey: 'gsk_test_key_value_1234567890',
  model: 'openai/gpt-oss-120b',
  messages: [{ role: 'user' as const, content: 'price?' }],
  maxTokens: 300,
};

describe('parseResetDuration', () => {
  const now = new Date('2026-11-02T10:00:00.000Z');

  it('parses compound durations', () => {
    expect(parseResetDuration('2m59.56s', now)?.toISOString()).toBe('2026-11-02T10:02:59.560Z');
    expect(parseResetDuration('7.66s', now)?.toISOString()).toBe('2026-11-02T10:00:07.660Z');
    expect(parseResetDuration('1h2m3s', now)?.toISOString()).toBe('2026-11-02T11:02:03.000Z');
  });

  it('accepts plain seconds and rejects junk', () => {
    expect(parseResetDuration('30', now)?.toISOString()).toBe('2026-11-02T10:00:30.000Z');
    expect(parseResetDuration('soon', now)).toBeNull();
    expect(parseResetDuration(null, now)).toBeNull();
  });
});

describe('groq client rate limiting', () => {
  it('honours Retry-After, retries, and succeeds', async () => {
    const responses = [rateLimited('1'), jsonSuccess()];
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi.fn(async () => responses.shift() ?? jsonSuccess()) as unknown as typeof fetch;
    const onRateLimits = vi.fn();

    const client = createGroqClient({ fetchImpl, sleep, onRateLimits });
    const result = await client.chat(request);

    expect(result.text).toContain('1500 PKR');
    expect(result.attempts).toBe(2);
    expect(result.usedFallback).toBe(false);
    // Retry-After of 1s is honoured exactly, with no jitter added.
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(onRateLimits).toHaveBeenCalled();
    expect(result.rateLimits.requests.remaining).toBe(42);
    expect(result.rateLimits.requests.resetAt).toBeTruthy();
  });

  it('falls back to the secondary model after repeated 429s', async () => {
    const responses = [
      rateLimited('0'),
      rateLimited('0'),
      rateLimited('0'),
      jsonSuccess(),
    ];
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi.fn(
      async () => responses.shift() ?? jsonSuccess(),
    ) as unknown as typeof fetch;

    const client = createGroqClient({ fetchImpl, sleep, maxRetries: 3 });
    const result = await client.chat({
      ...request,
      fallbackModel: 'openai/gpt-oss-20b',
    });

    expect(result.usedFallback).toBe(true);
    expect(result.model).toBe('openai/gpt-oss-20b');
    expect(sleep).toHaveBeenCalledTimes(2);
    const bodies = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.map(
      (call) => JSON.parse(String(call[1].body)).model as string,
    );
    expect(bodies).toEqual([
      'openai/gpt-oss-120b',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
    ]);
  });

  it('throws rate_limited when the fallback is limited too', async () => {
    const fetchImpl = vi.fn(async () => rateLimited('3')) as unknown as typeof fetch;
    const client = createGroqClient({ fetchImpl, sleep: async () => undefined, maxRetries: 1 });

    await expect(
      client.chat({ ...request, fallbackModel: 'openai/gpt-oss-20b' }),
    ).rejects.toMatchObject({ kind: 'rate_limited', retryAfterSec: 3 });
  });

  it('does not block inline when Retry-After exceeds the inline ceiling', async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi.fn(async () => rateLimited('600')) as unknown as typeof fetch;
    const client = createGroqClient({ fetchImpl, sleep, maxRetries: 3 });

    await expect(client.chat(request)).rejects.toBeInstanceOf(GroqError);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('never retries an auth failure', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: 'bad key' }, { status: 401 }),
    ) as unknown as typeof fetch;
    const client = createGroqClient({ fetchImpl, sleep: async () => undefined });

    await expect(client.chat(request)).rejects.toMatchObject({ kind: 'auth' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
