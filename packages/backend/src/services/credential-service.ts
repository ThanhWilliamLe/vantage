import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as schema from '../data/schema.js';
import { encrypt, decrypt } from '../crypto/index.js';
import { NotFoundError } from '../errors/index.js';
import type { DrizzleDB } from '../data/db.js';

function maskToken(encrypted: string, key: Buffer): string {
  try {
    const token = decrypt(encrypted, key);
    if (token.length <= 4) return '****';
    return '*'.repeat(token.length - 4) + token.slice(-4);
  } catch {
    return '****';
  }
}

export const CredentialService = {
  async create(
    db: DrizzleDB,
    key: Buffer,
    input: { name: string; platform: string; token: string; instanceUrl?: string },
  ) {
    const now = new Date().toISOString();
    const id = ulid();
    const tokenEncrypted = encrypt(input.token, key);

    const row = {
      id,
      name: input.name,
      platform: input.platform,
      tokenEncrypted,
      instanceUrl: input.instanceUrl ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(schema.gitCredential).values(row);

    return {
      id: row.id,
      name: row.name,
      platform: row.platform,
      tokenMasked: '*'.repeat(Math.max(input.token.length - 4, 0)) + input.token.slice(-4),
      instanceUrl: row.instanceUrl,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },

  async list(db: DrizzleDB, key: Buffer) {
    const rows = await db.select().from(schema.gitCredential).all();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      platform: row.platform,
      tokenMasked: maskToken(row.tokenEncrypted, key),
      instanceUrl: row.instanceUrl,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  },

  async update(
    db: DrizzleDB,
    key: Buffer,
    id: string,
    input: { name?: string; token?: string },
  ) {
    const existing = await db
      .select()
      .from(schema.gitCredential)
      .where(eq(schema.gitCredential.id, id))
      .get();
    if (!existing) {
      throw new NotFoundError('Credential', id);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (input.name !== undefined) updates.name = input.name;
    if (input.token !== undefined) updates.tokenEncrypted = encrypt(input.token, key);

    await db.update(schema.gitCredential).set(updates).where(eq(schema.gitCredential.id, id));

    const updated = await db
      .select()
      .from(schema.gitCredential)
      .where(eq(schema.gitCredential.id, id))
      .get();

    return {
      id: updated!.id,
      name: updated!.name,
      platform: updated!.platform,
      tokenMasked: maskToken(updated!.tokenEncrypted, key),
      instanceUrl: updated!.instanceUrl,
      createdAt: updated!.createdAt,
      updatedAt: updated!.updatedAt,
    };
  },

  async delete(db: DrizzleDB, id: string) {
    const existing = await db
      .select()
      .from(schema.gitCredential)
      .where(eq(schema.gitCredential.id, id))
      .get();
    if (!existing) {
      throw new NotFoundError('Credential', id);
    }

    await db.delete(schema.gitCredential).where(eq(schema.gitCredential.id, id));
  },

  async getDecryptedToken(db: DrizzleDB, key: Buffer, id: string): Promise<string> {
    const existing = await db
      .select()
      .from(schema.gitCredential)
      .where(eq(schema.gitCredential.id, id))
      .get();
    if (!existing) {
      throw new NotFoundError('Credential', id);
    }

    return decrypt(existing.tokenEncrypted, key);
  },
};
