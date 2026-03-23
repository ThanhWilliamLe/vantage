import { FastifyInstance } from 'fastify';
import * as schema from '../data/schema.js';
import { SyncService } from '../services/sync-service.js';

export async function syncRoutes(app: FastifyInstance) {
  // POST /api/sync — trigger platform sync for all configured repositories
  app.post('/api/sync', async (request, reply) => {
    const { projectId, repoId, since } = (request.body as Record<string, unknown>) ?? {};
    if (since && isNaN(Date.parse(String(since)))) {
      return reply
        .status(400)
        .send({ error: { code: 'INVALID_SINCE', message: 'since must be a valid ISO 8601 date' } });
    }
    const filters = {
      ...(projectId ? { projectId: String(projectId) } : {}),
      ...(repoId ? { repoId: String(repoId) } : {}),
      ...(since ? { since: String(since) } : {}),
    };
    const result = await SyncService.syncAll(
      app.db,
      app.encryptionKey,
      Object.keys(filters).length > 0 ? filters : undefined,
    );
    return reply.status(200).send(result);
  });

  // GET /api/sync/status — per-repo sync state
  app.get('/api/sync/status', async () => {
    const states = await app.db.select().from(schema.syncState).all();

    return states;
  });
}
