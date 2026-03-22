import { ExternalAPIError } from '../../errors/index.js';
import type { GiteaPRMetadata, GiteaPRDetailMetadata } from './types.js';

/**
 * Gitea API v1 adapter.
 * Always self-hosted — instanceUrl is required.
 * Uses personal access tokens for authentication.
 */
export class GiteaAdapter {
  private baseUrl: string;

  constructor(
    private token: string,
    instanceUrl: string,
  ) {
    // Normalize: strip trailing slash
    const base = instanceUrl.replace(/\/+$/, '');
    this.baseUrl = `${base}/api/v1`;
  }

  /**
   * Fetch PRs updated since a given timestamp.
   * Uses Gitea's GitHub-compatible pulls endpoint.
   * Handles pagination via page parameter.
   */
  async fetchPRsSince(owner: string, repo: string, since?: string): Promise<GiteaPRMetadata[]> {
    const allPRs: GiteaPRMetadata[] = [];
    let page = 1;
    const limit = 50;

    while (true) {
      let url = `${this.baseUrl}/repos/${owner}/${repo}/pulls?state=all&sort=updated&limit=${limit}&page=${page}`;
      if (since) {
        // Gitea supports since parameter for filtering by updated time
        url += `&since=${since}`;
      }

      const res = await this.fetch(url);
      const prs = await res.json();

      if (!Array.isArray(prs) || prs.length === 0) break;

      for (const pr of prs) {
        allPRs.push({
          number: pr.number,
          title: pr.title || '',
          body: pr.body || null,
          state: pr.state as 'open' | 'closed',
          draft: pr.draft ?? false,
          merged: pr.merged ?? false,
          headBranch: pr.head?.ref || pr.head?.label || '',
          authorLogin: pr.user?.login || pr.user?.username || 'unknown',
          linesAdded: pr.additions ?? 0,
          linesDeleted: pr.deletions ?? 0,
          filesChanged: pr.changed_files ?? 0,
          createdAt: pr.created_at || '',
          updatedAt: pr.updated_at || '',
          mergedAt: pr.merged_at || null,
        });
      }

      if (prs.length < limit) break;
      page++;
    }

    return allPRs;
  }

  /**
   * Fetch detailed PR metadata including commit SHAs.
   * Makes two API calls: PR detail and commit list.
   */
  async fetchPRDetail(owner: string, repo: string, number: number): Promise<GiteaPRDetailMetadata> {
    const [prRes, commitsRes] = await Promise.all([
      this.fetch(`${this.baseUrl}/repos/${owner}/${repo}/pulls/${number}`),
      this.fetch(`${this.baseUrl}/repos/${owner}/${repo}/pulls/${number}/commits?limit=250`),
    ]);

    const pr = await prRes.json();
    const commits = await commitsRes.json();

    return {
      number: pr.number,
      title: pr.title || '',
      body: pr.body || null,
      state: pr.state as 'open' | 'closed',
      draft: pr.draft ?? false,
      merged: pr.merged ?? false,
      headBranch: pr.head?.ref || pr.head?.label || '',
      authorLogin: pr.user?.login || pr.user?.username || 'unknown',
      linesAdded: pr.additions ?? 0,
      linesDeleted: pr.deletions ?? 0,
      filesChanged: pr.changed_files ?? 0,
      createdAt: pr.created_at || '',
      updatedAt: pr.updated_at || '',
      mergedAt: pr.merged_at || null,
      commitSHAs: (Array.isArray(commits) ? commits : []).map(
        (c: { sha?: string; id?: string }) => c.sha || c.id || '',
      ),
    };
  }

  /**
   * Fetch the unified diff for a PR.
   */
  async getDiff(owner: string, repo: string, number: number): Promise<string> {
    const res = await this.fetch(`${this.baseUrl}/repos/${owner}/${repo}/pulls/${number}.diff`, {
      Accept: 'text/plain',
    });
    return res.text();
  }

  /**
   * Authenticated fetch wrapper with error handling.
   */
  private async fetch(url: string, extraHeaders?: Record<string, string>): Promise<Response> {
    const res = await globalThis.fetch(url, {
      headers: {
        Authorization: `token ${this.token}`,
        Accept: 'application/json',
        ...extraHeaders,
      },
    });

    if (!res.ok) {
      if (res.status === 429) {
        throw new ExternalAPIError('Gitea API rate limit exceeded', {
          platform: 'gitea',
          httpStatus: 429,
        });
      }
      if (res.status === 401) {
        throw new ExternalAPIError('Gitea API authentication failed', {
          platform: 'gitea',
          httpStatus: 401,
        });
      }
      throw new ExternalAPIError(`Gitea API error: ${res.status} ${res.statusText}`, {
        platform: 'gitea',
        httpStatus: res.status,
      });
    }

    return res;
  }
}
