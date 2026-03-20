import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export function createDatabase(dbPath: string | ':memory:'): { db: ReturnType<typeof drizzle>; sqlite: DatabaseType } {
  const sqlite = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  sqlite.pragma('journal_mode = WAL');
  // Set busy timeout for concurrent access
  sqlite.pragma('busy_timeout = 5000');
  // Enable foreign keys
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  return { db, sqlite };
}

export function runMigrations(sqlite: Database.Database) {
  const now = new Date().toISOString();

  sqlite.exec(`
    -- ═══ Tables ═══
    CREATE TABLE IF NOT EXISTS project (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS git_credential (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      token_encrypted TEXT NOT NULL,
      instance_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS repository (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES project(id),
      type TEXT NOT NULL,
      local_path TEXT,
      api_owner TEXT,
      api_repo TEXT,
      api_url TEXT,
      credential_id TEXT REFERENCES git_credential(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_provider (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      preset TEXT,
      endpoint_url TEXT,
      api_key_encrypted TEXT,
      model TEXT,
      cli_command TEXT,
      cli_io_method TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS member (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS member_identity (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES member(id),
      platform TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(member_id, platform, value)
    );

    CREATE TABLE IF NOT EXISTS assignment (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES member(id),
      project_id TEXT NOT NULL REFERENCES project(id),
      role TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS code_change (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES project(id),
      repo_id TEXT NOT NULL REFERENCES repository(id),
      type TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      branch TEXT,
      title TEXT NOT NULL,
      body TEXT,
      author_member_id TEXT REFERENCES member(id),
      author_raw TEXT NOT NULL,
      author_name TEXT,
      lines_added INTEGER NOT NULL DEFAULT 0,
      lines_deleted INTEGER NOT NULL DEFAULT 0,
      files_changed INTEGER NOT NULL DEFAULT 0,
      authored_at TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      pr_status TEXT,
      ai_summary TEXT,
      ai_category TEXT,
      ai_risk_level TEXT,
      ai_generated_at TEXT,
      review_notes TEXT,
      reviewed_at TEXT,
      flagged_at TEXT,
      flag_reason TEXT,
      deferred_at TEXT,
      defer_count INTEGER NOT NULL DEFAULT 0,
      communicated_at TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(repo_id, type, platform_id)
    );

    CREATE TABLE IF NOT EXISTS deep_analysis (
      id TEXT PRIMARY KEY,
      code_change_id TEXT NOT NULL REFERENCES code_change(id) UNIQUE,
      findings TEXT NOT NULL,
      repo_files_accessed TEXT,
      analyzed_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evaluation_entry (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES member(id),
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      quarter TEXT,
      project_ids TEXT NOT NULL,
      description TEXT,
      workload_score REAL,
      notes TEXT,
      ai_insights TEXT,
      is_ai_generated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_pattern (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES project(id),
      regex TEXT NOT NULL,
      url_template TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scan_state (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repository(id) UNIQUE,
      last_commit_hash TEXT,
      last_scanned_at TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      error_message TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repository(id) UNIQUE,
      last_sync_cursor TEXT,
      last_synced_at TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      error_message TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_config (
      id TEXT PRIMARY KEY,
      access_password_hash TEXT,
      ai_auto_tier1 INTEGER NOT NULL DEFAULT 1,
      schema_version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- ═══ Indexes ═══
    CREATE INDEX IF NOT EXISTS idx_repo_project ON repository(project_id);
    CREATE INDEX IF NOT EXISTS idx_mi_platform_value ON member_identity(platform, value);
    CREATE INDEX IF NOT EXISTS idx_assign_member ON assignment(member_id);
    CREATE INDEX IF NOT EXISTS idx_assign_project ON assignment(project_id);
    CREATE INDEX IF NOT EXISTS idx_cc_project_status ON code_change(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_cc_author_status ON code_change(author_member_id, status);
    CREATE INDEX IF NOT EXISTS idx_cc_status_authored ON code_change(status, authored_at);
    CREATE INDEX IF NOT EXISTS idx_cc_authored ON code_change(authored_at);
    CREATE INDEX IF NOT EXISTS idx_eval_member_type ON evaluation_entry(member_id, type);
    CREATE INDEX IF NOT EXISTS idx_eval_date ON evaluation_entry(date);
    CREATE INDEX IF NOT EXISTS idx_eval_type_date ON evaluation_entry(type, date);

    -- ═══ FTS5 Virtual Tables ═══
    CREATE VIRTUAL TABLE IF NOT EXISTS code_change_fts USING fts5(
      title,
      body,
      ai_summary,
      review_notes,
      content='code_change',
      content_rowid='rowid'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS evaluation_entry_fts USING fts5(
      description,
      notes,
      content='evaluation_entry',
      content_rowid='rowid'
    );

    -- ═══ FTS5 Sync Triggers ═══
    CREATE TRIGGER IF NOT EXISTS code_change_fts_insert AFTER INSERT ON code_change BEGIN
      INSERT INTO code_change_fts(rowid, title, body, ai_summary, review_notes)
      VALUES (NEW.rowid, NEW.title, NEW.body, NEW.ai_summary, NEW.review_notes);
    END;

    CREATE TRIGGER IF NOT EXISTS code_change_fts_delete AFTER DELETE ON code_change BEGIN
      INSERT INTO code_change_fts(code_change_fts, rowid, title, body, ai_summary, review_notes)
      VALUES ('delete', OLD.rowid, OLD.title, OLD.body, OLD.ai_summary, OLD.review_notes);
    END;

    CREATE TRIGGER IF NOT EXISTS code_change_fts_update AFTER UPDATE ON code_change BEGIN
      INSERT INTO code_change_fts(code_change_fts, rowid, title, body, ai_summary, review_notes)
      VALUES ('delete', OLD.rowid, OLD.title, OLD.body, OLD.ai_summary, OLD.review_notes);
      INSERT INTO code_change_fts(rowid, title, body, ai_summary, review_notes)
      VALUES (NEW.rowid, NEW.title, NEW.body, NEW.ai_summary, NEW.review_notes);
    END;

    CREATE TRIGGER IF NOT EXISTS evaluation_entry_fts_insert AFTER INSERT ON evaluation_entry BEGIN
      INSERT INTO evaluation_entry_fts(rowid, description, notes)
      VALUES (NEW.rowid, NEW.description, NEW.notes);
    END;

    CREATE TRIGGER IF NOT EXISTS evaluation_entry_fts_delete AFTER DELETE ON evaluation_entry BEGIN
      INSERT INTO evaluation_entry_fts(evaluation_entry_fts, rowid, description, notes)
      VALUES ('delete', OLD.rowid, OLD.description, OLD.notes);
    END;

    CREATE TRIGGER IF NOT EXISTS evaluation_entry_fts_update AFTER UPDATE ON evaluation_entry BEGIN
      INSERT INTO evaluation_entry_fts(evaluation_entry_fts, rowid, description, notes)
      VALUES ('delete', OLD.rowid, OLD.description, OLD.notes);
      INSERT INTO evaluation_entry_fts(rowid, description, notes)
      VALUES (NEW.rowid, NEW.description, NEW.notes);
    END;
  `);

  // Seed app_config singleton if not present
  const existing = sqlite.prepare('SELECT id FROM app_config WHERE id = ?').get('default');
  if (!existing) {
    sqlite.prepare(`
      INSERT INTO app_config (id, ai_auto_tier1, schema_version, created_at, updated_at)
      VALUES (?, 1, 1, ?, ?)
    `).run('default', now, now);
  }
}

export function checkDatabaseIntegrity(sqlite: Database.Database): boolean {
  const result = sqlite.pragma('integrity_check') as Array<{ integrity_check: string }>;
  return result.length === 1 && result[0].integrity_check === 'ok';
}

export type DrizzleDB = ReturnType<typeof createDatabase>['db'];
