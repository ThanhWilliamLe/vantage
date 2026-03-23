import { eq, and, inArray, gte, isNotNull } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as schema from '../data/schema.js';
import { CredentialService } from './credential-service.js';
import { MemberService } from './member-service.js';
import { GitHubAdapter } from '../integrations/github/github-adapter.js';
import { GitLabAdapter } from '../integrations/gitlab/gitlab-adapter.js';
import { BitbucketAdapter } from '../integrations/bitbucket/bitbucket-adapter.js';
import { GiteaAdapter } from '../integrations/gitea/gitea-adapter.js';
import { ExternalAPIError } from '../errors/index.js';
import type { DrizzleDB } from '../data/db.js';
import type { PRDetailMetadata } from '../integrations/github/types.js';
import type { MRDetailMetadata } from '../integrations/gitlab/types.js';
import type { BitbucketPRDetailMetadata } from '../integrations/bitbucket/types.js';
import type { GiteaPRDetailMetadata } from '../integrations/gitea/types.js';
import type { SyncFilters } from '@twle/vantage-shared';

export type { SyncBatchResult } from '@twle/vantage-shared';
import type { SyncBatchResult } from '@twle/vantage-shared';

// ─── Types ──────────────────────────────────────

interface RepoRow {
  id: string;
  projectId: string;
  type: string;
  localPath: string | null;
  apiOwner: string | null;
  apiRepo: string | null;
  apiUrl: string | null;
  credentialId: string | null;
  createdAt: string;
}

/**
 * Adapter interface for testability.
 * Both GitHubAdapter and GitLabAdapter satisfy this through duck-typing,
 * and tests can provide mock implementations.
 */
export interface PlatformAdapter {
  fetchPRDetail?(owner: string, repo: string, number: number): Promise<PRDetailMetadata>;
  fetchMRDetail?(projectId: string, iid: number): Promise<MRDetailMetadata>;
}

export interface GitHubAdapterInterface {
  fetchPRsSince(
    owner: string,
    repo: string,
    since?: string,
  ): Promise<
    Array<{
      number: number;
      title: string;
      body: string | null;
      state: string;
      draft: boolean;
      merged: boolean;
      headBranch: string;
      authorLogin: string;
      linesAdded: number;
      linesDeleted: number;
      filesChanged: number;
      createdAt: string;
      updatedAt: string;
      mergedAt: string | null;
    }>
  >;
  fetchPRDetail(owner: string, repo: string, number: number): Promise<PRDetailMetadata>;
}

export interface GitLabAdapterInterface {
  fetchMRsSince(
    projectId: string,
    since?: string,
  ): Promise<
    Array<{
      iid: number;
      title: string;
      description: string | null;
      state: string;
      draft: boolean;
      sourceBranch: string;
      authorUsername: string;
      linesAdded: number;
      linesDeleted: number;
      filesChanged: number;
      createdAt: string;
      updatedAt: string;
      mergedAt: string | null;
    }>
  >;
  fetchMRDetail(projectId: string, iid: number): Promise<MRDetailMetadata>;
}

export interface BitbucketAdapterInterface {
  fetchPRsSince(
    workspace: string,
    repo: string,
    since?: string,
  ): Promise<
    Array<{
      id: number;
      title: string;
      description: string | null;
      state: string;
      draft: boolean;
      headBranch: string;
      authorLogin: string;
      linesAdded: number;
      linesDeleted: number;
      filesChanged: number;
      createdAt: string;
      updatedAt: string;
      mergedAt: string | null;
    }>
  >;
  fetchPRDetail(workspace: string, repo: string, id: number): Promise<BitbucketPRDetailMetadata>;
}

export interface GiteaAdapterInterface {
  fetchPRsSince(
    owner: string,
    repo: string,
    since?: string,
  ): Promise<
    Array<{
      number: number;
      title: string;
      body: string | null;
      state: string;
      draft: boolean;
      merged: boolean;
      headBranch: string;
      authorLogin: string;
      linesAdded: number;
      linesDeleted: number;
      filesChanged: number;
      createdAt: string;
      updatedAt: string;
      mergedAt: string | null;
    }>
  >;
  fetchPRDetail(owner: string, repo: string, number: number): Promise<GiteaPRDetailMetadata>;
}

