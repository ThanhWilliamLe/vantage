import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GiteaAdapter } from './gitea-adapter.js';
import { ExternalAPIError } from '../../errors/index.js';

// ─── Mock fetch ──────────────────────────────────

function mockFetch(
  responses: Array<{
    ok: boolean;
    status: number;
    statusText?: string;
    json?: unknown;
    text?: string;
  }>,
) {
  let callIndex = 0;
  return vi.fn(async () => {
    const resp = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return {
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText ?? 'OK',
      json: async () => resp.json,
      text: async () => resp.text ?? '',
    } as unknown as Response;
  });
}

describe('GiteaAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('strips trailing slash from instanceUrl', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, json: [] }]);
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new GiteaAdapter('token', 'https://gitea.example.com/');
      await adapter.fetchPRsSince('owner', 'repo');

      const url = (fetchMock.mock.calls[0] as unknown[])[0] as string;
      expect(url).toMatch(/^https:\/\/gitea\.example\.com\/api\/v1\//);
      expect(url).not.toContain('//api');
    });
  });

  describe('fetchPRsSince', () => {
    it('returns mapped PRs from list endpoint', async () => {
      const fetchMock = mockFetch([
        {
          ok: true,
          status: 200,
          json: [
            {
              number: 1,
              title: 'Add feature',
              body: 'Some description',
              state: 'open',
              draft: false,
              merged: false,
              head: { ref: 'feature/add', label: 'feature/add' },
              user: { login: 'alice', username: 'alice' },
              additions: 50,
              deletions: 10,
              changed_files: 3,
              created_at: '2026-03-18T09:00:00Z',
              updated_at: '2026-03-18T14:00:00Z',
              merged_at: null,
            },
            {
              number: 2,
              title: 'Fix bug',
              body: null,
              state: 'closed',
              draft: false,
              merged: true,
              head: { ref: 'fix/bug' },
              user: { login: 'bob' },
              additions: 5,
              deletions: 2,
              changed_files: 1,
              created_at: '2026-03-17T09:00:00Z',
              updated_at: '2026-03-18T10:00:00Z',
              merged_at: '2026-03-18T09:30:00Z',
            },
          ],
        },
      ]);
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new GiteaAdapter('test-token', 'https://gitea.example.com');
      const prs = await adapter.fetchPRsSince('owner', 'repo');

      expect(prs).toHaveLength(2);
      expect(prs[0].number).toBe(1);
      expect(prs[0].title).toBe('Add feature');
      expect(prs[0].state).toBe('open');
      expect(prs[0].headBranch).toBe('feature/add');
      expect(prs[0].authorLogin).toBe('alice');
      expect(prs[0].merged).toBe(false);
      expect(prs[0].linesAdded).toBe(50);

      expect(prs[1].number).toBe(2);
      expect(prs[1].merged).toBe(true);
      expect(prs[1].mergedAt).toBe('2026-03-18T09:30:00Z');
    });

    it('handles pagination via page parameter', async () => {
      const page1 = Array.from({ length: 50 }, (_, i) => ({
        number: i + 1,
        title: `PR ${i + 1}`,
        body: null,
        state: 'open',
        draft: false,
        merged: false,
        head: { ref: 'main' },
        user: { login: 'dev' },
        additions: 0,
        deletions: 0,
        changed_files: 0,
        created_at: '',
        updated_at: '',
        merged_at: null,
      }));

      const fetchMock = mockFetch([
        { ok: true, status: 200, json: page1 },
        {
          ok: true,
          status: 200,
          json: [
            {
              number: 51,
              title: 'PR 51',
              body: null,
              state: 'open',
              draft: false,
              merged: false,
              head: { ref: 'main' },
              user: { login: 'dev' },
              additions: 0,
              deletions: 0,
              changed_files: 0,
              created_at: '',
              updated_at: '',
              merged_at: null,
            },
          ],
        },
      ]);
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new GiteaAdapter('token', 'https://gitea.example.com');
      const prs = await adapter.fetchPRsSince('owner', 'repo');

      expect(prs).toHaveLength(51);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('includes since filter when provided', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, json: [] }]);
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new GiteaAdapter('token', 'https://gitea.example.com');
      await adapter.fetchPRsSince('owner', 'repo', '2026-03-18T00:00:00Z');

      const url = (fetchMock.mock.calls[0] as unknown[])[0] as string;
      expect(url).toContain('since=2026-03-18T00:00:00Z');
    });
  });

  describe('fetchPRDetail', () => {
    it('returns detail with commit SHAs', async () => {
      const fetchMock = mockFetch([
        // PR detail
        {
          ok: true,
          status: 200,
          json: {
            number: 42,
            title: 'Feature PR',
            body: 'Details here',
            state: 'open',
            draft: true,
            merged: false,
            head: { ref: 'feature/x' },
            user: { login: 'alice' },
            additions: 100,
            deletions: 20,
            changed_files: 5,
            created_at: '2026-03-18T09:00:00Z',
            updated_at: '2026-03-18T14:00:00Z',
            merged_at: null,
          },
        },
        // Commits
        {
          ok: true,
          status: 200,
          json: [{ sha: 'aaa111' }, { sha: 'bbb222' }],
        },
      ]);
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new GiteaAdapter('token', 'https://gitea.example.com');
      const detail = await adapter.fetchPRDetail('owner', 'repo', 42);

      expect(detail.number).toBe(42);
      expect(detail.title).toBe('Feature PR');
      expect(detail.draft).toBe(true);
      expect(detail.commitSHAs).toEqual(['aaa111', 'bbb222']);
      expect(detail.linesAdded).toBe(100);
      expect(detail.linesDeleted).toBe(20);
      expect(detail.filesChanged).toBe(5);
    });
  });

  describe('error handling', () => {
    it('throws ExternalAPIError on 401', async () => {
      const fetchMock = mockFetch([{ ok: false, status: 401, statusText: 'Unauthorized' }]);
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new GiteaAdapter('bad-token', 'https://gitea.example.com');
      await expect(adapter.fetchPRsSince('owner', 'repo')).rejects.toThrow(ExternalAPIError);
      await expect(adapter.fetchPRsSince('owner', 'repo')).rejects.toThrow('authentication failed');
    });

    it('throws ExternalAPIError on 429 rate limit', async () => {
      const fetchMock = mockFetch([{ ok: false, status: 429, statusText: 'Too Many Requests' }]);
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new GiteaAdapter('token', 'https://gitea.example.com');
      await expect(adapter.fetchPRsSince('owner', 'repo')).rejects.toThrow(ExternalAPIError);
      await expect(adapter.fetchPRsSince('owner', 'repo')).rejects.toThrow('rate limit');
    });

    it('throws ExternalAPIError on other HTTP errors', async () => {
      const fetchMock = mockFetch([
        { ok: false, status: 500, statusText: 'Internal Server Error' },
      ]);
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new GiteaAdapter('token', 'https://gitea.example.com');
      await expect(adapter.fetchPRsSince('owner', 'repo')).rejects.toThrow(ExternalAPIError);
      await expect(adapter.fetchPRsSince('owner', 'repo')).rejects.toThrow('500');
    });
  });

  describe('getDiff', () => {
    it('returns diff text', async () => {
      const fetchMock = mockFetch([
        { ok: true, status: 200, text: 'diff --git a/file.ts b/file.ts\n+new line' },
      ]);
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new GiteaAdapter('token', 'https://gitea.example.com');
      const diff = await adapter.getDiff('owner', 'repo', 1);
      expect(diff).toContain('diff --git');
    });
  });

  describe('authentication', () => {
    it('uses token-style auth header', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, json: [] }]);
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new GiteaAdapter('my-token', 'https://gitea.example.com');
      await adapter.fetchPRsSince('owner', 'repo');

      const headers = ((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).headers as Record<
        string,
        string
      >;
      expect(headers['Authorization']).toBe('token my-token');
    });
  });
});
