import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import { createTestDatabase } from '../data/test-helpers.js';
import { ProjectService } from '../services/project-service.js';
import { MemberService } from '../services/member-service.js';
import * as schema from '../data/schema.js';
import { ulid } from 'ulid';
import type { BackupExport } from '../services/backup-service.js';

const { db, sqlite } = createTestDatabase();
const app = buildApp({ db, key: Buffer.alloc(32) });

let projectId: string;
let memberId: string;
let repoId: string;

beforeAll(async () => {
  await app.ready();

  // Seed test data
  const project = await ProjectService.create(db, { name: 'BackupTest' });
  projectId = project.id;

  const member = await MemberService.create(db, { name: 'BackupMember' });
  memberId = member.id;

  repoId = ulid();
  await db.insert(schema.repository).values({
    id: repoId,
    projectId,
    type: 'local',
    localPath: '/tmp/backup-test',
    createdAt: new Date().toISOString(),
  });

  // Seed a code change
  const ccId = ulid();
  await db.insert(schema.codeChange).values({
    id: ccId,
    projectId,
    repoId,
    type: 'commit',
    platformId: 'abc123',
    title: 'test commit',
    authorRaw: 'test@test.com',
    authorMemberId: memberId,
    linesAdded: 10,
    linesDeleted: 5,
    filesChanged: 2,
    authoredAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    status: 'reviewed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Seed an evaluation entry
  await db.insert(schema.evaluationEntry).values({
    id: ulid(),
    memberId,
    type: 'daily',
    date: '2026-03-22',
    projectIds: JSON.stringify([projectId]),
    description: 'Good day',
    workloadScore: 6,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

afterAll(async () => {
  await app.close();
  sqlite.close();
});

describe('POST /api/backup/export', () => {
  it('returns a valid backup with all entity types', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/backup/export',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');

    const backup = JSON.parse(res.payload) as BackupExport;
    expect(backup.version).toBe('1.1.0');
    expect(backup.schemaVersion).toBe(1);
    expect(backup.createdAt).toBeTruthy();
    expect(backup.data.projects.length).toBeGreaterThanOrEqual(1);
    expect(backup.data.members.length).toBeGreaterThanOrEqual(1);
    expect(backup.data.codeChanges.length).toBeGreaterThanOrEqual(1);
    expect(backup.data.evaluationEntries.length).toBeGreaterThanOrEqual(1);
  });

  it('excludes sensitive fields from git credentials', async () => {
    // Add a credential
    await db.insert(schema.gitCredential).values({
      id: ulid(),
      name: 'TestCred',
      platform: 'github',
      tokenEncrypted: 'SECRET_TOKEN_DATA',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await app.inject({ method: 'POST', url: '/api/backup/export' });
    const backup = JSON.parse(res.payload) as BackupExport;

    for (const cred of backup.data.gitCredentials) {
      expect(cred).not.toHaveProperty('tokenEncrypted');
      expect(cred).not.toHaveProperty('token_encrypted');
      expect(cred).toHaveProperty('id');
      expect(cred).toHaveProperty('name');
      expect(cred).toHaveProperty('platform');
    }
  });
});

describe('POST /api/backup/validate', () => {
  it('validates a well-formed backup', async () => {
    // First export
    const exportRes = await app.inject({ method: 'POST', url: '/api/backup/export' });
    const backup = JSON.parse(exportRes.payload);

    const res = await app.inject({
      method: 'POST',
      url: '/api/backup/validate',
      payload: { backup, mode: 'replace' },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.payload);
    expect(result.compatible).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects newer version', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/backup/validate',
      payload: {
        backup: {
          version: '99.0.0',
          schemaVersion: 1,
          createdAt: new Date().toISOString(),
          data: {},
        },
        mode: 'replace',
      },
    });

    const result = JSON.parse(res.payload);
    expect(result.compatible).toBe(false);
    expect(result.errors.some((e: string) => e.includes('newer'))).toBe(true);
  });

  it('counts duplicates in merge mode', async () => {
    const exportRes = await app.inject({ method: 'POST', url: '/api/backup/export' });
    const backup = JSON.parse(exportRes.payload);

    const res = await app.inject({
      method: 'POST',
      url: '/api/backup/validate',
      payload: { backup, mode: 'merge' },
    });

    const result = JSON.parse(res.payload);
    expect(result.compatible).toBe(true);
    // All entities should show as duplicates since they already exist
    expect(result.duplicateCounts).toBeDefined();
    expect(result.duplicateCounts.projects).toBeGreaterThanOrEqual(1);
  });
});

describe('POST /api/backup/restore', () => {
  it('full-replace round-trip: export → restore → data matches', async () => {
    // Export
    const exportRes = await app.inject({ method: 'POST', url: '/api/backup/export' });
    const backup = JSON.parse(exportRes.payload);
    const originalProjectCount = backup.data.projects.length;

    // Restore (replace)
    const restoreRes = await app.inject({
      method: 'POST',
      url: '/api/backup/restore',
      payload: { backup, mode: 'replace' },
    });

    expect(restoreRes.statusCode).toBe(200);
    const result = JSON.parse(restoreRes.payload);
    expect(result.mode).toBe('replace');
    expect(result.inserted).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);

    // Verify data matches
    const projects = await db.select().from(schema.project).all();
    expect(projects.length).toBe(originalProjectCount);
  });

  it('merge mode skips existing entities', async () => {
    // Export
    const exportRes = await app.inject({ method: 'POST', url: '/api/backup/export' });
    const backup = JSON.parse(exportRes.payload);

    // Merge same data — should skip all
    const restoreRes = await app.inject({
      method: 'POST',
      url: '/api/backup/restore',
      payload: { backup, mode: 'merge' },
    });

    const result = JSON.parse(restoreRes.payload);
    expect(result.mode).toBe('merge');
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBeGreaterThan(0);
  });

  it('rejects invalid mode', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/backup/restore',
      payload: { backup: {}, mode: 'invalid' },
    });

    const result = JSON.parse(res.payload);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
