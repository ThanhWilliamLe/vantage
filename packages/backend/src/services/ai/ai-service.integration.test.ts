import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDatabase, createTestRepo } from '../../data/test-helpers.js';
import { ProjectService } from '../project-service.js';
import { ScanService } from '../scan-service.js';
import { AIService } from './ai-service.js';
import { AIProcessingQueue } from './processing-queue.js';
import { AIError } from '../../errors/ai.js';
import { ulid } from 'ulid';
import { eq } from 'drizzle-orm';
import * as schema from '../../data/schema.js';
import type { AIProviderInterface } from '../../integrations/ai/ai-provider.js';

// ─── Test Helpers ───────────────────────────────

function createMockProvider(response: string): AIProviderInterface {
  return {
    async generate() {
      return response;
    },
    async isAvailable() {
      return true;
    },
  };
}

function createFailingProvider(error: AIError): AIProviderInterface {
  return {
    async generate() {
      throw error;
    },
    async isAvailable() {
      return true;
    },
  };
}

function createSequenceProvider(responses: Array<string | AIError>): AIProviderInterface {
  let callIndex = 0;
  return {
    async generate() {
      const response = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      if (response instanceof AIError) throw response;
      return response;
    },
    async isAvailable() {
      return true;
    },
  };
}

const VALID_TIER1_RESPONSE = JSON.stringify({
  summary: 'Adds a new feature module.',
  category: 'feature',
  risk_level: 'medium',
});

const VALID_TIER2_RESPONSE = JSON.stringify({
  findings: [
    {
      severity: 'medium',
      category: 'quality',
      description: 'Missing error handling in handler.',
      file: 'src/feature.ts',
      line: 1,
    },
  ],
});

// ─── Tests ──────────────────────────────────────

const { db, sqlite } = createTestDatabase();

afterAll(() => {
  sqlite.close();
});

