import { normalizeForMatching } from './safety.js';

/** Jaccard similarity over normalised token sets (0..1). */
export function similarity(a: string, b: string): number {
  const left = new Set(normalizeForMatching(a).split(' ').filter(Boolean));
  const right = new Set(normalizeForMatching(b).split(' ').filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

export interface CachedAnswer {
  question: string;
  answer: string;
  createdAt: number;
  hits: number;
}

/**
 * Reuses an answer when a different contact asks substantially the same question
 * (e.g. "what is your price?" / "price kya hai?"). Exact normalised matches hit
 * immediately; near-duplicates use token similarity.
 */
export class AnswerCache {
  private readonly entries = new Map<string, CachedAnswer>();

  constructor(
    private readonly options: { maxEntries?: number; ttlMs?: number; threshold?: number } = {},
  ) {}

  private get maxEntries(): number {
    return this.options.maxEntries ?? 200;
  }

  private get ttlMs(): number {
    return this.options.ttlMs ?? 1000 * 60 * 60 * 12;
  }

  private get threshold(): number {
    return this.options.threshold ?? 0.82;
  }

  get size(): number {
    return this.entries.size;
  }

  lookup(question: string, now = Date.now()): CachedAnswer | null {
    const key = normalizeForMatching(question);
    if (!key) return null;

    const exact = this.entries.get(key);
    if (exact && now - exact.createdAt <= this.ttlMs) {
      exact.hits += 1;
      return exact;
    }
    if (exact) this.entries.delete(key);

    for (const [storedKey, entry] of this.entries) {
      if (now - entry.createdAt > this.ttlMs) {
        this.entries.delete(storedKey);
        continue;
      }
      if (similarity(key, storedKey) >= this.threshold) {
        entry.hits += 1;
        return entry;
      }
    }
    return null;
  }

  store(question: string, answer: string, now = Date.now()): void {
    const key = normalizeForMatching(question);
    if (!key || !answer.trim()) return;
    if (this.entries.size >= this.maxEntries) {
      const oldest = [...this.entries.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
      if (oldest) this.entries.delete(oldest[0]);
    }
    this.entries.set(key, { question, answer, createdAt: now, hits: 0 });
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * Cache-aware answer resolution used by the autopilot pipeline: a hit returns the
 * stored answer and never calls the model, which is what keeps the free tier alive
 * when several contacts ask the same question.
 */
export async function answerWithCache(options: {
  cache: AnswerCache;
  question: string;
  enabled: boolean;
  generate: () => Promise<string>;
  now?: () => number;
}): Promise<{ answer: string; cached: boolean }> {
  const now = options.now ?? (() => Date.now());
  if (options.enabled) {
    const hit = options.cache.lookup(options.question, now());
    if (hit) return { answer: hit.answer, cached: true };
  }
  const answer = await options.generate();
  if (options.enabled && answer.trim()) options.cache.store(options.question, answer, now());
  return { answer, cached: false };
}
