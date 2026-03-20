import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import * as schema from './schema.js';
import { runMigrations } from './db.js';

export function createTestDatabase(): { db: ReturnType<typeof drizzle>; sqlite: DatabaseType } {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  runMigrations(sqlite);

  const db = drizzle(sqlite, { schema });

  return { db, sqlite };
}

export function createTestRepo(commits?: Array<{ message: string; files: Record<string, string> }>) {
  const dir = mkdtempSync(join(tmpdir(), 'vantage-test-repo-'));

  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Test User"', { cwd: dir, stdio: 'ignore' });

  if (commits) {
    for (const commit of commits) {
      for (const [file, content] of Object.entries(commit.files)) {
        const filePath = join(dir, file);
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, content);
        execSync(`git add "${file}"`, { cwd: dir, stdio: 'ignore' });
      }
      execSync(`git commit -m "${commit.message}"`, { cwd: dir, stdio: 'ignore' });
    }
  }

  return dir;
}
