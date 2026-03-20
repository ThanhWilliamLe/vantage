import { FastifyInstance } from 'fastify';
import { TaskPatternService } from '../services/task-pattern-service.js';
import { ValidationError } from '../errors/index.js';

export async function taskPatternRoutes(app: FastifyInstance) {
  app.post('/api/projects/:projectId/task-patterns', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { regex, urlTemplate } = request.body as {
      regex?: string;
      urlTemplate?: string;
    };
    if (!regex || typeof regex !== 'string') {
      throw new ValidationError('regex is required', { field: 'regex' });
    }
    if (!urlTemplate || typeof urlTemplate !== 'string') {
      throw new ValidationError('urlTemplate is required', { field: 'urlTemplate' });
    }
    const pattern = await TaskPatternService.create(app.db, {
      projectId,
      regex,
      urlTemplate,
    });
    return reply.status(201).send(pattern);
  });

  app.get('/api/projects/:projectId/task-patterns', async (request) => {
    const { projectId } = request.params as { projectId: string };
    const patterns = await TaskPatternService.list(app.db, projectId);
    return patterns;
  });

  app.delete('/api/task-patterns/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await TaskPatternService.delete(app.db, id);
    return reply.status(204).send();
  });
}