// ─── Adapter factory (overridable for tests) ────

export type AdapterFactory = {
  createGitHub(token: string): GitHubAdapterInterface;
  createGitLab(token: string, instanceUrl?: string): GitLabAdapterInterface;
  createBitbucket(token: string): BitbucketAdapterInterface;
  createGitea(token: string, instanceUrl: string): GiteaAdapterInterface;
};

const defaultAdapterFactory: AdapterFactory = {
  createGitHub(token: string) {
    return new GitHubAdapter(token);
  },
  createGitLab(token: string, instanceUrl?: string) {
    return new GitLabAdapter(token, instanceUrl);
  },
  createBitbucket(token: string) {
    return new BitbucketAdapter(token);
  },
  createGitea(token: string, instanceUrl: string) {
    return new GiteaAdapter(token, instanceUrl);
  },
};

// ─── SyncService ────────────────────────────────

export const SyncService = {
  /**
   * Sync all repositories that have API credentials configured.
   * Repos with type 'github' or 'gitlab' and a credentialId are eligible.
   * Each repo is synced independently; one failure does not block others.
   */
  async syncAll(
    db: DrizzleDB,
    key: Buffer,
    filters?: SyncFilters,
    adapterFactory: AdapterFactory = defaultAdapterFactory,
  ): Promise<SyncBatchResult> {
    const apiTypes = ['github', 'gitlab', 'bitbucket', 'gitea'];
    let apiRepos;

    if (filters?.repoId) {
      const repo = await db.select().from(schema.repository)
        .where(and(
          eq(schema.repository.id, filters.repoId),
          isNotNull(schema.repository.credentialId),
        )).get();
      apiRepos = (repo && apiTypes.includes(repo.type)) ? [repo] : [];
    } else if (filters?.projectId) {
      const repos = await db.select().from(schema.repository)
        .where(eq(schema.repository.projectId, filters.projectId))
        .all();
      apiRepos = repos.filter(r => apiTypes.includes(r.type) && r.credentialId);
    } else {
      const repos = await db.select().from(schema.repository).all();
      apiRepos = repos.filter(r => apiTypes.includes(r.type) && r.credentialId);
    }

    const result: SyncBatchResult = {
      reposSynced: 0,
      reposSkipped: 0,
      reposFailed: 0,
      totalNewItems: 0,
      results: [],
    };

    for (const repo of apiRepos) {
      try {
        const { newItems, updatedItems } = await SyncService.syncRepository(
          db,
          key,
          repo as RepoRow,
          filters,
          adapterFactory,
        );
        result.reposSynced++;
        result.totalNewItems += newItems;
        result.results.push({
          repoId: repo.id,
          projectId: repo.projectId,
          platform: repo.type,
          status: 'synced',
          newItems,
          updatedItems,
        });
      } catch (err) {
        result.reposFailed++;
        const errorMessage = err instanceof Error ? err.message : String(err);
        result.results.push({
          repoId: repo.id,
          projectId: repo.projectId,
          platform: repo.type,
          status: 'failed',
          newItems: 0,
          updatedItems: 0,
          error: errorMessage,
        });
      }
    }

    return result;
  },

  /**
   * Sync a single repository. Fetches PR/MR list from the platform API,
   * then applies the four-tier matching algorithm for each item.
   *
   * Returns the count of newly created items.
   */
  async syncRepository(
    db: DrizzleDB,
    key: Buffer,
    repo: RepoRow,
    filters?: SyncFilters,
    adapterFactory: AdapterFactory = defaultAdapterFactory,
  ): Promise<{ newItems: number; updatedItems: number }> {
    if (!repo.credentialId) {
      throw new Error('Repository has no credential configured');
    }

    const now = new Date().toISOString();

    // Ensure sync_state row exists
    let state = await db
      .select()
      .from(schema.syncState)
      .where(eq(schema.syncState.repoId, repo.id))
      .get();

    if (!state) {
      const stateId = ulid();
      await db.insert(schema.syncState).values({
        id: stateId,
        repoId: repo.id,
        status: 'idle',
        updatedAt: now,
      });
      state = await db
        .select()
        .from(schema.syncState)
        .where(eq(schema.syncState.repoId, repo.id))
        .get();
    }

    // Reset failed repos to idle so they can be retried
    db.$client
      .prepare('UPDATE sync_state SET status = ?, error_message = NULL, updated_at = ? WHERE repo_id = ? AND status = ?')
      .run('idle', now, repo.id, 'failed');

    // Atomic concurrent sync prevention: only transition idle→syncing
    const updateResult = db.$client
      .prepare(
        'UPDATE sync_state SET status = ?, error_message = NULL, updated_at = ? WHERE repo_id = ? AND status = ?',
      )
      .run('syncing', now, repo.id, 'idle');

    if (updateResult.changes === 0) {
      return { newItems: 0, updatedItems: 0 };
    }

    try {
      // Decrypt the API token
      const token = await CredentialService.getDecryptedToken(db, key, repo.credentialId);
      const cursor = state!.lastSyncCursor ?? filters?.since ?? undefined;

      let newItems = 0;
      let updatedItems = 0;
      let latestUpdatedAt: string | undefined;

      if (repo.type === 'github') {
        const adapter = adapterFactory.createGitHub(token);
        const result = await syncGitHub(db, adapter, repo, cursor);
        newItems = result.newItems;
        updatedItems = result.updatedItems;
        latestUpdatedAt = result.latestUpdatedAt;
      } else if (repo.type === 'gitlab') {
        const credential = await db
          .select()
          .from(schema.gitCredential)
          .where(eq(schema.gitCredential.id, repo.credentialId))
          .get();
        const instanceUrl = credential?.instanceUrl ?? undefined;
        const adapter = adapterFactory.createGitLab(token, instanceUrl);
        const result = await syncGitLab(db, adapter, repo, cursor);
        newItems = result.newItems;
        updatedItems = result.updatedItems;
        latestUpdatedAt = result.latestUpdatedAt;
      } else if (repo.type === 'bitbucket') {
        const adapter = adapterFactory.createBitbucket(token);
        const result = await syncBitbucket(db, adapter, repo, cursor);
        newItems = result.newItems;
        updatedItems = result.updatedItems;
        latestUpdatedAt = result.latestUpdatedAt;
      } else if (repo.type === 'gitea') {
        const credential = await db
          .select()
          .from(schema.gitCredential)
          .where(eq(schema.gitCredential.id, repo.credentialId))
          .get();
        const instanceUrl = credential?.instanceUrl ?? '';
        const adapter = adapterFactory.createGitea(token, instanceUrl);
        const result = await syncGitea(db, adapter, repo, cursor);
        newItems = result.newItems;
        updatedItems = result.updatedItems;
        latestUpdatedAt = result.latestUpdatedAt;
      }

      // Update sync_state on success
      const syncNow = new Date().toISOString();
      await db
        .update(schema.syncState)
        .set({
          lastSyncCursor: latestUpdatedAt ?? state!.lastSyncCursor,
          lastSyncedAt: syncNow,
          status: 'idle',
          errorMessage: null,
          updatedAt: syncNow,
        })
        .where(eq(schema.syncState.repoId, repo.id));

      return { newItems, updatedItems };
    } catch (err) {
      // On error: set status to 'failed' with error details
      const errorMessage = err instanceof Error ? err.message : String(err);
      const failNow = new Date().toISOString();

      // For rate limit errors, include reset time in the error message
      const details: Record<string, unknown> = {};
      if (err instanceof ExternalAPIError && err.details?.rateLimitReset) {
        details.rateLimitReset = err.details.rateLimitReset;
      }

      await db
        .update(schema.syncState)
        .set({
          status: 'failed',
          errorMessage,
          updatedAt: failNow,
        })
        .where(eq(schema.syncState.repoId, repo.id));

      throw err;
    }
  },
};

