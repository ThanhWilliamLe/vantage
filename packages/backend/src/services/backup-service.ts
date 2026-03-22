import { sql } from 'drizzle-orm';
import { copyFileSync } from 'node:fs';
import * as schema from '../data/schema.js';
import type { DrizzleDB } from '../data/db.js';

// ─── Types ──────────────────────────────────────

export interface BackupExport {
  version: string;
  schemaVersion: number;
  createdAt: string;
  entityCounts: Record<string, number>;
  data: {
    projects: Record<string, unknown>[];
    members: Record<string, unknown>[];
    memberIdentities: Record<string, unknown>[];
    assignments: Record<string, unknown>[];
    repositories: Record<string, unknown>[];
    gitCredentials: Record<string, unknown>[];
    aiProviders: Record<string, unknown>[];
    taskPatterns: Record<string, unknown>[];
    codeChanges: Record<string, unknown>[];
    deepAnalyses: Record<string, unknown>[];
    evaluationEntries: Record<string, unknown>[];
  };
}

export interface ValidationResult {
  compatible: boolean;
  requiresMigration: boolean;
  entityCounts: Record<string, number>;
  duplicateCounts?: Record<string, number>;
  errors: string[];
}

export interface RestoreResult {
  mode: 'replace' | 'merge';
  inserted: number;
  skipped: number;
  errors: string[];
}

// ─── Constants ──────────────────────────────────

const CURRENT_VERSION = '1.1.0';
const CURRENT_SCHEMA_VERSION = 1;

/**
 * Tables in dependency order (parents before children).
 * Used for insert order; reverse for delete order.
 */
const TABLE_ORDER = [
  'project',
  'member',
  'git_credential',
  'ai_provider',
  'repository',
  'member_identity',
  'assignment',
  'task_pattern',
  'code_change',
  'deep_analysis',
  'evaluation_entry',
] as const;

// ─── Helpers ────────────────────────────────────

function getColumnNames(tableName: string): string[] {
  const columnMap: Record<string, string[]> = {
    project: ['id', 'name', 'description', 'status', 'created_at', 'updated_at'],
    member: ['id', 'name', 'status', 'created_at', 'updated_at'],
    git_credential: [
      'id',
      'name',
      'platform',
      'token_encrypted',
      'instance_url',
      'created_at',
      'updated_at',
    ],
    ai_provider: [
      'id',
      'name',
      'type',
      'preset',
      'endpoint_url',
      'api_key_encrypted',
      'model',
      'cli_command',
      'cli_io_method',
      'is_active',
      'created_at',
      'updated_at',
    ],
    repository: [
      'id',
      'project_id',
      'type',
      'local_path',
      'api_owner',
      'api_repo',
      'api_url',
      'credential_id',
      'created_at',
    ],
    member_identity: ['id', 'member_id', 'platform', 'value', 'created_at'],
    assignment: ['id', 'member_id', 'project_id', 'role', 'start_date', 'end_date', 'created_at'],
    task_pattern: ['id', 'project_id', 'regex', 'url_template', 'created_at'],
    code_change: [
      'id',
      'project_id',
      'repo_id',
      'type',
      'platform_id',
      'branch',
      'title',
      'body',
      'author_member_id',
      'author_raw',
      'author_name',
      'lines_added',
      'lines_deleted',
      'files_changed',
      'authored_at',
      'fetched_at',
      'status',
      'pr_status',
      'ai_summary',
      'ai_category',
      'ai_risk_level',
      'ai_generated_at',
      'review_notes',
      'reviewed_at',
      'flagged_at',
      'flag_reason',
      'deferred_at',
      'defer_count',
      'communicated_at',
      'resolved_at',
      'created_at',
      'updated_at',
    ],
    deep_analysis: [
      'id',
      'code_change_id',
      'findings',
      'repo_files_accessed',
      'analyzed_at',
      'created_at',
    ],
    evaluation_entry: [
      'id',
      'member_id',
      'type',
      'date',
      'quarter',
      'project_ids',
      'description',
      'workload_score',
      'notes',
      'ai_insights',
      'is_ai_generated',
      'source',
      'created_at',
      'updated_at',
    ],
  };
  return columnMap[tableName] ?? [];
}

/** Map from backup data key to SQL table name */
const DATA_KEY_TO_TABLE: Record<string, string> = {
  projects: 'project',
  members: 'member',
  gitCredentials: 'git_credential',
  aiProviders: 'ai_provider',
  repositories: 'repository',
  memberIdentities: 'member_identity',
  assignments: 'assignment',
  taskPatterns: 'task_pattern',
  codeChanges: 'code_change',
  deepAnalyses: 'deep_analysis',
  evaluationEntries: 'evaluation_entry',
};

