import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '../data/test-helpers.js';
import { ProjectService } from './project-service.js';
import { MemberService } from './member-service.js';
import { CredentialService } from './credential-service.js';
import { AssignmentService } from './assignment-service.js';
import { AIProviderService } from './ai-provider-service.js';
import { TaskPatternService } from './task-pattern-service.js';
import { AuthService } from './auth-service.js';
import { NotFoundError, ConflictError } from '../errors/index.js';

const { db, sqlite } = createTestDatabase();
const key = randomBytes(32);

afterAll(() => {
  sqlite.close();
});

// ═══════════════════════════════════════════════════════════════
// ProjectService
// ═══════════════════════════════════════════════════════════════
describe('ProjectService', () => {
  let projectId: string;

  it('create project → returns project with id and timestamps', async () => {
    const project = await ProjectService.create(db, {
      name: 'Test Project',
      description: 'A test project',
    });

    expect(project.id).toBeDefined();
    expect(project.name).toBe('Test Project');
    expect(project.description).toBe('A test project');
    expect(project.status).toBe('active');
    expect(project.createdAt).toBeDefined();
    expect(project.updatedAt).toBeDefined();

    projectId = project.id;
  });

  it('list projects → returns all active by default', async () => {
    const projects = await ProjectService.list(db);
    expect(projects.length).toBeGreaterThanOrEqual(1);
    expect(projects.some((p) => p.id === projectId)).toBe(true);
  });

  it('getById → returns project with repositories array', async () => {
    const project = await ProjectService.getById(db, projectId);
    expect(project.id).toBe(projectId);
    expect(project.name).toBe('Test Project');
    expect(Array.isArray(project.repositories)).toBe(true);
  });

  it('update project → changes name', async () => {
    const updated = await ProjectService.update(db, projectId, {
      name: 'Renamed Project',
    });
    expect(updated.name).toBe('Renamed Project');

    const fetched = await ProjectService.getById(db, projectId);
    expect(fetched.name).toBe('Renamed Project');
  });

  it('archive project → sets status to archived, excluded from filtered list but data intact', async () => {
    const archived = await ProjectService.archive(db, projectId);
    expect(archived.status).toBe('archived');

    // Filtered list with status=active should not include archived project
    const activeProjects = await ProjectService.list(db, { status: 'active' });
    expect(activeProjects.some((p) => p.id === projectId)).toBe(false);

    // Unfiltered list still includes it (data intact)
    const allProjects = await ProjectService.list(db);
    expect(allProjects.some((p) => p.id === projectId)).toBe(true);

    // getById still works (data intact)
    const fetched = await ProjectService.getById(db, projectId);
    expect(fetched.id).toBe(projectId);
    expect(fetched.status).toBe('archived');
  });

  it('create duplicate name → throws due to unique constraint', async () => {
    await ProjectService.create(db, { name: 'Unique Project' });
    await expect(
      ProjectService.create(db, { name: 'Unique Project' }),
    ).rejects.toThrow();
  });

  it('getById with non-existent ID → throws NotFoundError', async () => {
    await expect(
      ProjectService.getById(db, 'nonexistent'),
    ).rejects.toThrow(NotFoundError);
  });
});

