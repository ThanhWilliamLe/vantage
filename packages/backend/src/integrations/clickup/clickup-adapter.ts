import { ExternalAPIError } from '../../errors/index.js';
import type { TaskMetadata } from '@twle/vantage-shared';

export class ClickUpAdapter {
  private baseUrl = 'https://api.clickup.com/api/v2';

  constructor(private token: string) {}

  async fetchTask(taskId: string): Promise<TaskMetadata> {
    const res = await this.doFetch(`${this.baseUrl}/task/${taskId}?custom_task_ids=true`);
    const task = await res.json();

    return {
      taskId: task.custom_id || task.id,
      title: task.name,
      status: task.status?.status || 'unknown',
      assignee: task.assignees?.[0]?.username || null,
      url: task.url || `https://app.clickup.com/t/${task.id}`,
      fetchedAt: new Date().toISOString(),
    };
  }

  async fetchBatch(taskIds: string[]): Promise<TaskMetadata[]> {
    // ClickUp doesn't have a batch endpoint — fetch individually
    const results: TaskMetadata[] = [];
    for (const id of taskIds) {
      try {
        results.push(await this.fetchTask(id));
      } catch {
        // Skip individual failures in batch
      }
    }
    return results;
  }

  private async doFetch(url: string): Promise<Response> {
    const res = await globalThis.fetch(url, {
      headers: {
        Authorization: this.token,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      if (res.status === 429) {
        throw new ExternalAPIError('ClickUp API rate limit exceeded', {
          platform: 'clickup',
          httpStatus: 429,
        });
      }
      if (res.status === 401) {
        throw new ExternalAPIError('ClickUp API authentication failed', {
          platform: 'clickup',
          httpStatus: 401,
        });
      }
      throw new ExternalAPIError(`ClickUp API error: ${res.status}`, {
        platform: 'clickup',
        httpStatus: res.status,
      });
    }

    return res;
  }
}
