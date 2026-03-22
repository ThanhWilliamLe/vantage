import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { buildApp } from '../app.js';
import { createTestDatabase } from '../data/test-helpers.js';
import { ProjectService } from '../services/project-service.js';
import { MemberService } from '../services/member-service.js';
import * as schema from '../data/schema.js';

const { db, sqlite } = createTestDatabase();
const app = buildApp({ db, key: Buffer.alloc(32) });

let projectId: string;
let memberId: string;

beforeAll(async () => {
  await app.ready();

  const project = await ProjectService.create(db, { name: 'Chart Route Test' });
  projectId = project.id;

  const member = await MemberService.create(db, { name: 'RouteTestMember' });
  memberId = member.id;

  const repoId = ulid();
  const now = new Date().toISOString();
  await db.insert(schema.repository).values({
    id: repoId,
    projectId,
    type: 'local',
    localPath: '/tmp/fake-route-repo',
    createdAt: now,
  });

  // Seed 3 commits for the member
  for (let i = 0; i < 3; i++) {
    await db.insert(schema.codeChange).values({
      id: ulid(),
      projectId,
      repoId,
      type: 'commit',
      platformId: `route-test-${i}`,
      title: `Route commit ${i}`,
      authorMemberId: memberId,
      authorRaw: 'route@test.com',
      authorName: 'Route Test',
      authoredAt: `2026-03-10T0${i}:00:00Z`,
      fetchedAt: now,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  }
});

afterAll(async () => {
  await app.close();
  sqlite.close();
});

describe('GET /api/workload/charts/bar', () => {
  it('returns 200 with bar chart data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/workload/charts/bar?startDate=2026-03-01&endDate=2026-03-31',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.startDate).toBe('2026-03-01');
    expect(body.endDate).toBe('2026-03-31');
    expect(body.data).toHaveLength(1);
    expect(body.data[0].commits).toBe(3);
    expect(body.data[0].memberName).toBe('RouteTestMember');
  });

  it('returns 400 when startDate is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/workload/charts/bar?endDate=2026-03-31',
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid date format', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/workload/charts/bar?startDate=not-a-date&endDate=2026-03-31',
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns empty data for out-of-range dates', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/workload/charts/bar?startDate=2030-01-01&endDate=2030-12-31',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toEqual([]);
  });
});

describe('GET /api/workload/charts/trend', () => {
  it('returns 200 with trend data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/workload/charts/trend?startDate=2026-03-01&endDate=2026-03-31',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0]).toHaveProperty('weekBucket');
    expect(body.data[0]).toHaveProperty('weekStart');
    expect(body.data[0]).toHaveProperty('commits');
  });

  it('accepts memberId filter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/workload/charts/trend?startDate=2026-03-01&endDate=2026-03-31&memberId=${memberId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.memberId).toBe(memberId);
  });

  it('returns 400 when endDate is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/workload/charts/trend?startDate=2026-03-01',
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/workload/charts/heatmap', () => {
  it('returns 200 with heatmap data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/workload/charts/heatmap?startDate=2026-03-01&endDate=2026-03-31',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('members');
    expect(body).toHaveProperty('projects');
    expect(body).toHaveProperty('cells');
    expect(body).toHaveProperty('maxCommits');
    expect(body.members.length).toBeGreaterThanOrEqual(1);
    expect(body.cells.length).toBeGreaterThanOrEqual(1);
    expect(body.maxCommits).toBeGreaterThan(0);
  });

  it('returns 400 when dates are missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/workload/charts/heatmap',
    });

    expect(res.statusCode).toBe(400);
  });
});
