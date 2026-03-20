import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from './app.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthError,
  GitError,
  ExternalAPIError,
  AIError,
} from './errors/index.js';
import type { FastifyInstance } from 'fastify';

describe('Fastify app', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();

    // Register test routes that throw specific errors for error-handler testing
    app.get('/test/validation-error', async () => {
      throw new ValidationError('Name is required', { field: 'name' });
    });

    app.get('/test/not-found-error', async () => {
      throw new NotFoundError('Project', 'proj-123');
    });

    app.get('/test/conflict-error', async () => {
      throw new ConflictError('Project already exists', {
        entity: 'project',
        field: 'name',
        value: 'My Project',
      });
    });

    app.get('/test/auth-error', async () => {
      throw new AuthError();
    });

    app.get('/test/git-error', async () => {
      throw new GitError('Repository not found', 'GIT_REPO_NOT_FOUND', {
        repoPath: '/tmp/repo',
      });
    });

    app.get('/test/external-api-error', async () => {
      throw new ExternalAPIError('GitHub API rate limited', {
        platform: 'github',
        httpStatus: 429,
        rateLimitReset: '2026-03-19T23:00:00Z',
      });
    });

    app.get('/test/ai-unavailable-error', async () => {
      throw new AIError('AI provider is not reachable', 'AI_PROVIDER_UNAVAILABLE');
    });

    app.get('/test/ai-timeout-error', async () => {
      throw new AIError('AI request timed out', 'AI_TIMEOUT');
    });

    app.get('/test/unknown-error', async () => {
      throw new Error('Something went horribly wrong internally');
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('health check', () => {
    it('GET /api/health returns 200 with status and timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeTruthy();
      // Timestamp should be a valid ISO string
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });
  });

  describe('unknown route', () => {
    it('GET /api/nonexistent returns 404 with correct format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/nonexistent',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('GET');
      expect(body.error.message).toContain('/api/nonexistent');
    });
  });

  describe('error handler', () => {
    it('ValidationError returns 400 with correct JSON format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/validation-error',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Name is required');
      expect(body.error.details).toEqual({ field: 'name' });
    });

    it('NotFoundError returns 404', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/not-found-error',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Project not found');
      expect(body.error.details).toEqual({ entity: 'Project', id: 'proj-123' });
    });

    it('ConflictError returns 409', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/conflict-error',
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toBe('Project already exists');
      expect(body.error.details).toEqual({
        entity: 'project',
        field: 'name',
        value: 'My Project',
      });
    });

    it('AuthError returns 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/auth-error',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('AUTH_REQUIRED');
      expect(body.error.message).toBe('Authentication required');
    });

    it('GitError returns 502', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/git-error',
      });

      expect(response.statusCode).toBe(502);
      const body = response.json();
      expect(body.error.code).toBe('GIT_REPO_NOT_FOUND');
      expect(body.error.message).toBe('Repository not found');
      expect(body.error.details).toEqual({ repoPath: '/tmp/repo' });
    });

    it('ExternalAPIError returns 502', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/external-api-error',
      });

      expect(response.statusCode).toBe(502);
      const body = response.json();
      expect(body.error.code).toBe('EXTERNAL_API_ERROR');
      expect(body.error.details.platform).toBe('github');
    });

    it('AIError (UNAVAILABLE) returns 503', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/ai-unavailable-error',
      });

      expect(response.statusCode).toBe(503);
      const body = response.json();
      expect(body.error.code).toBe('AI_PROVIDER_UNAVAILABLE');
    });

    it('AIError (TIMEOUT) returns 504', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/ai-timeout-error',
      });

      expect(response.statusCode).toBe(504);
      const body = response.json();
      expect(body.error.code).toBe('AI_TIMEOUT');
    });

    it('unknown error returns 500 without internal details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/unknown-error',
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('An unexpected error occurred');
      // Must NOT leak internal error message
      expect(JSON.stringify(body)).not.toContain('horribly wrong');
    });
  });
});
