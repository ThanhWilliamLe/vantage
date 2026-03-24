import { eq, and, or } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as schema from '../data/schema.js';
import { NotFoundError, ConflictError } from '../errors/index.js';
import type { DrizzleDB } from '../data/db.js';

export const MemberService = {
  async create(db: DrizzleDB, input: { name: string; aliases?: string }) {
    const now = new Date().toISOString();
    const id = ulid();

    const row = {
      id,
      name: input.name,
      aliases: input.aliases ?? null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(schema.member).values(row);
    return row;
  },

  async update(
    db: DrizzleDB,
    id: string,
    input: { name?: string; status?: string; aliases?: string },
  ) {
    const existing = await db.select().from(schema.member).where(eq(schema.member.id, id)).get();
    if (!existing) {
      throw new NotFoundError('Member', id);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (input.name !== undefined) updates.name = input.name;
    if (input.status !== undefined) updates.status = input.status;
    if (input.aliases !== undefined) updates.aliases = input.aliases;

    await db.update(schema.member).set(updates).where(eq(schema.member.id, id));

    return { ...existing, ...updates };
  },

  async getById(db: DrizzleDB, id: string) {
    const mem = await db.select().from(schema.member).where(eq(schema.member.id, id)).get();
    if (!mem) {
      throw new NotFoundError('Member', id);
    }

    const identities = await db
      .select()
      .from(schema.memberIdentity)
      .where(eq(schema.memberIdentity.memberId, id))
      .all();

    const assignments = await db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.memberId, id))
      .all();

    return { ...mem, identities, assignments };
  },

  async list(db: DrizzleDB, filter?: { status?: string }) {
    if (filter?.status) {
      return db.select().from(schema.member).where(eq(schema.member.status, filter.status)).all();
    }
    return db.select().from(schema.member).all();
  },

  async addIdentity(db: DrizzleDB, memberId: string, input: { platform: string; value: string }) {
    // Verify member exists
    const mem = await db.select().from(schema.member).where(eq(schema.member.id, memberId)).get();
    if (!mem) {
      throw new NotFoundError('Member', memberId);
    }

    // Check if this identity value is already mapped to another member
    const existingIdentity = await db
      .select()
      .from(schema.memberIdentity)
      .where(
        and(
          eq(schema.memberIdentity.platform, input.platform),
          eq(schema.memberIdentity.value, input.value),
        ),
      )
      .get();

    if (existingIdentity && existingIdentity.memberId !== memberId) {
      throw new ConflictError(
        `Identity ${input.platform}:${input.value} is already mapped to another member`,
        { entity: 'MemberIdentity', field: 'value', value: input.value },
      );
    }

    // Check for exact duplicate on same member
    if (existingIdentity && existingIdentity.memberId === memberId) {
      throw new ConflictError(
        `Identity ${input.platform}:${input.value} already exists for this member`,
        { entity: 'MemberIdentity', field: 'value', value: input.value },
      );
    }

    const now = new Date().toISOString();
    const id = ulid();

    const row = {
      id,
      memberId,
      platform: input.platform,
      value: input.value,
      createdAt: now,
    };

    await db.insert(schema.memberIdentity).values(row);
    return row;
  },

  async delete(db: DrizzleDB, id: string) {
    const existing = await db.select().from(schema.member).where(eq(schema.member.id, id)).get();
    if (!existing) {
      throw new NotFoundError('Member', id);
    }

    // Cascade: remove identities and assignments first
    await db.delete(schema.memberIdentity).where(eq(schema.memberIdentity.memberId, id));
    await db.delete(schema.assignment).where(eq(schema.assignment.memberId, id));
    await db.delete(schema.member).where(eq(schema.member.id, id));
  },

  async removeIdentity(db: DrizzleDB, identityId: string) {
    const existing = await db
      .select()
      .from(schema.memberIdentity)
      .where(eq(schema.memberIdentity.id, identityId))
      .get();
    if (!existing) {
      throw new NotFoundError('MemberIdentity', identityId);
    }

    await db.delete(schema.memberIdentity).where(eq(schema.memberIdentity.id, identityId));
  },

  async resolveAuthor(db: DrizzleDB, platform: string, value: string) {
    // When resolving git authors, also match identities stored as 'email'
    // since the UI stores email identities with platform='email'
    const platformCondition =
      platform === 'git'
        ? or(eq(schema.memberIdentity.platform, 'git'), eq(schema.memberIdentity.platform, 'email'))
        : eq(schema.memberIdentity.platform, platform);

    const identity = await db
      .select()
      .from(schema.memberIdentity)
      .where(and(platformCondition, eq(schema.memberIdentity.value, value)))
      .get();

    if (!identity) return null;

    const mem = await db
      .select()
      .from(schema.member)
      .where(eq(schema.member.id, identity.memberId))
      .get();

    return mem ?? null;
  },
};