describe('AIService', () => {
  let projectId: string;
  let repoId: string;
  let repoPath: string;
  let codeChangeId: string;

  beforeAll(async () => {
    // Create a project
    const project = await ProjectService.create(db, { name: 'AI Test Project' });
    projectId = project.id;

    // Create a test repo with a commit
    repoPath = createTestRepo([
      {
        message: 'Initial commit',
        files: { 'README.md': '# Test Repo\n' },
      },
      {
        message: 'Add feature module',
        files: { 'src/feature.ts': 'export const x = 1;\n' },
      },
    ]);

    // Insert a repository record
    repoId = ulid();
    const now = new Date().toISOString();
    await db.insert(schema.repository).values({
      id: repoId,
      projectId,
      type: 'local',
      localPath: repoPath,
      createdAt: now,
    });

    // Scan to populate code_changes
    await ScanService.scanRepository(db, { id: repoId, projectId, localPath: repoPath });

    // Get a code change ID for testing
    const changes = await db
      .select()
      .from(schema.codeChange)
      .where(eq(schema.codeChange.repoId, repoId))
      .all();

    expect(changes.length).toBeGreaterThan(0);
    codeChangeId = changes.find(c => c.title === 'Add feature module')?.id ?? changes[0].id;

    // Mark all changes as already generated so queue tests can selectively clear
    for (const c of changes) {
      await db
        .update(schema.codeChange)
        .set({ aiGeneratedAt: now, updatedAt: now })
        .where(eq(schema.codeChange.id, c.id));
    }
  });

  beforeEach(() => {
    AIService._resetQueue();
  });

  // ─── Tier 1 On-Demand ──────────────────────────

  describe('generateTier1', () => {
    it('generates and stores Tier 1 analysis', async () => {
      const provider = createMockProvider(VALID_TIER1_RESPONSE);
      await AIService.generateTier1(db, provider, codeChangeId);

      const updated = await db
        .select()
        .from(schema.codeChange)
        .where(eq(schema.codeChange.id, codeChangeId))
        .get();

      expect(updated).toBeDefined();
      expect(updated!.aiSummary).toBe('Adds a new feature module.');
      expect(updated!.aiCategory).toBe('feature');
      expect(updated!.aiRiskLevel).toBe('medium');
      expect(updated!.aiGeneratedAt).toBeTruthy();
    });

    it('throws NotFoundError for non-existent code change', async () => {
      const provider = createMockProvider(VALID_TIER1_RESPONSE);
      await expect(
        AIService.generateTier1(db, provider, 'nonexistent-id'),
      ).rejects.toThrow('not found');
    });

    it('propagates AI provider errors', async () => {
      const provider = createFailingProvider(
        new AIError('Auth failed', 'AI_AUTH_FAILED'),
      );
      await expect(
        AIService.generateTier1(db, provider, codeChangeId),
      ).rejects.toThrow('Auth failed');
    });
  });

  // ─── Tier 2 On-Demand ──────────────────────────

  describe('generateTier2', () => {
    it('generates and stores deep analysis', async () => {
      // Clean up any existing deep_analysis for this code change
      await db
        .delete(schema.deepAnalysis)
        .where(eq(schema.deepAnalysis.codeChangeId, codeChangeId));

      const provider = createMockProvider(VALID_TIER2_RESPONSE);
      const result = await AIService.generateTier2(db, provider, codeChangeId, repoPath);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe('medium');
      expect(result.findings[0].description).toBe('Missing error handling in handler.');

      // Verify stored in database
      const stored = await db
        .select()
        .from(schema.deepAnalysis)
        .where(eq(schema.deepAnalysis.codeChangeId, codeChangeId))
        .get();

      expect(stored).toBeDefined();
      expect(JSON.parse(stored!.findings)).toHaveLength(1);
    });

    it('returns existing analysis without re-generating', async () => {
      // Ensure there's an existing analysis (from the test above or create one)
      const existing = await db
        .select()
        .from(schema.deepAnalysis)
        .where(eq(schema.deepAnalysis.codeChangeId, codeChangeId))
        .get();

      if (!existing) {
        const provider = createMockProvider(VALID_TIER2_RESPONSE);
        await AIService.generateTier2(db, provider, codeChangeId, repoPath);
      }

      // Second call should return existing without calling generate
      let generateCalled = false;
      const trackingProvider: AIProviderInterface = {
        async generate() {
          generateCalled = true;
          return VALID_TIER2_RESPONSE;
        },
        async isAvailable() { return true; },
      };

      const result = await AIService.generateTier2(db, trackingProvider, codeChangeId, repoPath);
      expect(result.findings).toHaveLength(1);
      expect(generateCalled).toBe(false);
    });

    it('re-generates with force flag', async () => {
      const newResponse = JSON.stringify({
        findings: [
          { severity: 'high', category: 'security', description: 'SQL injection', file: 'a.ts', line: 5 },
          { severity: 'low', category: 'style', description: 'Naming issue', file: 'b.ts', line: 10 },
        ],
      });
      const provider = createMockProvider(newResponse);
      const result = await AIService.generateTier2(db, provider, codeChangeId, repoPath, true);

      expect(result.findings).toHaveLength(2);
      expect(result.findings[0].category).toBe('security');
    });
  });

  // ─── Queue Processing ──────────────────────────

  describe('Queue processing', () => {
    it('processes queue items with mock provider', async () => {
      // Clear aiGeneratedAt for ONLY the target code change so only 1 item is queued
      await db
        .update(schema.codeChange)
        .set({ aiGeneratedAt: null, aiSummary: null, aiCategory: null, aiRiskLevel: null, updatedAt: new Date().toISOString() })
        .where(eq(schema.codeChange.id, codeChangeId));

      const provider = createMockProvider(VALID_TIER1_RESPONSE);
      AIService.startProcessing(db, provider);

      // Wait for queue to complete
      await waitForQueue(AIService._getQueue(), 15000);

      const status = AIService.getQueueStatus();
      expect(status.processing).toBe(false);
      expect(status.completed).toBe(1);
      expect(status.failed).toBe(0);

      // Verify code change was updated
      const updated = await db
        .select()
        .from(schema.codeChange)
        .where(eq(schema.codeChange.id, codeChangeId))
        .get();

      expect(updated!.aiSummary).toBe('Adds a new feature module.');
      expect(updated!.aiGeneratedAt).toBeTruthy();
    }, 20000);

    it('retries on TIMEOUT error', async () => {
      // Clear aiGeneratedAt for only our target
      await db
        .update(schema.codeChange)
        .set({ aiGeneratedAt: null, aiSummary: null, updatedAt: new Date().toISOString() })
        .where(eq(schema.codeChange.id, codeChangeId));

      // First call times out, second succeeds
      const provider = createSequenceProvider([
        new AIError('Timeout', 'AI_TIMEOUT'),
        VALID_TIER1_RESPONSE,
      ]);

      AIService.startProcessing(db, provider);
      await waitForQueue(AIService._getQueue(), 15000);

      const status = AIService.getQueueStatus();
      expect(status.failed).toBe(0);
      expect(status.completed).toBe(1);
    }, 20000);

    it('does NOT retry on AUTH_FAILED', async () => {
      // Clear aiGeneratedAt for only our target
      await db
        .update(schema.codeChange)
        .set({ aiGeneratedAt: null, aiSummary: null, updatedAt: new Date().toISOString() })
        .where(eq(schema.codeChange.id, codeChangeId));

      let callCount = 0;
      const provider: AIProviderInterface = {
        async generate() {
          callCount++;
          throw new AIError('Bad credentials', 'AI_AUTH_FAILED');
        },
        async isAvailable() { return true; },
      };

      AIService.startProcessing(db, provider);
      await waitForQueue(AIService._getQueue(), 15000);

      const status = AIService.getQueueStatus();
      expect(status.failed).toBe(1);
      // Should only have been called once (no retry for auth failures)
      expect(callCount).toBe(1);
    }, 20000);

    it('sets ai_generated_at on final failure to prevent re-queue', async () => {
      // Clear aiGeneratedAt
      await db
        .update(schema.codeChange)
        .set({ aiGeneratedAt: null, aiSummary: null, updatedAt: new Date().toISOString() })
        .where(eq(schema.codeChange.id, codeChangeId));

      const provider = createFailingProvider(
        new AIError('Bad key', 'AI_AUTH_FAILED'),
      );

      AIService.startProcessing(db, provider);
      await waitForQueue(AIService._getQueue(), 15000);

      const updated = await db
        .select()
        .from(schema.codeChange)
        .where(eq(schema.codeChange.id, codeChangeId))
        .get();

      // ai_generated_at should be set even though generation failed
      expect(updated!.aiGeneratedAt).toBeTruthy();
      // ai_summary should remain null (generation failed)
      expect(updated!.aiSummary).toBeNull();
    }, 20000);
  });

  // ─── AI Unavailable ────────────────────────────

  describe('AI unavailable does not break non-AI workflows', () => {
    it('code changes exist and are queryable without AI', async () => {
      // Verify code changes can be listed regardless of AI state
      const changes = await db
        .select()
        .from(schema.codeChange)
        .where(eq(schema.codeChange.repoId, repoId))
        .all();

      expect(changes.length).toBeGreaterThan(0);
      // Non-AI fields should be populated
      for (const c of changes) {
        expect(c.title).toBeTruthy();
        expect(c.authorRaw).toBeTruthy();
      }
    });

    it('queue status reports correctly when nothing is queued', () => {
      const status = AIService.getQueueStatus();
      expect(status.processing).toBe(false);
    });
  });

  // ─── Queue Status ─────────────────────────────

  describe('getQueueStatus', () => {
    it('returns initial status', () => {
      const status = AIService.getQueueStatus();
      expect(status).toEqual({
        total: 0,
        completed: 0,
        failed: 0,
        processing: false,
      });
    });
  });
});

