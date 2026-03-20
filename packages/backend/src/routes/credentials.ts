import { FastifyInstance } from 'fastify';
import { CredentialService } from '../services/credential-service.js';
import { ValidationError } from '../errors/index.js';

export async function credentialRoutes(app: FastifyInstance) {
  app.post('/api/credentials', async (request, reply) => {
    const { name, platform, token, instanceUrl } = request.body as {
      name?: string;
      platform?: string;
      token?: string;
      instanceUrl?: string;
    };
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('Name is required', { field: 'name' });
    }
    if (!platform || typeof platform !== 'string') {
      throw new ValidationError('Platform is required', { field: 'platform' });
    }
    if (!token || typeof token !== 'string') {
      throw new ValidationError('Token is required', { field: 'token' });
    }
    const credential = await CredentialService.create(app.db, app.encryptionKey, {
      name: name.trim(),
      platform,
      token,
      instanceUrl,
    });
    return reply.status(201).send(credential);
  });

  app.get('/api/credentials', async () => {
    const credentials = await CredentialService.list(app.db, app.encryptionKey);
    return credentials;
  });

  app.put('/api/credentials/:id', async (request) => {
    const { id } = request.params as { id: string };
    const { name, token } = request.body as { name?: string; token?: string };
    const credential = await CredentialService.update(app.db, app.encryptionKey, id, {
      name,
      token,
    });
    return credential;
  });

  app.delete('/api/credentials/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await CredentialService.delete(app.db, id);
    return reply.status(204).send();
  });

  app.post('/api/credentials/:id/test', async (request) => {
    const { id } = request.params as { id: string };
    // Retrieve decrypted token to verify it can be decrypted
    // Actual connection testing will be implemented in a later milestone
    await CredentialService.getDecryptedToken(app.db, app.encryptionKey, id);
    return { success: true, message: 'Token decrypted successfully. Connection test not yet implemented.' };
  });
}
