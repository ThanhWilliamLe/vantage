import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { ulid } from 'ulid';
import { createTestDatabase } from '../data/test-helpers.js';
import { buildApp } from '../app.js';
import { ProjectService } from '../services/project-service.js';
import { MemberService } from '../services/member-service.js';
import { AuthService } from '../services/auth-service.js';
import * as schema from '../data/schema.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let sqlite: ReturnType<typeof createTestDatabase>['sqlite'];
let db: ReturnType<typeof createTestDatabase>['db'];
let projectId: string;
let repoId: string;
let memberId: string;

// Helper to insert a code_change for testing
async function insertCodeChange(overrides: Partial<{
  id: string;
  status: string;
  branch: string;
  authoredAt: string;
  flaggedAt: string;
  flagReason: string;
  deferCount: number;
  projectId: string;
}> = {}) {
  const id = overrides.id || ulid();
  const now = new Date().toISOString();
  await db.insert(schema.codeChange).values({
    id,
    projectId: overrides.projectId || projectId,
    repoId,
    type: 'commit',
    platformId: `route-hash-${id}`,
    branch: overrides.branch ?? 'main',
    title: `Route test commit ${id}`,
    body: null,
    authorMemberId: memberId,
    authorRaw: 'route-test@example.com',
    authorName: 'Route Test User',
    linesAdded: 5,
    linesDeleted: 1,
    filesChanged: 1,
    authoredAt: overrides.authoredAt || now,
    fetchedAt: now,
    status: overrides.status || 'pending',
    createdAt: now,
    updatedAt: now,
    flaggedAt: overrides.flaggedAt || null,
    flagReason: overrides.flagReason || null,
    deferCount: overrides.deferCount ?? 0,
  });
  return id;
}

beforeAll(async () => {
  const testDb = createTestDatabase();
  sqlite = testDb.sqlite;
  db = testDb.db;
  const key = randomBytes(32);
  app = buildApp({ db: testDb.db, key });
  await app.ready();

  // Set up test data
  const project = await ProjectService.create(db, { name: 'Review Route Test' });
  projectId = project.id;

  const member = await MemberService.create(db, { name: 'RouteReviewTester' });
  memberId = member.id;

  repoId = ulid();
  const now = new Date().toISOString();
  await db.insert(schema.repository).values({
    id: repoId,
    projectId,
    type: 'local',
    localPath: '/tmp/fake-review-repo',
    createdAt: now,
  });
});

afterAll(async () => {
  AuthService._clearSessions();
  await app.close();
  sqlite.close();
});