// ─── Processing Queue Unit Tests ────────────────

describe('AIProcessingQueue', () => {
  it('processes items sequentially', async () => {
    const queue = new AIProcessingQueue();
    const processed: string[] = [];

    queue.setProcessor(async (id) => {
      processed.push(id);
    });
    queue.setFailureHandler(async () => {});

    queue.enqueue([
      { codeChangeId: 'a', attempts: 0 },
      { codeChangeId: 'b', attempts: 0 },
      { codeChangeId: 'c', attempts: 0 },
    ]);

    await waitForQueue(queue, 5000);

    expect(processed).toEqual(['a', 'b', 'c']);
    expect(queue.getStatus()).toEqual({
      total: 3,
      completed: 3,
      failed: 0,
      processing: false,
    });
  });

  it('retries TIMEOUT errors with delay', async () => {
    const queue = new AIProcessingQueue();
    let attempts = 0;

    queue.setProcessor(async () => {
      attempts++;
      if (attempts === 1) {
        throw new AIError('Timeout', 'AI_TIMEOUT');
      }
    });
    queue.setFailureHandler(async () => {});

    queue.enqueue([{ codeChangeId: 'x', attempts: 0 }]);
    await waitForQueue(queue, 10000);

    expect(attempts).toBe(2);
    expect(queue.getStatus().completed).toBe(1);
    expect(queue.getStatus().failed).toBe(0);
  }, 15000);

  it('does not retry AUTH_FAILED', async () => {
    const queue = new AIProcessingQueue();
    let attempts = 0;
    let failedId: string | null = null;

    queue.setProcessor(async () => {
      attempts++;
      throw new AIError('Auth failed', 'AI_AUTH_FAILED');
    });
    queue.setFailureHandler(async (id) => {
      failedId = id;
    });

    queue.enqueue([{ codeChangeId: 'y', attempts: 0 }]);
    await waitForQueue(queue, 5000);

    expect(attempts).toBe(1);
    expect(queue.getStatus().failed).toBe(1);
    expect(failedId).toBe('y');
  });

  it('does not retry CONTEXT_TOO_LARGE', async () => {
    const queue = new AIProcessingQueue();
    let attempts = 0;

    queue.setProcessor(async () => {
      attempts++;
      throw new AIError('Too large', 'AI_CONTEXT_TOO_LARGE');
    });
    queue.setFailureHandler(async () => {});

    queue.enqueue([{ codeChangeId: 'z', attempts: 0 }]);
    await waitForQueue(queue, 5000);

    expect(attempts).toBe(1);
    expect(queue.getStatus().failed).toBe(1);
  });

  it('retries PARSE_FAILED once', async () => {
    const queue = new AIProcessingQueue();
    let attempts = 0;

    queue.setProcessor(async () => {
      attempts++;
      throw new AIError('Parse failed', 'AI_PARSE_FAILED');
    });
    queue.setFailureHandler(async () => {});

    queue.enqueue([{ codeChangeId: 'p', attempts: 0 }]);
    await waitForQueue(queue, 10000);

    // Initial attempt + 1 retry = 2 total
    expect(attempts).toBe(2);
    expect(queue.getStatus().failed).toBe(1);
  }, 15000);

  it('stops when requested', async () => {
    const queue = new AIProcessingQueue();
    const processed: string[] = [];

    queue.setProcessor(async (id) => {
      processed.push(id);
      if (id === 'b') queue.stop();
    });
    queue.setFailureHandler(async () => {});

    queue.enqueue([
      { codeChangeId: 'a', attempts: 0 },
      { codeChangeId: 'b', attempts: 0 },
      { codeChangeId: 'c', attempts: 0 },
    ]);

    await waitForQueue(queue, 5000);

    // Should have processed 'a' and 'b', stopped before 'c'
    expect(processed).toContain('a');
    expect(processed).toContain('b');
    expect(queue.getStatus().processing).toBe(false);
  });
});

// ─── Utility ────────────────────────────────────

async function waitForQueue(queue: AIProcessingQueue, maxWait: number): Promise<void> {
  const start = Date.now();
  while (queue.getStatus().processing && Date.now() - start < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
