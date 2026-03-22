import type { FastifyInstance } from 'fastify';
import { TaskTrackerService } from '../services/task-tracker-service.js';
import { ValidationError } from '../errors/index.js';

const VALID_PLATFORMS = ['jira', 'clickup'];

export async function taskTrackerRoutes(app: FastifyInstance) {
  // List credentials for a project
  app.get('/api/projects/:projectId/task-tracker-credentials', async (request) => {
    const { projectId } = request.params as { projectId: string };
    return TaskTrackerService.listCredentials(app.db, projectId);
  });

  // Create a credential
  app.post('/api/projects/:projectId/task-tracker-credentials', async (request) => {
    const { projectId } = request.params as { projectId: string };
    const { name, platform, token, instanceUrl } = request.body as {
      name: string;
      platform: 'jira' | 'clickup';
      token: string;
      instanceUrl?: string;
    };

    if (!name || !token) {
      throw new ValidationError('name and token are required');
    }
    if (!VALID_PLATFORMS.includes(platform)) {
      throw new ValidationError(`platform must be one of: ${VALID_PLATFORMS.join(', ')}`);
    }
    if (platform === 'jira' && !instanceUrl) {
      throw new ValidationError('instanceUrl is required for Jira');
    }

    return TaskTrackerService.createCredential(app.db, app.encryptionKey, {
      projectId,
      name,
      platform,
      token,
      instanceUrl,
    });
  });

  // Delete a credential
  app.delete('/api/task-tracker-credentials/:id', async (request) => {
    const { id } = request.params as { id: string };
    await TaskTrackerService.deleteCredential(app.db, id);
    return { success: true };
  });

  // Enrich task IDs with metadata
  app.post('/api/task-tracker/enrich', async (request) => {
    const { projectId, taskIds } = request.body as {
      projectId: string;
      taskIds: string[];
    };
    if (!projectId || !Array.isArray(taskIds)) {
      throw new ValidationError('projectId and taskIds array are required');
    }
    return TaskTrackerService.enrichTaskIds(app.db, app.encryptionKey, projectId, taskIds);
  });
}
