import { FastifyInstance } from 'fastify';
import { ReviewService } from '../services/review-service.js';

export async function reviewRoutes(app: FastifyInstance) {
  // POST /api/code-changes/:id/review — mark reviewed with optional notes
  app.post('/api/code-changes/:id/review', async (request) => {
    const { id } = request.params as { id: string };
    const body = (request.body as { notes?: string }) || {};

    const result = await ReviewService.review(app.db, id, body.notes);
    return result;
  });

  // POST /api/code-changes/:id/flag — flag with reason
  app.post('/api/code-changes/:id/flag', async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as { reason: string };

    const result = await ReviewService.flag(app.db, id, body.reason);
    return result;
  });

  // POST /api/code-changes/:id/defer — defer
  app.post('/api/code-changes/:id/defer', async (request) => {
    const { id } = request.params as { id: string };

    const result = await ReviewService.defer(app.db, id);
    return result;
  });

  // POST /api/code-changes/:id/communicate — flagged → communicated
  app.post('/api/code-changes/:id/communicate', async (request) => {
    const { id } = request.params as { id: string };

    const result = await ReviewService.communicate(app.db, id);
    return result;
  });

  // POST /api/code-changes/:id/resolve — communicated → resolved
  app.post('/api/code-changes/:id/resolve', async (request) => {
    const { id } = request.params as { id: string };

    const result = await ReviewService.resolve(app.db, id);
    return result;
  });

  // POST /api/code-changes/batch-action — batch review/flag/defer
  app.post('/api/code-changes/batch-action', async (request) => {
    const body = request.body as {
      ids: string[];
      action: 'review' | 'flag' | 'defer';
      notes?: string;
      flagReason?: string;
    };

    const results = await ReviewService.batchAction(app.db, body);
    return { items: results };
  });

  // POST /api/code-changes/aggregate-review — review multiple commits as one unit
  app.post('/api/code-changes/aggregate-review', async (request) => {
    const body = request.body as { ids: string[]; notes?: string };
    const result = await ReviewService.aggregateReview(app.db, body.ids, body.notes);
    return result;
  });

  // POST /api/code-changes/:id/clear-review — reset to pending, keep notes
  app.post('/api/code-changes/:id/clear-review', async (request) => {
    const { id } = request.params as { id: string };
    const result = await ReviewService.clearReview(app.db, id);
    return result;
  });

  // GET /api/code-changes/history — review history with filters
  app.get('/api/code-changes/history', async (request) => {
    const query = request.query as {
      projectId?: string;
      memberId?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      limit?: string;
      offset?: string;
    };

    const result = await ReviewService.getHistory(app.db, {
      projectId: query.projectId,
      memberId: query.memberId,
      status: query.status,
      startDate: query.startDate,
      endDate: query.endDate,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      offset: query.offset ? parseInt(query.offset, 10) : undefined,
    });

    return result;
  });
}