/** Map from SQL table name to backup data key */
const TABLE_TO_DATA_KEY: Record<string, keyof BackupExport['data']> = {
  project: 'projects',
  member: 'members',
  git_credential: 'gitCredentials',
  ai_provider: 'aiProviders',
  repository: 'repositories',
  member_identity: 'memberIdentities',
  assignment: 'assignments',
  task_pattern: 'taskPatterns',
  code_change: 'codeChanges',
  deep_analysis: 'deepAnalyses',
  evaluation_entry: 'evaluationEntries',
};

// ─── Service ────────────────────────────────────

export const BackupService = {
  /**
   * Export all user data tables as a JSON backup.
   * Excludes sensitive fields (tokens, passwords) and transient tables.
   */
  async exportAll(db: DrizzleDB): Promise<BackupExport> {
    const now = new Date().toISOString();

    // Query all exportable tables
    const projects = await db.select().from(schema.project).all();
    const members = await db.select().from(schema.member).all();
    const memberIdentities = await db.select().from(schema.memberIdentity).all();
    const assignments = await db.select().from(schema.assignment).all();
    const repositories = await db.select().from(schema.repository).all();
    const taskPatterns = await db.select().from(schema.taskPattern).all();
    const codeChanges = await db.select().from(schema.codeChange).all();
    const deepAnalyses = await db.select().from(schema.deepAnalysis).all();
    const evaluationEntries = await db.select().from(schema.evaluationEntry).all();

    // Git credentials: exclude token_encrypted
    const gitCredentialsRaw = await db.select().from(schema.gitCredential).all();
    const gitCredentials = gitCredentialsRaw.map((gc) => ({
      id: gc.id,
      name: gc.name,
      platform: gc.platform,
      instanceUrl: gc.instanceUrl,
    }));

    // AI providers: exclude api_key_encrypted and other sensitive/runtime fields
    const aiProvidersRaw = await db.select().from(schema.aiProvider).all();
    const aiProviders = aiProvidersRaw.map((ap) => ({
      id: ap.id,
      name: ap.name,
      type: ap.type,
      preset: ap.preset,
      model: ap.model,
    }));

    const data: BackupExport['data'] = {
      projects,
      members,
      memberIdentities,
      assignments,
      repositories,
      gitCredentials,
      aiProviders,
      taskPatterns,
      codeChanges,
      deepAnalyses,
      evaluationEntries,
    };

    const entityCounts: Record<string, number> = {};
    for (const [key, entities] of Object.entries(data)) {
      entityCounts[key] = entities.length;
    }

    // Update app_config.updated_at to record backup timestamp
    try {
      db.run(sql`UPDATE app_config SET updated_at = ${now} WHERE id = 'default'`);
    } catch {
      // Non-critical: don't fail the export if this update fails
    }

    return {
      version: CURRENT_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: now,
      entityCounts,
      data,
    };
  },

  /**
   * Validate a backup payload before restore.
   * Checks version compatibility, required fields, and duplicate detection for merge mode.
   */
  validate(backup: unknown, mode: 'replace' | 'merge', db: DrizzleDB): ValidationResult {
    const errors: string[] = [];
    const entityCounts: Record<string, number> = {};
    const duplicateCounts: Record<string, number> = {};

    // Basic structure check
    if (!backup || typeof backup !== 'object') {
      return {
        compatible: false,
        requiresMigration: false,
        entityCounts,
        errors: ['Invalid backup format: not an object'],
      };
    }

    const b = backup as Record<string, unknown>;

    // Version compatibility
    if (!b.version || typeof b.version !== 'string') {
      errors.push('Missing or invalid version field');
    } else if (b.version > CURRENT_VERSION) {
      errors.push(`Backup version ${b.version} is newer than supported version ${CURRENT_VERSION}`);
    }

    // Schema version
    if (b.schemaVersion === undefined || typeof b.schemaVersion !== 'number') {
      errors.push('Missing or invalid schemaVersion field');
    } else if (b.schemaVersion > CURRENT_SCHEMA_VERSION) {
      errors.push(
        `Schema version ${b.schemaVersion} is newer than supported version ${CURRENT_SCHEMA_VERSION}`,
      );
    }

    // createdAt
    if (!b.createdAt || typeof b.createdAt !== 'string') {
      errors.push('Missing or invalid createdAt field');
    }

    // Data section
    if (!b.data || typeof b.data !== 'object') {
      errors.push('Missing or invalid data section');
      return { compatible: false, requiresMigration: false, entityCounts, errors };
    }

    const data = b.data as Record<string, unknown>;

    // Check each entity type
    const requiredDataKeys: Array<keyof BackupExport['data']> = [
      'projects',
      'members',
      'memberIdentities',
      'assignments',
      'repositories',
      'gitCredentials',
      'aiProviders',
      'taskPatterns',
      'codeChanges',
      'deepAnalyses',
      'evaluationEntries',
    ];

    for (const key of requiredDataKeys) {
      const entities = data[key];
      if (!Array.isArray(entities)) {
        errors.push(`Missing or invalid data.${key}: expected array`);
        entityCounts[key] = 0;
        continue;
      }
      entityCounts[key] = entities.length;

      // Check required fields: every entity must have an 'id'
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i] as Record<string, unknown>;
        if (!entity || typeof entity !== 'object') {
          errors.push(`data.${key}[${i}]: not an object`);
          continue;
        }
        if (!entity.id) {
          errors.push(`data.${key}[${i}]: missing required field 'id'`);
        }
      }
    }

    // For merge mode: count duplicates by checking existing IDs via raw SQL
    if (mode === 'merge' && errors.length === 0) {
      const dataKeyToTable: Record<string, string> = DATA_KEY_TO_TABLE;

      for (const key of requiredDataKeys) {
        const entities = data[key] as Array<Record<string, unknown>>;
        if (!entities || entities.length === 0) continue;

        const tableName = dataKeyToTable[key];
        if (!tableName) continue;

        const existingRows = db.all<{ id: string }>(sql.raw(`SELECT id FROM ${tableName}`));
        const existingIds = new Set(existingRows.map((r) => r.id));

        let dupeCount = 0;
        for (const entity of entities) {
          if (existingIds.has(entity.id as string)) {
            dupeCount++;
          }
        }
        if (dupeCount > 0) {
          duplicateCounts[key] = dupeCount;
        }
      }
    }

    const compatible = errors.length === 0;
    const requiresMigration =
      typeof b.schemaVersion === 'number' && b.schemaVersion < CURRENT_SCHEMA_VERSION;

    return {
      compatible,
      requiresMigration,
      entityCounts,
      ...(mode === 'merge' ? { duplicateCounts } : {}),
      errors,
    };
  },

  /**
   * Restore a backup into the database.
   *
   * - replace mode: deletes all existing data and inserts backup data
   * - merge mode: inserts entities whose IDs don't already exist, skips duplicates
   *
   * Uses db.$client for raw SQLite transaction support.
   */
  async restore(
    backup: BackupExport,
    mode: 'replace' | 'merge',
    db: DrizzleDB,
  ): Promise<RestoreResult> {
    const errors: string[] = [];
    let inserted = 0;
    let skipped = 0;
    const sqliteDb = db.$client;

    if (mode === 'replace') {
      // Create pre-restore backup (safety net)
      const dbPath = sqliteDb.name;
      if (dbPath && dbPath !== ':memory:') {
        try {
          const bakPath = `${dbPath}.pre-restore.bak`;
          copyFileSync(dbPath, bakPath);
        } catch {
          // Non-critical — log but proceed
          errors.push('Warning: could not create pre-restore backup copy');
        }
      }

      // Full replace within a single SQLite transaction
      const runReplace = sqliteDb.transaction(() => {
        // 1. Delete in reverse dependency order
        const reverseOrder = [...TABLE_ORDER].reverse();
        for (const tableName of reverseOrder) {
          sqliteDb.prepare(`DELETE FROM ${tableName}`).run();
        }

        // Clear FTS tables
        sqliteDb.prepare('DELETE FROM code_change_fts').run();
        sqliteDb.prepare('DELETE FROM evaluation_entry_fts').run();

        // 2. Insert in dependency order
        for (const tableName of TABLE_ORDER) {
          const dataKey = TABLE_TO_DATA_KEY[tableName];
          if (!dataKey) continue;

          const entities = backup.data[dataKey];
          if (!entities || entities.length === 0) continue;

          const columns = getColumnNames(tableName);
          if (columns.length === 0) continue;

          const placeholders = columns.map(() => '?').join(', ');
          const insertSql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
          const stmt = sqliteDb.prepare(insertSql);

          for (const entity of entities) {
            try {
              const values = columns.map((col) => {
                // Map snake_case column to camelCase entity key
                const camelKey = col.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
                const val = (entity as Record<string, unknown>)[camelKey];
                if (val === undefined || val === null) {
                  // Provide defaults for NOT NULL columns missing from shells
                  if (col === 'token_encrypted') return '';
                  if (col === 'api_key_encrypted') return '';
                  if (col === 'is_active') return 0;
                  if (col === 'created_at' || col === 'updated_at') return new Date().toISOString();
                  return null;
                }
                return val;
              });
              stmt.run(...values);
              inserted++;
            } catch (err) {
              errors.push(
                `Failed to insert into ${tableName}: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
        }

        // 3. Rebuild FTS indexes
        rebuildFts(sqliteDb);
      });

      runReplace();
    } else {
      // Merge mode: insert only if ID doesn't exist
      const runMerge = sqliteDb.transaction(() => {
        for (const tableName of TABLE_ORDER) {
          const dataKey = TABLE_TO_DATA_KEY[tableName];
          if (!dataKey) continue;

          const entities = backup.data[dataKey];
          if (!entities || entities.length === 0) continue;

          const columns = getColumnNames(tableName);
          if (columns.length === 0) continue;

          const checkStmt = sqliteDb.prepare(`SELECT 1 FROM ${tableName} WHERE id = ?`);
          const placeholders = columns.map(() => '?').join(', ');
          const insertSql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
          const insertStmt = sqliteDb.prepare(insertSql);

          for (const entity of entities) {
            const id = (entity as Record<string, unknown>).id as string;
            if (!id) {
              errors.push(`Skipping entity in ${tableName}: missing id`);
              skipped++;
              continue;
            }

            const existing = checkStmt.get(id);
            if (existing) {
              skipped++;
              continue;
            }

            try {
              const values = columns.map((col) => {
                const camelKey = col.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
                const val = (entity as Record<string, unknown>)[camelKey];
                if (val === undefined || val === null) {
                  if (col === 'token_encrypted') return '';
                  if (col === 'api_key_encrypted') return '';
                  if (col === 'is_active') return 0;
                  if (col === 'created_at' || col === 'updated_at') return new Date().toISOString();
                  return null;
                }
                return val;
              });
              insertStmt.run(...values);
              inserted++;
            } catch (err) {
              errors.push(
                `Failed to insert into ${tableName}: ${err instanceof Error ? err.message : String(err)}`,
              );
              skipped++;
            }
          }
        }
      });

      runMerge();
    }

    return { mode, inserted, skipped, errors };
  },

  /**
   * Delete all user data. Preserves app_config (password, schema version).
   */
  async deleteAll(db: DrizzleDB): Promise<void> {
    const sqliteDb = db.$client;

    // Create safety backup
    const dbPath = sqliteDb.name;
    if (dbPath && dbPath !== ':memory:') {
      try {
        copyFileSync(dbPath, `${dbPath}.pre-wipe.bak`);
      } catch {
        // Non-critical
      }
    }

    const run = sqliteDb.transaction(() => {
      // Delete leaf tables first (reference TABLE_ORDER tables), then reverse dependency order
      const allTables = [
        'scan_state',
        'sync_state',
        'task_tracker_credential',
        ...[...TABLE_ORDER].reverse(),
      ];
      for (const table of allTables) {
        sqliteDb.prepare(`DELETE FROM ${table}`).run();
      }
      // Clear FTS tables
      sqliteDb.prepare('DELETE FROM code_change_fts').run();
      sqliteDb.prepare('DELETE FROM evaluation_entry_fts').run();
    });

    run();
  },
};

// ─── FTS Rebuild ────────────────────────────────

/**
 * Rebuild FTS5 indexes from their content tables.
 * Called after full-replace restore since triggers don't fire for raw INSERTs.
 */
function rebuildFts(sqliteDb: DrizzleDB['$client']): void {
  // Rebuild code_change_fts
  const codeChanges = sqliteDb
    .prepare('SELECT rowid, title, body, ai_summary, review_notes FROM code_change')
    .all() as Array<{
    rowid: number;
    title: string;
    body: string | null;
    ai_summary: string | null;
    review_notes: string | null;
  }>;

  const ccFtsInsert = sqliteDb.prepare(
    'INSERT INTO code_change_fts(rowid, title, body, ai_summary, review_notes) VALUES (?, ?, ?, ?, ?)',
  );
  for (const row of codeChanges) {
    ccFtsInsert.run(row.rowid, row.title, row.body, row.ai_summary, row.review_notes);
  }

  // Rebuild evaluation_entry_fts
  const evalEntries = sqliteDb
    .prepare('SELECT rowid, description, notes FROM evaluation_entry')
    .all() as Array<{ rowid: number; description: string | null; notes: string | null }>;

  const evalFtsInsert = sqliteDb.prepare(
    'INSERT INTO evaluation_entry_fts(rowid, description, notes) VALUES (?, ?, ?)',
  );
  for (const row of evalEntries) {
    evalFtsInsert.run(row.rowid, row.description, row.notes);
  }
}
