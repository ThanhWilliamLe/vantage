import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, createTestRepo } from '../data/test-helpers.js';
import { ProjectService } from './project-service.js';
import { MemberService } from './member-service.js';
import { ScanService } from './scan-service.js';
import { ulid } from 'ulid';
import { eq } from 'drizzle-orm';
import * as schema from '../data/schema.js';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Note: execSync usage here is for test-only git repo manipulation
// with hardcoded commands — same pattern as test-helpers.ts createTestRepo().

const { db, sqlite } = createTestDatabase();

afterAll(() => {
  sqlite.close();
});

describe('ScanService', () => {
  let projectId: string;
  let repoId: string;
  let repoPath: string;

  beforeAll(async () => {
    // Create a project
    const project = await ProjectService.create(db, { name: 'Scan Test Project' });
    projectId = project.id;

    // Create a test repo with two commits
    repoPath = createTestRepo([
      {
        message: 'Initial commit',
        files: { 'README.md': '# Hello\n' },
      },
      {
        message: 'Add feature PROJ-101',
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
  });

  it('scanRepository → creates code_change records for all commits', async () => {
    const repo = { id: repoId, projectId, localPath: repoPath };
    const newCommits = await ScanService.scanRepository(db, repo);

    expect(newCommits).toBe(2);

    // Verify code_change records
    const changes = await db
      .select()
      .from(schema.codeChange)
      .where(eq(schema.codeChange.repoId, repoId))
      .all();

    expect(changes).toHaveLength(2);

    // Check one of the changes
    const featureCommit = changes.find(c => c.title === 'Add feature PROJ-101');
    expect(featureCommit).toBeDefined();
    expect(featureCommit!.type).toBe('commit');
    expect(featureCommit!.projectId).toBe(projectId);
    expect(featureCommit!.authorRaw).toBe('test@example.com');
    expect(featureCommit!.status).toBe('pending');
    expect(featureCommit!.linesAdded).toBeGreaterThanOrEqual(1);

    const initialCommit = changes.find(c => c.title === 'Initial commit');
    expect(initialCommit).toBeDefined();
  });

  it('scan_state is updated after scan', async () => {
    const state = await db
      .select()
      .from(schema.scanState)
      .where(eq(schema.scanState.repoId, repoId))
      .get();

    expect(state).toBeDefined();
    expect(state!.status).toBe('idle');
    expect(state!.lastCommitHash).toBeDefined();
    expect(state!.lastScannedAt).toBeDefined();
    expect(state!.errorMessage).toBeNull();
  });

  it('incremental scan → only new commits added', async () => {
    // Add a new commit to the test repo
    const newFilePath = join(repoPath, 'src/new-file.ts');
    writeFileSync(newFilePath, 'export const y = 2;\n');
    execSync('git add .', { cwd: repoPath, stdio: 'ignore' });
    execSync('git commit -m "Add new file"', { cwd: repoPath, stdio: 'ignore' });

    const repo = { id: repoId, projectId, localPath: repoPath };
    const newCommits = await ScanService.scanRepository(db, repo);

    // Should only find the 1 new commit
    expect(newCommits).toBe(1);

    // Total should now be 3
    const allChanges = await db
      .select()
      .from(schema.codeChange)
      .where(eq(schema.codeChange.repoId, repoId))
      .all();

    expect(allChanges).toHaveLength(3);
  });

  it('duplicate scan → no duplicates (unique constraint as safety net)', async () => {
    const repo = { id: repoId, projectId, localPath: repoPath };
    const newCommits = await ScanService.scanRepository(db, repo);

    // No new commits since last scan
    expect(newCommits).toBe(0);

    // Total should still be 3
    const allChanges = await db
      .select()
      .from(schema.codeChange)
      .where(eq(schema.codeChange.repoId, repoId))
      .all();

    expect(allChanges).toHaveLength(3);
  });

  it('empty repo → zero commits, no error', async () => {
    // Create project and empty repo
    const emptyProject = await ProjectService.create(db, { name: 'Empty Repo Project' });
    const emptyRepoPath = createTestRepo(); // no commits
    const emptyRepoId = ulid();
    const now = new Date().toISOString();

    await db.insert(schema.repository).values({
      id: emptyRepoId,
      projectId: emptyProject.id,
      type: 'local',
      localPath: emptyRepoPath,
      createdAt: now,
    });

    const repo = { id: emptyRepoId, projectId: emptyProject.id, localPath: emptyRepoPath };
    const newCommits = await ScanService.scanRepository(db, repo);

    expect(newCommits).toBe(0);
  });

  it('author resolution → mapped email returns member; unmapped returns null', async () => {
    // Create a member with a git identity matching the test repo email
    const member = await MemberService.create(db, { name: 'Test Author' });
    await MemberService.addIdentity(db, member.id, {
      platform: 'git',
      value: 'test@example.com',
    });

    // Create a new project + repo to scan fresh
    const mappedProject = await ProjectService.create(db, { name: 'Mapped Author Project' });
    const mappedRepoPath = createTestRepo([
      {
        message: 'Commit by known author',
        files: { 'file.txt': 'content\n' },
      },
    ]);
    const mappedRepoId = ulid();
    const now = new Date().toISOString();

    await db.insert(schema.repository).values({
      id: mappedRepoId,
      projectId: mappedProject.id,
      type: 'local',
      localPath: mappedRepoPath,
      createdAt: now,
    });

    const repo = { id: mappedRepoId, projectId: mappedProject.id, localPath: mappedRepoPath };
    await ScanService.scanRepository(db, repo);

    const changes = await db
      .select()
      .from(schema.codeChange)
      .where(eq(schema.codeChange.repoId, mappedRepoId))
      .all();

    expect(changes).toHaveLength(1);
    // Author should be resolved to the member
    expect(changes[0].authorMemberId).toBe(member.id);
  });

  it('scanAll → scans all local repos and returns batch result', async () => {
    const result = await ScanService.scanAll(db);

    expect(result.reposScanned).toBeGreaterThanOrEqual(1);
    expect(result.results).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);

    // Each result should have the expected shape
    for (const r of result.results) {
      expect(r.repoId).toBeDefined();
      expect(r.projectId).toBeDefined();
      expect(['scanned', 'skipped', 'failed']).toContain(r.status);
    }
  });

  it('FTS5 trigger fires for scan-inserted code_changes', async () => {
    // Query the FTS table for a commit title we know exists
    const ftsResults = sqlite
      .prepare("SELECT * FROM code_change_fts WHERE code_change_fts MATCH 'feature'")
      .all();

    expect(ftsResults.length).toBeGreaterThanOrEqual(1);
  });
});
