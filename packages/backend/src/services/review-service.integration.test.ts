import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { createTestDatabase } from '../data/test-helpers.js';
import { ReviewService } from './review-service.js';
import { ProjectService } from './project-service.js';
import { MemberService } from './member-service.js';
import { NotFoundError, ValidationError } from '../errors/index.js';
import * as schema from '../data/schema.js';

const { db, sqlite } = createTestDatabase();

let projectId: string;
let repoId: string;
let memberId: string;

// Helper to insert a code_change for testing
async function insertCodeChange(overrides: Partial<{
  id: string;
  status: string;
  branch: string | null;
  authoredAt: string;
  flaggedAt: string;
  flagReason: string;
  deferCount: number;
  deferredAt: string;
  projectId: string;
}> = {}) {
  const id = overrides.id || ulid();
  const now = new Date().toISOString();
  await db.insert(schema.codeChange).values({
    id,
    projectId: overrides.projectId || projectId,
    repoId,
    type: 'commit',
    platformId: `hash-${id}`,
    branch: 'branch' in overrides ? overrides.branch ?? null : 'main',
    title: `Test commit ${id}`,
    body: null,
    authorMemberId: memberId,
    authorRaw: 'test@example.com',
    authorName: 'Test User',
    linesAdded: 10,
    linesDeleted: 2,
    filesChanged: 1,
    authoredAt: overrides.authoredAt || now,
    fetchedAt: now,
    status: overrides.status || 'pending',
    createdAt: now,
    updatedAt: now,
    flaggedAt: overrides.flaggedAt || null,
    flagReason: overrides.flagReason || null,
    deferCount: overrides.deferCount ?? 0,
    deferredAt: overrides.deferredAt || null,
  });
  return id;
}

beforeAll(async () => {
  const project = await ProjectService.create(db, { name: 'Review Test Project' });
  projectId = project.id;

  const member = await MemberService.create(db, { name: 'ReviewTester' });
  memberId = member.id;

  // Insert a repo record directly
  repoId = ulid();
  const now = new Date().toISOString();
  await db.insert(schema.repository).values({
    id: repoId,
    projectId,
    type: 'local',
    localPath: '/tmp/fake-repo',
    createdAt: now,
  });
});

afterAll(() => {
  sqlite.close();
});

