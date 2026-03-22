import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JiraAdapter } from './jira-adapter.js';
import { ExternalAPIError } from '../../errors/index.js';

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('JiraAdapter', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('fetchTask', () => {
    it('should return TaskMetadata for a valid issue', async () => {
      const issueData = {
        key: 'PROJ-123',
        fields: {
          summary: 'Fix login bug',
          status: { name: 'In Progress' },
          assignee: { displayName: 'Alice' },
        },
      };

      globalThis.fetch = mockFetch(issueData);

      const adapter = new JiraAdapter('user@test.com', 'tok', 'https://jira.example.com');
      const result = await adapter.fetchTask('PROJ-123');

      expect(result.taskId).toBe('PROJ-123');
      expect(result.title).toBe('Fix login bug');
      expect(result.status).toBe('In Progress');
      expect(result.assignee).toBe('Alice');
      expect(result.url).toBe('https://jira.example.com/browse/PROJ-123');
      expect(result.fetchedAt).toBeTruthy();
    });

    it('should return null assignee when not assigned', async () => {
      const issueData = {
        key: 'PROJ-456',
        fields: {
          summary: 'Task',
          status: { name: 'Open' },
          assignee: null,
        },
      };

      globalThis.fetch = mockFetch(issueData);

      const adapter = new JiraAdapter('user@test.com', 'tok', 'https://jira.example.com/');
      const result = await adapter.fetchTask('PROJ-456');

      expect(result.assignee).toBeNull();
      // Trailing slash should be trimmed
      expect(result.url).toBe('https://jira.example.com/browse/PROJ-456');
    });
  });

  describe('fetchBatch', () => {
    it('should return empty array for empty input', async () => {
      const adapter = new JiraAdapter('user@test.com', 'tok', 'https://jira.example.com');
      const result = await adapter.fetchBatch([]);
      expect(result).toEqual([]);
    });

    it('should return TaskMetadata array for multiple issues', async () => {
      const searchData = {
        issues: [
          {
            key: 'PROJ-1',
            fields: {
              summary: 'First',
              status: { name: 'Done' },
              assignee: { displayName: 'Bob' },
            },
          },
          {
            key: 'PROJ-2',
            fields: {
              summary: 'Second',
              status: { name: 'Open' },
              assignee: null,
            },
          },
        ],
      };

      globalThis.fetch = mockFetch(searchData);

      const adapter = new JiraAdapter('user@test.com', 'tok', 'https://jira.example.com');
      const result = await adapter.fetchBatch(['PROJ-1', 'PROJ-2']);

      expect(result).toHaveLength(2);
      expect(result[0].taskId).toBe('PROJ-1');
      expect(result[1].taskId).toBe('PROJ-2');
    });

    it('should handle missing issues array', async () => {
      globalThis.fetch = mockFetch({});

      const adapter = new JiraAdapter('user@test.com', 'tok', 'https://jira.example.com');
      const result = await adapter.fetchBatch(['PROJ-1']);

      expect(result).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should throw ExternalAPIError on 429 rate limit', async () => {
      globalThis.fetch = mockFetch({}, 429);

      const adapter = new JiraAdapter('user@test.com', 'tok', 'https://jira.example.com');
      await expect(adapter.fetchTask('PROJ-1')).rejects.toThrow(ExternalAPIError);
      await expect(adapter.fetchTask('PROJ-1')).rejects.toThrow('rate limit');
    });

    it('should throw ExternalAPIError on 401 auth failure', async () => {
      globalThis.fetch = mockFetch({}, 401);

      const adapter = new JiraAdapter('user@test.com', 'tok', 'https://jira.example.com');
      await expect(adapter.fetchTask('PROJ-1')).rejects.toThrow(ExternalAPIError);
      await expect(adapter.fetchTask('PROJ-1')).rejects.toThrow('authentication failed');
    });

    it('should throw ExternalAPIError on 403 forbidden', async () => {
      globalThis.fetch = mockFetch({}, 403);

      const adapter = new JiraAdapter('user@test.com', 'tok', 'https://jira.example.com');
      await expect(adapter.fetchTask('PROJ-1')).rejects.toThrow('authentication failed');
    });

    it('should throw ExternalAPIError on other errors', async () => {
      globalThis.fetch = mockFetch({}, 500);

      const adapter = new JiraAdapter('user@test.com', 'tok', 'https://jira.example.com');
      await expect(adapter.fetchTask('PROJ-1')).rejects.toThrow(ExternalAPIError);
    });
  });
});
