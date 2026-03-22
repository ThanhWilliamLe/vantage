import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDatabase } from '../data/test-helpers.js';
import { WorkloadChartService } from './workload-chart-service.js';
import { ProjectService } from './project-service.js';
import { MemberService } from './member-service.js';
import * as schema from '../data/schema.js';

const { db, sqlite } = createTestDatabase();

let projectAlpha: string;
let projectBeta: string;
let memberAlice: string;
let memberBob: string;
let repoId: string;

beforeAll(async () => {
  // Create projects
  const pA = await ProjectService.create(db, { name: 'Project Alpha' });
  projectAlpha = pA.id;
  const pB = await ProjectService.create(db, { name: 'Project Beta' });
  projectBeta = pB.id;

  // Create members
  const mAlice = await MemberService.create(db, { name: 'Alice' });
  memberAlice = mAlice.id;
  const mBob = await MemberService.create(db, { name: 'Bob' });
  memberBob = mBob.id;

  // Create a repo
  repoId = ulid();
  const now = new Date().toISOString();
  await db.insert(schema.repository).values({
    id: repoId,
    projectId: projectAlpha,
    type: 'local',
    localPath: '/tmp/fake-chart-repo',
    createdAt: now,
  });

  // Seed code_change data:
  // Alice: 3 commits on Alpha (week 10), 2 commits on Beta (week 10)
  // Bob: 1 commit on Alpha (week 10), 4 commits on Alpha (week 11)
  // Unmapped: 2 commits on Alpha (week 10) — no author_member_id

  const repoIdBeta = ulid();
  await db.insert(schema.repository).values({
    id: repoIdBeta,
    projectId: projectBeta,
    type: 'local',
    localPath: '/tmp/fake-chart-repo-beta',
    createdAt: now,
  });

  const seedCommits = [
    // Alice - Alpha - week 10 (March 2-6, 2026 is week 09; March 9-13 is week 10)
    {
      authorMemberId: memberAlice,
      projectId: projectAlpha,
      repoId,
      authoredAt: '2026-03-09T10:00:00Z',
    },
    {
      authorMemberId: memberAlice,
      projectId: projectAlpha,
      repoId,
      authoredAt: '2026-03-10T10:00:00Z',
    },
    {
      authorMemberId: memberAlice,
      projectId: projectAlpha,
      repoId,
      authoredAt: '2026-03-11T10:00:00Z',
    },
    // Alice - Beta - week 10
    {
      authorMemberId: memberAlice,
      projectId: projectBeta,
      repoId: repoIdBeta,
      authoredAt: '2026-03-09T14:00:00Z',
    },
    {
      authorMemberId: memberAlice,
      projectId: projectBeta,
      repoId: repoIdBeta,
      authoredAt: '2026-03-12T14:00:00Z',
    },
    // Bob - Alpha - week 10
    {
      authorMemberId: memberBob,
      projectId: projectAlpha,
      repoId,
      authoredAt: '2026-03-09T09:00:00Z',
    },
    // Bob - Alpha - week 11 (March 16-20)
    {
      authorMemberId: memberBob,
      projectId: projectAlpha,
      repoId,
      authoredAt: '2026-03-16T09:00:00Z',
    },
    {
      authorMemberId: memberBob,
      projectId: projectAlpha,
      repoId,
      authoredAt: '2026-03-17T09:00:00Z',
    },
    {
      authorMemberId: memberBob,
      projectId: projectAlpha,
      repoId,
      authoredAt: '2026-03-18T09:00:00Z',
    },
    {
      authorMemberId: memberBob,
      projectId: projectAlpha,
      repoId,
      authoredAt: '2026-03-19T09:00:00Z',
    },
    // Unmapped author - Alpha - week 10
    { authorMemberId: null, projectId: projectAlpha, repoId, authoredAt: '2026-03-10T08:00:00Z' },
    { authorMemberId: null, projectId: projectAlpha, repoId, authoredAt: '2026-03-11T08:00:00Z' },
  ];

  for (let i = 0; i < seedCommits.length; i++) {
    const c = seedCommits[i];
    await db.insert(schema.codeChange).values({
      id: ulid(),
      projectId: c.projectId,
      repoId: c.repoId,
      type: 'commit',
      platformId: `abc${i}def`,
      title: `Commit ${i}`,
      authorMemberId: c.authorMemberId,
      authorRaw: c.authorMemberId ? 'user@example.com' : 'unknown@example.com',
      authorName: c.authorMemberId ? 'User' : 'Unknown',
      authoredAt: c.authoredAt,
      fetchedAt: now,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  }
});

afterAll(() => {
  sqlite.close();
});

// ═══════════════════════════════════════════════════════════════
// Bar chart
// ═══════════════════════════════════════════════════════════════
describe('WorkloadChartService.getBarData', () => {
  it('returns correct member×project commit counts', async () => {
    const data = await WorkloadChartService.getBarData(db, '2026-03-01', '2026-03-31');

    // Alice: 3 Alpha + 2 Beta = 5 commits across 2 entries
    // Bob: 1 Alpha (wk10) + 4 Alpha (wk11) = 5 commits in 1 entry
    // Unmapped: excluded
    expect(data).toHaveLength(3); // Alice-Alpha, Alice-Beta, Bob-Alpha

    const aliceAlpha = data.find((d) => d.memberId === memberAlice && d.projectId === projectAlpha);
    expect(aliceAlpha).toBeDefined();
    expect(aliceAlpha!.commits).toBe(3);
    expect(aliceAlpha!.memberName).toBe('Alice');
    expect(aliceAlpha!.projectName).toBe('Project Alpha');

    const aliceBeta = data.find((d) => d.memberId === memberAlice && d.projectId === projectBeta);
    expect(aliceBeta).toBeDefined();
    expect(aliceBeta!.commits).toBe(2);

    const bobAlpha = data.find((d) => d.memberId === memberBob && d.projectId === projectAlpha);
    expect(bobAlpha).toBeDefined();
    expect(bobAlpha!.commits).toBe(5); // 1 + 4 across weeks
  });

  it('excludes unmapped authors', async () => {
    const data = await WorkloadChartService.getBarData(db, '2026-03-01', '2026-03-31');
    const unmapped = data.find((d) => d.memberId === null || d.memberId === undefined);
    expect(unmapped).toBeUndefined();
  });

  it('returns empty array for future date range', async () => {
    const data = await WorkloadChartService.getBarData(db, '2030-01-01', '2030-12-31');
    expect(data).toEqual([]);
  });

  it('filters by narrow date range', async () => {
    // Only week 11 (March 16-20) — should only have Bob's 4 commits
    const data = await WorkloadChartService.getBarData(db, '2026-03-16', '2026-03-20');
    expect(data).toHaveLength(1);
    expect(data[0].memberId).toBe(memberBob);
    expect(data[0].commits).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════
// Trend line
// ═══════════════════════════════════════════════════════════════
describe('WorkloadChartService.getTrendData', () => {
  it('returns weekly buckets sorted ascending', async () => {
    const data = await WorkloadChartService.getTrendData(db, '2026-03-01', '2026-03-31');

    // Week 10 (March 9-13): Alice 5 + Bob 1 + Unmapped 2 = 8
    // Week 11 (March 16-19): Bob 4
    expect(data.length).toBeGreaterThanOrEqual(2);

    // Sorted ascending
    for (let i = 1; i < data.length; i++) {
      expect(data[i].weekBucket > data[i - 1].weekBucket).toBe(true);
    }
  });

  it('includes unmapped authors in aggregate (no filter)', async () => {
    const data = await WorkloadChartService.getTrendData(db, '2026-03-09', '2026-03-13');
    // Week 10 only: Alice 5 + Bob 1 + Unmapped 2 = 8
    expect(data).toHaveLength(1);
    expect(data[0].commits).toBe(8);
  });

  it('filters by memberId', async () => {
    const data = await WorkloadChartService.getTrendData(
      db,
      '2026-03-01',
      '2026-03-31',
      memberAlice,
    );

    // Alice: week 10 = 5 commits (3 Alpha + 2 Beta)
    const week10 = data.find((d) => d.commits === 5);
    expect(week10).toBeDefined();
    // No week 11 data for Alice
    expect(data.every((d) => d.commits <= 5)).toBe(true);
  });

  it('filters by projectId', async () => {
    const data = await WorkloadChartService.getTrendData(
      db,
      '2026-03-01',
      '2026-03-31',
      undefined,
      projectBeta,
    );

    // Beta: only Alice's 2 commits in week 10
    expect(data).toHaveLength(1);
    expect(data[0].commits).toBe(2);
  });

  it('returns weekStart as a valid date string', async () => {
    const data = await WorkloadChartService.getTrendData(db, '2026-03-01', '2026-03-31');
    for (const entry of data) {
      expect(entry.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('returns empty array for future date range', async () => {
    const data = await WorkloadChartService.getTrendData(db, '2030-01-01', '2030-12-31');
    expect(data).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Heatmap
// ═══════════════════════════════════════════════════════════════
describe('WorkloadChartService.getHeatmapData', () => {
  it('returns members, projects, cells, and maxCommits', async () => {
    const result = await WorkloadChartService.getHeatmapData(db, '2026-03-01', '2026-03-31');

    // 2 members (Alice, Bob) — unmapped excluded
    expect(result.members).toHaveLength(2);
    expect(result.members.map((m) => m.name).sort()).toEqual(['Alice', 'Bob']);

    // 2 projects (Alpha, Beta)
    expect(result.projects).toHaveLength(2);
    expect(result.projects.map((p) => p.name).sort()).toEqual(['Project Alpha', 'Project Beta']);

    // 3 cells: Alice-Alpha, Alice-Beta, Bob-Alpha
    expect(result.cells).toHaveLength(3);

    // Max commits: Bob-Alpha = 5
    expect(result.maxCommits).toBe(5);
  });

  it('excludes unmapped authors', async () => {
    const result = await WorkloadChartService.getHeatmapData(db, '2026-03-01', '2026-03-31');
    const unmapped = result.cells.find((c) => !c.memberId);
    expect(unmapped).toBeUndefined();
  });

  it('returns correct cell values', async () => {
    const result = await WorkloadChartService.getHeatmapData(db, '2026-03-01', '2026-03-31');

    const aliceAlpha = result.cells.find(
      (c) => c.memberId === memberAlice && c.projectId === projectAlpha,
    );
    expect(aliceAlpha!.commits).toBe(3);

    const aliceBeta = result.cells.find(
      (c) => c.memberId === memberAlice && c.projectId === projectBeta,
    );
    expect(aliceBeta!.commits).toBe(2);

    const bobAlpha = result.cells.find(
      (c) => c.memberId === memberBob && c.projectId === projectAlpha,
    );
    expect(bobAlpha!.commits).toBe(5);
  });

  it('returns empty results for future date range', async () => {
    const result = await WorkloadChartService.getHeatmapData(db, '2030-01-01', '2030-12-31');
    expect(result.members).toEqual([]);
    expect(result.projects).toEqual([]);
    expect(result.cells).toEqual([]);
    expect(result.maxCommits).toBe(0);
  });
});
