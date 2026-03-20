import { FastifyInstance } from 'fastify';
import { SearchService } from '../services/search-service.js';
import { ValidationError } from '../errors/index.js';

export async function searchRoutes(app: FastifyInstance) {
  // GET /api/search — full-text search across code changes and evaluations
  app.get('/api/search', async (request) => {
    const query = request.query as {
      q?: string;
      scope?: string;
      limit?: string;
      offset?: string;
    };

    if (!query.q || !query.q.trim()) {
      throw new ValidationError('Search query (q) is required', { field: 'q' });
    }

    const scope = query.scope || 'all';
    const limit = query.limit ? parseInt(query.limit, 10) : 20;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;

    const results = await SearchService.search(app.db, query.q, scope, limit, offset);
    return results;
  });

  // GET /api/members/search — member name search (LIKE)
  app.get('/api/members/search', async (request) => {
    const query = request.query as { q?: string };

    if (!query.q || !query.q.trim()) {
      return [];
    }

    const results = await SearchService.searchMembers(app.db, query.q);
    return results;
  });

  // GET /api/projects/search — project name search (LIKE)
  app.get('/api/projects/search', async (request) => {
    const query = request.query as { q?: string };

    if (!query.q || !query.q.trim()) {
      return [];
    }

    const results = await SearchService.searchProjects(app.db, query.q);
    return results;
  });
}
