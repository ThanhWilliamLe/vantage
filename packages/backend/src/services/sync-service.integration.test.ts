import { describe, it, expect, afterAll } from 'vitest';
import { createTestDatabase } from '../data/test-helpers.js';
import { ProjectService } from './project-service.js';
import {
  SyncService,
  type AdapterFactory,
  type GitHubAdapterInterface,
  type GitLabAdapterInterface,
} from './sync-service.js';
import { ExternalAPIError } from '../errors/index.js';
import { ulid } from 'ulid';
import { eq, and } from 'drizzle-orm';
import * as schema from '../data/schema.js';
import { encrypt } from '../crypto/index.js';
import { randomBytes } from 'node:crypto';
import type { PRDetailMetadata } from '../integrations/github/types.js';

// ─── Test infrastructure ────────────────────────

const { db, sqlite } = createTestDatabase();
const encryptionKey = randomBytes(32);

afterAll(() => {
  sqlite.close();
});

/** Helper: create a project, credential, and GitHub repo record */
async function setupGitHubRepo(
  name: string,
  opts?: { owner?: string; repo?: string },
): Promise<{ projectId: string; repoId: string; credentialId: string }> {
  const project = await ProjectService.create(db, { name });
  const projectId = project.id;

  // Create an encrypted credential
  const credentialId = ulid();
  const now = new Date().toISOString();
  await db.insert(schema.gitCredential).values({
    id: credentialId,
    name: `${name}-cred`,
    platform: 'github',
    tokenEncrypted: encrypt('ghp_test_token_123', encryptionKey),
    createdAt: now,
    updatedAt: now,
  });

  // Create repo record
  const repoId = ulid();
  await db.insert(schema.repository).values({
    id: repoId,
    projectId,
    type: 'github',
    apiOwner: opts?.owner ?? 'test-org',
    apiRepo: opts?.repo ?? 'test-repo',
    credentialId,
    createdAt: now,
  });

  return { projectId, repoId, credentialId };
}

