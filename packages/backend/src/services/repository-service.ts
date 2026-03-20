import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as schema from '../data/schema.js';
import { NotFoundError } from '../errors/index.js';
import type { DrizzleDB } from '../data/db.js';

export const RepositoryService = {
  async create(
    db: DrizzleDB,
    projectId: string,
    input: {
      type: string;
      localPath?: string;
      apiOwner?: string;
      apiRepo?: string;
      apiUrl?: string;
      credentialId?: string;
    },
  ) {
    // Verify project exists
    const proj = await db.select().from(schema.project).where(eq(schema.project.id, projectId)).get();
    if (!proj) {
      throw new NotFoundError('Project', projectId);
    }

    const now = new Date().toISOString();
    const id = ulid();

    const row = {
      id,
      projectId,
      type: input.type,
      localPath: input.localPath ?? null,
      apiOwner: input.apiOwner ?? null,
      apiRepo: input.apiRepo ?? null,
      apiUrl: input.apiUrl ?? null,
      credentialId: input.credentialId ?? null,
      createdAt: now,
    };

    await db.insert(schema.repository).values(row);

    // Create scan_state for local repos
    if (input.type === 'local') {
      await db.insert(schema.scanState).values({
        id: ulid(),
        repoId: id,
        status: 'idle',
        updatedAt: now,
      });
    }

    // Create sync_state for API repos
    if (input.type === 'github' || input.type === 'gitlab') {
      await db.insert(schema.syncState).values({
        id: ulid(),
        repoId: id,
        status: 'idle',
        updatedAt: now,
      });
    }

    return row;
  },

  async list(db: DrizzleDB, projectId: string) {
    return db
      .select()
      .from(schema.repository)
      .where(eq(schema.repository.projectId, projectId))
      .all();
  },

  async delete(db: DrizzleDB, id: string) {
    const existing = await db.select().from(schema.repository).where(eq(schema.repository.id, id)).get();
    if (!existing) {
      throw new NotFoundError('Repository', id);
    }

    // Clean up related state
    await db.delete(schema.scanState).where(eq(schema.scanState.repoId, id));
    await db.delete(schema.syncState).where(eq(schema.syncState.repoId, id));
    await db.delete(schema.repository).where(eq(schema.repository.id, id));
  },
};
