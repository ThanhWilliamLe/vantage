import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDatabase } from '../data/test-helpers.js';
import { SearchService, sanitizeFTS5Query } from './search-service.js';
import { ProjectService } from './project-service.js';
import { MemberService } from './member-service.js';
import * as schema from '../data/schema.js';

const { db, sqlite } = createTestDatabase();

let projectId: string;
let repoId: string;
let memberId: string;

beforeAll(async () => {
  const project = await ProjectService.create(db, { name: 'Search Test Project' });
  projectId = project.id;

  const member = await MemberService.create(db, { name: 'SearchTester' });
  memberId = member.id;

  repoId = ulid();
  const now = new Date().toISOString();
  await db.insert(schema.repository).values({
    id: repoId,
    projectId,
    type: 'local',
    localPath: '/tmp/fake-search-repo',
    createdAt: now,
  });

  // Insert code changes with searchable content
  for (const [title, body, aiSummary] of [
    ['Fix authentication bug', 'Resolved token expiry issue', 'Fixed token expiration handling in auth middleware'],
    ['Add user profile feature', 'New profile page with avatar', 'Added user profile component with avatar upload'],
    ['Refactor database queries', null, 'Optimized SQL queries for better performance'],
    ['Update CI pipeline', 'Modified GitHub Actions workflow', null],
  ]) {
    await db.insert(schema.codeChange).values({
      id: ulid(),
      projectId,
      repoId,
      type: 'commit',
      platformId: `search-${ulid()}`,
      branch: 'main',
      title: title as string,
      body: body as string | null,
      authorMemberId: memberId,
      authorRaw: 'test@example.com',
      authorName: 'Test User',
      linesAdded: 10,
      linesDeleted: 2,
      filesChanged: 1,
      authoredAt: now,
      fetchedAt: now,
      status: 'pending',
      aiSummary: aiSummary as string | null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Insert evaluation entries with searchable content
  for (const [description, notes] of [
    ['Worked on authentication improvements', 'Needs to follow up on token storage'],
    ['Database optimization sprint', 'Good progress on query performance'],
    ['Profile feature development', null],
  ]) {
    await db.insert(schema.evaluationEntry).values({
      id: ulid(),
      memberId,
      type: 'daily',
      date: '2026-03-15',
      quarter: null,
      projectIds: JSON.stringify([projectId]),
      description: description as string,
      workloadScore: 5,
      notes: notes as string | null,
      aiInsights: null,
      isAiGenerated: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Create additional members and projects for LIKE search tests
  await MemberService.create(db, { name: 'Alice Johnson' });
  await MemberService.create(db, { name: 'Bob Smith' });
  await ProjectService.create(db, { name: 'Vantage Frontend' });
  await ProjectService.create(db, { name: 'Vantage Backend' });
});

afterAll(() => {
  sqlite.close();
});

// ═══════════════════════════════════════════════════════════════
// FTS5 search: code_changes
// ═══════════════════════════════════════════════════════════════
describe('SearchService.search — code changes', () => {
  it('finds code changes by title', async () => {
    const results = await SearchService.search(db, 'authentication', 'changes');
    expect(results.changes.length).toBeGreaterThanOrEqual(1);
    expect(results.changes[0].item.title).toContain('authentication');
  });

  it('finds code changes by AI summary', async () => {
    const results = await SearchService.search(db, 'optimized SQL', 'changes');
    expect(results.changes.length).toBeGreaterThanOrEqual(1);
  });

  it('finds code changes by body text', async () => {
    const results = await SearchService.search(db, 'GitHub Actions', 'changes');
    expect(results.changes.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty for non-matching query', async () => {
    const results = await SearchService.search(db, 'xyznonexistent123', 'changes');
    expect(results.changes.length).toBe(0);
  });

  it('returns score with each result', async () => {
    const results = await SearchService.search(db, 'authentication', 'changes');
    for (const hit of results.changes) {
      expect(typeof hit.score).toBe('number');
      expect(hit.item.id).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// FTS5 search: evaluation_entries
// ═══════════════════════════════════════════════════════════════
describe('SearchService.search — evaluations', () => {
  it('finds evaluation entries by description', async () => {
    const results = await SearchService.search(db, 'authentication improvements', 'evaluations');
    expect(results.evaluations.length).toBeGreaterThanOrEqual(1);
  });

  it('finds evaluation entries by notes', async () => {
    const results = await SearchService.search(db, 'query performance', 'evaluations');
    expect(results.evaluations.length).toBeGreaterThanOrEqual(1);
  });

  it('returns both scopes when scope=all', async () => {
    const results = await SearchService.search(db, 'authentication', 'all');
    // Should find both code changes and evaluations with "authentication"
    expect(results.changes.length).toBeGreaterThanOrEqual(1);
    expect(results.evaluations.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Empty database search
// ═══════════════════════════════════════════════════════════════
describe('SearchService.search — empty/edge cases', () => {
  it('empty query returns empty results', async () => {
    const results = await SearchService.search(db, '', 'all');
    expect(results.changes.length).toBe(0);
    expect(results.evaluations.length).toBe(0);
  });

  it('whitespace-only query returns empty results', async () => {
    const results = await SearchService.search(db, '   ', 'all');
    expect(results.changes.length).toBe(0);
    expect(results.evaluations.length).toBe(0);
  });

  it('respects limit parameter', async () => {
    const results = await SearchService.search(db, 'authentication', 'all', 1);
    expect(results.changes.length).toBeLessThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// sanitizeFTS5Query
// ═══════════════════════════════════════════════════════════════
describe('sanitizeFTS5Query', () => {
  it('wraps words in quotes', () => {
    expect(sanitizeFTS5Query('hello world')).toBe('"hello" "world"');
  });

  it('handles single word', () => {
    expect(sanitizeFTS5Query('hello')).toBe('"hello"');
  });

  it('handles FTS5 operators — treats AND, OR, NOT as literals', () => {
    expect(sanitizeFTS5Query('fix NOT working')).toBe('"fix" "NOT" "working"');
    expect(sanitizeFTS5Query('feature AND bug')).toBe('"feature" "AND" "bug"');
    expect(sanitizeFTS5Query('this OR that')).toBe('"this" "OR" "that"');
  });

  it('handles NEAR operator', () => {
    expect(sanitizeFTS5Query('NEAR test')).toBe('"NEAR" "test"');
  });

  it('escapes double quotes', () => {
    expect(sanitizeFTS5Query('say "hello"')).toBe('"say" """hello"""');
  });

  it('handles email-like strings', () => {
    expect(sanitizeFTS5Query('user@example.com')).toBe('"user@example.com"');
  });

  it('handles special characters in search terms', () => {
    expect(sanitizeFTS5Query('file.ts src/utils')).toBe('"file.ts" "src/utils"');
  });

  it('handles empty string', () => {
    expect(sanitizeFTS5Query('')).toBe('');
  });

  it('handles whitespace-only string', () => {
    expect(sanitizeFTS5Query('   ')).toBe('');
  });

  it('handles multiple spaces between words', () => {
    expect(sanitizeFTS5Query('hello    world')).toBe('"hello" "world"');
  });

  it('handles asterisk (FTS5 prefix token)', () => {
    expect(sanitizeFTS5Query('test*')).toBe('"test*"');
  });

  it('handles parentheses (FTS5 grouping)', () => {
    expect(sanitizeFTS5Query('(test) group')).toBe('"(test)" "group"');
  });

  it('handles caret (FTS5 initial token query)', () => {
    expect(sanitizeFTS5Query('^start')).toBe('"^start"');
  });
});

// ═══════════════════════════════════════════════════════════════
// Member LIKE search
// ═══════════════════════════════════════════════════════════════
describe('SearchService.searchMembers', () => {
  it('finds members by partial name', async () => {
    const results = await SearchService.searchMembers(db, 'Alice');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe('Alice Johnson');
  });

  it('case-insensitive search', async () => {
    const results = await SearchService.searchMembers(db, 'alice');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('empty query returns empty array', async () => {
    const results = await SearchService.searchMembers(db, '');
    expect(results).toEqual([]);
  });

  it('no match returns empty array', async () => {
    const results = await SearchService.searchMembers(db, 'NonExistentName123');
    expect(results).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Project LIKE search
// ═══════════════════════════════════════════════════════════════
describe('SearchService.searchProjects', () => {
  it('finds projects by partial name', async () => {
    const results = await SearchService.searchProjects(db, 'Vantage');
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('finds specific project', async () => {
    const results = await SearchService.searchProjects(db, 'Frontend');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe('Vantage Frontend');
  });

  it('empty query returns empty array', async () => {
    const results = await SearchService.searchProjects(db, '');
    expect(results).toEqual([]);
  });
});
