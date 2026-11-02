import { env } from './config/env.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

/**
 * Defence in depth: even if a caller passes message content or a key by mistake,
 * it never reaches the log stream. We log ids, counts and error codes only.
 */
const DENY = new Set([
  'text',
  'body',
  'content',
  'draftText',
  'transcript',
  'message',
  'reply',
  'prompt',
  'apiKey',
  'groqKey',
  'groqApiKey',
  'groqApiKeyEnc',
  'password',
  'token',
  'cookie',
  'authorization',
  'secret',
]);

function clean(fields?: Record<string, unknown>): Record<string, unknown> {
  if (!fields) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (DENY.has(key)) {
      out[key] = '[redacted]';
      continue;
    }
    if (value instanceof Error) {
      out[key] = { name: value.name, message: value.message };
      continue;
    }
    if (typeof value === 'string' && value.length > 180) {
      out[key] = `${value.slice(0, 180)}…`;
      continue;
    }
    out[key] = value;
  }
  return out;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[env.LOG_LEVEL]) return;
  const line = `${JSON.stringify({ t: new Date().toISOString(), level, msg, ...clean(fields) })}\n`;
  if (level === 'error' || level === 'warn') process.stderr.write(line);
  else process.stdout.write(line);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields),
};
