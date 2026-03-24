/**
 * AI Processing Queue
 *
 * In-memory background queue for Tier 1 auto-generation.
 * Sequential processing (1 concurrent), retry with exponential backoff.
 */

import { AIError } from '../../errors/ai.js';
import type { AIErrorType } from '../../errors/ai.js';

export interface AIQueueItem {
  codeChangeId: string;
  attempts: number;
  lastError?: string;
}

export interface AIActiveItem {
  codeChangeId: string;
  providerName: string;
  providerType: string;
  repoPath: string;
  startedAt: string;
}

export interface AIQueueStatus {
  total: number;
  completed: number;
  failed: number;
  processing: boolean;
  activeItems?: AIActiveItem[];
}

type ProcessFn = (codeChangeId: string) => Promise<void>;
type FailFn = (codeChangeId: string) => Promise<void>;

const MAX_ATTEMPTS = 4; // 1 initial + 3 retries
const RETRY_DELAYS = [0, 5_000, 30_000]; // delays before attempts 2, 3, 4

function shouldRetry(errorCode: AIErrorType, attempts: number): boolean {
  switch (errorCode) {
    case 'AI_TIMEOUT':
    case 'AI_PROVIDER_UNAVAILABLE':
    case 'AI_RATE_LIMITED':
      return attempts < MAX_ATTEMPTS;
    case 'AI_PARSE_FAILED':
      // Retry once for parse failures
      return attempts < 2;
    case 'AI_AUTH_FAILED':
    case 'AI_CONTEXT_TOO_LARGE':
      return false;
    default:
      return attempts < MAX_ATTEMPTS;
  }
}

function getRetryDelay(attempt: number): number {
  // attempt is 1-indexed: attempt 1 = first retry
  return RETRY_DELAYS[attempt - 1] ?? 30_000;
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AIProcessingQueue {
  private queue: AIQueueItem[] = [];
  private _status: AIQueueStatus = { total: 0, completed: 0, failed: 0, processing: false };
  private processFn: ProcessFn | null = null;
  private failFn: FailFn | null = null;
  private active = false;
  private stopRequested = false;

  /**
   * Set the processing function called for each queue item.
   */
  setProcessor(fn: ProcessFn): void {
    this.processFn = fn;
  }

  /**
   * Set the failure callback for final failures (sets ai_generated_at to prevent re-queue).
   */
  setFailureHandler(fn: FailFn): void {
    this.failFn = fn;
  }

  /**
   * Enqueue items for processing.
   */
  enqueue(items: AIQueueItem[]): void {
    this.queue.push(...items);
    this._status.total += items.length;
    this.startProcessing();
  }

  /**
   * Get current queue status.
   */
  getStatus(): AIQueueStatus {
    return { ...this._status };
  }

  /**
   * Stop processing after the current item completes.
   */
  stop(): void {
    this.stopRequested = true;
  }

  /**
   * Start processing the queue (non-blocking).
   */
  private startProcessing(): void {
    if (this.active) return;
    this.active = true;
    this.stopRequested = false;
    this._status.processing = true;

    // Process asynchronously — don't block the caller
    this.processLoop().catch(() => {
      // Error handling is internal; processLoop catches per-item errors
    });
  }

  private async processLoop(): Promise<void> {
    while (this.queue.length > 0 && !this.stopRequested) {
      const item = this.queue[0];

      try {
        if (!this.processFn) {
          throw new AIError('No processor configured', 'AI_PROVIDER_UNAVAILABLE');
        }
        await this.processFn(item.codeChangeId);

        // Success — remove from queue
        this.queue.shift();
        this._status.completed++;
      } catch (err) {
        item.attempts++;
        item.lastError = err instanceof Error ? err.message : String(err);

        const errorCode: AIErrorType = err instanceof AIError ? err.code : 'AI_UNKNOWN';

        if (shouldRetry(errorCode, item.attempts)) {
          const retryDelay = getRetryDelay(item.attempts);
          if (retryDelay > 0) {
            await delay(retryDelay);
          }
          // Item stays at front of queue for retry
          continue;
        }

        // Final failure — remove from queue, mark as failed
        this.queue.shift();
        this._status.failed++;

        // Call failure handler to set ai_generated_at and prevent re-queue
        if (this.failFn) {
          try {
            await this.failFn(item.codeChangeId);
          } catch {
            // Best-effort
          }
        }
      }
    }

    this.active = false;
    this._status.processing = false;
  }

  /**
   * Reset the queue (used in tests).
   */
  reset(): void {
    this.queue = [];
    this._status = { total: 0, completed: 0, failed: 0, processing: false };
    this.active = false;
    this.stopRequested = false;
  }
}
