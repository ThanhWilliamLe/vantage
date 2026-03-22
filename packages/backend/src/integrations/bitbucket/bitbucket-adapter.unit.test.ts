import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BitbucketAdapter } from './bitbucket-adapter.js';
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

describe('BitbucketAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchPRsSince', () => {
    it('returns mapped PRs from list endpoint', async () => {
      const fetchMock = mockFetch([
        {
          ok: true,
          status: 200,
          json: {
            values: [
              {
                id: 1,
                title: 'Add feature',
                description: 'Some description',
                state: 'OPEN',
                source: { branch: { name: 'feature/add' } },
                author: { display_name: 'Alice', nickname: 'alice' },
                created_on: '2026-03-18T09:00:00Z',
                updated_on: '2026-03-18T14:00:00Z',
              },
              {
                id: 2,
                title: 'Fix bug',
                description: null,
                state: 'MERGED',
                source: { branch: { name: 'fix/bug' } },
                author: { display_name: 'Bob' },
                created_on: '2026-03-17T09:00:00Z',
                updated_on: '2026-03-18T10:00:00Z',
              },
            ],
            next: null,
          },
        },
      ]);
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new BitbucketAdapter('test-token');
      const prs = await adapter.fetchPRsSince('my-workspace', 'my-repo');

      expect(prs).toHaveLength(2);
      expect(prs[0].id).toBe(1);
      expect(prs[0].title).toBe('Add feature');
      expect(prs[0].state).toBe('OPEN');
      expect(prs[0].headBranch).toBe('feature/add');
      expect(prs[0].authorLogin).toBe('Alice');
      expect(prs[0].mergedAt).toBeNull();
      expect(prs[0].draft).toBe(false);

      expect(prs[1].id).toBe(2);
      expect(prs[1].state).toBe('MERGED');
      expect(prs[1].mergedAt).toBe('2026-03-18T10:00:00Z');
    });

    it('handles pagination via next URL', async () => {
      const fetchMock = mockFetch([
        {
          ok: true,
          status: 200,
          json: {
            values: [
              {
                id: 1,
                title: 'PR 1',
                state: 'OPEN',
                source: { branch: { name: 'a' } },
                author: { nickname: 'a' },
                created_on: '',
                updated_on: '',
              },
            ],
            next: 'https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests?page=2',
          },
        },
        {
          ok: true,
          status: 200,
          json: {
            values: [
              {
                id: 2,
                title: 'PR 2',
                state: 'OPEN',
                source: { branch: { name: 'b' } },
                author: { nickname: 'b' },
                created_on: '',
                updated_on: '',
              },
            ],
            next: null,
          },
        },
      ]);
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new BitbucketAdapter('test-token');
      const prs = await adapter.fetchPRsSince('ws', 'repo');

      expect(prs).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('includes since filter in query when provided', async () => {
      const fetchMock = mockFetch([{ ok: true, status: 200, json: { values: [], next: null } }]);
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new BitbucketAdapter('test-token');
      await adapter.fetchPRsSince('ws', 'repo', '2026-03-18T00:00:00Z');

      const url = (fetchMock.mock.calls[0] as unknown[])[0] as string;
      expect(url).toContain('q=updated_on>"2026-03-18T00:00:00Z"');
    });
  });

  describe('fetchPRDetail', () => {
    it('returns detail with commit SHAs and diffstat', async () => {
      const fetchMock = mockFetch([
        // PR detail
        {
          ok: true,
          status: 200,
          json: {
            id: 42,
            title: 'Feature PR',
            description: 'Details here',
            state: 'OPEN',
            source: { branch: { name: 'feature/x' } },
            author: { display_name: 'Alice', nickname: 'alice' },
            created_on: '2026-03-18T09:00:00Z',
            updated_on: '2026-03-18T14:00:00Z',
          },
        },
        // Commits
        {
          ok: true,
          status: 200,
          json: {
            values: [{ hash: 'aaa111' }, { hash: 'bbb222' }],
          },
        },
        // Diffstat
        {
          ok: true,
          status: 200,
          json: {
            values: [
              { lines_added: 10, lines_removed: 3 },
              { lines_added: 5, lines_removed: 1 },
            ],
          },
        },
      ]);
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new BitbucketAdapter('test-token');
      const detail = await adapter.fetchPRDetail('ws', 'repo', 42);

      expect(detail.id).toBe(42);
      expect(detail.title).toBe('Feature PR');
      expect(detail.commitSHAs).toEqual(['aaa111', 'bbb222']);
      expect(detail.linesAdded).toBe(15);
      expect(detail.linesDeleted).toBe(4);
      expect(detail.filesChanged).toBe(2);
    });
  });

  describe('error handling', () => {
    it('throws ExternalAPIError on 401', async () => {
      const fetchMock = mockFetch([{ ok: false, status: 401, statusText: 'Unauthorized' }]);
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new BitbucketAdapter('bad-token');
      await expect(adapter.fetchPRsSince('ws', 'repo')).rejects.toThrow(ExternalAPIError);
      await expect(adapter.fetchPRsSince('ws', 'repo')).rejects.toThrow('authentication failed');
    });

    it('throws ExternalAPIError on 429 rate limit', async () => {
      const fetchMock = mockFetch([{ ok: false, status: 429, statusText: 'Too Many Requests' }]);
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new BitbucketAdapter('token');
      await expect(adapter.fetchPRsSince('ws', 'repo')).rejects.toThrow(ExternalAPIError);
      await expect(adapter.fetchPRsSince('ws', 'repo')).rejects.toThrow('rate limit');
    });

    it('throws ExternalAPIError on other HTTP errors', async () => {
      const fetchMock = mockFetch([
        { ok: false, status: 500, statusText: 'Internal Server Error' },
      ]);
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new BitbucketAdapter('token');
      await expect(adapter.fetchPRsSince('ws', 'repo')).rejects.toThrow(ExternalAPIError);
      await expect(adapter.fetchPRsSince('ws', 'repo')).rejects.toThrow('500');
    });
  });

  describe('getDiff', () => {
    it('returns diff text', async () => {
      const fetchMock = mockFetch([
        { ok: true, status: 200, text: 'diff --git a/file.ts b/file.ts\n+new line' },
      ]);
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new BitbucketAdapter('token');
      const diff = await adapter.getDiff('ws', 'repo', 1);
      expect(diff).toContain('diff --git');
    });
  });
});
