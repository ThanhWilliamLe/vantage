import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDatabase } from '../data/test-helpers.js';
import { EvaluationService } from './evaluation-service.js';
import { ProjectService } from './project-service.js';
import { MemberService } from './member-service.js';
import { NotFoundError, ValidationError } from '../errors/index.js';
import * as schema from '../data/schema.js';

const { db, sqlite } = createTestDatabase();

let projectId: string;
let projectId2: string;
let memberId: string;
let memberId2: string;
let repoId: string;

beforeAll(async () => {
  const project = await ProjectService.create(db, { name: 'Eval Test Project' });
  projectId = project.id;

  const project2 = await ProjectService.create(db, { name: 'Eval Test Project 2' });
  projectId2 = project2.id;

  const member = await MemberService.create(db, { name: 'EvalTester' });
  memberId = member.id;

  const member2 = await MemberService.create(db, { name: 'EvalTester2' });
  memberId2 = member2.id;

  // Insert a repo for code_change inserts
  repoId = ulid();
  const now = new Date().toISOString();
  await db.insert(schema.repository).values({
    id: repoId,
    projectId,
    type: 'local',
    localPath: '/tmp/fake-eval-repo',
    createdAt: now,
  });
});

afterAll(() => {
  sqlite.close();
});

// ═══════════════════════════════════════════════════════════════
// Create daily entry
// ═══════════════════════════════════════════════════════════════
describe('EvaluationService.createDaily', () => {
  it('creates a daily entry and returns it', async () => {
    const result = await EvaluationService.createDaily(db, {
      memberId,
      date: '2026-03-15',
      projectIds: [projectId],
      description: 'Worked on feature X',
      workloadScore: 6,
      notes: 'Good progress',
    });

    expect(result.id).toBeDefined();
    expect(result.memberId).toBe(memberId);
    expect(result.type).toBe('daily');
    expect(result.date).toBe('2026-03-15');
    expect(result.projectIds).toEqual([projectId]);
    expect(result.description).toBe('Worked on feature X');
    expect(result.workloadScore).toBe(6);
    expect(result.notes).toBe('Good progress');
  });

  it('creates a daily entry with minimal fields', async () => {
    const result = await EvaluationService.createDaily(db, {
      memberId,
      date: '2026-03-16',
      projectIds: [projectId],
    });

    expect(result.id).toBeDefined();
    expect(result.description).toBeNull();
    expect(result.workloadScore).toBeNull();
    expect(result.notes).toBeNull();
  });

  it('throws ValidationError when memberId missing', async () => {
    await expect(
      EvaluationService.createDaily(db, {
        memberId: '',
        date: '2026-03-15',
        projectIds: [projectId],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError for non-existent member', async () => {
    await expect(
      EvaluationService.createDaily(db, {
        memberId: 'nonexistent',
        date: '2026-03-15',
        projectIds: [projectId],
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws ValidationError when projectIds empty', async () => {
    await expect(
      EvaluationService.createDaily(db, {
        memberId,
        date: '2026-03-15',
        projectIds: [],
      }),
    ).rejects.toThrow(ValidationError);
  });
});

// ═══════════════════════════════════════════════════════════════
// Get by ID
// ═══════════════════════════════════════════════════════════════
describe('EvaluationService.getById', () => {
  it('returns existing entry', async () => {
    const created = await EvaluationService.createDaily(db, {
      memberId,
      date: '2026-03-17',
      projectIds: [projectId],
      description: 'Test getById',
    });

    const result = await EvaluationService.getById(db, created.id);
    expect(result.id).toBe(created.id);
    expect(result.description).toBe('Test getById');
  });

  it('throws NotFoundError for non-existent ID', async () => {
    await expect(EvaluationService.getById(db, 'nonexistent')).rejects.toThrow(NotFoundError);
  });
});

// ═══════════════════════════════════════════════════════════════
// Update
// ═══════════════════════════════════════════════════════════════
describe('EvaluationService.updateDaily', () => {
  it('updates description and workload score', async () => {
    const created = await EvaluationService.createDaily(db, {
      memberId,
      date: '2026-03-18',
      projectIds: [projectId],
      description: 'Original',
    });

    const result = await EvaluationService.updateDaily(db, created.id, {
      description: 'Updated description',
      workloadScore: 8,
    });

    expect(result.description).toBe('Updated description');
    expect(result.workloadScore).toBe(8);
  });

  it('throws NotFoundError for non-existent ID', async () => {
    await expect(
      EvaluationService.updateDaily(db, 'nonexistent', { description: 'fail' }),
    ).rejects.toThrow(NotFoundError);
  });
});

// ═══════════════════════════════════════════════════════════════
// Delete
// ═══════════════════════════════════════════════════════════════
describe('EvaluationService.deleteDaily', () => {
  it('deletes an entry', async () => {
    const created = await EvaluationService.createDaily(db, {
      memberId,
      date: '2026-03-19',
      projectIds: [projectId],
    });

    await EvaluationService.deleteDaily(db, created.id);

    await expect(EvaluationService.getById(db, created.id)).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError for non-existent ID', async () => {
    await expect(EvaluationService.deleteDaily(db, 'nonexistent')).rejects.toThrow(NotFoundError);
  });
});

// ═══════════════════════════════════════════════════════════════
// getDailyData
// ═══════════════════════════════════════════════════════════════
describe('EvaluationService.getDailyData', () => {
  it('returns members with activity for the given date', async () => {
    const date = '2026-02-20';
    const now = new Date().toISOString();

    // Insert a code_change for memberId on that date
    await db.insert(schema.codeChange).values({
      id: ulid(),
      projectId,
      repoId,
      type: 'commit',
      platformId: `daily-data-${ulid()}`,
      branch: 'main',
      title: 'Daily data test commit',
      body: null,
      authorMemberId: memberId,
      authorRaw: 'test@example.com',
      authorName: 'Test User',
      linesAdded: 10,
      linesDeleted: 2,
      filesChanged: 1,
      authoredAt: `${date}T10:00:00.000Z`,
      fetchedAt: now,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });

    const result = await EvaluationService.getDailyData(db, date);
    expect(result.date).toBe(date);
    expect(result.members.length).toBeGreaterThanOrEqual(1);

    const found = result.members.find((m) => m.id === memberId);
    expect(found).toBeDefined();
    expect(found!.commitCount).toBeGreaterThanOrEqual(1);
  });

  it('throws ValidationError for missing date', async () => {
    await expect(EvaluationService.getDailyData(db, '')).rejects.toThrow(ValidationError);
  });
});

// ═══════════════════════════════════════════════════════════════
// List with filters
// ═══════════════════════════════════════════════════════════════
describe('EvaluationService.listDaily', () => {
  beforeAll(async () => {
    // Ensure some entries exist for filtering tests
    await EvaluationService.createDaily(db, {
      memberId,
      date: '2026-01-10',
      projectIds: [projectId],
      description: 'January daily',
    });
    await EvaluationService.createDaily(db, {
      memberId: memberId2,
      date: '2026-01-11',
      projectIds: [projectId],
      description: 'Another member daily',
    });
  });

  it('lists all entries without filters', async () => {
    const result = await EvaluationService.listDaily(db);
    expect(result.items.length).toBeGreaterThanOrEqual(2);
    expect(result.total).toBeGreaterThanOrEqual(2);
  });

  it('filters by memberId', async () => {
    const result = await EvaluationService.listDaily(db, { memberId: memberId2 });
    for (const item of result.items) {
      expect(item.memberId).toBe(memberId2);
    }
  });

  it('filters by type', async () => {
    const result = await EvaluationService.listDaily(db, { type: 'daily' });
    for (const item of result.items) {
      expect(item.type).toBe('daily');
    }
  });

  it('filters by date range', async () => {
    const result = await EvaluationService.listDaily(db, {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });

    for (const item of result.items) {
      expect(item.date >= '2026-01-01').toBe(true);
      expect(item.date <= '2026-01-31').toBe(true);
    }
  });

  it('respects limit and offset', async () => {
    const result = await EvaluationService.listDaily(db, { limit: 1, offset: 0 });
    expect(result.items.length).toBeLessThanOrEqual(1);
    expect(result.limit).toBe(1);
    expect(result.offset).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Quarterly: create and getQuarterlyData
// ═══════════════════════════════════════════════════════════════
describe('EvaluationService.createQuarterly', () => {
  it('creates a quarterly entry (per-member)', async () => {
    const result = await EvaluationService.createQuarterly(db, {
      memberId,
      quarter: '2026-Q1',
      projectIds: [projectId],
      description: 'Q1 overall performance',
      workloadScore: 7,
      notes: 'Strong quarter',
    });

    expect(result.id).toBeDefined();
    expect(result.type).toBe('quarterly');
    expect(result.quarter).toBe('2026-Q1');
    expect(result.description).toBe('Q1 overall performance');
    expect(result.projectIds).toEqual([projectId]);
  });

  it('creates a quarterly entry (per-member per-project)', async () => {
    const result = await EvaluationService.createQuarterly(db, {
      memberId,
      quarter: '2026-Q1',
      projectIds: [projectId, projectId2],
      description: 'Q1 multi-project performance',
      workloadScore: 6,
    });

    expect(result.projectIds).toEqual([projectId, projectId2]);
  });

  it('throws ValidationError for missing quarter', async () => {
    await expect(
      EvaluationService.createQuarterly(db, {
        memberId,
        quarter: '',
        projectIds: [projectId],
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('EvaluationService.getQuarterlyData', () => {
  it('returns daily entries for the quarter', async () => {
    // We already have daily entries created in January (2026-01-10, 2026-01-11)
    const result = await EvaluationService.getQuarterlyData(db, '2026-Q1');

    expect(result.quarter).toBe('2026-Q1');
    expect(result.startDate).toBe('2026-01-01');
    expect(result.endDate).toBe('2026-03-31');
    expect(result.dailyEntries.length).toBeGreaterThanOrEqual(2);
    expect(result.quarterlyEntries.length).toBeGreaterThanOrEqual(1);
  });

  it('filters by memberIds', async () => {
    const result = await EvaluationService.getQuarterlyData(db, '2026-Q1', [memberId2]);

    for (const entry of result.dailyEntries) {
      expect(entry.memberId).toBe(memberId2);
    }
  });

  it('throws ValidationError for missing quarter', async () => {
    await expect(EvaluationService.getQuarterlyData(db, '')).rejects.toThrow(ValidationError);
  });
});
