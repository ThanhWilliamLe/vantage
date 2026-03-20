import { eq, and } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as schema from '../data/schema.js';
import { GitReader } from '../integrations/git/git-reader.js';
import { MemberService } from './member-service.js';
import type { DrizzleDB } from '../data/db.js';
import type { RawCommit } from '../integrations/git/types.js';

export interface BatchResult {
  reposScanned: number;
  reposSkipped: number;
  reposFailed: number;
  totalNewCommits: number;
  results: Array<{
    repoId: string;
    projectId: string;
    localPath: string;
    status: 'scanned' | 'skipped' | 'failed';
    newCommits: number;
    error?: string;
  }>;
}

export const ScanService = {
  async scanAll(db: DrizzleDB): Promise<BatchResult> {
    // Fetch all local repos (type = 'local' and localPath set)
    const repos = await db
      .select()
      .from(schema.repository)
      .where(eq(schema.repository.type, 'local'))
      .all();

    const result: BatchResult = {
      reposScanned: 0,
      reposSkipped: 0,
      reposFailed: 0,
      totalNewCommits: 0,
      results: [],
    };

    for (const repo of repos) {
      if (!repo.localPath) {
        result.reposSkipped++;
        result.results.push({
          repoId: repo.id,
          projectId: repo.projectId,
          localPath: '',
          status: 'skipped',
          newCommits: 0,
          error: 'No local path configured',
        });
        continue;
      }

      try {
        const newCommits = await ScanService.scanRepository(db, repo);
        result.reposScanned++;
        result.totalNewCommits += newCommits;
        result.results.push({
          repoId: repo.id,
          projectId: repo.projectId,
          localPath: repo.localPath,
          status: 'scanned',
          newCommits,
        });
      } catch (err) {
        result.reposFailed++;
        const errorMessage = err instanceof Error ? err.message : String(err);
        result.results.push({
          repoId: repo.id,
          projectId: repo.projectId,
          localPath: repo.localPath,
          status: 'failed',
          newCommits: 0,
          error: errorMessage,
        });
      }
    }

    return result;
  },

  async scanRepository(
    db: DrizzleDB,
    repo: { id: string; projectId: string; localPath: string | null },
  ): Promise<number> {
    if (!repo.localPath) {
      throw new Error('Repository has no local path');
    }

    const now = new Date().toISOString();

    // Ensure scan_state row exists
    let state = await db
      .select()
      .from(schema.scanState)
      .where(eq(schema.scanState.repoId, repo.id))
      .get();

    if (!state) {
      const stateId = ulid();
      await db.insert(schema.scanState).values({
        id: stateId,
        repoId: repo.id,
        status: 'idle',
        updatedAt: now,
      });
      state = await db
        .select()
        .from(schema.scanState)
        .where(eq(schema.scanState.repoId, repo.id))
        .get();
    }

    // Atomic concurrent scan prevention: only transition idle→scanning
    const updateResult = db.$client
      .prepare(
        'UPDATE scan_state SET status = ?, error_message = NULL, updated_at = ? WHERE repo_id = ? AND status = ?',
      )
      .run('scanning', now, repo.id, 'idle');

    if (updateResult.changes === 0) {
      // Either already scanning or in failed state that wasn't reset
      return 0;
    }

    try {
      let rawCommits: RawCommit[];

      if (!state!.lastCommitHash) {
        // First scan — get everything
        rawCommits = await GitReader.getAllCommits(repo.localPath);
      } else {
        // Incremental — find the authored_at of the last known commit
        const lastChange = await db
          .select()
          .from(schema.codeChange)
          .where(
            and(
              eq(schema.codeChange.repoId, repo.id),
              eq(schema.codeChange.type, 'commit'),
              eq(schema.codeChange.platformId, state!.lastCommitHash),
            ),
          )
          .get();

        let afterDate: string;
        if (lastChange) {
          // Subtract 1 day for safety window
          const date = new Date(lastChange.authoredAt);
          date.setDate(date.getDate() - 1);
          afterDate = date.toISOString();
        } else {
          // Fallback: use lastScannedAt minus 1 day
          const date = new Date(state!.lastScannedAt || now);
          date.setDate(date.getDate() - 1);
          afterDate = date.toISOString();
        }

        rawCommits = await GitReader.getNewCommits(repo.localPath, afterDate);
      }

      // Load known SHAs for this repo into a Set for O(1) dedup
      const existingChanges = await db
        .select({ platformId: schema.codeChange.platformId })
        .from(schema.codeChange)
        .where(and(eq(schema.codeChange.repoId, repo.id), eq(schema.codeChange.type, 'commit')))
        .all();

      const knownHashes = new Set(existingChanges.map((c) => c.platformId));

      // Filter out already-known commits
      const newCommits = rawCommits.filter((c) => !knownHashes.has(c.hash));

      // Resolve branch names for new commits
      if (newCommits.length > 0) {
        const branchMap = await GitReader.getBranchesForCommits(
          repo.localPath!,
          newCommits.map((c) => c.hash),
        );
        for (const commit of newCommits) {
          commit.branch = branchMap.get(commit.hash) ?? null;
        }
      }

      // Convert to code_change records and insert
      for (const commit of newCommits) {
        const memberId = await resolveAuthorMember(db, commit.authorEmail);

        const id = ulid();
        const changeNow = new Date().toISOString();

        try {
          await db.insert(schema.codeChange).values({
            id,
            projectId: repo.projectId,
            repoId: repo.id,
            type: 'commit',
            platformId: commit.hash,
            branch: commit.branch,
            title: commit.subject,
            body: commit.body || null,
            authorMemberId: memberId,
            authorRaw: commit.authorEmail,
            authorName: commit.authorName,
            linesAdded: commit.linesAdded,
            linesDeleted: commit.linesDeleted,
            filesChanged: commit.filesChanged,
            authoredAt: commit.authorDate,
            fetchedAt: changeNow,
            status: 'pending',
            createdAt: changeNow,
            updatedAt: changeNow,
          });
        } catch (err: unknown) {
          // Unique constraint violation — commit already exists (safety net)
          if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
            continue;
          }
          throw err;
        }
      }

      // Update scan_state
      const latestHash =
        newCommits.length > 0
          ? newCommits[0].hash // first commit in log output is the most recent
          : state!.lastCommitHash;

      const scanNow = new Date().toISOString();
      await db
        .update(schema.scanState)
        .set({
          lastCommitHash: latestHash,
          lastScannedAt: scanNow,
          status: 'idle',
          errorMessage: null,
          updatedAt: scanNow,
        })
        .where(eq(schema.scanState.repoId, repo.id));

      return newCommits.length;
    } catch (err) {
      // On error: set status to 'failed'
      const errorMessage = err instanceof Error ? err.message : String(err);
      const failNow = new Date().toISOString();
      await db
        .update(schema.scanState)
        .set({
          status: 'failed',
          errorMessage,
          updatedAt: failNow,
        })
        .where(eq(schema.scanState.repoId, repo.id));

      throw err;
    }
  },
};

async function resolveAuthorMember(db: DrizzleDB, email: string): Promise<string | null> {
  const member = await MemberService.resolveAuthor(db, 'git', email);
  return member ? member.id : null;
}
