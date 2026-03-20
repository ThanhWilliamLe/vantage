import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as schema from '../data/schema.js';
import { hashPassword, verifyPassword } from '../crypto/index.js';
import type { DrizzleDB } from '../data/db.js';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface SessionEntry {
  expiresAt: number;
}

// In-memory session store
const sessions = new Map<string, SessionEntry>();

export const AuthService = {
  async setPassword(db: DrizzleDB, password: string) {
    const hash = await hashPassword(password);
    const now = new Date().toISOString();

    await db
      .update(schema.appConfig)
      .set({ accessPasswordHash: hash, updatedAt: now })
      .where(eq(schema.appConfig.id, 'default'));
  },

  async removePassword(db: DrizzleDB) {
    const now = new Date().toISOString();

    await db
      .update(schema.appConfig)
      .set({ accessPasswordHash: null, updatedAt: now })
      .where(eq(schema.appConfig.id, 'default'));

    // Clear all sessions since password protection is removed
    sessions.clear();
  },

  async verifyPassword(db: DrizzleDB, password: string): Promise<boolean> {
    const config = await db
      .select()
      .from(schema.appConfig)
      .where(eq(schema.appConfig.id, 'default'))
      .get();

    if (!config?.accessPasswordHash) {
      return false;
    }

    return verifyPassword(password, config.accessPasswordHash);
  },

  createSession(): string {
    const token = randomBytes(32).toString('hex');
    sessions.set(token, {
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return token;
  },

  validateSession(token: string): boolean {
    const entry = sessions.get(token);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      sessions.delete(token);
      return false;
    }

    return true;
  },

  async isPasswordSet(db: DrizzleDB): Promise<boolean> {
    const config = await db
      .select()
      .from(schema.appConfig)
      .where(eq(schema.appConfig.id, 'default'))
      .get();

    return !!(config?.accessPasswordHash);
  },

  // Exposed for testing — clears all sessions
  _clearSessions() {
    sessions.clear();
  },
};
