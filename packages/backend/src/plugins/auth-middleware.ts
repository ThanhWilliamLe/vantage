import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { AuthService } from '../services/auth-service.js';
import { AuthError } from '../errors/index.js';

// Routes that do not require authentication
const PUBLIC_ROUTES = ['/api/auth/verify', '/api/health'];

function isPublicRoute(url: string): boolean {
  // Strip query string for comparison
  const path = url.split('?')[0];
  return PUBLIC_ROUTES.some((route) => path === route);
}

async function authMiddleware(app: FastifyInstance) {
  app.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    // Skip auth for public routes
    if (isPublicRoute(request.url)) {
      return;
    }

    // Check if password is set
    const passwordSet = await AuthService.isPasswordSet(app.db);
    if (!passwordSet) {
      // No password configured — allow all requests
      return;
    }

    // Password is set — require Bearer token
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthError('Authentication required');
    }

    const token = authHeader.slice(7);
    if (!AuthService.validateSession(token)) {
      throw new AuthError('Invalid or expired session token');
    }
  });
}

export default fp(authMiddleware, {
  name: 'auth-middleware',
});
