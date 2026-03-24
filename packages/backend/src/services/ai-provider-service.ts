import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as schema from '../data/schema.js';
import { encrypt, decrypt } from '../crypto/index.js';
import { NotFoundError } from '../errors/index.js';
import type { DrizzleDB } from '../data/db.js';

function maskApiKey(encrypted: string, key: Buffer): string {
  try {
    const apiKey = decrypt(encrypted, key);
    if (apiKey.length <= 4) return '****';
    return '*'.repeat(apiKey.length - 4) + apiKey.slice(-4);
  } catch {
    return '****';
  }
}

export const AIProviderService = {
  async create(
    db: DrizzleDB,
    key: Buffer,
    input: {
      name: string;
      type: string;
      preset?: string;
      endpointUrl?: string;
      apiKey?: string;
      model?: string;
      cliCommand?: string;
      cliIoMethod?: string;
    },
  ) {
    const now = new Date().toISOString();
    const id = ulid();

    const row = {
      id,
      name: input.name,
      type: input.type,
      preset: input.preset ?? null,
      endpointUrl: input.endpointUrl ?? null,
      apiKeyEncrypted: input.apiKey ? encrypt(input.apiKey, key) : null,
      model: input.model ?? null,
      cliCommand: input.cliCommand ?? null,
      cliIoMethod: input.cliIoMethod ?? null,
      isActive: 0,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(schema.aiProvider).values(row);

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      preset: row.preset,
      endpointUrl: row.endpointUrl,
      apiKeyMasked: input.apiKey
        ? '*'.repeat(Math.max(input.apiKey.length - 4, 0)) + input.apiKey.slice(-4)
        : null,
      model: row.model,
      cliCommand: row.cliCommand,
      cliIoMethod: row.cliIoMethod,
      isActive: false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },

  async update(
    db: DrizzleDB,
    key: Buffer,
    id: string,
    input: {
      name?: string;
      type?: string;
      preset?: string;
      endpointUrl?: string;
      apiKey?: string;
      model?: string;
      cliCommand?: string;
      cliIoMethod?: string;
    },
  ) {
    const existing = await db
      .select()
      .from(schema.aiProvider)
      .where(eq(schema.aiProvider.id, id))
      .get();
    if (!existing) {
      throw new NotFoundError('AIProvider', id);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (input.name !== undefined) updates.name = input.name;
    if (input.type !== undefined) updates.type = input.type;
    if (input.preset !== undefined) updates.preset = input.preset;
    if (input.endpointUrl !== undefined) updates.endpointUrl = input.endpointUrl;
    if (input.apiKey !== undefined) updates.apiKeyEncrypted = encrypt(input.apiKey, key);
    if (input.model !== undefined) updates.model = input.model;
    if (input.cliCommand !== undefined) updates.cliCommand = input.cliCommand;
    if (input.cliIoMethod !== undefined) updates.cliIoMethod = input.cliIoMethod;

    await db.update(schema.aiProvider).set(updates).where(eq(schema.aiProvider.id, id));

    const updated = await db
      .select()
      .from(schema.aiProvider)
      .where(eq(schema.aiProvider.id, id))
      .get();

    if (!updated) {
      throw new NotFoundError('AIProvider', id);
    }
    return formatProvider(updated, key);
  },

  async setActive(db: DrizzleDB, id: string) {
    const existing = await db
      .select()
      .from(schema.aiProvider)
      .where(eq(schema.aiProvider.id, id))
      .get();
    if (!existing) {
      throw new NotFoundError('AIProvider', id);
    }

    const now = new Date().toISOString();

    // Deactivate currently active providers
    await db
      .update(schema.aiProvider)
      .set({ isActive: 0, updatedAt: now })
      .where(eq(schema.aiProvider.isActive, 1));

    // Activate the requested one
    await db
      .update(schema.aiProvider)
      .set({ isActive: 1, updatedAt: now })
      .where(eq(schema.aiProvider.id, id));

    return { ...existing, isActive: 1, updatedAt: now };
  },

  async getActive(db: DrizzleDB) {
    const provider = await db
      .select()
      .from(schema.aiProvider)
      .where(eq(schema.aiProvider.isActive, 1))
      .get();

    return provider ?? null;
  },

  async list(db: DrizzleDB, key: Buffer) {
    const rows = await db.select().from(schema.aiProvider).all();
    return rows.map((row) => formatProvider(row, key));
  },

  async delete(db: DrizzleDB, id: string) {
    const existing = await db
      .select()
      .from(schema.aiProvider)
      .where(eq(schema.aiProvider.id, id))
      .get();
    if (!existing) {
      throw new NotFoundError('AIProvider', id);
    }

    await db.delete(schema.aiProvider).where(eq(schema.aiProvider.id, id));
  },

  async testProvider(
    db: DrizzleDB,
    key: Buffer,
    id: string,
  ): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const provider = await db
      .select()
      .from(schema.aiProvider)
      .where(eq(schema.aiProvider.id, id))
      .get();

    if (!provider) {
      throw new NotFoundError('AIProvider', id);
    }

    const start = Date.now();

    try {
      if (provider.type === 'api') {
        if (!provider.endpointUrl || !provider.apiKeyEncrypted || !provider.model) {
          return {
            success: false,
            message: 'API provider is missing configuration (URL, key, or model)',
          };
        }
        const { APIProvider } = await import('../integrations/ai/api-provider.js');
        const apiKey = decrypt(provider.apiKeyEncrypted, key);
        const apiProv = new APIProvider({
          endpointUrl: provider.endpointUrl,
          apiKey,
          model: provider.model,
          preset: (provider.preset as 'openai' | 'anthropic') || 'openai',
        });
        await apiProv.generate('Respond with OK');
        const latencyMs = Date.now() - start;
        return { success: true, message: `Connected successfully (${latencyMs}ms)`, latencyMs };
      }

      if (provider.type === 'cli') {
        if (!provider.cliCommand) {
          return { success: false, message: 'CLI provider is missing command' };
        }
        const { CLIProvider } = await import('../integrations/ai/cli-provider.js');
        const args = provider.cliIoMethod === 'stdin' ? ['-p'] : [];
        const cliProv = new CLIProvider({ command: provider.cliCommand, args });
        await cliProv.generate('Respond with OK');
        const latencyMs = Date.now() - start;
        return { success: true, message: `Connected successfully (${latencyMs}ms)`, latencyMs };
      }

      return { success: false, message: `Unknown provider type: ${provider.type}` };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Test failed: ${msg}`, latencyMs };
    }
  },
};

function formatProvider(row: typeof schema.aiProvider.$inferSelect, key: Buffer) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    preset: row.preset,
    endpointUrl: row.endpointUrl,
    apiKeyMasked: row.apiKeyEncrypted ? maskApiKey(row.apiKeyEncrypted, key) : null,
    model: row.model,
    cliCommand: row.cliCommand,
    cliIoMethod: row.cliIoMethod,
    isActive: row.isActive === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
