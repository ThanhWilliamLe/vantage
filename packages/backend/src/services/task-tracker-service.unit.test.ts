import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createDatabase, runMigrations } from '../data/db.js';
import { TaskTrackerService } from './task-tracker-service.js';
import { NotFoundError } from '../errors/index.js';
import type { DrizzleDB } from '../data/db.js';
import * as schema from '../data/schema.js';
import { ulid } from 'ulid';

describe('TaskTrackerService', () => {
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
      name: 'Test Project',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    TaskTrackerService.clearCache();
  });

  describe('createCredential', () => {
    it('should create and return a credential without token', async () => {
      const result = await TaskTrackerService.createCredential(db, key, {
        projectId,
        name: 'My Jira',
        platform: 'jira',
        token: 'secret-token',
        instanceUrl: 'https://myorg.atlassian.net',
      });

      expect(result.id).toBeTruthy();
      expect(result.projectId).toBe(projectId);
      expect(result.name).toBe('My Jira');
      expect(result.platform).toBe('jira');
      expect(result.instanceUrl).toBe('https://myorg.atlassian.net');
      expect(result.createdAt).toBeTruthy();
      expect(result.updatedAt).toBeTruthy();
      // Should not include token or tokenEncrypted
      expect((result as Record<string, unknown>).token).toBeUndefined();
      expect((result as Record<string, unknown>).tokenEncrypted).toBeUndefined();
    });

    it('should create a ClickUp credential with null instanceUrl', async () => {
      const result = await TaskTrackerService.createCredential(db, key, {
        projectId,
        name: 'My ClickUp',
        platform: 'clickup',
        token: 'pk_abc123',
      });

      expect(result.platform).toBe('clickup');
      expect(result.instanceUrl).toBeNull();
    });
  });

  describe('listCredentials', () => {
    it('should list credentials for a project', async () => {
      await TaskTrackerService.createCredential(db, key, {
        projectId,
        name: 'Cred 1',
        platform: 'jira',
        token: 'tok1',
        instanceUrl: 'https://a.atlassian.net',
      });
      await TaskTrackerService.createCredential(db, key, {
        projectId,
        name: 'Cred 2',
        platform: 'clickup',
        token: 'tok2',
      });

      const list = await TaskTrackerService.listCredentials(db, projectId);
      expect(list).toHaveLength(2);
      // Should not include tokenEncrypted
      for (const item of list) {
        expect((item as Record<string, unknown>).tokenEncrypted).toBeUndefined();
      }
    });

    it('should return empty array for project with no credentials', async () => {
      const list = await TaskTrackerService.listCredentials(db, projectId);
      expect(list).toEqual([]);
    });
  });

  describe('deleteCredential', () => {
    it('should delete an existing credential', async () => {
      const cred = await TaskTrackerService.createCredential(db, key, {
        projectId,
        name: 'To delete',
        platform: 'jira',
        token: 'tok',
        instanceUrl: 'https://x.atlassian.net',
      });

      await TaskTrackerService.deleteCredential(db, cred.id);

      const list = await TaskTrackerService.listCredentials(db, projectId);
      expect(list).toHaveLength(0);
    });

    it('should throw NotFoundError for non-existent credential', async () => {
      await expect(TaskTrackerService.deleteCredential(db, 'nonexistent')).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('enrichTaskIds', () => {
    it('should return empty array for empty taskIds', async () => {
      const result = await TaskTrackerService.enrichTaskIds(db, key, projectId, []);
      expect(result).toEqual([]);
    });

    it('should return empty array when no patterns have credentials', async () => {
      // Create a task pattern without tracker credential
      await db.insert(schema.taskPattern).values({
        id: ulid(),
        projectId,
        regex: 'PROJ-\\d+',
        urlTemplate: 'https://jira.example.com/browse/{id}',
        createdAt: new Date().toISOString(),
      });

      const result = await TaskTrackerService.enrichTaskIds(db, key, projectId, ['PROJ-123']);
      expect(result).toEqual([]);
    });
  });

  describe('clearCache', () => {
    it('should clear the cache without error', () => {
      expect(() => TaskTrackerService.clearCache()).not.toThrow();
    });
  });
});
