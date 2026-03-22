import { ExternalAPIError } from '../../errors/index.js';
import type { JiraIssue } from './types.js';
import type { TaskMetadata } from '@twle/vantage-shared';

export class JiraAdapter {
  private baseUrl: string;
  private authHeader: string;

  constructor(email: string, token: string, instanceUrl: string) {
    this.baseUrl = instanceUrl.replace(/\/$/, '');
    // Jira Cloud uses Basic Auth: email:api_token
    this.authHeader = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
  }

  async fetchTask(issueKey: string): Promise<TaskMetadata> {
    const res = await this.doFetch(
      `${this.baseUrl}/rest/api/3/issue/${issueKey}?fields=summary,status,assignee`,
    );
    const issue: JiraIssue = await res.json();

    return {
      taskId: issue.key,
      title: issue.fields.summary,
      status: issue.fields.status.name,
      assignee: issue.fields.assignee?.displayName || null,
      url: `${this.baseUrl}/browse/${issue.key}`,
      fetchedAt: new Date().toISOString(),
    };
  }

  async fetchBatch(issueKeys: string[]): Promise<TaskMetadata[]> {
    if (issueKeys.length === 0) return [];

    // Sanitize keys: only allow valid Jira issue key format
    const validKeys = issueKeys.filter((k) => /^[A-Z][A-Z0-9_]+-\d+$/.test(k));
    if (validKeys.length === 0) return [];

    // Batch in chunks of 50 to avoid URL length limits
    const results: TaskMetadata[] = [];
    for (let i = 0; i < validKeys.length; i += 50) {
      const chunk = validKeys.slice(i, i + 50);
      const jql = `key in (${chunk.map((k) => `"${k}"`).join(',')})`;
      const res = await this.doFetch(
        `${this.baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,status,assignee&maxResults=${chunk.length}`,
      );
      const data = await res.json();

      for (const issue of (data.issues || []) as JiraIssue[]) {
        results.push({
          taskId: issue.key,
          title: issue.fields.summary,
          status: issue.fields.status.name,
          assignee: issue.fields.assignee?.displayName || null,
          url: `${this.baseUrl}/browse/${issue.key}`,
          fetchedAt: new Date().toISOString(),
        });
      }
    }

    return results;
  }

  private async doFetch(url: string): Promise<Response> {
    const res = await globalThis.fetch(url, {
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      if (res.status === 429) {
        throw new ExternalAPIError('Jira API rate limit exceeded', {
          platform: 'jira',
          httpStatus: 429,
        });
      }
      if (res.status === 401 || res.status === 403) {
        throw new ExternalAPIError('Jira API authentication failed', {
          platform: 'jira',
          httpStatus: res.status,
        });
      }
      throw new ExternalAPIError(`Jira API error: ${res.status}`, {
        platform: 'jira',
        httpStatus: res.status,
      });
    }

    return res;
  }
}
