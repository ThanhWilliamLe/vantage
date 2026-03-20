import { FastifyInstance } from 'fastify';
import { ProjectService } from '../services/project-service.js';
import { ValidationError } from '../errors/index.js';

export async function projectRoutes(app: FastifyInstance) {
  app.post('/api/projects', async (request, reply) => {
    const { name, description } = request.body as { name?: string; description?: string };
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('Name is required', { field: 'name' });
    }
    const project = await ProjectService.create(app.db, { name: name.trim(), description });
    return reply.status(201).send(project);
  });

  app.get('/api/projects', async (request) => {
    const { status } = request.query as { status?: string };
    const projects = await ProjectService.list(app.db, status ? { status } : undefined);
    return projects;
  });

  app.get('/api/projects/:id', async (request) => {
    const { id } = request.params as { id: string };
    const project = await ProjectService.getById(app.db, id);
    return project;
  });

  app.put('/api/projects/:id', async (request) => {
    const { id } = request.params as { id: string };
    const { name, description, status } = request.body as {
      name?: string;
      description?: string;
      status?: string;
    };
    const project = await ProjectService.update(app.db, id, { name, description, status });
    return project;
  });

  app.delete('/api/projects/:id', async (request) => {
    const { id } = request.params as { id: string };
    const project = await ProjectService.archive(app.db, id);
    return project;
  });
}