// ─── GitHub sync logic ──────────────────────────

async function syncGitHub(
  db: DrizzleDB,
  adapter: GitHubAdapterInterface,
  repo: RepoRow,
  cursor?: string,
): Promise<{ newItems: number; updatedItems: number; latestUpdatedAt?: string }> {
  if (!repo.apiOwner || !repo.apiRepo) {
    throw new Error('GitHub repository missing apiOwner or apiRepo');
  }

  const prs = await adapter.fetchPRsSince(repo.apiOwner, repo.apiRepo, cursor);

  let newItems = 0;
  let updatedItems = 0;
  let latestUpdatedAt: string | undefined;

  for (const pr of prs) {
    // Fetch detail (with commit SHAs) for each PR
    const detail = await adapter.fetchPRDetail(repo.apiOwner, repo.apiRepo, pr.number);

    const matchResult = await matchPRToCodeChanges(db, repo, {
      type: 'pr',
      platformId: String(detail.number),
      title: detail.title,
      body: detail.body,
      branch: detail.headBranch,
      authorRaw: detail.authorLogin,
      authorName: detail.authorLogin,
      linesAdded: detail.linesAdded,
      linesDeleted: detail.linesDeleted,
      filesChanged: detail.filesChanged,
      authoredAt: detail.createdAt,
      prStatus: derivePRStatus(detail.state, detail.merged, detail.draft),
      commitSHAs: detail.commitSHAs,
      createdAt: detail.createdAt,
    });

    if (matchResult === 'created') newItems++;
    if (matchResult === 'updated') updatedItems++;

    // Track cursor: latest updated_at
    if (!latestUpdatedAt || pr.updatedAt > latestUpdatedAt) {
      latestUpdatedAt = pr.updatedAt;
    }
  }

  return { newItems, updatedItems, latestUpdatedAt };
}

