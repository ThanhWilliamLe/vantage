import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createDatabase, runMigrations } from '../data/db.js';
import { TaskTrackerService } from './task-tracker-service.js';
import * as schema from '../data/schema.js';
import { ulid } from 'ulid';
import type { DrizzleDB } from '../data/db.js';

describe('TaskTrackerService integration', () => {
  let db: DrizzleDB;
  let key: Buffer;
  let projectId: string;

  beforeEach(async () => {
    const { db: database, sqlite } = createDatabase(':memory:');
    db = database;
    runMigrations(sqlite);
    key = randomBytes(32);

    // Seed a project
    projectId = ulid();
    await db.insert(schema.project).values({
      id: projectId,
      name: 'Integration Test Project',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    TaskTrackerService.clearCache();
    vi.restoreAllMocks();
  });

  describe('credential CRUD lifecycle', () => {
    it('should create, list, and delete a Jira credential', async () => {
      // Create
      const created = await TaskTrackerService.createCredential(db, key, {
        projectId,
        name: 'Jira Cloud',
        platform: 'jira',
        token: 'user@test.com:api-token-123',
        instanceUrl: 'https://myorg.atlassian.net',
      });
      expect(created.id).toBeTruthy();
      expect(created.platform).toBe('jira');

      // List
      const list = await TaskTrackerService.listCredentials(db, projectId);
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('Jira Cloud');
      expect(list[0].instanceUrl).toBe('https://myorg.atlassian.net');

      // Delete
      await TaskTrackerService.deleteCredential(db, created.id);
      const afterDelete = await TaskTrackerService.listCredentials(db, projectId);
      expect(afterDelete).toHaveLength(0);
    });

    it('should create, list, and delete a ClickUp credential', async () => {
      const created = await TaskTrackerService.createCredential(db, key, {
        projectId,
        name: 'ClickUp API',
        platform: 'clickup',
        token: 'pk_abc123',
      });
      expect(created.platform).toBe('clickup');
      expect(created.instanceUrl).toBeNull();

      const list = await TaskTrackerService.listCredentials(db, projectId);
      expect(list).toHaveLength(1);

      await TaskTrackerService.deleteCredential(db, created.id);
      const afterDelete = await TaskTrackerService.listCredentials(db, projectId);
      expect(afterDelete).toHaveLength(0);
    });

    it('should support multiple credentials per project', async () => {
      await TaskTrackerService.createCredential(db, key, {
        projectId,
        name: 'Jira',
        platform: 'jira',
        token: 'tok1',
        instanceUrl: 'https://a.atlassian.net',
      });
      await TaskTrackerService.createCredential(db, key, {
        projectId,
        name: 'ClickUp',
        platform: 'clickup',
        token: 'tok2',
      });

      const list = await TaskTrackerService.listCredentials(db, projectId);
      expect(list).toHaveLength(2);
    });
  });

  describe('enrichment with mocked adapters', () => {
    it('should enrich task IDs using Jira adapter', async () => {
      // Create credential
      const cred = await TaskTrackerService.createCredential(db, key, {
        projectId,
        name: 'Jira',
        platform: 'jira',
        token: 'user@test.com:api-token',
        instanceUrl: 'https://myorg.atlassian.net',
      });

      // Create task pattern linked to credential
      await db.insert(schema.taskPattern).values({
        id: ulid(),
        projectId,
        regex: 'PROJ-\\d+',
        urlTemplate: 'https://myorg.atlassian.net/browse/{id}',
        trackerCredentialId: cred.id,
        createdAt: new Date().toISOString(),
      });

      // Mock fetch to return Jira search results
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            issues: [
              {
                key: 'PROJ-100',
                fields: {
                  summary: 'Fix bug',
                  status: { name: 'Done' },
                  assignee: { displayName: 'Alice' },
                },
              },
            ],
          }),
      });

      try {
        const result = await TaskTrackerService.enrichTaskIds(db, key, projectId, ['PROJ-100']);

        expect(result).toHaveLength(1);
        expect(result[0].taskId).toBe('PROJ-100');
        expect(result[0].title).toBe('Fix bug');
        expect(result[0].status).toBe('Done');
        expect(result[0].assignee).toBe('Alice');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should return cached results on second call', async () => {
      // Create credential and pattern
      const cred = await TaskTrackerService.createCredential(db, key, {
        projectId,
        name: 'Jira',
        platform: 'jira',
        token: 'user@test.com:api-token',
        instanceUrl: 'https://myorg.atlassian.net',
      });

      await db.insert(schema.taskPattern).values({
        id: ulid(),
        projectId,
        regex: 'PROJ-\\d+',
        urlTemplate: 'https://myorg.atlassian.net/browse/{id}',
        trackerCredentialId: cred.id,
        createdAt: new Date().toISOString(),
      });

      const originalFetch = globalThis.fetch;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            issues: [
              {
                key: 'PROJ-200',
                fields: {
                  summary: 'Cached task',
                  status: { name: 'Open' },
                  assignee: null,
                },
              },
            ],
          }),
      });
      globalThis.fetch = fetchMock;

      try {
        // First call — fetches from API
        const first = await TaskTrackerService.enrichTaskIds(db, key, projectId, ['PROJ-200']);
        expect(first).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Second call — should use cache, not call fetch again
        const second = await TaskTrackerService.enrichTaskIds(db, key, projectId, ['PROJ-200']);
        expect(second).toHaveLength(1);
        expect(second[0].taskId).toBe('PROJ-200');
        expect(fetchMock).toHaveBeenCalledTimes(1); // Still only 1 call
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should gracefully degrade when API fails', async () => {
      const cred = await TaskTrackerService.createCredential(db, key, {
        projectId,
        name: 'Jira',
        platform: 'jira',
        token: 'user@test.com:api-token',
        instanceUrl: 'https://myorg.atlassian.net',
      });

      await db.insert(schema.taskPattern).values({
        id: ulid(),
        projectId,
        regex: 'PROJ-\\d+',
        urlTemplate: 'https://myorg.atlassian.net/browse/{id}',
        trackerCredentialId: cred.id,
        createdAt: new Date().toISOString(),
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      try {
        const result = await TaskTrackerService.enrichTaskIds(db, key, projectId, ['PROJ-300']);
        // Should return empty results, not throw
        expect(result).toEqual([]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should skip task IDs that do not match any pattern regex', async () => {
      const cred = await TaskTrackerService.createCredential(db, key, {
        projectId,
        name: 'Jira',
        platform: 'jira',
        token: 'user@test.com:api-token',
        instanceUrl: 'https://myorg.atlassian.net',
      });

      await db.insert(schema.taskPattern).values({
        id: ulid(),
        projectId,
        regex: 'PROJ-\\d+',
        urlTemplate: 'https://myorg.atlassian.net/browse/{id}',
        trackerCredentialId: cred.id,
        createdAt: new Date().toISOString(),
      });

      const originalFetch = globalThis.fetch;
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock;

      try {
        const result = await TaskTrackerService.enrichTaskIds(db, key, projectId, ['OTHER-123']);
        // No matching pattern, so no API call
        expect(result).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
