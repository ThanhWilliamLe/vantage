import { ExternalAPIError } from '../../errors/index.js';
import type { BitbucketPRMetadata, BitbucketPRDetailMetadata } from './types.js';

/**
 * Bitbucket Cloud REST API v2 adapter.
 * Uses app passwords or OAuth tokens for authentication.
 */
export class BitbucketAdapter {
  private baseUrl = 'https://api.bitbucket.org/2.0';

  constructor(private token: string) {}

  /**
   * Fetch PRs updated since a given timestamp.
   * Uses Bitbucket's query language to filter by updated_on.
   * Handles pagination via 'next' URL in response.
   */
  async fetchPRsSince(
    workspace: string,
    repo: string,
    since?: string,
  ): Promise<BitbucketPRMetadata[]> {
    let url = `${this.baseUrl}/repositories/${workspace}/${repo}/pullrequests?pagelen=50`;
    if (since) {
      url += `&q=updated_on>"${since}"`;
    }

    const allPRs: BitbucketPRMetadata[] = [];
    let nextUrl: string | null = url;

    while (nextUrl) {
      const res = await this.fetch(nextUrl);
      const data = await res.json();

      for (const pr of data.values || []) {
        allPRs.push({
          id: pr.id,
          title: pr.title || '',
          description: pr.description || null,
          state: pr.state,
          draft: false, // Bitbucket Cloud does not have draft PRs
          headBranch: pr.source?.branch?.name || '',
          authorLogin: pr.author?.display_name || pr.author?.nickname || 'unknown',
          linesAdded: 0, // Not available in list endpoint
          linesDeleted: 0,
          filesChanged: 0,
          createdAt: pr.created_on || '',
          updatedAt: pr.updated_on || '',
          mergedAt: pr.state === 'MERGED' ? pr.updated_on || '' : null,
        });
      }

      nextUrl = data.next || null;
    }

    return allPRs;
  }

  /**
   * Fetch detailed PR metadata including commit SHAs and diff stats.
   * Makes three API calls: PR detail, commits list, and diffstat.
   */
  async fetchPRDetail(
    workspace: string,
    repo: string,
    id: number,
  ): Promise<BitbucketPRDetailMetadata> {
    const [prRes, commitsRes] = await Promise.all([
      this.fetch(`${this.baseUrl}/repositories/${workspace}/${repo}/pullrequests/${id}`),
      this.fetch(
        `${this.baseUrl}/repositories/${workspace}/${repo}/pullrequests/${id}/commits?pagelen=100`,
      ),
    ]);

    const pr = await prRes.json();
    const commits = await commitsRes.json();

    // Get diffstat for line counts
    let linesAdded = 0;
    let linesDeleted = 0;
    let filesChanged = 0;
    try {
      const diffstatRes = await this.fetch(
        `${this.baseUrl}/repositories/${workspace}/${repo}/pullrequests/${id}/diffstat`,
      );
      const diffstat = await diffstatRes.json();
      for (const file of diffstat.values || []) {
        linesAdded += file.lines_added || 0;
        linesDeleted += file.lines_removed || 0;
        filesChanged++;
      }
    } catch {
      /* diffstat may not be available */
    }

    return {
      id: pr.id,
      title: pr.title || '',
      description: pr.description || null,
      state: pr.state,
      draft: false,
      headBranch: pr.source?.branch?.name || '',
      authorLogin: pr.author?.display_name || pr.author?.nickname || 'unknown',
      linesAdded,
      linesDeleted,
      filesChanged,
      createdAt: pr.created_on || '',
      updatedAt: pr.updated_on || '',
      mergedAt: pr.state === 'MERGED' ? pr.updated_on || '' : null,
      commitSHAs: (commits.values || []).map((c: { hash: string }) => c.hash),
    };
  }

  /**
   * Fetch the unified diff for a PR.
   */
  async getDiff(workspace: string, repo: string, id: number): Promise<string> {
    const res = await this.fetch(
      `${this.baseUrl}/repositories/${workspace}/${repo}/pullrequests/${id}/diff`,
      { Accept: 'text/plain' },
    );
    return res.text();
  }

  /**
   * Authenticated fetch wrapper with error handling.
   */
  private async fetch(url: string, extraHeaders?: Record<string, string>): Promise<Response> {
    const res = await globalThis.fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        ...extraHeaders,
      },
    });

    if (!res.ok) {
      if (res.status === 429) {
        throw new ExternalAPIError('Bitbucket API rate limit exceeded', {
          platform: 'bitbucket',
          httpStatus: 429,
        });
      }
      if (res.status === 401) {
        throw new ExternalAPIError('Bitbucket API authentication failed', {
          platform: 'bitbucket',
          httpStatus: 401,
        });
      }
      throw new ExternalAPIError(`Bitbucket API error: ${res.status} ${res.statusText}`, {
        platform: 'bitbucket',
        httpStatus: res.status,
      });
    }

    return res;
  }
}
