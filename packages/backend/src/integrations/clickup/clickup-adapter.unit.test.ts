import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClickUpAdapter } from './clickup-adapter.js';
import { ExternalAPIError } from '../../errors/index.js';

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('ClickUpAdapter', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('fetchTask', () => {
    it('should return TaskMetadata for a valid task', async () => {
      const taskData = {
        id: 'abc123',
        custom_id: 'CU-42',
        name: 'Implement feature',
        status: { status: 'in progress' },
        assignees: [{ username: 'alice' }],
        url: 'https://app.clickup.com/t/abc123',
      };

      globalThis.fetch = mockFetch(taskData);

      const adapter = new ClickUpAdapter('pk_token');
      const result = await adapter.fetchTask('abc123');

      expect(result.taskId).toBe('CU-42');
      expect(result.title).toBe('Implement feature');
      expect(result.status).toBe('in progress');
      expect(result.assignee).toBe('alice');
      expect(result.url).toBe('https://app.clickup.com/t/abc123');
      expect(result.fetchedAt).toBeTruthy();
    });

    it('should use id when custom_id is null', async () => {
      const taskData = {
        id: 'abc123',
        custom_id: null,
        name: 'Task',
        status: { status: 'open' },
        assignees: [],
        url: null,
      };

      globalThis.fetch = mockFetch(taskData);

      const adapter = new ClickUpAdapter('pk_token');
      const result = await adapter.fetchTask('abc123');

      expect(result.taskId).toBe('abc123');
      expect(result.assignee).toBeNull();
      expect(result.url).toBe('https://app.clickup.com/t/abc123');
    });

    it('should handle missing status gracefully', async () => {
      const taskData = {
        id: 'abc123',
        custom_id: null,
        name: 'Task',
        status: null,
        assignees: [],
        url: 'https://app.clickup.com/t/abc123',
      };

      globalThis.fetch = mockFetch(taskData);

      const adapter = new ClickUpAdapter('pk_token');
      const result = await adapter.fetchTask('abc123');

      expect(result.status).toBe('unknown');
    });
  });

  describe('fetchBatch', () => {
    it('should fetch tasks individually', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: `task${callCount}`,
              custom_id: null,
              name: `Task ${callCount}`,
              status: { status: 'open' },
              assignees: [],
              url: `https://app.clickup.com/t/task${callCount}`,
            }),
        });
      });

      const adapter = new ClickUpAdapter('pk_token');
      const result = await adapter.fetchBatch(['task1', 'task2']);

      expect(result).toHaveLength(2);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('should skip individual failures in batch', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'task2',
              custom_id: null,
              name: 'Task 2',
              status: { status: 'open' },
              assignees: [],
              url: 'https://app.clickup.com/t/task2',
            }),
        });
      });

      const adapter = new ClickUpAdapter('pk_token');
      const result = await adapter.fetchBatch(['task1', 'task2']);

      expect(result).toHaveLength(1);
      expect(result[0].taskId).toBe('task2');
    });
  });

  describe('error handling', () => {
    it('should throw ExternalAPIError on 429 rate limit', async () => {
      globalThis.fetch = mockFetch({}, 429);

      const adapter = new ClickUpAdapter('pk_token');
      await expect(adapter.fetchTask('task1')).rejects.toThrow(ExternalAPIError);
      await expect(adapter.fetchTask('task1')).rejects.toThrow('rate limit');
    });

    it('should throw ExternalAPIError on 401 auth failure', async () => {
      globalThis.fetch = mockFetch({}, 401);

      const adapter = new ClickUpAdapter('pk_token');
      await expect(adapter.fetchTask('task1')).rejects.toThrow(ExternalAPIError);
      await expect(adapter.fetchTask('task1')).rejects.toThrow('authentication failed');
    });

    it('should throw ExternalAPIError on other errors', async () => {
      globalThis.fetch = mockFetch({}, 500);

      const adapter = new ClickUpAdapter('pk_token');
      await expect(adapter.fetchTask('task1')).rejects.toThrow(ExternalAPIError);
    });
  });
});
