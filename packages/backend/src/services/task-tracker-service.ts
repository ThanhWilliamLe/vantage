import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as schema from '../data/schema.js';
import { encrypt, decrypt } from '../crypto/index.js';
import { NotFoundError } from '../errors/index.js';
import { JiraAdapter } from '../integrations/jira/jira-adapter.js';
import { ClickUpAdapter } from '../integrations/clickup/clickup-adapter.js';
import type { DrizzleDB } from '../data/db.js';
import type { TaskMetadata } from '@twle/vantage-shared';

// In-memory cache with 15-minute TTL
const cache = new Map<string, { data: TaskMetadata; expiresAt: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

export const TaskTrackerService = {
  async createCredential(
    db: DrizzleDB,
    key: Buffer,
    input: {
      projectId: string;
      name: string;
      platform: 'jira' | 'clickup';
      token: string;
      instanceUrl?: string;
    },
  ) {
    const now = new Date().toISOString();
    const id = ulid();
    const tokenEncrypted = encrypt(input.token, key);

    const row = {
      id,
      projectId: input.projectId,
      name: input.name,
      platform: input.platform,
      tokenEncrypted,
      instanceUrl: input.instanceUrl || null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(schema.taskTrackerCredential).values(row);
    return {
      id,
      projectId: input.projectId,
      name: input.name,
      platform: input.platform,
      instanceUrl: input.instanceUrl || null,
      createdAt: now,
      updatedAt: now,
    };
  },

  async listCredentials(db: DrizzleDB, projectId: string) {
    return db
      .select({
        id: schema.taskTrackerCredential.id,
        projectId: schema.taskTrackerCredential.projectId,
        name: schema.taskTrackerCredential.name,
        platform: schema.taskTrackerCredential.platform,
        instanceUrl: schema.taskTrackerCredential.instanceUrl,
        createdAt: schema.taskTrackerCredential.createdAt,
        updatedAt: schema.taskTrackerCredential.updatedAt,
      })
      .from(schema.taskTrackerCredential)
      .where(eq(schema.taskTrackerCredential.projectId, projectId))
      .all();
  },

  async updateCredential(
    db: DrizzleDB,
    key: Buffer,
    id: string,
    input: { name?: string; token?: string; instanceUrl?: string },
  ) {
    const existing = await db
      .select()
      .from(schema.taskTrackerCredential)
      .where(eq(schema.taskTrackerCredential.id, id))
      .get();
    if (!existing) throw new NotFoundError('TaskTrackerCredential', id);

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (input.name !== undefined) updates.name = input.name;
    if (input.token !== undefined) updates.tokenEncrypted = encrypt(input.token, key);
    if (input.instanceUrl !== undefined) updates.instanceUrl = input.instanceUrl || null;

    await db
      .update(schema.taskTrackerCredential)
      .set(updates)
      .where(eq(schema.taskTrackerCredential.id, id));

    return {
      id: existing.id,
      projectId: existing.projectId,
      name: input.name ?? existing.name,
      platform: existing.platform,
      instanceUrl:
        input.instanceUrl !== undefined ? input.instanceUrl || null : existing.instanceUrl,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
  },

  async deleteCredential(db: DrizzleDB, id: string) {
    const existing = await db
      .select()
      .from(schema.taskTrackerCredential)
      .where(eq(schema.taskTrackerCredential.id, id))
      .get();
    if (!existing) throw new NotFoundError('TaskTrackerCredential', id);
    await db.delete(schema.taskTrackerCredential).where(eq(schema.taskTrackerCredential.id, id));
  },

  async enrichTaskIds(
    db: DrizzleDB,
    key: Buffer,
    projectId: string,
    taskIds: string[],
  ): Promise<TaskMetadata[]> {
    if (taskIds.length === 0) return [];

    const now = Date.now();
    const results: TaskMetadata[] = [];
    const uncached: string[] = [];

    // Check cache
    for (const taskId of taskIds) {
      const cacheKey = `${projectId}:${taskId}`;
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        results.push(cached.data);
      } else {
        uncached.push(taskId);
      }
    }

    if (uncached.length === 0) return results;

    // Get task patterns for this project that have tracker credentials
    const patterns = await db
      .select()
      .from(schema.taskPattern)
      .where(eq(schema.taskPattern.projectId, projectId))
      .all();

    const patternsWithCredentials = patterns.filter((p) => p.trackerCredentialId);
    if (patternsWithCredentials.length === 0) return results;

    // Pre-fetch all credentials to avoid N+1
    const credentialIds = [...new Set(patternsWithCredentials.map((p) => p.trackerCredentialId!))];
    const allCredentials = await db
      .select()
      .from(schema.taskTrackerCredential)
      .where(inArray(schema.taskTrackerCredential.id, credentialIds))
      .all();
    const credentialMap = new Map(allCredentials.map((c) => [c.id, c]));

    for (const pattern of patternsWithCredentials) {
      const credential = credentialMap.get(pattern.trackerCredentialId!);
      if (!credential) continue;

      // Find which uncached task IDs match this pattern's regex
      let regex: RegExp;
      try {
        regex = new RegExp(pattern.regex);
      } catch {
        continue; // Skip invalid regex patterns
      }
      const matchingIds = uncached.filter((id) => regex.test(id));
      if (matchingIds.length === 0) continue;

      try {
        const token = decrypt(credential.tokenEncrypted, key);
        let fetched: TaskMetadata[] = [];

        if (credential.platform === 'jira') {
          // For Jira, token format is "email:token" — split it
          const [email, ...tokenParts] = token.split(':');
          const apiToken = tokenParts.join(':');
          const adapter = new JiraAdapter(email || '', apiToken, credential.instanceUrl || '');
          fetched = await adapter.fetchBatch(matchingIds);
        } else if (credential.platform === 'clickup') {
          const adapter = new ClickUpAdapter(token);
          fetched = await adapter.fetchBatch(matchingIds);
        }

        // Cache and collect results
        for (const task of fetched) {
          const cacheKey = `${projectId}:${task.taskId}`;
          cache.set(cacheKey, {
            data: task,
            expiresAt: now + CACHE_TTL_MS,
          });
          results.push(task);
        }
      } catch {
        // Graceful degradation — if API fails, return what we have
      }
    }

    return results;
  },

  clearCache() {
    cache.clear();
  },
};
