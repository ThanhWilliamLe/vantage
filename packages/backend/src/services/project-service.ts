import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as schema from '../data/schema.js';
import { NotFoundError, ConflictError } from '../errors/index.js';
import type { DrizzleDB } from '../data/db.js';

export const ProjectService = {
  async create(
    db: DrizzleDB,
    input: { name: string; description?: string },
  ) {
    const now = new Date().toISOString();
    const id = ulid();

    const row = {
      id,
      name: input.name,
      description: input.description ?? null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert(schema.project).values(row);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        throw new ConflictError('Project with this name already exists', {
          entity: 'project',
          field: 'name',
          value: input.name,
        });
      }
      throw err;
    }
    return row;
  },

  async update(
    db: DrizzleDB,
    id: string,
    input: { name?: string; description?: string; status?: string },
  ) {
    const existing = await db.select().from(schema.project).where(eq(schema.project.id, id)).get();
    if (!existing) {
      throw new NotFoundError('Project', id);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.status !== undefined) updates.status = input.status;

    await db.update(schema.project).set(updates).where(eq(schema.project.id, id));

    return { ...existing, ...updates };
  },

  async getById(db: DrizzleDB, id: string) {
    const proj = await db.select().from(schema.project).where(eq(schema.project.id, id)).get();
    if (!proj) {
      throw new NotFoundError('Project', id);
    }

    const repositories = await db
      .select()
      .from(schema.repository)
      .where(eq(schema.repository.projectId, id))
      .all();

    return { ...proj, repositories };
  },

  async list(db: DrizzleDB, filter?: { status?: string }) {
    if (filter?.status) {
      return db
        .select()
        .from(schema.project)
        .where(eq(schema.project.status, filter.status))
        .all();
    }
    return db.select().from(schema.project).all();
  },

  async archive(db: DrizzleDB, id: string) {
    const existing = await db.select().from(schema.project).where(eq(schema.project.id, id)).get();
    if (!existing) {
      throw new NotFoundError('Project', id);
    }

    const now = new Date().toISOString();
    await db
      .update(schema.project)
      .set({ status: 'archived', updatedAt: now })
      .where(eq(schema.project.id, id));

    return { ...existing, status: 'archived', updatedAt: now };
  },
};