// ═══════════════════════════════════════════════════════════════
// Review action: pending → reviewed
// ═══════════════════════════════════════════════════════════════
describe('ReviewService.review', () => {
  it('pending → reviewed with notes', async () => {
    const id = await insertCodeChange();
    const result = await ReviewService.review(db, id, 'Looks good');

    expect(result.status).toBe('reviewed');
    expect(result.reviewedAt).toBeDefined();
    expect(result.reviewNotes).toBe('Looks good');
  });

  it('pending → reviewed without notes', async () => {
    const id = await insertCodeChange();
    const result = await ReviewService.review(db, id);

    expect(result.status).toBe('reviewed');
    expect(result.reviewedAt).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Flag action: pending → flagged
// ═══════════════════════════════════════════════════════════════
describe('ReviewService.flag', () => {
  it('pending → flagged with reason', async () => {
    const id = await insertCodeChange();
    const result = await ReviewService.flag(db, id, 'Needs discussion');

    expect(result.status).toBe('flagged');
    expect(result.flaggedAt).toBeDefined();
    expect(result.flagReason).toBe('Needs discussion');
  });

  it('reviewed → flagged', async () => {
    const id = await insertCodeChange({ status: 'reviewed' });
    const result = await ReviewService.flag(db, id, 'Found issue after review');

    expect(result.status).toBe('flagged');
    expect(result.flagReason).toBe('Found issue after review');
  });

  it('flag without reason → throws ValidationError', async () => {
    const id = await insertCodeChange();
    await expect(ReviewService.flag(db, id, '')).rejects.toThrow(ValidationError);
  });
});

// ═══════════════════════════════════════════════════════════════
// Defer action: stays pending, deferred_at set, defer_count incremented
// ═══════════════════════════════════════════════════════════════
describe('ReviewService.defer', () => {
  it('stays pending, deferred_at set, defer_count incremented', async () => {
    const id = await insertCodeChange();
    const result = await ReviewService.defer(db, id);

    expect(result.status).toBe('pending');
    expect(result.deferredAt).toBeDefined();
    expect(result.deferCount).toBe(1);

    // Defer again
    const result2 = await ReviewService.defer(db, id);
    expect(result2.deferCount).toBe(2);
    expect(result2.status).toBe('pending');
  });

  it('cannot defer non-pending item', async () => {
    const id = await insertCodeChange({ status: 'reviewed' });
    await expect(ReviewService.defer(db, id)).rejects.toThrow(ValidationError);
  });
});

// ═══════════════════════════════════════════════════════════════
// Communicate: flagged → communicated
// ═══════════════════════════════════════════════════════════════
describe('ReviewService.communicate', () => {
  it('flagged → communicated', async () => {
    const id = await insertCodeChange({ status: 'flagged', flaggedAt: new Date().toISOString(), flagReason: 'issue' });
    const result = await ReviewService.communicate(db, id);

    expect(result.status).toBe('communicated');
    expect(result.communicatedAt).toBeDefined();
  });

  it('pending → communicated → throws ValidationError', async () => {
    const id = await insertCodeChange();
    await expect(ReviewService.communicate(db, id)).rejects.toThrow(ValidationError);
  });
});

// ═══════════════════════════════════════════════════════════════
// Resolve: communicated → resolved
// ═══════════════════════════════════════════════════════════════
describe('ReviewService.resolve', () => {
  it('communicated → resolved', async () => {
    const id = await insertCodeChange({ status: 'communicated' });
    const result = await ReviewService.resolve(db, id);

    expect(result.status).toBe('resolved');
    expect(result.resolvedAt).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Unflag: flagged → reviewed
// ═══════════════════════════════════════════════════════════════
describe('ReviewService.unflagReview', () => {
  it('flagged → reviewed', async () => {
    const id = await insertCodeChange({ status: 'flagged', flaggedAt: new Date().toISOString(), flagReason: 'test' });
    const result = await ReviewService.unflagReview(db, id, 'Actually fine');

    expect(result.status).toBe('reviewed');
    expect(result.reviewedAt).toBeDefined();
    expect(result.reviewNotes).toBe('Actually fine');
  });

  it('communicated → reviewed', async () => {
    const id = await insertCodeChange({ status: 'communicated' });
    const result = await ReviewService.unflagReview(db, id);

    expect(result.status).toBe('reviewed');
    expect(result.reviewedAt).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Invalid transition → 400
// ═══════════════════════════════════════════════════════════════
describe('Invalid transitions', () => {
  it('pending → resolved → throws ValidationError', async () => {
    const id = await insertCodeChange();
    await expect(ReviewService.resolve(db, id)).rejects.toThrow(ValidationError);
  });

  it('pending → communicated → throws ValidationError', async () => {
    const id = await insertCodeChange();
    await expect(ReviewService.communicate(db, id)).rejects.toThrow(ValidationError);
  });

  it('resolved → reviewed → throws ValidationError', async () => {
    const id = await insertCodeChange({ status: 'resolved' });
    await expect(ReviewService.review(db, id)).rejects.toThrow(ValidationError);
  });

  it('non-existent ID → throws NotFoundError', async () => {
    await expect(ReviewService.review(db, 'nonexistent')).rejects.toThrow(NotFoundError);
  });
});

// ═══════════════════════════════════════════════════════════════
// Batch action: review 3 items → all become reviewed
// ═══════════════════════════════════════════════════════════════
describe('ReviewService.batchAction', () => {
  it('batch review 3 items → all become reviewed', async () => {
    const id1 = await insertCodeChange();
    const id2 = await insertCodeChange();
    const id3 = await insertCodeChange();

    const results = await ReviewService.batchAction(db, {
      ids: [id1, id2, id3],
      action: 'review',
      notes: 'Batch approved',
    });

    expect(results.length).toBe(3);
    for (const r of results) {
      expect(r.status).toBe('reviewed');
      expect(r.reviewNotes).toBe('Batch approved');
    }

    // Verify in DB
    for (const id of [id1, id2, id3]) {
      const row = await db.select().from(schema.codeChange).where(eq(schema.codeChange.id,id)).get();
      expect(row!.status).toBe('reviewed');
    }
  });

  it('batch with invalid item → 400, none changed (atomicity)', async () => {
    const id1 = await insertCodeChange();
    const id2 = await insertCodeChange({ status: 'resolved' }); // Cannot be reviewed

    await expect(
      ReviewService.batchAction(db, {
        ids: [id1, id2],
        action: 'review',
      }),
    ).rejects.toThrow(ValidationError);

    // id1 should still be pending (transaction rolled back at validation phase)
    const row = await db.select().from(schema.codeChange).where(eq(schema.codeChange.id,id1)).get();
    expect(row!.status).toBe('pending');
  });

  it('batch with non-existent ID → throws NotFoundError, none changed', async () => {
    const id1 = await insertCodeChange();

    await expect(
      ReviewService.batchAction(db, {
        ids: [id1, 'nonexistent'],
        action: 'review',
      }),
    ).rejects.toThrow(NotFoundError);

    // id1 should still be pending
    const row = await db.select().from(schema.codeChange).where(eq(schema.codeChange.id,id1)).get();
    expect(row!.status).toBe('pending');
  });

  it('batch flag with reason', async () => {
    const id1 = await insertCodeChange();
    const id2 = await insertCodeChange();

    const results = await ReviewService.batchAction(db, {
      ids: [id1, id2],
      action: 'flag',
      flagReason: 'Both need review',
    });

    expect(results.length).toBe(2);
    for (const r of results) {
      expect(r.status).toBe('flagged');
      expect(r.flagReason).toBe('Both need review');
    }
  });

  it('batch defer', async () => {
    const id1 = await insertCodeChange();
    const id2 = await insertCodeChange();

    const results = await ReviewService.batchAction(db, {
      ids: [id1, id2],
      action: 'defer',
    });

    expect(results.length).toBe(2);
    for (const r of results) {
      expect(r.status).toBe('pending');
      expect(r.deferCount).toBe(1);
    }
  });

  it('batch flag without reason → throws ValidationError', async () => {
    const id1 = await insertCodeChange();
    await expect(
      ReviewService.batchAction(db, {
        ids: [id1],
        action: 'flag',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('batch with empty ids → throws ValidationError', async () => {
    await expect(
      ReviewService.batchAction(db, {
        ids: [],
        action: 'review',
      }),
    ).rejects.toThrow(ValidationError);
  });
});

// ═══════════════════════════════════════════════════════════════
// Resolution hints
// ═══════════════════════════════════════════════════════════════
describe('ReviewService.getResolutionHint', () => {
  it('flag item, add newer commit same branch → hint returned', async () => {
    const flaggedAt = '2026-01-15T10:00:00.000Z';
    const flaggedId = await insertCodeChange({
      status: 'flagged',
      branch: 'feature-x',
      flaggedAt,
      flagReason: 'buggy',
      authoredAt: '2026-01-14T10:00:00.000Z',
    });

    // Insert a newer commit on same branch after flag date
    await insertCodeChange({
      branch: 'feature-x',
      authoredAt: '2026-01-16T10:00:00.000Z', // after flaggedAt
    });

    const change = await db.select().from(schema.codeChange).where(eq(schema.codeChange.id,flaggedId)).get();
    const hint = await ReviewService.getResolutionHint(db, change!);

    expect(hint).toBe(true);
  });

  it('flag item with no newer commits → no hint', async () => {
    const flaggedAt = '2026-03-15T10:00:00.000Z';
    const flaggedId = await insertCodeChange({
      status: 'flagged',
      branch: 'feature-solo',
      flaggedAt,
      flagReason: 'needs fix',
      authoredAt: '2026-03-14T10:00:00.000Z',
    });

    const change = await db.select().from(schema.codeChange).where(eq(schema.codeChange.id,flaggedId)).get();
    const hint = await ReviewService.getResolutionHint(db, change!);

    expect(hint).toBe(false);
  });

  it('flag item with no branch → no hint', async () => {
    const flaggedId = await insertCodeChange({
      status: 'flagged',
      branch: null,
      flaggedAt: '2026-01-15T10:00:00.000Z',
      flagReason: 'orphan',
    });

    const change = await db.select().from(schema.codeChange).where(eq(schema.codeChange.id,flaggedId)).get();
    const hint = await ReviewService.getResolutionHint(db, change!);

    expect(hint).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// History filters
// ═══════════════════════════════════════════════════════════════
describe('ReviewService.getHistory', () => {
  let historyProjectId: string;

  beforeAll(async () => {
    const hp = await ProjectService.create(db, { name: 'History Test Project' });
    historyProjectId = hp.id;

    // Create a second repo for this project
    const histRepoId = ulid();
    await db.insert(schema.repository).values({
      id: histRepoId,
      projectId: historyProjectId,
      type: 'local',
      localPath: '/tmp/fake-repo-hist',
      createdAt: new Date().toISOString(),
    });

    // Insert reviewed items with specific dates
    const now = new Date().toISOString();
    for (const [status, authoredAt] of [
      ['reviewed', '2026-02-01T10:00:00.000Z'],
      ['reviewed', '2026-02-15T10:00:00.000Z'],
      ['flagged', '2026-03-01T10:00:00.000Z'],
      ['communicated', '2026-03-10T10:00:00.000Z'],
      ['resolved', '2026-03-15T10:00:00.000Z'],
    ] as const) {
      const id = ulid();
      await db.insert(schema.codeChange).values({
        id,
        projectId: historyProjectId,
        repoId: histRepoId,
        type: 'commit',
        platformId: `hist-${id}`,
        branch: 'main',
        title: `History commit ${status}`,
        body: null,
        authorMemberId: memberId,
        authorRaw: 'test@example.com',
        authorName: 'Test User',
        linesAdded: 5,
        linesDeleted: 1,
        filesChanged: 1,
        authoredAt,
        fetchedAt: now,
        status,
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  it('returns non-pending items', async () => {
    const result = await ReviewService.getHistory(db, { projectId: historyProjectId });
    expect(result.items.length).toBe(5);
    for (const item of result.items) {
      expect(item.status).not.toBe('pending');
    }
  });

  it('filters by date range', async () => {
    const result = await ReviewService.getHistory(db, {
      projectId: historyProjectId,
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-31T23:59:59.999Z',
    });

    expect(result.items.length).toBe(3);
    for (const item of result.items) {
      expect(item.authoredAt >= '2026-03-01T00:00:00.000Z').toBe(true);
      expect(item.authoredAt <= '2026-03-31T23:59:59.999Z').toBe(true);
    }
  });

  it('filters by status', async () => {
    const result = await ReviewService.getHistory(db, {
      projectId: historyProjectId,
      status: 'reviewed',
    });

    expect(result.items.length).toBe(2);
    for (const item of result.items) {
      expect(item.status).toBe('reviewed');
    }
  });

  it('filters by member', async () => {
    const result = await ReviewService.getHistory(db, {
      projectId: historyProjectId,
      memberId,
    });

    expect(result.items.length).toBe(5);
  });

  it('respects limit and offset', async () => {
    const result = await ReviewService.getHistory(db, {
      projectId: historyProjectId,
      limit: 2,
      offset: 0,
    });

    expect(result.items.length).toBe(2);
    expect(result.total).toBe(5);
    expect(result.limit).toBe(2);
    expect(result.offset).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// getPendingQueue
// ═══════════════════════════════════════════════════════════════
describe('ReviewService.getPendingQueue', () => {
  it('returns only pending items sorted by authored_at ASC', async () => {
    // Insert items with specific authored_at times
    const older = await insertCodeChange({ authoredAt: '2026-01-01T00:00:00.000Z' });
    const newer = await insertCodeChange({ authoredAt: '2026-01-02T00:00:00.000Z' });

    const result = await ReviewService.getPendingQueue(db, { projectId });
    expect(result.items.length).toBeGreaterThanOrEqual(2);

    // All items should be pending
    for (const item of result.items) {
      expect(item.status).toBe('pending');
    }

    // Check order: older should come before newer
    const olderIdx = result.items.findIndex(i => i.id === older);
    const newerIdx = result.items.findIndex(i => i.id === newer);
    if (olderIdx !== -1 && newerIdx !== -1) {
      expect(olderIdx).toBeLessThan(newerIdx);
    }
  });

  it('filters by projectId', async () => {
    const result = await ReviewService.getPendingQueue(db, { projectId });
    for (const item of result.items) {
      expect(item.projectId).toBe(projectId);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// getById with resolution hint
// ═══════════════════════════════════════════════════════════════
describe('ReviewService.getById', () => {
  it('returns code change with resolutionHint for flagged items', async () => {
    const flaggedId = await insertCodeChange({
      status: 'flagged',
      branch: 'hint-branch',
      flaggedAt: '2026-01-10T10:00:00.000Z',
      flagReason: 'test hint',
      authoredAt: '2026-01-09T10:00:00.000Z',
    });

    // Add newer commit on same branch
    await insertCodeChange({
      branch: 'hint-branch',
      authoredAt: '2026-01-11T10:00:00.000Z',
    });

    const result = await ReviewService.getById(db, flaggedId);
    expect(result.resolutionHint).toBe(true);
  });

  it('throws NotFoundError for non-existent ID', async () => {
    await expect(ReviewService.getById(db, 'nonexistent')).rejects.toThrow(NotFoundError);
  });
});
