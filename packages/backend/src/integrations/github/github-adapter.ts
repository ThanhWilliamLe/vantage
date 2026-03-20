import { Octokit } from '@octokit/rest';
import { ExternalAPIError } from '../../errors/index.js';
import type { PRMetadata, PRDetailMetadata } from './types.js';

/**
 * GitHub API adapter using @octokit/rest.
 * Fetches PR metadata and diffs for platform integration sync.
 */
export class GitHubAdapter {
  private octokit: Octokit;

  constructor(private token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  /**
   * Fetch PRs updated since a given timestamp.
   * Uses the `since` parameter (ISO 8601) on the list pulls endpoint,
   * filtering by update time. Returns all states (open, closed, merged).
   */
  async fetchPRsSince(
    owner: string,
    repo: string,
    since?: string,
  ): Promise<PRMetadata[]> {
    try {
      const params: Record<string, unknown> = {
        owner,
        repo,
        state: 'all',
        sort: 'updated',
        direction: 'asc',
        per_page: 100,
      };

      if (since) {
        params.since = since;
      }

      const { data } = await this.octokit.pulls.list(
        params as Parameters<Octokit['pulls']['list']>[0],
      );

      return data.map((pr) => {
        const prAny = pr as Record<string, unknown>;
        return {
          number: pr.number,
          title: pr.title,
          body: pr.body,
          state: pr.state as 'open' | 'closed',
          draft: pr.draft ?? false,
          merged: pr.merged_at !== null,
          headBranch: pr.head.ref,
          authorLogin: pr.user?.login ?? 'unknown',
          linesAdded: (prAny.additions as number) ?? 0,
          linesDeleted: (prAny.deletions as number) ?? 0,
          filesChanged: (prAny.changed_files as number) ?? 0,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          mergedAt: pr.merged_at,
        };
      });
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  /**
   * Fetch detailed PR metadata including commit SHAs.
   * Makes two API calls: one for PR detail, one for commit list.
   */
  async fetchPRDetail(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PRDetailMetadata> {
    try {
      const [prResponse, commitsResponse] = await Promise.all([
        this.octokit.pulls.get({ owner, repo, pull_number: number }),
        this.octokit.pulls.listCommits({
          owner,
          repo,
          pull_number: number,
          per_page: 250,
        }),
      ]);

      const pr = prResponse.data;
      const commits = commitsResponse.data;

      return {
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state as 'open' | 'closed',
        draft: pr.draft ?? false,
        merged: pr.merged_at !== null,
        headBranch: pr.head.ref,
        authorLogin: pr.user?.login ?? 'unknown',
        linesAdded: pr.additions ?? 0,
        linesDeleted: pr.deletions ?? 0,
        filesChanged: pr.changed_files ?? 0,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        mergedAt: pr.merged_at,
        commitSHAs: commits.map((c) => c.sha),
      };
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  /**
   * Fetch the unified diff for a PR.
   * Uses the GitHub media type for diff format.
   */
  async getDiff(
    owner: string,
    repo: string,
    number: number,
  ): Promise<string> {
    try {
      const { data } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: number,
        mediaType: { format: 'diff' },
      });

      // When requesting diff format, data comes back as a string
      return data as unknown as string;
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  /**
   * Wrap Octokit errors into ExternalAPIError with platform context.
   * Handles rate limiting (429) and auth failures (401) specifically.
   */
  private wrapError(error: unknown): ExternalAPIError {
    if (error instanceof ExternalAPIError) return error;

    const httpStatus = (error as { status?: number }).status;
    const message = error instanceof Error ? error.message : String(error);

    // Rate limit: extract reset time from headers if available
    if (httpStatus === 403 || httpStatus === 429) {
      const resetHeader = (error as { response?: { headers?: Record<string, string> } })
        .response?.headers?.['x-ratelimit-reset'];
      const resetTime = resetHeader
        ? new Date(parseInt(resetHeader, 10) * 1000).toISOString()
        : undefined;

      return new ExternalAPIError(
        `GitHub API rate limit exceeded: ${message}`,
        { platform: 'github', httpStatus: httpStatus ?? 429, rateLimitReset: resetTime },
      );
    }

    // Auth failure
    if (httpStatus === 401) {
      return new ExternalAPIError(
        'GitHub API authentication failed: token may be expired or revoked',
        { platform: 'github', httpStatus: 401 },
      );
    }

    return new ExternalAPIError(
      `GitHub API error: ${message}`,
      { platform: 'github', httpStatus },
    );
  }
}
