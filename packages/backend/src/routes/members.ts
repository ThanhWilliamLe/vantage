import { FastifyInstance } from 'fastify';
import { MemberService } from '../services/member-service.js';
import { ValidationError } from '../errors/index.js';

export async function memberRoutes(app: FastifyInstance) {
  app.post('/api/members', async (request, reply) => {
    const { name } = request.body as { name?: string };
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('Name is required', { field: 'name' });
    }
    const member = await MemberService.create(app.db, { name: name.trim() });
    return reply.status(201).send(member);
  });

  app.get('/api/members', async (request) => {
    const { status } = request.query as { status?: string };
    const members = await MemberService.list(app.db, status ? { status } : undefined);
    return members;
  });

  app.get('/api/members/:id', async (request) => {
    const { id } = request.params as { id: string };
    const member = await MemberService.getById(app.db, id);
    return member;
  });

  app.put('/api/members/:id', async (request) => {
    const { id } = request.params as { id: string };
    const { name, status } = request.body as { name?: string; status?: string };
    const member = await MemberService.update(app.db, id, { name, status });
    return member;
  });

  app.delete('/api/members/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await MemberService.delete(app.db, id);
    return reply.status(204).send();
  });

  app.post('/api/members/:id/identities', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { platform, value } = request.body as { platform?: string; value?: string };
    if (!platform || typeof platform !== 'string') {
      throw new ValidationError('Platform is required', { field: 'platform' });
    }
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new ValidationError('Value is required', { field: 'value' });
    }
    const identity = await MemberService.addIdentity(app.db, id, {
      platform,
      value: value.trim(),
    });
    return reply.status(201).send(identity);
  });

  app.delete('/api/identities/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await MemberService.removeIdentity(app.db, id);
    return reply.status(204).send();
  });
}
