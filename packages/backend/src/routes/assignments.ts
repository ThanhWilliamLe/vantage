import { FastifyInstance } from 'fastify';
import { AssignmentService } from '../services/assignment-service.js';
import { ValidationError } from '../errors/index.js';

export async function assignmentRoutes(app: FastifyInstance) {
  app.post('/api/assignments', async (request, reply) => {
    const { memberId, projectId, role, startDate } = request.body as {
      memberId?: string;
      projectId?: string;
      role?: string;
      startDate?: string;
    };
    if (!memberId || typeof memberId !== 'string') {
      throw new ValidationError('memberId is required', { field: 'memberId' });
    }
    if (!projectId || typeof projectId !== 'string') {
      throw new ValidationError('projectId is required', { field: 'projectId' });
    }
    if (!startDate || typeof startDate !== 'string') {
      throw new ValidationError('startDate is required', { field: 'startDate' });
    }
    const assignment = await AssignmentService.create(app.db, {
      memberId,
      projectId,
      role,
      startDate,
    });
    return reply.status(201).send(assignment);
  });

  app.put('/api/assignments/:id', async (request) => {
    const { id } = request.params as { id: string };
    const { endDate, role } = request.body as { endDate?: string; role?: string };
    const assignment = await AssignmentService.update(app.db, id, { endDate, role });
    return assignment;
  });

  app.delete('/api/assignments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await AssignmentService.delete(app.db, id);
    return reply.status(204).send();
  });

  app.get('/api/members/:memberId/assignments', async (request) => {
    const { memberId } = request.params as { memberId: string };
    const assignments = await AssignmentService.listByMember(app.db, memberId);
    return assignments;
  });

  app.get('/api/projects/:projectId/assignments', async (request) => {
    const { projectId } = request.params as { projectId: string };
    const assignments = await AssignmentService.listByProject(app.db, projectId);
    return assignments;
  });
}
