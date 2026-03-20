import { FastifyInstance } from 'fastify';
import { AuthService } from '../services/auth-service.js';
import { ValidationError, AuthError } from '../errors/index.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/verify', async (request, reply) => {
    const { password } = request.body as { password?: string };
    if (!password || typeof password !== 'string') {
      throw new ValidationError('Password is required', { field: 'password' });
    }

    const isValid = await AuthService.verifyPassword(app.db, password);
    if (!isValid) {
      throw new AuthError('Invalid password');
    }

    const token = AuthService.createSession();
    return reply.status(200).send({ token });
  });

  app.post('/api/auth/set-password', async (request, reply) => {
    const { password } = request.body as { password?: string };
    if (!password || typeof password !== 'string' || password.length < 4) {
      throw new ValidationError('Password must be at least 4 characters', {
        field: 'password',
      });
    }

    await AuthService.setPassword(app.db, password);
    return reply.status(200).send({ message: 'Password set successfully' });
  });

  app.delete('/api/auth/password', async (_request, reply) => {
    await AuthService.removePassword(app.db);
    return reply.status(200).send({ message: 'Password removed successfully' });
  });
}