// ═══════════════════════════════════════════════════════════════
// MemberService
// ═══════════════════════════════════════════════════════════════
describe('MemberService', () => {
  let memberId: string;
  let identityId: string;

  it('create member → returns member with id', async () => {
    const member = await MemberService.create(db, { name: 'Alice' });

    expect(member.id).toBeDefined();
    expect(member.name).toBe('Alice');
    expect(member.status).toBe('active');
    expect(member.createdAt).toBeDefined();
    expect(member.updatedAt).toBeDefined();

    memberId = member.id;
  });

  it('list members → returns all', async () => {
    const members = await MemberService.list(db);
    expect(members.length).toBeGreaterThanOrEqual(1);
    expect(members.some((m) => m.id === memberId)).toBe(true);
  });

  it('getById → returns member with identities and assignments', async () => {
    const member = await MemberService.getById(db, memberId);
    expect(member.id).toBe(memberId);
    expect(member.name).toBe('Alice');
    expect(Array.isArray(member.identities)).toBe(true);
    expect(Array.isArray(member.assignments)).toBe(true);
  });

  it('addIdentity → adds identity to member', async () => {
    const identity = await MemberService.addIdentity(db, memberId, {
      platform: 'email',
      value: 'alice@example.com',
    });

    expect(identity.id).toBeDefined();
    expect(identity.memberId).toBe(memberId);
    expect(identity.platform).toBe('email');
    expect(identity.value).toBe('alice@example.com');

    identityId = identity.id;

    // Verify it appears in getById
    const member = await MemberService.getById(db, memberId);
    expect(member.identities.length).toBe(1);
    expect(member.identities[0].value).toBe('alice@example.com');
  });

  it('addIdentity with same email on another member → throws ConflictError', async () => {
    const otherMember = await MemberService.create(db, { name: 'Bob' });

    await expect(
      MemberService.addIdentity(db, otherMember.id, {
        platform: 'email',
        value: 'alice@example.com',
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('addIdentity with duplicate on same member → throws ConflictError', async () => {
    await expect(
      MemberService.addIdentity(db, memberId, {
        platform: 'email',
        value: 'alice@example.com',
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('removeIdentity → removes identity', async () => {
    await MemberService.removeIdentity(db, identityId);

    const member = await MemberService.getById(db, memberId);
    expect(member.identities.length).toBe(0);
  });

  it('resolveAuthor → maps email to correct member; unmapped email returns null', async () => {
    // Add identity back for resolve test
    await MemberService.addIdentity(db, memberId, {
      platform: 'git',
      value: 'alice@dev.com',
    });

    const resolved = await MemberService.resolveAuthor(db, 'git', 'alice@dev.com');
    expect(resolved).not.toBeNull();
    expect(resolved!.id).toBe(memberId);
    expect(resolved!.name).toBe('Alice');

    // Unmapped email returns null
    const unknown = await MemberService.resolveAuthor(db, 'git', 'unknown@dev.com');
    expect(unknown).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// CredentialService
// ═══════════════════════════════════════════════════════════════
describe('CredentialService', () => {
  let credentialId: string;
  const originalToken = 'ghp_abcdef1234567890ABCDEF';

  it('create credential → token is encrypted at rest', async () => {
    const cred = await CredentialService.create(db, key, {
      name: 'GitHub Token',
      platform: 'github',
      token: originalToken,
    });

    expect(cred.id).toBeDefined();
    expect(cred.name).toBe('GitHub Token');
    expect(cred.platform).toBe('github');
    expect(cred.tokenMasked).not.toBe(originalToken);
    expect(cred.tokenMasked).toContain('CDEF'); // last 4 chars
    expect(cred.tokenMasked).toContain('*');

    credentialId = cred.id;
  });

  it('list credentials → tokens are masked (last 4 chars only)', async () => {
    const list = await CredentialService.list(db, key);
    expect(list.length).toBeGreaterThanOrEqual(1);

    const cred = list.find((c) => c.id === credentialId)!;
    expect(cred.tokenMasked).toContain('*');
    expect(cred.tokenMasked.slice(-4)).toBe('CDEF');
    // Ensure raw token is not exposed
    expect(cred).not.toHaveProperty('tokenEncrypted');
  });

  it('getDecryptedToken → returns original token', async () => {
    const decrypted = await CredentialService.getDecryptedToken(db, key, credentialId);
    expect(decrypted).toBe(originalToken);
  });

  it('update credential with new token → re-encrypted', async () => {
    const newToken = 'ghp_newtoken1234XYZW';
    const updated = await CredentialService.update(db, key, credentialId, {
      token: newToken,
    });

    expect(updated.tokenMasked.slice(-4)).toBe('XYZW');

    // Verify decryption of new token
    const decrypted = await CredentialService.getDecryptedToken(db, key, credentialId);
    expect(decrypted).toBe(newToken);
  });

  it('delete credential → removed', async () => {
    await CredentialService.delete(db, credentialId);

    await expect(
      CredentialService.getDecryptedToken(db, key, credentialId),
    ).rejects.toThrow(NotFoundError);
  });
});

// ═══════════════════════════════════════════════════════════════
// AssignmentService
// ═══════════════════════════════════════════════════════════════
describe('AssignmentService', () => {
  let assignmentId: string;
  let memberId: string;
  let projectId: string;

  beforeAll(async () => {
    const member = await MemberService.create(db, { name: 'Charlie' });
    memberId = member.id;
    const project = await ProjectService.create(db, { name: 'Assignment Test Project' });
    projectId = project.id;
  });

  it('create assignment → returns assignment with dates', async () => {
    const assignment = await AssignmentService.create(db, {
      memberId,
      projectId,
      role: 'developer',
      startDate: '2026-01-01',
    });

    expect(assignment.id).toBeDefined();
    expect(assignment.memberId).toBe(memberId);
    expect(assignment.projectId).toBe(projectId);
    expect(assignment.role).toBe('developer');
    expect(assignment.startDate).toBe('2026-01-01');
    expect(assignment.endDate).toBeNull();
    expect(assignment.createdAt).toBeDefined();

    assignmentId = assignment.id;
  });

  it('end assignment → sets end_date', async () => {
    const ended = await AssignmentService.end(db, assignmentId, '2026-06-30');
    expect(ended.endDate).toBe('2026-06-30');
  });

  it('listByMember → returns assignments for member', async () => {
    const assignments = await AssignmentService.listByMember(db, memberId);
    expect(assignments.length).toBeGreaterThanOrEqual(1);
    expect(assignments.some((a) => a.id === assignmentId)).toBe(true);
  });

  it('listByProject → returns assignments for project', async () => {
    const assignments = await AssignmentService.listByProject(db, projectId);
    expect(assignments.length).toBeGreaterThanOrEqual(1);
    expect(assignments.some((a) => a.id === assignmentId)).toBe(true);
  });

  it('create assignment with nonexistent member → throws NotFoundError', async () => {
    await expect(
      AssignmentService.create(db, {
        memberId: 'nonexistent',
        projectId,
        startDate: '2026-01-01',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('create assignment with nonexistent project → throws NotFoundError', async () => {
    await expect(
      AssignmentService.create(db, {
        memberId,
        projectId: 'nonexistent',
        startDate: '2026-01-01',
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

// ═══════════════════════════════════════════════════════════════
// AIProviderService
// ═══════════════════════════════════════════════════════════════
describe('AIProviderService', () => {
  let providerId1: string;
  let providerId2: string;
  const apiKeyValue = 'sk-test-api-key-1234ABCD';

  it('create provider → API key encrypted', async () => {
    const provider = await AIProviderService.create(db, key, {
      name: 'OpenAI',
      type: 'api',
      apiKey: apiKeyValue,
      model: 'gpt-4',
    });

    expect(provider.id).toBeDefined();
    expect(provider.name).toBe('OpenAI');
    expect(provider.type).toBe('api');
    expect(provider.apiKeyMasked).toContain('*');
    expect(provider.apiKeyMasked!.slice(-4)).toBe('ABCD');
    expect(provider.isActive).toBe(false);

    providerId1 = provider.id;
  });

  it('create second provider without API key', async () => {
    const provider = await AIProviderService.create(db, key, {
      name: 'Local LLM',
      type: 'cli',
      cliCommand: 'ollama run llama',
    });

    expect(provider.id).toBeDefined();
    expect(provider.apiKeyMasked).toBeNull();

    providerId2 = provider.id;
  });

  it('setActive → this provider active, others deactivated', async () => {
    // Activate provider 1
    await AIProviderService.setActive(db, providerId1);

    const active = await AIProviderService.getActive(db);
    expect(active).not.toBeNull();
    expect(active!.id).toBe(providerId1);
    expect(active!.isActive).toBe(1);

    // Now activate provider 2 — provider 1 should be deactivated
    await AIProviderService.setActive(db, providerId2);

    const active2 = await AIProviderService.getActive(db);
    expect(active2).not.toBeNull();
    expect(active2!.id).toBe(providerId2);
  });

  it('getActive → returns active provider', async () => {
    const active = await AIProviderService.getActive(db);
    expect(active).not.toBeNull();
    expect(active!.id).toBe(providerId2);
  });

  it('list → API keys masked', async () => {
    const providers = await AIProviderService.list(db, key);
    expect(providers.length).toBeGreaterThanOrEqual(2);

    const p1 = providers.find((p) => p.id === providerId1)!;
    expect(p1.apiKeyMasked).toContain('*');
    expect(p1.apiKeyMasked!.slice(-4)).toBe('ABCD');
    // No raw key exposed
    expect(p1).not.toHaveProperty('apiKeyEncrypted');

    const p2 = providers.find((p) => p.id === providerId2)!;
    expect(p2.apiKeyMasked).toBeNull();
  });

  it('getActive returns null when no provider is active', async () => {
    // Delete both providers to clear state
    await AIProviderService.delete(db, providerId1);
    await AIProviderService.delete(db, providerId2);

    const active = await AIProviderService.getActive(db);
    expect(active).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// TaskPatternService
// ═══════════════════════════════════════════════════════════════
describe('TaskPatternService', () => {
  let projectId: string;
  let patternId: string;

  beforeAll(async () => {
    const project = await ProjectService.create(db, {
      name: 'TaskPattern Test Project',
    });
    projectId = project.id;
  });

  it('create pattern → returns pattern', async () => {
    const pattern = await TaskPatternService.create(db, {
      projectId,
      regex: '(PROJ-\\d+)',
      urlTemplate: 'https://jira.example.com/browse/{id}',
    });

    expect(pattern.id).toBeDefined();
    expect(pattern.projectId).toBe(projectId);
    expect(pattern.regex).toBe('(PROJ-\\d+)');
    expect(pattern.urlTemplate).toBe('https://jira.example.com/browse/{id}');
    expect(pattern.createdAt).toBeDefined();

    patternId = pattern.id;
  });

  it('list patterns for project', async () => {
    const patterns = await TaskPatternService.list(db, projectId);
    expect(patterns.length).toBe(1);
    expect(patterns[0].id).toBe(patternId);
  });

  it('detectTaskIds → regex matches in text, returns IDs with URLs', () => {
    const patterns = [
      {
        regex: '(PROJ-\\d+)',
        urlTemplate: 'https://jira.example.com/browse/{id}',
      },
    ];

    const text = 'Fixed PROJ-123 and PROJ-456. Also references PROJ-123 again.';
    const detected = TaskPatternService.detectTaskIds(text, patterns);

    expect(detected.length).toBe(2); // deduplicated
    expect(detected).toContainEqual({
      taskId: 'PROJ-123',
      url: 'https://jira.example.com/browse/PROJ-123',
    });
    expect(detected).toContainEqual({
      taskId: 'PROJ-456',
      url: 'https://jira.example.com/browse/PROJ-456',
    });
  });

  it('detectTaskIds → with multiple patterns', () => {
    const patterns = [
      {
        regex: '(PROJ-\\d+)',
        urlTemplate: 'https://jira.example.com/browse/{id}',
      },
      {
        regex: '#(\\d+)',
        urlTemplate: 'https://github.com/org/repo/issues/{id}',
      },
    ];

    const text = 'Fixes PROJ-100 and closes #42';
    const detected = TaskPatternService.detectTaskIds(text, patterns);

    expect(detected.length).toBe(2);
    expect(detected).toContainEqual({
      taskId: 'PROJ-100',
      url: 'https://jira.example.com/browse/PROJ-100',
    });
    expect(detected).toContainEqual({
      taskId: '42',
      url: 'https://github.com/org/repo/issues/42',
    });
  });

  it('detectTaskIds → returns empty array when no matches', () => {
    const patterns = [
      {
        regex: '(PROJ-\\d+)',
        urlTemplate: 'https://jira.example.com/browse/{id}',
      },
    ];

    const detected = TaskPatternService.detectTaskIds('no task references here', patterns);
    expect(detected).toEqual([]);
  });

  it('create pattern with invalid regex → throws ValidationError', async () => {
    await expect(
      TaskPatternService.create(db, {
        projectId,
        regex: '(unclosed',
        urlTemplate: 'https://example.com/{id}',
      }),
    ).rejects.toThrow();
  });

  it('create pattern with nonexistent project → throws NotFoundError', async () => {
    await expect(
      TaskPatternService.create(db, {
        projectId: 'nonexistent',
        regex: '(TEST-\\d+)',
        urlTemplate: 'https://example.com/{id}',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('delete pattern', async () => {
    await TaskPatternService.delete(db, patternId);
    const patterns = await TaskPatternService.list(db, projectId);
    expect(patterns.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// AuthService
// ═══════════════════════════════════════════════════════════════
describe('AuthService', () => {
  beforeAll(() => {
    AuthService._clearSessions();
  });

  it('setPassword → hash stored in app_config', async () => {
    await AuthService.setPassword(db, 'testpass123');

    const isSet = await AuthService.isPasswordSet(db);
    expect(isSet).toBe(true);
  });

  it('verifyPassword → correct returns true', async () => {
    const result = await AuthService.verifyPassword(db, 'testpass123');
    expect(result).toBe(true);
  });

  it('verifyPassword → wrong returns false', async () => {
    const result = await AuthService.verifyPassword(db, 'wrongpassword');
    expect(result).toBe(false);
  });

  it('createSession + validateSession → token works', () => {
    const token = AuthService.createSession();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);

    const valid = AuthService.validateSession(token);
    expect(valid).toBe(true);
  });

  it('validateSession → invalid token returns false', () => {
    const valid = AuthService.validateSession('nonexistent-token');
    expect(valid).toBe(false);
  });

  it('removePassword → hash cleared', async () => {
    await AuthService.removePassword(db);

    const isSet = await AuthService.isPasswordSet(db);
    expect(isSet).toBe(false);

    // verifyPassword returns false when no hash is set
    const result = await AuthService.verifyPassword(db, 'testpass123');
    expect(result).toBe(false);
  });
});
