import { FastifyInstance } from 'fastify';
import { RepositoryService } from '../services/repository-service.js';
import { ValidationError } from '../errors/index.js';

export async function repositoryRoutes(app: FastifyInstance) {
  app.post('/api/projects/:projectId/repositories', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { type, localPath, apiOwner, apiRepo, apiUrl, credentialId } = request.body as {
      type?: string;
      localPath?: string;
      apiOwner?: string;
      apiRepo?: string;
      apiUrl?: string;
      credentialId?: string;
    };

    if (!type || !['local', 'github', 'gitlab'].includes(type)) {
      throw new ValidationError('Type must be local, github, or gitlab', { field: 'type' });
    }

    if (type === 'local' && !localPath) {
      throw new ValidationError('localPath is required for local repositories', { field: 'localPath' });
    }

    const repo = await RepositoryService.create(app.db, projectId, {
      type,
      localPath,
      apiOwner,
      apiRepo,
      apiUrl,
      credentialId,
    });
    return reply.status(201).send(repo);
  });

  app.get('/api/projects/:projectId/repositories', async (request) => {
    const { projectId } = request.params as { projectId: string };
    return RepositoryService.list(app.db, projectId);
  });

  app.delete('/api/repositories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await RepositoryService.delete(app.db, id);
    return reply.status(204).send();
  });
}
