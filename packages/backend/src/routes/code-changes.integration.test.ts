import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createTestDatabase, createTestRepo } from '../data/test-helpers.js';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';
import { AuthService } from '../services/auth-service.js';
import { ProjectService } from '../services/project-service.js';
import { ScanService } from '../services/scan-service.js';
import { ulid } from 'ulid';
import * as schema from '../data/schema.js';

let app: FastifyInstance;
let sqlite: ReturnType<typeof createTestDatabase>['sqlite'];
let db: ReturnType<typeof createTestDatabase>['db'];
let projectId: string;
let repoId: string;
let repoPath: string;
let codeChangeId: string;

beforeAll(async () => {
  const testDb = createTestDatabase();
  sqlite = testDb.sqlite;
  db = testDb.db;
  const key = randomBytes(32);
  app = buildApp({ db: testDb.db, key });
  await app.ready();

  // Set up test data: project + repo + scan
  const project = await ProjectService.create(db, { name: 'Code Changes Route Test' });
  projectId = project.id;

  repoPath = createTestRepo([
    {
      message: 'Initial commit for route test',
      files: { 'README.md': '# Route Test\n' },
    },
    {
      message: 'Add main module',
      files: { 'src/main.ts': 'console.log("hello");\n' },
    },
  ]);

  repoId = ulid();
  const now = new Date().toISOString();
  await db.insert(schema.repository).values({
    id: repoId,
    projectId,
    type: 'local',
    localPath: repoPath,
    createdAt: now,
  });

  // Scan the repo to populate code_changes
  await ScanService.scanRepository(db, { id: repoId, projectId, localPath: repoPath });

  // Get the first code_change for subsequent tests
  const changes = await db.select().from(schema.codeChange).all();
  expect(changes.length).toBeGreaterThanOrEqual(1);
  codeChangeId = changes[0].id;
});

afterAll(async () => {
  AuthService._clearSessions();
  await app.close();
  sqlite.close();
});

describe('Code change routes', () => {
  it('GET /api/code-changes → returns list with pagination', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/code-changes',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    expect(body.total).toBeGreaterThanOrEqual(2);
    expect(body.limit).toBeDefined();
    expect(body.offset).toBeDefined();
  });

  it('GET /api/code-changes with projectId filter → returns filtered list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/code-changes?projectId=${projectId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    // All items should belong to the project
    for (const item of body.items) {
      expect(item.projectId).toBe(projectId);
    }
  });

  it('GET /api/code-changes with status filter → returns filtered list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/code-changes?status=pending',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    for (const item of body.items) {
      expect(item.status).toBe('pending');
    }
  });

  it('GET /api/code-changes with limit and offset → respects pagination', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/code-changes?limit=1&offset=0',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBe(1);
    expect(body.limit).toBe(1);
    expect(body.offset).toBe(0);
    expect(body.total).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/code-changes/:id → returns detail with taskIds', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/code-changes/${codeChangeId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(codeChangeId);
    expect(body.type).toBe('commit');
    expect(body.projectId).toBe(projectId);
    expect(body.repoId).toBe(repoId);
    expect(body.taskIds).toBeDefined();
    expect(Array.isArray(body.taskIds)).toBe(true);
  });

  it('GET /api/code-changes/:id with non-existent ID → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/code-changes/nonexistent-id',
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('GET /api/code-changes/:id/diff → returns diff content', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/code-changes/${codeChangeId}/diff`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.diff).toBe('string');
    expect(typeof body.truncated).toBe('boolean');
    expect(body.truncated).toBe(false);
    // Diff should contain some content (from the commit)
    expect(body.diff.length).toBeGreaterThan(0);
  });

  it('GET /api/code-changes/:id/diff with non-existent ID → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/code-changes/nonexistent-id/diff',
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('Scan routes', () => {
  it('POST /api/scan → triggers scan and returns results', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scan',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.reposScanned).toBeDefined();
    expect(body.reposSkipped).toBeDefined();
    expect(body.reposFailed).toBeDefined();
    expect(body.totalNewCommits).toBeDefined();
    expect(Array.isArray(body.results)).toBe(true);
  });

  it('GET /api/scan/status → returns per-repo scan state', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/scan/status',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);

    const state = body.find((s: { repoId: string }) => s.repoId === repoId);
    expect(state).toBeDefined();
    expect(state.status).toBe('idle');
    expect(state.lastCommitHash).toBeDefined();
  });
});