// ═══════════════════════════════════════════════════════════════
// POST /api/code-changes/:id/review
// ═══════════════════════════════════════════════════════════════
describe('POST /api/code-changes/:id/review', () => {
  it('→ 200 with reviewed status', async () => {
    const id = await insertCodeChange();

    const res = await app.inject({
      method: 'POST',
      url: `/api/code-changes/${id}/review`,
      payload: { notes: 'Approved' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('reviewed');
    expect(body.reviewedAt).toBeDefined();
    expect(body.reviewNotes).toBe('Approved');
  });

  it('non-existent ID → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/code-changes/nonexistent/review',
      payload: {},
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('invalid transition (resolved → reviewed) → 400', async () => {
    const id = await insertCodeChange({ status: 'resolved' });

    const res = await app.inject({
      method: 'POST',
      url: `/api/code-changes/${id}/review`,
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/code-changes/:id/flag
// ═══════════════════════════════════════════════════════════════
describe('POST /api/code-changes/:id/flag', () => {
  it('→ 200 with flagged status', async () => {
    const id = await insertCodeChange();

    const res = await app.inject({
      method: 'POST',
      url: `/api/code-changes/${id}/flag`,
      payload: { reason: 'Needs attention' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('flagged');
    expect(body.flaggedAt).toBeDefined();
    expect(body.flagReason).toBe('Needs attention');
  });

  it('without reason → 400', async () => {
    const id = await insertCodeChange();

    const res = await app.inject({
      method: 'POST',
      url: `/api/code-changes/${id}/flag`,
      payload: { reason: '' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/code-changes/:id/defer
// ═══════════════════════════════════════════════════════════════
describe('POST /api/code-changes/:id/defer', () => {
  it('→ 200 with deferred_at set and defer_count incremented', async () => {
    const id = await insertCodeChange();

    const res = await app.inject({
      method: 'POST',
      url: `/api/code-changes/${id}/defer`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('pending'); // stays pending
    expect(body.deferredAt).toBeDefined();
    expect(body.deferCount).toBe(1);
  });

  it('non-pending item → 400', async () => {
    const id = await insertCodeChange({ status: 'reviewed' });

    const res = await app.inject({
      method: 'POST',
      url: `/api/code-changes/${id}/defer`,
    });

    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/code-changes/:id/communicate
// ═══════════════════════════════════════════════════════════════
describe('POST /api/code-changes/:id/communicate', () => {
  it('flagged → communicated → 200', async () => {
    const id = await insertCodeChange({ status: 'flagged', flaggedAt: new Date().toISOString(), flagReason: 'issue' });

    const res = await app.inject({
      method: 'POST',
      url: `/api/code-changes/${id}/communicate`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('communicated');
    expect(body.communicatedAt).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/code-changes/:id/resolve
// ═══════════════════════════════════════════════════════════════
describe('POST /api/code-changes/:id/resolve', () => {
  it('communicated → resolved → 200', async () => {
    const id = await insertCodeChange({ status: 'communicated' });

    const res = await app.inject({
      method: 'POST',
      url: `/api/code-changes/${id}/resolve`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('resolved');
    expect(body.resolvedAt).toBeDefined();
  });

  it('pending → resolved → 400', async () => {
    const id = await insertCodeChange();

    const res = await app.inject({
      method: 'POST',
      url: `/api/code-changes/${id}/resolve`,
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/code-changes/batch-action
// ═══════════════════════════════════════════════════════════════
describe('POST /api/code-changes/batch-action', () => {
  it('batch review → 200 with all reviewed', async () => {
    const id1 = await insertCodeChange();
    const id2 = await insertCodeChange();
    const id3 = await insertCodeChange();

    const res = await app.inject({
      method: 'POST',
      url: '/api/code-changes/batch-action',
      payload: {
        ids: [id1, id2, id3],
        action: 'review',
        notes: 'All good',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBe(3);
    for (const item of body.items) {
      expect(item.status).toBe('reviewed');
    }
  });

  it('batch with non-existent ID → 400/404, none changed', async () => {
    const id1 = await insertCodeChange();

    const res = await app.inject({
      method: 'POST',
      url: '/api/code-changes/batch-action',
      payload: {
        ids: [id1, 'nonexistent-batch-id'],
        action: 'review',
      },
    });

    // Should fail (404 from NotFoundError)
    expect(res.statusCode).toBe(404);

    // id1 should still be pending
    const checkRes = await app.inject({
      method: 'GET',
      url: `/api/code-changes/${id1}`,
    });
    expect(checkRes.json().status).toBe('pending');
  });

  it('batch with invalid transition → 400, none changed', async () => {
    const id1 = await insertCodeChange();
    const id2 = await insertCodeChange({ status: 'resolved' }); // Cannot be reviewed

    const res = await app.inject({
      method: 'POST',
      url: '/api/code-changes/batch-action',
      payload: {
        ids: [id1, id2],
        action: 'review',
      },
    });

    expect(res.statusCode).toBe(400);

    // id1 should still be pending (atomicity)
    const checkRes = await app.inject({
      method: 'GET',
      url: `/api/code-changes/${id1}`,
    });
    expect(checkRes.json().status).toBe('pending');
  });

  it('batch flag with reason → 200', async () => {
    const id1 = await insertCodeChange();
    const id2 = await insertCodeChange();

    const res = await app.inject({
      method: 'POST',
      url: '/api/code-changes/batch-action',
      payload: {
        ids: [id1, id2],
        action: 'flag',
        flagReason: 'Both suspicious',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBe(2);
    for (const item of body.items) {
      expect(item.status).toBe('flagged');
      expect(item.flagReason).toBe('Both suspicious');
    }
  });

  it('batch defer → 200', async () => {
    const id1 = await insertCodeChange();
    const id2 = await insertCodeChange();

    const res = await app.inject({
      method: 'POST',
      url: '/api/code-changes/batch-action',
      payload: {
        ids: [id1, id2],
        action: 'defer',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBe(2);
    for (const item of body.items) {
      expect(item.status).toBe('pending');
      expect(item.deferCount).toBe(1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /api/code-changes/history
// ═══════════════════════════════════════════════════════════════
describe('GET /api/code-changes/history', () => {
  beforeAll(async () => {
    // Insert some reviewed items with specific dates for history tests
    for (const [status, authoredAt] of [
      ['reviewed', '2026-02-01T10:00:00.000Z'],
      ['reviewed', '2026-02-15T10:00:00.000Z'],
      ['flagged', '2026-03-01T10:00:00.000Z'],
    ] as const) {
      await insertCodeChange({ status, authoredAt });
    }
  });

  it('→ 200 with correct filtering', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/code-changes/history',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.total).toBeDefined();

    // All items should be non-pending
    for (const item of body.items) {
      expect(item.status).not.toBe('pending');
    }
  });

  it('filters by status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/code-changes/history?status=reviewed',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    for (const item of body.items) {
      expect(item.status).toBe('reviewed');
    }
  });

  it('filters by date range', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/code-changes/history?startDate=2026-02-01T00:00:00.000Z&endDate=2026-02-28T23:59:59.999Z',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    for (const item of body.items) {
      expect(item.authoredAt >= '2026-02-01T00:00:00.000Z').toBe(true);
      expect(item.authoredAt <= '2026-02-28T23:59:59.999Z').toBe(true);
    }
  });

  it('respects limit and offset', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/code-changes/history?limit=2&offset=0',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeLessThanOrEqual(2);
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(0);
  });
});
