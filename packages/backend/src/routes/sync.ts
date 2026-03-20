import { FastifyInstance } from 'fastify';
import * as schema from '../data/schema.js';
import { SyncService } from '../services/sync-service.js';

export async function syncRoutes(app: FastifyInstance) {
  // POST /api/sync — trigger platform sync for all configured repositories
  app.post('/api/sync', async (request, reply) => {
    const result = await SyncService.syncAll(app.db, app.encryptionKey);
    return reply.status(200).send(result);
  });

  // GET /api/sync/status — per-repo sync state
  app.get('/api/sync/status', async () => {
    const states = await app.db
      .select()
      .from(schema.syncState)
      .all();

    return states;
  });
}
