import { FastifyInstance } from 'fastify';
import { AIProviderService } from '../services/ai-provider-service.js';
import { ValidationError } from '../errors/index.js';

export async function aiProviderRoutes(app: FastifyInstance) {
  app.post('/api/ai-providers', async (request, reply) => {
    const body = request.body as {
      name?: string;
      type?: string;
      preset?: string;
      endpointUrl?: string;
      apiKey?: string;
      model?: string;
      cliCommand?: string;
      cliIoMethod?: string;
    };
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw new ValidationError('Name is required', { field: 'name' });
    }
    if (!body.type || typeof body.type !== 'string') {
      throw new ValidationError('Type is required', { field: 'type' });
    }
    const provider = await AIProviderService.create(app.db, app.encryptionKey, {
      name: body.name.trim(),
      type: body.type,
      preset: body.preset,
      endpointUrl: body.endpointUrl,
      apiKey: body.apiKey,
      model: body.model,
      cliCommand: body.cliCommand,
      cliIoMethod: body.cliIoMethod,
    });
    return reply.status(201).send(provider);
  });

  app.get('/api/ai-providers', async () => {
    const providers = await AIProviderService.list(app.db, app.encryptionKey);
    return providers;
  });

  app.put('/api/ai-providers/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      type?: string;
      preset?: string;
      endpointUrl?: string;
      apiKey?: string;
      model?: string;
      cliCommand?: string;
      cliIoMethod?: string;
    };
    const provider = await AIProviderService.update(app.db, app.encryptionKey, id, body);
    return provider;
  });

  app.post('/api/ai-providers/:id/activate', async (request) => {
    const { id } = request.params as { id: string };
    const provider = await AIProviderService.setActive(app.db, id);
    return provider;
  });

  app.delete('/api/ai-providers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await AIProviderService.delete(app.db, id);
    return reply.status(204).send();
  });

  app.post('/api/ai-providers/:id/test', async (request) => {
    const { id } = request.params as { id: string };
    const result = await AIProviderService.testProvider(app.db, app.encryptionKey, id);
    return result;
  });
}