// ─── GitLab sync logic ──────────────────────────

async function syncGitLab(
  db: DrizzleDB,
  adapter: GitLabAdapterInterface,
  repo: RepoRow,
  cursor?: string,
): Promise<{ newItems: number; updatedItems: number; latestUpdatedAt?: string }> {
  // GitLab uses apiOwner as projectId (numeric or path)
  const projectId = repo.apiOwner;
  if (!projectId) {
    throw new Error('GitLab repository missing apiOwner (project ID)');
  }

  const mrs = await adapter.fetchMRsSince(projectId, cursor);

  let newItems = 0;
  let updatedItems = 0;
  let latestUpdatedAt: string | undefined;

  for (const mr of mrs) {
    const detail = await adapter.fetchMRDetail(projectId, mr.iid);

    const matchResult = await matchPRToCodeChanges(db, repo, {
      type: 'mr',
      platformId: String(detail.iid),
      title: detail.title,
      body: detail.description,
      branch: detail.sourceBranch,
      authorRaw: detail.authorUsername,
      authorName: detail.authorUsername,
      linesAdded: detail.linesAdded,
      linesDeleted: detail.linesDeleted,
      filesChanged: detail.filesChanged,
      authoredAt: detail.createdAt,
      prStatus: deriveMRStatus(detail.state, detail.draft),
      commitSHAs: detail.commitSHAs,
      createdAt: detail.createdAt,
    });

    if (matchResult === 'created') newItems++;
    if (matchResult === 'updated') updatedItems++;

    if (!latestUpdatedAt || mr.updatedAt > latestUpdatedAt) {
      latestUpdatedAt = mr.updatedAt;
    }
  }

  return { newItems, updatedItems, latestUpdatedAt };
}

// ─── Bitbucket sync logic ────────────────────────

