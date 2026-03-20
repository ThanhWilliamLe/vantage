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

beforeAll(async () => {
  const testDb = createTestDatabase();
  sqlite = testDb.sqlite;
  db = testDb.db;
  const key = randomBytes(32);
  app = buildApp({ db: testDb.db, key });
  await app.ready();

  // Set up test data
  const project = await ProjectService.create(db, { name: 'M7 Route Test Project' });
  projectId = project.id;

  const member = await MemberService.create(db, { name: 'M7RouteTester' });
  memberId = member.id;

  repoId = ulid();
  const now = new Date().toISOString();
  await db.insert(schema.repository).values({
    id: repoId,
    projectId,
    type: 'local',
    localPath: '/tmp/fake-m7-repo',
    createdAt: now,
  });

  // Insert code changes for search and workload tests
  for (const [title, authoredAt] of [
    ['Fix login bug', '2026-03-15T10:00:00.000Z'],
    ['Add dashboard widget', '2026-03-15T14:00:00.000Z'],
    ['Refactor API layer', '2026-03-16T10:00:00.000Z'],
  ]) {
    await db.insert(schema.codeChange).values({
      id: ulid(),
      projectId,
      repoId,
      type: 'commit',
      platformId: `m7route-${ulid()}`,
      branch: 'main',
      title: title as string,
      body: null,
      authorMemberId: memberId,
      authorRaw: 'test@example.com',
      authorName: 'Test User',
      linesAdded: 15,
      linesDeleted: 5,
      filesChanged: 3,
      authoredAt: authoredAt as string,
      fetchedAt: now,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  }
});

afterAll(async () => {
  AuthService._clearSessions();
  await app.close();
  sqlite.close();
});

// ═══════════════════════════════════════════════════════════════
// Evaluation CRUD routes
// ═══════════════════════════════════════════════════════════════
describe('POST /api/evaluations', () => {
  it('creates a daily evaluation → 200', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/evaluations',
      payload: {
        type: 'daily',
        memberId,
        date: '2026-03-15',
        projectIds: [projectId],
        description: 'Route test daily entry',
        workloadScore: 6,
        notes: 'Test notes',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.type).toBe('daily');
    expect(body.description).toBe('Route test daily entry');
  });

  it('creates a quarterly evaluation → 200', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/evaluations',
      payload: {
        type: 'quarterly',
        memberId,
        quarter: '2026-Q1',
        projectIds: [projectId],
        description: 'Route test quarterly',
        workloadScore: 7,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.type).toBe('quarterly');
    expect(body.quarter).toBe('2026-Q1');
  });

  it('missing memberId → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/evaluations',
      payload: {
        type: 'daily',
        memberId: '',
        date: '2026-03-15',
        projectIds: [projectId],
      },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/evaluations', () => {
  it('lists evaluations → 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/evaluations',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it('filters by type', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/evaluations?type=daily',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    for (const item of body.items) {
      expect(item.type).toBe('daily');
    }
  });
});

describe('GET /api/evaluations/:id', () => {
  it('returns evaluation by ID → 200', async () => {
    // Create one first
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/evaluations',
      payload: {
        type: 'daily',
        memberId,
        date: '2026-03-17',
        projectIds: [projectId],
        description: 'Get by ID test',
      },
    });
    const created = createRes.json();

    const res = await app.inject({
      method: 'GET',
      url: `/api/evaluations/${created.id}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(created.id);
  });

  it('non-existent ID → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/evaluations/nonexistent',
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /api/evaluations/:id', () => {
  it('updates evaluation → 200', async () => {
    // Create one first
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/evaluations',
      payload: {
        type: 'daily',
        memberId,
        date: '2026-03-18',
        projectIds: [projectId],
        description: 'Before update',
      },
    });
    const created = createRes.json();

    const res = await app.inject({
      method: 'PUT',
      url: `/api/evaluations/${created.id}`,
      payload: {
        description: 'After update',
        workloadScore: 9,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().description).toBe('After update');
    expect(res.json().workloadScore).toBe(9);
  });
});

describe('DELETE /api/evaluations/:id', () => {
  it('deletes evaluation → 204', async () => {
    // Create one first
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/evaluations',
      payload: {
        type: 'daily',
        memberId,
        date: '2026-03-19',
        projectIds: [projectId],
      },
    });
    const created = createRes.json();

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/evaluations/${created.id}`,
    });

    expect(res.statusCode).toBe(204);

    // Verify deleted
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/evaluations/${created.id}`,
    });
    expect(getRes.statusCode).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════
// AI stub routes
// ═══════════════════════════════════════════════════════════════
describe('GET /api/evaluations/daily-prefill', () => {
  it('returns empty stub → 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/evaluations/daily-prefill?date=2026-03-15&memberId=test',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.description).toBe('');
    expect(body.workloadScore).toBeNull();
  });
});

describe('GET /api/evaluations/quarterly-synthesis', () => {
  it('returns empty stub → 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/evaluations/quarterly-synthesis?quarter=2026-Q1&memberId=test',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.description).toBe('');
    expect(body.insights).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Export endpoint
// ═══════════════════════════════════════════════════════════════
describe('GET /api/evaluations/export', () => {
  it('returns CSV with correct content-type → 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/evaluations/export',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('evaluations.csv');

    // Check BOM
    const body = res.body;
    expect(body.charCodeAt(0)).toBe(0xFEFF);
  });
});

// ═══════════════════════════════════════════════════════════════
// Search endpoint
// ═══════════════════════════════════════════════════════════════
describe('GET /api/search', () => {
  it('returns search results → 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=login',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.changes).toBeDefined();
    expect(body.evaluations).toBeDefined();
    expect(body.changes.length).toBeGreaterThanOrEqual(1);
  });

  it('missing query → 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search',
    });

    expect(res.statusCode).toBe(400);
  });

  it('scoped search → only returns that scope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=login&scope=changes',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.evaluations.length).toBe(0);
  });
});

describe('GET /api/members/search', () => {
  it('finds member by name → 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/members/search?q=M7Route',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('empty query → empty array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/members/search?q=',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});

describe('GET /api/projects/search', () => {
  it('finds project by name → 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects/search?q=M7%20Route',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Workload endpoint
// ═══════════════════════════════════════════════════════════════
describe('GET /api/workload', () => {
  it('returns aggregated workload data → 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/workload?startDate=2026-03-01T00:00:00.000Z&endDate=2026-03-31T23:59:59.999Z',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.byMember).toBeDefined();
    expect(body.byProject).toBeDefined();
    expect(Array.isArray(body.byMember)).toBe(true);
    expect(Array.isArray(body.byProject)).toBe(true);

    // Should have data from our test commits
    expect(body.byMember.length).toBeGreaterThanOrEqual(1);
    expect(body.byProject.length).toBeGreaterThanOrEqual(1);

    // Verify aggregation fields
    const memberEntry = body.byMember[0];
    expect(memberEntry.commitCount).toBeGreaterThanOrEqual(1);
    expect(memberEntry.linesAdded).toBeGreaterThanOrEqual(1);
  });

  it('missing dates → 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/workload',
    });

    expect(res.statusCode).toBe(400);
  });

  it('date range with no data → empty arrays', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/workload?startDate=2020-01-01T00:00:00.000Z&endDate=2020-01-31T23:59:59.999Z',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.byMember).toEqual([]);
    expect(body.byProject).toEqual([]);
  });
});
