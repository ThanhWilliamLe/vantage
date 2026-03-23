import Fastify, { type FastifyError } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from './errors/index.js';
import type { DrizzleDB } from './data/db.js';

// Route plugins
import { projectRoutes } from './routes/projects.js';
import { memberRoutes } from './routes/members.js';
import { credentialRoutes } from './routes/credentials.js';
import { assignmentRoutes } from './routes/assignments.js';
import { aiProviderRoutes } from './routes/ai-providers.js';
import { taskPatternRoutes } from './routes/task-patterns.js';
import { repositoryRoutes } from './routes/repositories.js';
import { authRoutes } from './routes/auth.js';
import { scanRoutes } from './routes/scan.js';
import { syncRoutes } from './routes/sync.js';
import { codeChangeRoutes } from './routes/code-changes.js';
import { reviewRoutes } from './routes/reviews.js';
import { aiRoutes } from './routes/ai.js';
import { evaluationRoutes } from './routes/evaluations.js';
import { searchRoutes } from './routes/search.js';
import { workloadRoutes } from './routes/workload.js';
import { workloadChartRoutes } from './routes/workload-charts.js';
import { backupRoutes } from './routes/backup.js';
import { importRoutes } from './routes/import.js';
import { identitySuggestionRoutes } from './routes/identity-suggestions.js';
import { taskTrackerRoutes } from './routes/task-tracker.js';
import { systemRoutes } from './routes/system.js';
import authMiddleware from './plugins/auth-middleware.js';

// Extend Fastify instance type with our decorators
declare module 'fastify' {
  interface FastifyInstance {
    db: DrizzleDB;
    encryptionKey: Buffer;
  }
}

export interface BuildAppOptions {
  db: DrizzleDB;
  key: Buffer;
}

export function buildApp(options?: BuildAppOptions) {
  const app = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Global error handler
  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    // Handle Fastify validation errors (JSON Schema)
    if ('validation' in error && error.validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: {
            validationErrors: error.validation.map(
              (v: {
                instancePath?: string;
                params?: Record<string, unknown>;
                message?: string;
              }) => ({
                field: v.instancePath || v.params?.missingProperty,
                message: v.message,
              }),
            ),
          },
        },
      });
    }

    // Handle known application errors
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log.error({ err: error }, error.message);
      } else {
        request.log.warn({ err: error }, error.message);
      }

      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details || undefined,
        },
      });
    }

    // Handle unknown errors
    request.log.error({ err: error }, 'Unhandled error');

    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });

  // Health check endpoint (before auth middleware so it's always accessible)
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Register decorators if options provided
  if (options) {
    app.decorate('db', options.db);
    app.decorate('encryptionKey', options.key);

    // Register auth middleware (must come before routes)
    app.register(authMiddleware);

    // Register route plugins
    app.register(projectRoutes);
    app.register(memberRoutes);
    app.register(credentialRoutes);
    app.register(assignmentRoutes);
    app.register(aiProviderRoutes);
    app.register(taskPatternRoutes);
    app.register(repositoryRoutes);
    app.register(scanRoutes);
    app.register(syncRoutes);
    app.register(codeChangeRoutes);
    app.register(reviewRoutes);
    app.register(aiRoutes);
    app.register(evaluationRoutes);
    app.register(searchRoutes);
    app.register(workloadRoutes);
    app.register(workloadChartRoutes);
    app.register(backupRoutes);
    app.register(importRoutes);
    app.register(identitySuggestionRoutes);
    app.register(taskTrackerRoutes);
    app.register(systemRoutes);
    app.register(authRoutes);
  }

  // Serve frontend static files if the build exists
  const __dirname =
    typeof import.meta.dirname === 'string'
      ? import.meta.dirname
      : fileURLToPath(new URL('.', import.meta.url));
  const frontendDist = resolve(__dirname, '../../frontend/dist');

  if (existsSync(frontendDist)) {
    app.register(fastifyStatic, {
      root: frontendDist,
      prefix: '/',
    });
  }

  // 404 handler: serve index.html for non-API routes (SPA fallback)
  app.setNotFoundHandler((request, reply) => {
    // API routes get a JSON 404
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: `Route ${request.method} ${request.url} not found`,
        },
      });
    }

    // Non-API routes: serve the SPA index.html
    if (existsSync(join(frontendDist, 'index.html'))) {
      return reply.sendFile('index.html');
    }

    // No frontend build available
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Frontend not built. Run: pnpm --filter @twle/vantage-frontend build',
      },
    });
  });

  return app;
}
