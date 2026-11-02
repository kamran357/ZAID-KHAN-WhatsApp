import { log } from '../logging.js';

export interface QueueTask {
  id: string;
  run: () => Promise<void>;
}

/**
 * Bounded concurrency runner for AI work. WhatsApp replies are inherently
 * sequential per account, so the default is intentionally small (1–2).
 */
export class ConcurrencyQueue {
  private readonly pending: QueueTask[] = [];
  private running = 0;

  constructor(private readonly concurrency: number) {}

  get depth(): number {
    return this.pending.length;
  }

  get active(): number {
    return this.running;
  }

  add(task: QueueTask): void {
    this.pending.push(task);
    void this.drain();
  }

  private async drain(): Promise<void> {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const task = this.pending.shift();
      if (!task) return;
      this.running += 1;
      try {
        await task.run();
      } catch (error) {
        log.error('queue/task-failed', {
          taskId: task.id,
          error: error instanceof Error ? error.message : 'unknown',
        });
      } finally {
        this.running -= 1;
      }
    }
  }
}

export interface RetryItem {
  id: string;
  /** When the inbound message arrived — full-auto sends go stale after 30 min. */
  receivedAt: Date;
}

/**
 * Messages that hit a rate limit wait here until the window resets. Nothing is
 * lost and nothing is sent broken: on release each item is re-processed through
 * the normal pipeline (which may draft instead of sending if it went stale).
 */
export class RetryQueue<T extends RetryItem> {
  private items: T[] = [];
  private releaseAt: Date | null = null;

  constructor(
    private readonly options: {
      process: (item: T) => Promise<void>;
      now?: () => Date;
      onReleased?: (count: number) => void;
    },
  ) {}

  get depth(): number {
    return this.items.length;
  }

  get nextReleaseAt(): Date | null {
    return this.releaseAt;
  }

  /** Items are deduplicated by id so a double upsert cannot double-reply. */
  push(item: T): void {
    if (this.items.some((existing) => existing.id === item.id)) return;
    this.items.push(item);
  }

  holdUntil(at: Date): void {
    if (!this.releaseAt || at < this.releaseAt) this.releaseAt = at;
  }

  snapshot(): T[] {
    return [...this.items];
  }

  /** Idempotent: returns how many items were processed (0 while still held). */
  async processDue(): Promise<number> {
    const now = (this.options.now ?? (() => new Date()))();
    if (this.releaseAt && now < this.releaseAt) return 0;
    this.releaseAt = null;

    const batch = this.items;
    this.items = [];
    for (const item of batch) {
      try {
        await this.options.process(item);
      } catch (error) {
        log.error('retry-queue/process-failed', {
          itemId: item.id,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
    if (batch.length > 0) this.options.onReleased?.(batch.length);
    return batch.length;
  }

  clear(): void {
    this.items = [];
    this.releaseAt = null;
  }
}
