/**
 * Shared E2E test helpers — API seeding, test repo creation, and common utilities.
 */
import { type APIRequestContext } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const API = 'http://localhost:3847';

/** Unique suffix per test run to avoid data collisions. */
export function uid(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Creates a temporary git repo with several commits for scanning.
 * Returns the absolute path to the repo directory.
 */
export function createFixtureRepo(prefix = 'vantage-e2e'): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));

  const run = (cmd: string) =>
    execSync(cmd, { cwd: dir, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 'Alice Dev', GIT_AUTHOR_EMAIL: 'alice@example.com', GIT_COMMITTER_NAME: 'Alice Dev', GIT_COMMITTER_EMAIL: 'alice@example.com' } });

  run('git init');
  run('git checkout -b main');

  // Commit 1 — initial setup
  writeFileSync(join(dir, 'README.md'), '# Test Project\n\nInitial setup.\n');
  run('git add .');
  run('git commit -m "feat: initial project setup"');

  // Commit 2 — add source file
  writeFileSync(join(dir, 'index.ts'), 'export function greet(name: string) {\n  return `Hello, ${name}!`;\n}\n');
  run('git add .');
  run('git commit -m "feat: add greeting function"');

  // Commit 3 — add config
  writeFileSync(join(dir, 'config.json'), '{\n  "port": 8080,\n  "debug": false\n}\n');
  run('git add .');
  run('git commit -m "chore: add configuration file"');

  // Commit 4 — fix bug
  writeFileSync(join(dir, 'index.ts'), 'export function greet(name: string) {\n  if (!name) return "Hello, stranger!";\n  return `Hello, ${name}!`;\n}\n');
  run('git add .');
  run('git commit -m "fix: handle empty name in greet function"');

  return dir;
}

/** API helper — create a project and return its id + name. */
export async function createProject(api: APIRequestContext, name: string, description?: string) {
  const res = await api.post(`${API}/api/projects`, { data: { name, description } });
  if (!res.ok()) throw new Error(`Failed to create project: ${res.status()}`);
  return res.json() as Promise<{ id: string; name: string; status: string }>;
}

/** API helper — create a member. */
export async function createMember(api: APIRequestContext, name: string) {
  const res = await api.post(`${API}/api/members`, { data: { name } });
  if (!res.ok()) throw new Error(`Failed to create member: ${res.status()}`);
  return res.json() as Promise<{ id: string; name: string }>;
}

/** API helper — add an identity to a member. Backend expects { platform, value }. Tolerates 409 (already exists). */
export async function addIdentity(api: APIRequestContext, memberId: string, platform: string, value: string) {
  const res = await api.post(`${API}/api/members/${memberId}/identities`, { data: { platform, value } });
  if (res.status() === 409) return; // identity already exists — fine
  if (!res.ok()) throw new Error(`Failed to add identity: ${res.status()}`);
  return res.json();
}

/** API helper — add a local repository to a project. Backend expects { type, localPath }. */
export async function addRepository(api: APIRequestContext, projectId: string, localPath: string) {
  const res = await api.post(`${API}/api/projects/${projectId}/repositories`, { data: { type: 'local', localPath } });
  if (!res.ok()) throw new Error(`Failed to add repository: ${res.status()}`);
  return res.json() as Promise<{ id: string }>;
}

/** API helper — trigger a scan of all repos. */
export async function triggerScan(api: APIRequestContext) {
  const res = await api.post(`${API}/api/scan`, { data: {} });
  if (!res.ok()) throw new Error(`Failed to trigger scan: ${res.status()}`);
  return res.json();
}

/** API helper — list pending code changes. */
export async function getPendingQueue(api: APIRequestContext) {
  const res = await api.get(`${API}/api/code-changes?status=pending`);
  if (!res.ok()) throw new Error(`Failed to get queue: ${res.status()}`);
  return res.json() as Promise<{ items: Array<{ id: string; title: string; status: string }>; total: number }>;
}

/** API helper — review a code change. */
export async function reviewChange(api: APIRequestContext, id: string, notes?: string) {
  const res = await api.post(`${API}/api/code-changes/${id}/review`, { data: { notes } });
  if (!res.ok()) throw new Error(`Failed to review: ${res.status()}`);
  return res.json();
}

/** API helper — flag a code change. */
export async function flagChange(api: APIRequestContext, id: string, reason: string) {
  const res = await api.post(`${API}/api/code-changes/${id}/flag`, { data: { reason } });
  if (!res.ok()) throw new Error(`Failed to flag: ${res.status()}`);
  return res.json();
}

/** API helper — create an evaluation. */
export async function createEvaluation(api: APIRequestContext, data: {
  type: string;
  memberId: string;
  date?: string;
  quarter?: string;
  projectIds: string[];
  description?: string;
  workloadScore?: number;
}) {
  const res = await api.post(`${API}/api/evaluations`, { data });
  if (!res.ok()) throw new Error(`Failed to create evaluation: ${res.status()}`);
  return res.json() as Promise<{ id: string }>;
}

/** API helper — get evaluations. */
export async function getEvaluations(api: APIRequestContext) {
  const res = await api.get(`${API}/api/evaluations`);
  if (!res.ok()) throw new Error(`Failed to get evaluations: ${res.status()}`);
  return res.json() as Promise<{ items: Array<{ id: string; type: string; description: string }>; total: number }>;
}

/** API helper — create a credential. Backend expects { name, platform, token, instanceUrl? }. */
export async function createCredential(api: APIRequestContext, data: { name: string; platform: string; token: string; instanceUrl?: string }) {
  const res = await api.post(`${API}/api/credentials`, { data });
  if (!res.ok()) throw new Error(`Failed to create credential: ${res.status()}`);
  return res.json() as Promise<{ id: string }>;
}

/** API helper — create an AI provider. Backend expects { name, type, model?, apiKey?, ... }. */
export async function createAIProvider(api: APIRequestContext, data: { name: string; type: string; model?: string; apiKey?: string }) {
  const res = await api.post(`${API}/api/ai-providers`, { data });
  if (!res.ok()) throw new Error(`Failed to create AI provider: ${res.status()}`);
  return res.json() as Promise<{ id: string }>;
}

/** API helper — search. */
export async function search(api: APIRequestContext, query: string, scope?: string) {
  const params = new URLSearchParams({ q: query });
  if (scope) params.set('scope', scope);
  const res = await api.get(`${API}/api/search?${params}`);
  if (!res.ok()) throw new Error(`Failed to search: ${res.status()}`);
  return res.json();
}

/** API helper — get workload data. */
export async function getWorkload(api: APIRequestContext, startDate: string, endDate: string) {
  const res = await api.get(`${API}/api/workload?startDate=${startDate}&endDate=${endDate}`);
  if (!res.ok()) throw new Error(`Failed to get workload: ${res.status()}`);
  return res.json();
}

/** API helper — get history. */
export async function getHistory(api: APIRequestContext, filters?: Record<string, string>) {
  const params = new URLSearchParams(filters ?? {});
  const res = await api.get(`${API}/api/code-changes/history?${params}`);
  if (!res.ok()) throw new Error(`Failed to get history: ${res.status()}`);
  return res.json() as Promise<{ items: Array<{ id: string; title: string; status: string }>; total: number }>;
}