async function syncBitbucket(
  db: DrizzleDB,
  adapter: BitbucketAdapterInterface,
  repo: RepoRow,
  cursor?: string,
): Promise<{ newItems: number; updatedItems: number; latestUpdatedAt?: string }> {
  if (!repo.apiOwner || !repo.apiRepo) {
    throw new Error('Bitbucket repository missing apiOwner (workspace) or apiRepo');
  }

  const prs = await adapter.fetchPRsSince(repo.apiOwner, repo.apiRepo, cursor);

  let newItems = 0;
  let updatedItems = 0;
  let latestUpdatedAt: string | undefined;

  for (const pr of prs) {
    const detail = await adapter.fetchPRDetail(repo.apiOwner, repo.apiRepo, pr.id);

    const matchResult = await matchPRToCodeChanges(db, repo, {
      type: 'pr',
      platformId: String(detail.id),
      title: detail.title,
      body: detail.description,
      branch: detail.headBranch,
      authorRaw: detail.authorLogin,
      authorName: detail.authorLogin,
      linesAdded: detail.linesAdded,
      linesDeleted: detail.linesDeleted,
      filesChanged: detail.filesChanged,
      authoredAt: detail.createdAt,
      prStatus: deriveBitbucketPRStatus(detail.state),
      commitSHAs: detail.commitSHAs,
      createdAt: detail.createdAt,
    });

    if (matchResult === 'created') newItems++;
    if (matchResult === 'updated') updatedItems++;

    if (!latestUpdatedAt || pr.updatedAt > latestUpdatedAt) {
      latestUpdatedAt = pr.updatedAt;
    }
  }

  return { newItems, updatedItems, latestUpdatedAt };
}

// ─── Gitea sync logic ───────────────────────────

async function syncGitea(
  db: DrizzleDB,
  adapter: GiteaAdapterInterface,
  repo: RepoRow,
  cursor?: string,
): Promise<{ newItems: number; updatedItems: number; latestUpdatedAt?: string }> {
  if (!repo.apiOwner || !repo.apiRepo) {
    throw new Error('Gitea repository missing apiOwner or apiRepo');
  }

  const prs = await adapter.fetchPRsSince(repo.apiOwner, repo.apiRepo, cursor);

  let newItems = 0;
  let updatedItems = 0;
  let latestUpdatedAt: string | undefined;

  for (const pr of prs) {
    const detail = await adapter.fetchPRDetail(repo.apiOwner, repo.apiRepo, pr.number);

    const matchResult = await matchPRToCodeChanges(db, repo, {
      type: 'pr',
      platformId: String(detail.number),
      title: detail.title,
      body: detail.body,
      branch: detail.headBranch,
      authorRaw: detail.authorLogin,
      authorName: detail.authorLogin,
      linesAdded: detail.linesAdded,
      linesDeleted: detail.linesDeleted,
      filesChanged: detail.filesChanged,
      authoredAt: detail.createdAt,
      prStatus: derivePRStatus(detail.state, detail.merged, detail.draft),
      commitSHAs: detail.commitSHAs,
      createdAt: detail.createdAt,
    });

    if (matchResult === 'created') newItems++;
    if (matchResult === 'updated') updatedItems++;

    if (!latestUpdatedAt || pr.updatedAt > latestUpdatedAt) {
      latestUpdatedAt = pr.updatedAt;
    }
  }

  return { newItems, updatedItems, latestUpdatedAt };
}

// ─── Four-tier matching algorithm ───────────────

interface MatchInput {
  type: 'pr' | 'mr';
  platformId: string;
  title: string;
  body: string | null;
  branch: string;
  authorRaw: string;
  authorName: string;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  authoredAt: string;
  prStatus: string;
  commitSHAs: string[];
  createdAt: string;
}

