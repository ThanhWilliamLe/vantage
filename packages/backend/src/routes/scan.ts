import { FastifyInstance } from 'fastify';
import * as schema from '../data/schema.js';
import { ScanService } from '../services/scan-service.js';

export async function scanRoutes(app: FastifyInstance) {
  // POST /api/scan — trigger a scan of all local repositories
  app.post('/api/scan', async (request, reply) => {
    const result = await ScanService.scanAll(app.db);
    return reply.status(200).send(result);
  });

  // GET /api/scan/status — per-repo scan state
  app.get('/api/scan/status', async () => {
    const states = await app.db.select().from(schema.scanState).all();

    return states;
  });
}
