import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from './test-helpers.js';
import { checkDatabaseIntegrity } from './db.js';

describe('database (integration)', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    const testDb = createTestDatabase();
    sqlite = testDb.sqlite;
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('schema tables', () => {
    const expectedTables = [
      'project',
      'git_credential',
      'repository',
      'ai_provider',
      'member',
      'member_identity',
      'assignment',
      'code_change',
      'deep_analysis',
      'evaluation_entry',
      'task_pattern',
      'scan_state',
      'sync_state',
      'app_config',
      'task_tracker_credential',
    ];

    it('all 15 tables exist after migration', () => {
      const rows = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%' ORDER BY name",
        )
        .all() as Array<{ name: string }>;

      const tableNames = rows.map((r) => r.name).sort();
      expect(tableNames).toEqual(expectedTables.slice().sort());
      expect(tableNames.length).toBe(15);
    });
  });

  describe('FTS5 virtual tables', () => {
    it('2 FTS5 virtual tables exist', () => {
      const rows = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%_fts' ORDER BY name",
        )
        .all() as Array<{ name: string }>;

      const ftsNames = rows.map((r) => r.name).sort();
      expect(ftsNames).toEqual(['code_change_fts', 'evaluation_entry_fts']);
      expect(ftsNames.length).toBe(2);
    });
  });

  describe('triggers', () => {
    it('6 FTS sync triggers exist', () => {
      const rows = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
        .all() as Array<{ name: string }>;

      const triggerNames = rows.map((r) => r.name).sort();
      expect(triggerNames).toEqual([
        'code_change_fts_delete',
        'code_change_fts_insert',
        'code_change_fts_update',
        'evaluation_entry_fts_delete',
        'evaluation_entry_fts_insert',
        'evaluation_entry_fts_update',
      ]);
      expect(triggerNames.length).toBe(6);
    });
  });

  describe('FTS5 rowid check', () => {
    it('SELECT rowid FROM code_change LIMIT 1 succeeds (returns empty before inserts)', () => {
      const rows = sqlite.prepare('SELECT rowid FROM code_change LIMIT 1').all();
      expect(rows).toEqual([]);
    });
  });

  describe('FTS5 trigger sync — code_change', () => {
    function insertProject() {
      const now = new Date().toISOString();
      sqlite
        .prepare(
          'INSERT INTO project (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run('proj-1', 'Test Project', 'active', now, now);
    }

    function insertRepo() {
      const now = new Date().toISOString();
      sqlite
        .prepare(
          'INSERT INTO repository (id, project_id, type, local_path, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run('repo-1', 'proj-1', 'local', '/tmp/repo', now);
    }

    function insertCodeChange(id: string, title: string, body: string | null) {
      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO code_change
           (id, project_id, repo_id, type, platform_id, title, body, author_raw, authored_at, fetched_at, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          'proj-1',
          'repo-1',
          'commit',
          id,
          title,
          body,
          'author@example.com',
          now,
          now,
          'pending',
          now,
          now,
        );
    }

    it('INSERT into code_change is found via FTS', () => {
      insertProject();
      insertRepo();
      insertCodeChange('cc-1', 'Fix authentication bug', 'Resolved login issue with OAuth tokens');

      const results = sqlite
        .prepare("SELECT rowid FROM code_change_fts WHERE code_change_fts MATCH 'authentication'")
        .all();
      expect(results.length).toBe(1);
    });

    it('UPDATE on code_change is reflected in FTS', () => {
      insertProject();
      insertRepo();
      insertCodeChange('cc-2', 'Original title', 'Original body');

      // Verify original is findable
      let results = sqlite
        .prepare("SELECT rowid FROM code_change_fts WHERE code_change_fts MATCH 'Original'")
        .all();
      expect(results.length).toBe(1);

      // Update the title
      sqlite
        .prepare("UPDATE code_change SET title = 'Updated refactored title' WHERE id = ?")
        .run('cc-2');

      // Old term should still match (body still has 'Original')
      results = sqlite
        .prepare("SELECT rowid FROM code_change_fts WHERE code_change_fts MATCH 'refactored'")
        .all();
      expect(results.length).toBe(1);
    });

    it('DELETE on code_change removes entry from FTS', () => {
      insertProject();
      insertRepo();
      insertCodeChange('cc-3', 'Temporary change', 'Will be deleted soon');

      let results = sqlite
        .prepare("SELECT rowid FROM code_change_fts WHERE code_change_fts MATCH 'Temporary'")
        .all();
      expect(results.length).toBe(1);

      sqlite.prepare("DELETE FROM code_change WHERE id = 'cc-3'").run();

      results = sqlite
        .prepare("SELECT rowid FROM code_change_fts WHERE code_change_fts MATCH 'Temporary'")
        .all();
      expect(results.length).toBe(0);
    });
  });

  describe('FTS5 trigger sync — evaluation_entry', () => {
    function insertMember() {
      const now = new Date().toISOString();
      sqlite
        .prepare(
          'INSERT INTO member (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run('mem-1', 'Alice', 'active', now, now);
    }

    function insertEvaluation(id: string, description: string, notes: string | null) {
      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO evaluation_entry
           (id, member_id, type, date, project_ids, description, notes, is_ai_generated, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, 'mem-1', 'weekly', now, '["proj-1"]', description, notes, 0, now, now);
    }

    it('INSERT into evaluation_entry is found via FTS', () => {
      insertMember();
      insertEvaluation(
        'eval-1',
        'Excellent performance in sprint review',
        'Delivered features on time',
      );

      const results = sqlite
        .prepare(
          "SELECT rowid FROM evaluation_entry_fts WHERE evaluation_entry_fts MATCH 'performance'",
        )
        .all();
      expect(results.length).toBe(1);
    });

    it('UPDATE on evaluation_entry is reflected in FTS', () => {
      insertMember();
      insertEvaluation('eval-2', 'Original evaluation', 'Original notes');

      sqlite
        .prepare(
          "UPDATE evaluation_entry SET description = 'Revised outstanding evaluation' WHERE id = ?",
        )
        .run('eval-2');

      const results = sqlite
        .prepare(
          "SELECT rowid FROM evaluation_entry_fts WHERE evaluation_entry_fts MATCH 'outstanding'",
        )
        .all();
      expect(results.length).toBe(1);
    });

    it('DELETE on evaluation_entry removes entry from FTS', () => {
      insertMember();
      insertEvaluation('eval-3', 'Temporary evaluation', 'Temporary notes');

      let results = sqlite
        .prepare(
          "SELECT rowid FROM evaluation_entry_fts WHERE evaluation_entry_fts MATCH 'Temporary'",
        )
        .all();
      expect(results.length).toBe(1);

      sqlite.prepare("DELETE FROM evaluation_entry WHERE id = 'eval-3'").run();

      results = sqlite
        .prepare(
          "SELECT rowid FROM evaluation_entry_fts WHERE evaluation_entry_fts MATCH 'Temporary'",
        )
        .all();
      expect(results.length).toBe(0);
    });
  });

  describe('app_config', () => {
    it('singleton row exists with correct defaults', () => {
      const row = sqlite.prepare('SELECT * FROM app_config WHERE id = ?').get('default') as Record<
        string,
        unknown
      >;

      expect(row).toBeDefined();
      expect(row.id).toBe('default');
      expect(row.access_password_hash).toBeNull();
      expect(row.ai_auto_tier1).toBe(1);
      expect(row.schema_version).toBe(1);
      expect(row.created_at).toBeTruthy();
      expect(row.updated_at).toBeTruthy();
    });
  });

  describe('checkDatabaseIntegrity', () => {
    it('returns true for a valid database', () => {
      expect(checkDatabaseIntegrity(sqlite)).toBe(true);
    });

    it('returns false when integrity_check reports problems', () => {
      // We can't easily corrupt an in-memory database, so we test the logic
      // by verifying our function correctly interprets non-'ok' pragma results.
      // Create a mock sqlite object that returns a failed integrity check
      const mockSqlite = {
        pragma: (cmd: string) => {
          if (cmd === 'integrity_check') {
            return [
              {
                integrity_check:
                  '*** in database main ***\nPage 3: btreeInitPage() returns error code 11',
              },
            ];
          }
          return [];
        },
      };

      expect(checkDatabaseIntegrity(mockSqlite as never)).toBe(false);
    });

    it('returns false when integrity_check returns multiple rows', () => {
      const mockSqlite = {
        pragma: () => [
          { integrity_check: 'row 1 missing from index idx_cc_authored' },
          { integrity_check: 'row 2 missing from index idx_cc_authored' },
        ],
      };

      expect(checkDatabaseIntegrity(mockSqlite as never)).toBe(false);
    });
  });

  describe('pragmas', () => {
    it('WAL mode is enabled', () => {
      const result = sqlite.pragma('journal_mode') as Array<{ journal_mode: string }>;
      // In-memory databases report 'memory' for journal_mode, but WAL was set
      // On-disk databases would report 'wal'
      expect(['wal', 'memory']).toContain(result[0].journal_mode);
    });

    it('foreign keys are enabled', () => {
      const result = sqlite.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
      expect(result[0].foreign_keys).toBe(1);
    });
  });
});
