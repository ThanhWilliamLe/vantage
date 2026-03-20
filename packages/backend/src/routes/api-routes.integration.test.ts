import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '../data/test-helpers.js';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';
import { AuthService } from '../services/auth-service.js';

let app: FastifyInstance;
let sqlite: ReturnType<typeof createTestDatabase>['sqlite'];

beforeAll(async () => {
  const testDb = createTestDatabase();
  sqlite = testDb.sqlite;
  const key = randomBytes(32);
  app = buildApp({ db: testDb.db, key });
  await app.ready();
});

afterAll(async () => {
  AuthService._clearSessions();
  await app.close();
  sqlite.close();
});

// ═══════════════════════════════════════════════════════════════
// Project routes
// ═══════════════════════════════════════════════════════════════
describe('Project routes', () => {
  let projectId: string;

  it('POST /api/projects → 201 with created project', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Route Test Project', description: 'test desc' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe('Route Test Project');
    expect(body.description).toBe('test desc');
    expect(body.status).toBe('active');

    projectId = body.id;
  });

  it('GET /api/projects → 200 with list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/projects/:id → 200 with project', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(projectId);
    expect(body.name).toBe('Route Test Project');
    expect(Array.isArray(body.repositories)).toBe(true);
  });

  it('PUT /api/projects/:id → 200 with updated project', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/projects/${projectId}`,
      payload: { name: 'Updated Project Name' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('Updated Project Name');
  });

  it('DELETE /api/projects/:id → 200 (archive)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('archived');
  });

  it('GET /api/projects/:id with non-existent ID → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects/nonexistent-id',
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('POST /api/projects with missing name → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
// Member routes
// ═══════════════════════════════════════════════════════════════
describe('Member routes', () => {
  let memberId: string;
  let identityId: string;

  it('POST /api/members → 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/members',
      payload: { name: 'Route Test Member' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe('Route Test Member');

    memberId = body.id;
  });

  it('GET /api/members/:id → 200 with identities', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/members/${memberId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(memberId);
    expect(Array.isArray(body.identities)).toBe(true);
    expect(Array.isArray(body.assignments)).toBe(true);
  });

  it('POST /api/members/:id/identities → 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/members/${memberId}/identities`,
      payload: { platform: 'email', value: 'route-test@example.com' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.memberId).toBe(memberId);
    expect(body.platform).toBe('email');
    expect(body.value).toBe('route-test@example.com');

    identityId = body.id;
  });

  it('GET /api/members/:id → includes the added identity', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/members/${memberId}`,
    });

    const body = res.json();
    expect(body.identities.length).toBe(1);
    expect(body.identities[0].value).toBe('route-test@example.com');
  });

  it('DELETE /api/identities/:id → 204', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/identities/${identityId}`,
    });

    expect(res.statusCode).toBe(204);
  });

  it('GET /api/members → 200 with list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/members',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Credential routes
// ═══════════════════════════════════════════════════════════════
describe('Credential routes', () => {
  let credentialId: string;

  it('POST /api/credentials → 201 (token encrypted)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/credentials',
      payload: {
        name: 'My GitHub',
        platform: 'github',
        token: 'ghp_route_test_token_1234ABCD',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe('My GitHub');
    expect(body.tokenMasked).toContain('*');
    expect(body.tokenMasked.slice(-4)).toBe('ABCD');
    // Raw token should not be in response
    expect(body).not.toHaveProperty('token');
    expect(body).not.toHaveProperty('tokenEncrypted');

    credentialId = body.id;
  });

  it('GET /api/credentials → 200 (tokens masked)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/credentials',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);

    const cred = body.find((c: { id: string }) => c.id === credentialId);
    expect(cred.tokenMasked).toContain('*');
    expect(cred).not.toHaveProperty('tokenEncrypted');
  });

  it('PUT /api/credentials/:id → 200 with updated credential', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/credentials/${credentialId}`,
      payload: { name: 'Renamed GitHub' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('Renamed GitHub');
  });

  it('DELETE /api/credentials/:id → 204', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/credentials/${credentialId}`,
    });

    expect(res.statusCode).toBe(204);
  });
});

// ═══════════════════════════════════════════════════════════════
// Auth routes
// ═══════════════════════════════════════════════════════════════
describe('Auth routes', () => {
  it('POST /api/auth/set-password → 200', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/set-password',
      payload: { password: 'securepass' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.message).toBe('Password set successfully');
  });

  it('POST /api/auth/verify with correct password → 200 with token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { password: 'securepass' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe('string');
  });

  it('POST /api/auth/verify with wrong password → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { password: 'wrongpassword' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.code).toBe('AUTH_REQUIRED');
  });

  it('Auth middleware: with password set, request without token → 401', async () => {
    // Password is set from previous test — any non-public route should require auth
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.code).toBe('AUTH_REQUIRED');
  });

  it('Auth middleware: with valid Bearer token → request succeeds', async () => {
    // Get a valid token
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { password: 'securepass' },
    });
    const { token } = verifyRes.json();

    // Use the token to make an authenticated request
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it('Auth middleware: with invalid Bearer token → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: {
        authorization: 'Bearer invalid-token-value',
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('Auth middleware: public routes accessible without token', async () => {
    // /api/auth/verify is public
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { password: 'wrongpassword' },
    });

    // Should get 401 for wrong password, NOT for missing auth token
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.message).toBe('Invalid password');
  });

  it('Health check always accessible without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
  });

  it('DELETE /api/auth/password → 200 removes password', async () => {
    // Get a valid token first (password still set)
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { password: 'securepass' },
    });
    const { token } = verifyRes.json();

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/auth/password',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.message).toBe('Password removed successfully');

    // After removing password, requests should work without auth
    const projectsRes = await app.inject({
      method: 'GET',
      url: '/api/projects',
    });
    expect(projectsRes.statusCode).toBe(200);
  });
});