/** Helper: insert a local commit code_change record */
async function insertLocalCommit(opts: {
  repoId: string;
  projectId: string;
  hash: string;
  branch?: string;
  title?: string;
  authoredAt?: string;
}): Promise<string> {
  const id = ulid();
  const now = new Date().toISOString();
  await db.insert(schema.codeChange).values({
    id,
    projectId: opts.projectId,
    repoId: opts.repoId,
    type: 'commit',
    platformId: opts.hash,
    branch: opts.branch ?? 'main',
    title: opts.title ?? `Commit ${opts.hash.slice(0, 7)}`,
    authorRaw: 'dev@example.com',
    authorName: 'Dev',
    linesAdded: 10,
    linesDeleted: 2,
    filesChanged: 1,
    authoredAt: opts.authoredAt ?? '2026-03-18T10:00:00.000Z',
    fetchedAt: now,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

// ─── Mock adapter factory ───────────────────────

function createMockAdapterFactory(overrides?: {
  github?: Partial<GitHubAdapterInterface>;
  gitlab?: Partial<GitLabAdapterInterface>;
}): AdapterFactory {
  return {
    createGitHub(): GitHubAdapterInterface {
      return {
        fetchPRsSince: overrides?.github?.fetchPRsSince ?? (async () => []),
        fetchPRDetail:
          overrides?.github?.fetchPRDetail ??
          (async () => ({
            number: 1,
            title: 'Test PR',
            body: null,
            state: 'open',
            draft: false,
            merged: false,
            headBranch: 'feature-x',
            authorLogin: 'testuser',
            linesAdded: 0,
            linesDeleted: 0,
            filesChanged: 0,
            createdAt: '2026-03-18T10:00:00Z',
            updatedAt: '2026-03-18T12:00:00Z',
            mergedAt: null,
            commitSHAs: [],
          })),
      };
    },
    createGitLab(): GitLabAdapterInterface {
      return {
        fetchMRsSince: overrides?.gitlab?.fetchMRsSince ?? (async () => []),
        fetchMRDetail:
          overrides?.gitlab?.fetchMRDetail ??
          (async () => ({
            iid: 1,
            title: 'Test MR',
            description: null,
            state: 'opened',
            draft: false,
            sourceBranch: 'feature-x',
            authorUsername: 'testuser',
            linesAdded: 0,
            linesDeleted: 0,
            filesChanged: 0,
            createdAt: '2026-03-18T10:00:00Z',
            updatedAt: '2026-03-18T12:00:00Z',
            mergedAt: null,
            commitSHAs: [],
          })),
      };
    },
  };
}

// ─── Fixture data ───────────────────────────────

function makePRListItem(overrides?: Partial<PRDetailMetadata>) {
  return {
    number: 42,
    title: 'Add login feature',
    body: 'Implements OAuth login flow',
    state: 'open' as const,
    draft: false,
    merged: false,
    headBranch: 'feature/login',
    authorLogin: 'alice',
    linesAdded: 150,
    linesDeleted: 20,
    filesChanged: 5,
    createdAt: '2026-03-18T09:00:00Z',
    updatedAt: '2026-03-18T14:00:00Z',
    mergedAt: null,
    ...overrides,
  };
}

function makePRDetail(overrides?: Partial<PRDetailMetadata>): PRDetailMetadata {
  return {
    ...makePRListItem(),
    commitSHAs: ['abc1234def5678', 'def5678abc1234'],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════

describe('SyncService', () => {
  describe('Tier 1: Platform ID match — re-sync updates existing PR', () => {
    it('updates an existing PR record with fresh API data', async () => {
      const { projectId, repoId } = await setupGitHubRepo('Tier1-Resync');

      // Pre-insert a PR record as if from a previous sync
      const existingId = ulid();
      const now = new Date().toISOString();
      await db.insert(schema.codeChange).values({
        id: existingId,
        projectId,
        repoId,
        type: 'pr',
        platformId: '42',
        branch: 'feature/login',
        title: 'OLD TITLE',
        body: 'old body',
        authorRaw: 'alice',
        authorName: 'alice',
        linesAdded: 50,
        linesDeleted: 5,
        filesChanged: 2,
        authoredAt: '2026-03-18T09:00:00Z',
        fetchedAt: now,
        status: 'pending',
        prStatus: 'open',
        createdAt: now,
        updatedAt: now,
      });

      const factory = createMockAdapterFactory({
        github: {
          fetchPRsSince: async () => [makePRListItem()],
          fetchPRDetail: async () =>
            makePRDetail({
              title: 'Add login feature (updated)',
              linesAdded: 200,
              linesDeleted: 30,
              filesChanged: 7,
            }),
        },
      });

      const result = await SyncService.syncRepository(
        db,
        encryptionKey,
        await getRepoRow(repoId),
        factory,
      );

      expect(result.updatedItems).toBe(1);
      expect(result.newItems).toBe(0);

      // Verify the existing record was updated, not duplicated
      const prs = await db
        .select()
        .from(schema.codeChange)
        .where(and(eq(schema.codeChange.repoId, repoId), eq(schema.codeChange.type, 'pr')))
        .all();

      expect(prs).toHaveLength(1);
      expect(prs[0].id).toBe(existingId);
      expect(prs[0].title).toBe('Add login feature (updated)');
      expect(prs[0].linesAdded).toBe(200);
      expect(prs[0].linesDeleted).toBe(30);
      expect(prs[0].filesChanged).toBe(7);
    });
  });

  describe('Tier 2: Commit SHA match — PR commits match local code_changes', () => {
    it('creates PR record when commit SHAs match local commits', async () => {
      const { projectId, repoId } = await setupGitHubRepo('Tier2-SHA');

      // Insert local commits that match the PR's commit list
      await insertLocalCommit({
        repoId,
        projectId,
        hash: 'abc1234def5678',
        branch: 'feature/login',
      });
      await insertLocalCommit({
        repoId,
        projectId,
        hash: 'def5678abc1234',
        branch: 'feature/login',
      });

      const factory = createMockAdapterFactory({
        github: {
          fetchPRsSince: async () => [makePRListItem()],
          fetchPRDetail: async () =>
            makePRDetail({
              commitSHAs: ['abc1234def5678', 'def5678abc1234'],
            }),
        },
      });

      const result = await SyncService.syncRepository(
        db,
        encryptionKey,
        await getRepoRow(repoId),
        factory,
      );

      expect(result.newItems).toBe(1);

      // PR record should exist alongside commit records
      const allChanges = await db
        .select()
        .from(schema.codeChange)
        .where(eq(schema.codeChange.repoId, repoId))
        .all();

      const prRecord = allChanges.find((c) => c.type === 'pr');
      expect(prRecord).toBeDefined();
      expect(prRecord!.platformId).toBe('42');
      expect(prRecord!.title).toBe('Add login feature');

      const commits = allChanges.filter((c) => c.type === 'commit');
      expect(commits).toHaveLength(2);
    });
  });

  describe('Tier 3: Branch name match — squash merge fallback', () => {
    it('creates PR when branch name matches local commits (SHA mismatch)', async () => {
      const { projectId, repoId } = await setupGitHubRepo('Tier3-Branch');

      // Insert local commits on the branch (different SHAs from PR — simulating rebase/squash)
      await insertLocalCommit({
        repoId,
        projectId,
        hash: 'local_sha_111111',
        branch: 'feature/login',
        authoredAt: '2026-03-18T10:00:00.000Z',
      });

      const factory = createMockAdapterFactory({
        github: {
          fetchPRsSince: async () => [makePRListItem({ number: 99 })],
          fetchPRDetail: async () =>
            makePRDetail({
              number: 99,
              headBranch: 'feature/login',
              // SHAs that do NOT match local commits (rebase scenario)
              commitSHAs: ['remote_sha_aaaaaa', 'remote_sha_bbbbbb'],
              createdAt: '2026-03-18T08:00:00Z',
            }),
        },
      });

      const result = await SyncService.syncRepository(
        db,
        encryptionKey,
        await getRepoRow(repoId),
        factory,
      );

      expect(result.newItems).toBe(1);

      const prRecord = await db
        .select()
        .from(schema.codeChange)
        .where(
          and(
            eq(schema.codeChange.repoId, repoId),
            eq(schema.codeChange.type, 'pr'),
            eq(schema.codeChange.platformId, '99'),
          ),
        )
        .get();

      expect(prRecord).toBeDefined();
      expect(prRecord!.branch).toBe('feature/login');
    });
  });

  describe('Tier 4: No match — standalone PR record', () => {
    it('creates standalone PR when no local commits match', async () => {
      const { repoId } = await setupGitHubRepo('Tier4-Standalone');

      // No local commits at all for this repo

      const factory = createMockAdapterFactory({
        github: {
          fetchPRsSince: async () => [makePRListItem({ number: 77 })],
          fetchPRDetail: async () =>
            makePRDetail({
              number: 77,
              headBranch: 'feature/remote-only',
              commitSHAs: ['remote_only_sha_1', 'remote_only_sha_2'],
            }),
        },
      });

      const result = await SyncService.syncRepository(
        db,
        encryptionKey,
        await getRepoRow(repoId),
        factory,
      );

      expect(result.newItems).toBe(1);

      const prRecord = await db
        .select()
        .from(schema.codeChange)
        .where(and(eq(schema.codeChange.repoId, repoId), eq(schema.codeChange.type, 'pr')))
        .get();

      expect(prRecord).toBeDefined();
      expect(prRecord!.platformId).toBe('77');
      expect(prRecord!.branch).toBe('feature/remote-only');
      expect(prRecord!.status).toBe('pending');
      expect(prRecord!.prStatus).toBe('open');
    });
  });

  describe('Error handling: rate limit (429)', () => {
    it('sets sync_state to failed with rate limit info', async () => {
      const { repoId } = await setupGitHubRepo('RateLimit-Test');

      const factory = createMockAdapterFactory({
        github: {
          fetchPRsSince: async () => {
            throw new ExternalAPIError('GitHub API rate limit exceeded', {
              platform: 'github',
              httpStatus: 429,
              rateLimitReset: '2026-03-18T15:00:00Z',
            });
          },
        },
      });

      await expect(
        SyncService.syncRepository(db, encryptionKey, await getRepoRow(repoId), factory),
      ).rejects.toThrow('rate limit');

      // Verify sync_state is failed
      const state = await db
        .select()
        .from(schema.syncState)
        .where(eq(schema.syncState.repoId, repoId))
        .get();

      expect(state).toBeDefined();
      expect(state!.status).toBe('failed');
      expect(state!.errorMessage).toContain('rate limit');
    });
  });

  describe('Error handling: expired token (401)', () => {
    it('sets sync_state to failed with auth error message', async () => {
      const { repoId } = await setupGitHubRepo('Auth-Fail-Test');

      const factory = createMockAdapterFactory({
        github: {
          fetchPRsSince: async () => {
            throw new ExternalAPIError(
              'GitHub API authentication failed: token may be expired or revoked',
              { platform: 'github', httpStatus: 401 },
            );
          },
        },
      });

      await expect(
        SyncService.syncRepository(db, encryptionKey, await getRepoRow(repoId), factory),
      ).rejects.toThrow('authentication failed');

      const state = await db
        .select()
        .from(schema.syncState)
        .where(eq(schema.syncState.repoId, repoId))
        .get();

      expect(state!.status).toBe('failed');
      expect(state!.errorMessage).toContain('authentication failed');
      expect(state!.errorMessage).toContain('expired or revoked');
    });
  });

  describe('Partial success: one repo fails, others succeed', () => {
    it('syncAll continues syncing after one repo fails', async () => {
      // Create two GitHub repos in separate projects
      await setupGitHubRepo('Partial-Good');
      await setupGitHubRepo('Partial-Bad');

      // Factory where the first call succeeds (good repo) but
      // we need to distinguish repos by checking call order
      let callCount = 0;
      const factory: AdapterFactory = {
        createGitHub(): GitHubAdapterInterface {
          return {
            fetchPRsSince: async () => {
              callCount++;
              // The bad repo (second in db order) throws
              if (callCount === 2) {
                throw new ExternalAPIError('GitHub API rate limit exceeded', {
                  platform: 'github',
                  httpStatus: 429,
                });
              }
              return [makePRListItem({ number: 200 + callCount })];
            },
            fetchPRDetail: async (_o: string, _r: string, num: number) =>
              makePRDetail({
                number: num,
                commitSHAs: [],
              }),
          };
        },
        createGitLab(): GitLabAdapterInterface {
          return {
            fetchMRsSince: async () => [],
            fetchMRDetail: async () => ({
              iid: 1,
              title: '',
              description: null,
              state: 'opened' as const,
              draft: false,
              sourceBranch: '',
              authorUsername: '',
              linesAdded: 0,
              linesDeleted: 0,
              filesChanged: 0,
              createdAt: '',
              updatedAt: '',
              mergedAt: null,
              commitSHAs: [],
            }),
          };
        },
      };

      const result = await SyncService.syncAll(db, encryptionKey, factory);

      // At least one synced, at least one failed
      expect(result.reposSynced).toBeGreaterThanOrEqual(1);
      expect(result.reposFailed).toBeGreaterThanOrEqual(1);

      // Verify the batch result has entries for both
      const synced = result.results.filter((r) => r.status === 'synced');
      const failed = result.results.filter((r) => r.status === 'failed');
      expect(synced.length).toBeGreaterThanOrEqual(1);
      expect(failed.length).toBeGreaterThanOrEqual(1);
      expect(failed[0].error).toContain('rate limit');
    });
  });

  describe('Sync state tracking', () => {
    it('advances sync cursor after successful sync', async () => {
      const { repoId } = await setupGitHubRepo('Cursor-Test');

      const factory = createMockAdapterFactory({
        github: {
          fetchPRsSince: async () => [
            makePRListItem({ number: 10, updatedAt: '2026-03-18T14:00:00Z' }),
            makePRListItem({ number: 11, updatedAt: '2026-03-18T16:00:00Z' }),
          ],
          fetchPRDetail: async (_o: string, _r: string, num: number) =>
            makePRDetail({ number: num, commitSHAs: [] }),
        },
      });

      await SyncService.syncRepository(db, encryptionKey, await getRepoRow(repoId), factory);

      const state = await db
        .select()
        .from(schema.syncState)
        .where(eq(schema.syncState.repoId, repoId))
        .get();

      expect(state!.status).toBe('idle');
      expect(state!.lastSyncCursor).toBe('2026-03-18T16:00:00Z');
      expect(state!.lastSyncedAt).toBeDefined();
    });

    it('does not advance cursor on failure', async () => {
      const { repoId } = await setupGitHubRepo('Cursor-Fail-Test');

      // First, do a successful sync to set cursor
      const goodFactory = createMockAdapterFactory({
        github: {
          fetchPRsSince: async () => [makePRListItem({ updatedAt: '2026-03-18T10:00:00Z' })],
          fetchPRDetail: async () => makePRDetail({ commitSHAs: [] }),
        },
      });

      await SyncService.syncRepository(db, encryptionKey, await getRepoRow(repoId), goodFactory);

      // Reset status to idle so we can run again
      await db
        .update(schema.syncState)
        .set({ status: 'idle' })
        .where(eq(schema.syncState.repoId, repoId));

      const stateBeforeFail = await db
        .select()
        .from(schema.syncState)
        .where(eq(schema.syncState.repoId, repoId))
        .get();

      const cursorBefore = stateBeforeFail!.lastSyncCursor;

      // Now do a failing sync
      const badFactory = createMockAdapterFactory({
        github: {
          fetchPRsSince: async () => {
            throw new ExternalAPIError('Boom', { platform: 'github', httpStatus: 500 });
          },
        },
      });

      await expect(
        SyncService.syncRepository(db, encryptionKey, await getRepoRow(repoId), badFactory),
      ).rejects.toThrow();

      const stateAfterFail = await db
        .select()
        .from(schema.syncState)
        .where(eq(schema.syncState.repoId, repoId))
        .get();

      // Cursor should remain unchanged from before the failure
      expect(stateAfterFail!.lastSyncCursor).toBe(cursorBefore);
      expect(stateAfterFail!.status).toBe('failed');
    });
  });

  describe('PR status derivation', () => {
    it('marks draft PRs correctly', async () => {
      const { repoId } = await setupGitHubRepo('Draft-PR-Test');

      const factory = createMockAdapterFactory({
        github: {
          fetchPRsSince: async () => [makePRListItem({ number: 55, draft: true })],
          fetchPRDetail: async () =>
            makePRDetail({
              number: 55,
              draft: true,
              commitSHAs: [],
            }),
        },
      });

      await SyncService.syncRepository(db, encryptionKey, await getRepoRow(repoId), factory);

      const pr = await db
        .select()
        .from(schema.codeChange)
        .where(and(eq(schema.codeChange.repoId, repoId), eq(schema.codeChange.type, 'pr')))
        .get();

      expect(pr!.prStatus).toBe('draft');
    });

    it('marks merged PRs correctly', async () => {
      const { repoId } = await setupGitHubRepo('Merged-PR-Test');

      const factory = createMockAdapterFactory({
        github: {
          fetchPRsSince: async () => [
            makePRListItem({ number: 56, state: 'closed', merged: true }),
          ],
          fetchPRDetail: async () =>
            makePRDetail({
              number: 56,
              state: 'closed',
              merged: true,
              commitSHAs: [],
            }),
        },
      });

      await SyncService.syncRepository(db, encryptionKey, await getRepoRow(repoId), factory);

      const pr = await db
        .select()
        .from(schema.codeChange)
        .where(and(eq(schema.codeChange.repoId, repoId), eq(schema.codeChange.type, 'pr')))
        .get();

      expect(pr!.prStatus).toBe('merged');
    });
  });
});

// ─── Helper to load full repo row ───────────────

async function getRepoRow(repoId: string) {
  const row = await db
    .select()
    .from(schema.repository)
    .where(eq(schema.repository.id, repoId))
    .get();

  if (!row) throw new Error(`Repo ${repoId} not found`);
  return row;
}