async function matchPRToCodeChanges(
  db: DrizzleDB,
  repo: RepoRow,
  input: MatchInput,
): Promise<'created' | 'updated'> {
  const now = new Date().toISOString();

  // ── Tier 1: Platform ID match ──
  // Check if a code_change already exists for this PR/MR (re-sync case)
  const existing = await db
    .select()
    .from(schema.codeChange)
    .where(
      and(
        eq(schema.codeChange.repoId, repo.id),
        eq(schema.codeChange.type, input.type),
        eq(schema.codeChange.platformId, input.platformId),
      ),
    )
    .get();

  if (existing) {
    // Update existing record with fresh API data
    await db
      .update(schema.codeChange)
      .set({
        title: input.title,
        body: input.body,
        branch: input.branch,
        linesAdded: input.linesAdded,
        linesDeleted: input.linesDeleted,
        filesChanged: input.filesChanged,
        prStatus: input.prStatus,
        fetchedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.codeChange.id, existing.id));

    return 'updated';
  }

  // ── Tier 2: Commit SHA match ──
  // Check if any of the PR's commit SHAs exist as local code_changes
  if (input.commitSHAs.length > 0) {
    const matchedCommits = await db
      .select()
      .from(schema.codeChange)
      .where(
        and(
          eq(schema.codeChange.repoId, repo.id),
          eq(schema.codeChange.type, 'commit'),
          inArray(schema.codeChange.platformId, input.commitSHAs),
        ),
      )
      .all();

    if (matchedCommits.length > 0) {
      // Found matching commits — create the PR/MR record alongside them
      await createCodeChange(db, repo, input, now);
      return 'created';
    }
  }

  // ── Tier 3: Branch name match ──
  // Try matching by branch name and date range (fallback for squash/rebase)
  const branchMatches = await db
    .select()
    .from(schema.codeChange)
    .where(
      and(
        eq(schema.codeChange.projectId, repo.projectId),
        eq(schema.codeChange.type, 'commit'),
        eq(schema.codeChange.branch, input.branch),
        gte(schema.codeChange.authoredAt, input.createdAt),
      ),
    )
    .all();

  if (branchMatches.length > 0) {
    await createCodeChange(db, repo, input, now);
    return 'created';
  }

  // ── Tier 4: No match — create standalone ──
  await createCodeChange(db, repo, input, now);
  return 'created';
}

async function createCodeChange(
  db: DrizzleDB,
  repo: RepoRow,
  input: MatchInput,
  now: string,
): Promise<void> {
  const memberId = await resolveAuthorMember(db, repo.type, input.authorRaw);

  const id = ulid();
  await db.insert(schema.codeChange).values({
    id,
    projectId: repo.projectId,
    repoId: repo.id,
    type: input.type,
    platformId: input.platformId,
    branch: input.branch,
    title: input.title,
    body: input.body,
    authorMemberId: memberId,
    authorRaw: input.authorRaw,
    authorName: input.authorName,
    linesAdded: input.linesAdded,
    linesDeleted: input.linesDeleted,
    filesChanged: input.filesChanged,
    authoredAt: input.authoredAt,
    fetchedAt: now,
    status: 'pending',
    prStatus: input.prStatus,
    createdAt: now,
    updatedAt: now,
  });
}

async function resolveAuthorMember(
  db: DrizzleDB,
  platform: string,
  value: string,
): Promise<string | null> {
  const member = await MemberService.resolveAuthor(db, platform, value);
  return member ? member.id : null;
}

// ─── Status derivation helpers ──────────────────

function derivePRStatus(state: string, merged: boolean, draft: boolean): string {
  if (draft) return 'draft';
  if (merged) return 'merged';
  if (state === 'closed') return 'closed';
  return 'open';
}

function deriveMRStatus(state: string, draft: boolean): string {
  if (draft) return 'draft';
  if (state === 'merged') return 'merged';
  if (state === 'closed') return 'closed';
  if (state === 'locked') return 'locked';
  return 'open';
}

function deriveBitbucketPRStatus(state: string): string {
  // Bitbucket states: OPEN, MERGED, DECLINED, SUPERSEDED
  if (state === 'MERGED') return 'merged';
  if (state === 'DECLINED' || state === 'SUPERSEDED') return 'closed';
  return 'open';
}
