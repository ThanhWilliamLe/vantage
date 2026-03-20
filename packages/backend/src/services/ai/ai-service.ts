/**
 * AI Service — Orchestration Layer
 *
 * Coordinates AI generation, parsing, and storage for all tiers.
 * Manages the background processing queue for Tier 1 auto-generation.
 */

import { eq, isNull } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as schema from '../../data/schema.js';
import { NotFoundError } from '../../errors/index.js';
import { GitReader } from '../../integrations/git/git-reader.js';
import type { AIProviderInterface } from '../../integrations/ai/ai-provider.js';
import type { DrizzleDB } from '../../data/db.js';
import { extractJSON, parseTier1Response, parseTier2Response } from './parsers.js';
import type { Tier2Result } from './parsers.js';
import { buildTier1Prompt, buildTier2Prompt } from './prompts.js';
import { AIProcessingQueue } from './processing-queue.js';
import type { AIQueueStatus } from './processing-queue.js';

// ─── Singleton Queue ────────────────────────────

const queue = new AIProcessingQueue();

// ─── Service ────────────────────────────────────

export const AIService = {
  /**
   * Generate Tier 1 analysis for a code change (on-demand, synchronous).
   * Updates code_change with ai_summary, ai_category, ai_risk_level, ai_generated_at.
   */
  async generateTier1(
    db: DrizzleDB,
    provider: AIProviderInterface,
    codeChangeId: string,
  ): Promise<void> {
    const change = await db
      .select()
      .from(schema.codeChange)
      .where(eq(schema.codeChange.id, codeChangeId))
      .get();

    if (!change) {
      throw new NotFoundError('CodeChange', codeChangeId);
    }

    // Get the repo for the diff
    const repo = await db
      .select()
      .from(schema.repository)
      .where(eq(schema.repository.id, change.repoId))
      .get();

    if (!repo || !repo.localPath) {
      throw new NotFoundError('Repository', change.repoId);
    }

    const { diff } = await GitReader.getDiffForAPI(repo.localPath, change.platformId);
    const prompt = buildTier1Prompt(change.title, change.body, diff);

    const raw = await provider.generate(prompt, { maxTokens: 300, timeout: 30_000 });
    const parsed = extractJSON(raw);
    const result = parseTier1Response(parsed);

    const now = new Date().toISOString();
    await db
      .update(schema.codeChange)
      .set({
        aiSummary: result.summary,
        aiCategory: result.category,
        aiRiskLevel: result.riskLevel,
        aiGeneratedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.codeChange.id, codeChangeId));
  },

  /**
   * Generate Tier 2 deep analysis for a code change (on-demand, synchronous).
   * Creates or replaces deep_analysis record.
   */
  async generateTier2(
    db: DrizzleDB,
    provider: AIProviderInterface,
    codeChangeId: string,
    repoPath: string,
    force = false,
  ): Promise<Tier2Result> {
    const change = await db
      .select()
      .from(schema.codeChange)
      .where(eq(schema.codeChange.id, codeChangeId))
      .get();

    if (!change) {
      throw new NotFoundError('CodeChange', codeChangeId);
    }

    // Check for existing analysis
    const existing = await db
      .select()
      .from(schema.deepAnalysis)
      .where(eq(schema.deepAnalysis.codeChangeId, codeChangeId))
      .get();

    if (existing && !force) {
      return { findings: JSON.parse(existing.findings) };
    }

    const { diff } = await GitReader.getDiffForAPI(repoPath, change.platformId);
    const prompt = buildTier2Prompt(change.title, change.body, diff, []);

    const raw = await provider.generate(prompt, { maxTokens: 2000, timeout: 120_000 });
    const parsed = extractJSON(raw);
    const result = parseTier2Response(parsed);

    const now = new Date().toISOString();

    if (existing) {
      // Replace existing analysis (force mode)
      await db
        .update(schema.deepAnalysis)
        .set({
          findings: JSON.stringify(result.findings),
          analyzedAt: now,
        })
        .where(eq(schema.deepAnalysis.codeChangeId, codeChangeId));
    } else {
      // Create new analysis
      await db.insert(schema.deepAnalysis).values({
        id: ulid(),
        codeChangeId,
        findings: JSON.stringify(result.findings),
        analyzedAt: now,
        createdAt: now,
      });
    }

    return result;
  },

  /**
   * Get current queue status.
   */
  getQueueStatus(): AIQueueStatus {
    return queue.getStatus();
  },

  /**
   * Start background Tier 1 processing.
   * Finds code_changes where ai_generated_at IS NULL and enqueues them.
   */
  startProcessing(db: DrizzleDB, provider: AIProviderInterface): void {
    // Configure the queue processor
    queue.setProcessor(async (codeChangeId: string) => {
      await AIService.generateTier1(db, provider, codeChangeId);
    });

    // Configure failure handler — sets ai_generated_at to prevent re-queue
    queue.setFailureHandler(async (codeChangeId: string) => {
      const now = new Date().toISOString();
      await db
        .update(schema.codeChange)
        .set({
          aiGeneratedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.codeChange.id, codeChangeId));
    });

    // Find items that need Tier 1 generation
    const pending = db
      .select({ id: schema.codeChange.id })
      .from(schema.codeChange)
      .where(isNull(schema.codeChange.aiGeneratedAt))
      .all();

    if (pending.length > 0) {
      queue.enqueue(
        pending.map((p) => ({
          codeChangeId: p.id,
          attempts: 0,
        })),
      );
    }
  },

  /**
   * Stop background processing.
   */
  stopProcessing(): void {
    queue.stop();
  },

  /**
   * Reset the queue (for testing).
   */
  _resetQueue(): void {
    queue.reset();
  },

  /**
   * Get the underlying queue instance (for testing).
   */
  _getQueue(): AIProcessingQueue {
    return queue;
  },
};
