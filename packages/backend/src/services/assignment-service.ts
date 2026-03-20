import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as schema from '../data/schema.js';
import { NotFoundError } from '../errors/index.js';
import type { DrizzleDB } from '../data/db.js';

export const AssignmentService = {
  async create(
    db: DrizzleDB,
    input: { memberId: string; projectId: string; role?: string; startDate: string },
  ) {
    // Verify member exists
    const mem = await db.select().from(schema.member).where(eq(schema.member.id, input.memberId)).get();
    if (!mem) {
      throw new NotFoundError('Member', input.memberId);
    }

    // Verify project exists
    const proj = await db.select().from(schema.project).where(eq(schema.project.id, input.projectId)).get();
    if (!proj) {
      throw new NotFoundError('Project', input.projectId);
    }

    const now = new Date().toISOString();
    const id = ulid();

    const row = {
      id,
      memberId: input.memberId,
      projectId: input.projectId,
      role: input.role ?? null,
      startDate: input.startDate,
      endDate: null as string | null,
      createdAt: now,
    };

    await db.insert(schema.assignment).values(row);
    return row;
  },

  async end(db: DrizzleDB, id: string, endDate: string) {
    const existing = await db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.id, id))
      .get();
    if (!existing) {
      throw new NotFoundError('Assignment', id);
    }

    await db
      .update(schema.assignment)
      .set({ endDate })
      .where(eq(schema.assignment.id, id));

    return { ...existing, endDate };
  },

  async update(
    db: DrizzleDB,
    id: string,
    input: { endDate?: string; role?: string },
  ) {
    const existing = await db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.id, id))
      .get();
    if (!existing) {
      throw new NotFoundError('Assignment', id);
    }

    const updates: Record<string, unknown> = {};
    if (input.endDate !== undefined) updates.endDate = input.endDate;
    if (input.role !== undefined) updates.role = input.role;

    await db.update(schema.assignment).set(updates).where(eq(schema.assignment.id, id));

    return { ...existing, ...updates };
  },

  async listByMember(db: DrizzleDB, memberId: string) {
    return db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.memberId, memberId))
      .all();
  },

  async listByProject(db: DrizzleDB, projectId: string) {
    return db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.projectId, projectId))
      .all();
  },
};
