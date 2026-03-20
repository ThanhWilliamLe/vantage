import { Gitlab } from '@gitbeaker/rest';
import { ExternalAPIError } from '../../errors/index.js';
import type { MRMetadata, MRDetailMetadata } from './types.js';

/**
 * GitLab API adapter using @gitbeaker/rest.
 * Fetches MR metadata and diffs for platform integration sync.
 * Supports both gitlab.com and self-hosted instances.
 */
export class GitLabAdapter {
  private gitlab: InstanceType<typeof Gitlab>;

  constructor(
    private token: string,
    private instanceUrl?: string,
  ) {
    this.gitlab = new Gitlab({
      token,
      host: instanceUrl || 'https://gitlab.com',
    });
  }

  /**
   * Fetch MRs updated since a given timestamp.
   * Uses `updated_after` parameter (ISO 8601) on the list MRs endpoint.
   * Returns all states.
   */
  async fetchMRsSince(
    projectId: string,
    since?: string,
  ): Promise<MRMetadata[]> {
    try {
      const params: Record<string, unknown> = {
        state: 'all',
        orderBy: 'updated_at',
        sort: 'asc',
        perPage: 100,
      };

      if (since) {
        params.updatedAfter = since;
      }

      const mrs = await this.gitlab.MergeRequests.all({
        projectId,
        ...params,
      });

      return (mrs as Array<Record<string, unknown>>).map((mr) => ({
        iid: mr.iid as number,
        title: mr.title as string,
        description: (mr.description as string | null) ?? null,
        state: mr.state as MRMetadata['state'],
        draft: (mr.work_in_progress as boolean) || (mr.draft as boolean) || false,
        sourceBranch: mr.source_branch as string,
        authorUsername: (mr.author as Record<string, unknown>)?.username as string ?? 'unknown',
        linesAdded: 0, // Not available in list endpoint; populated in detail
        linesDeleted: 0,
        filesChanged: 0,
        createdAt: mr.created_at as string,
        updatedAt: mr.updated_at as string,
        mergedAt: (mr.merged_at as string | null) ?? null,
      }));
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  /**
   * Fetch detailed MR metadata including commit SHAs and diff stats.
   */
  async fetchMRDetail(
    projectId: string,
    iid: number,
  ): Promise<MRDetailMetadata> {
    try {
      const [mr, commits, changes] = await Promise.all([
        this.gitlab.MergeRequests.show(projectId, iid),
        this.gitlab.MergeRequests.allCommits(projectId, iid),
        this.gitlab.MergeRequests.allDiffs(projectId, iid),
      ]);

      const mrData = mr as Record<string, unknown>;
      const commitsData = commits as Array<Record<string, unknown>>;
      const changesData = changes as Array<Record<string, unknown>>;

      // Calculate diff stats from changes
      let linesAdded = 0;
      let linesDeleted = 0;
      for (const change of changesData) {
        const diff = (change.diff as string) ?? '';
        for (const line of diff.split('\n')) {
          if (line.startsWith('+') && !line.startsWith('+++')) linesAdded++;
          if (line.startsWith('-') && !line.startsWith('---')) linesDeleted++;
        }
      }

      return {
        iid: mrData.iid as number,
        title: mrData.title as string,
        description: (mrData.description as string | null) ?? null,
        state: mrData.state as MRMetadata['state'],
        draft: (mrData.work_in_progress as boolean) || (mrData.draft as boolean) || false,
        sourceBranch: mrData.source_branch as string,
        authorUsername: (mrData.author as Record<string, unknown>)?.username as string ?? 'unknown',
        linesAdded,
        linesDeleted,
        filesChanged: changesData.length,
        createdAt: mrData.created_at as string,
        updatedAt: mrData.updated_at as string,
        mergedAt: (mrData.merged_at as string | null) ?? null,
        commitSHAs: commitsData.map((c) => c.id as string),
      };
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  /**
   * Fetch the unified diff for an MR by combining per-file diffs.
   */
  async getDiff(
    projectId: string,
    iid: number,
  ): Promise<string> {
    try {
      const changes = await this.gitlab.MergeRequests.allDiffs(projectId, iid);
      const changesData = changes as Array<Record<string, unknown>>;

      return changesData
        .map((c) => {
          const oldPath = c.old_path as string;
          const newPath = c.new_path as string;
          const diff = (c.diff as string) ?? '';
          return `diff --git a/${oldPath} b/${newPath}\n${diff}`;
        })
        .join('\n');
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  /**
   * Wrap gitbeaker errors into ExternalAPIError with platform context.
   */
  private wrapError(error: unknown): ExternalAPIError {
    if (error instanceof ExternalAPIError) return error;

    const message = error instanceof Error ? error.message : String(error);
    const cause = error as { cause?: { response?: { status?: number; headers?: Record<string, string> } } };
    const httpStatus = cause?.cause?.response?.status
      ?? (error as { statusCode?: number }).statusCode;

    // Rate limit
    if (httpStatus === 429) {
      const retryAfter = cause?.cause?.response?.headers?.['retry-after'];
      const resetTime = retryAfter
        ? new Date(Date.now() + parseInt(retryAfter, 10) * 1000).toISOString()
        : undefined;

      return new ExternalAPIError(
        `GitLab API rate limit exceeded: ${message}`,
        { platform: 'gitlab', httpStatus: 429, rateLimitReset: resetTime },
      );
    }

    // Auth failure
    if (httpStatus === 401) {
      return new ExternalAPIError(
        'GitLab API authentication failed: token may be expired or revoked',
        { platform: 'gitlab', httpStatus: 401 },
      );
    }

    return new ExternalAPIError(
      `GitLab API error: ${message}`,
      { platform: 'gitlab', httpStatus },
    );
  }
}
