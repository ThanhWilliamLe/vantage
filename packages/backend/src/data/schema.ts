import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ─── project ──────────────────────────────────────
export const project = sqliteTable('project', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ─── repository ───────────────────────────────────
export const repository = sqliteTable(
  'repository',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id),
    type: text('type').notNull(),
    localPath: text('local_path'),
    apiOwner: text('api_owner'),
    apiRepo: text('api_repo'),
    apiUrl: text('api_url'),
    credentialId: text('credential_id').references(() => gitCredential.id),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_repo_project').on(table.projectId)],
);

// ─── git_credential ──────────────────────────────
export const gitCredential = sqliteTable('git_credential', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  platform: text('platform').notNull(),
  tokenEncrypted: text('token_encrypted').notNull(),
  instanceUrl: text('instance_url'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ─── ai_provider ─────────────────────────────────
export const aiProvider = sqliteTable('ai_provider', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  preset: text('preset'),
  endpointUrl: text('endpoint_url'),
  apiKeyEncrypted: text('api_key_encrypted'),
  model: text('model'),
  cliCommand: text('cli_command'),
  cliIoMethod: text('cli_io_method'),
  isActive: integer('is_active').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ─── member ──────────────────────────────────────
export const member = sqliteTable('member', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  aliases: text('aliases'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ─── member_identity ─────────────────────────────
export const memberIdentity = sqliteTable(
  'member_identity',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id),
    platform: text('platform').notNull(),
    value: text('value').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_mi_member_platform_value').on(table.memberId, table.platform, table.value),
    index('idx_mi_platform_value').on(table.platform, table.value),
  ],
);

// ─── assignment ──────────────────────────────────
export const assignment = sqliteTable(
  'assignment',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id),
    role: text('role'),
    startDate: text('start_date').notNull(),
    endDate: text('end_date'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_assign_member').on(table.memberId),
    index('idx_assign_project').on(table.projectId),
  ],
);

// ─── code_change ─────────────────────────────────
export const codeChange = sqliteTable(
  'code_change',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id),
    repoId: text('repo_id')
      .notNull()
      .references(() => repository.id),
    type: text('type').notNull(),
    platformId: text('platform_id').notNull(),
    branch: text('branch'),
    title: text('title').notNull(),
    body: text('body'),
    authorMemberId: text('author_member_id').references(() => member.id),
    authorRaw: text('author_raw').notNull(),
    authorName: text('author_name'),
    linesAdded: integer('lines_added').notNull().default(0),
    linesDeleted: integer('lines_deleted').notNull().default(0),
    filesChanged: integer('files_changed').notNull().default(0),
    authoredAt: text('authored_at').notNull(),
    fetchedAt: text('fetched_at').notNull(),
    status: text('status').notNull().default('pending'),
    prStatus: text('pr_status'),
    aiSummary: text('ai_summary'),
    aiCategory: text('ai_category'),
    aiRiskLevel: text('ai_risk_level'),
    aiGeneratedAt: text('ai_generated_at'),
    reviewNotes: text('review_notes'),
    reviewedAt: text('reviewed_at'),
    flaggedAt: text('flagged_at'),
    flagReason: text('flag_reason'),
    deferredAt: text('deferred_at'),
    deferCount: integer('defer_count').notNull().default(0),
    communicatedAt: text('communicated_at'),
    resolvedAt: text('resolved_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_cc_repo_type_pid').on(table.repoId, table.type, table.platformId),
    index('idx_cc_project_status').on(table.projectId, table.status),
    index('idx_cc_author_status').on(table.authorMemberId, table.status),
    index('idx_cc_status_authored').on(table.status, table.authoredAt),
    index('idx_cc_authored').on(table.authoredAt),
  ],
);

// ─── deep_analysis ───────────────────────────────
export const deepAnalysis = sqliteTable('deep_analysis', {
  id: text('id').primaryKey(),
  codeChangeId: text('code_change_id')
    .notNull()
    .references(() => codeChange.id)
    .unique(),
  findings: text('findings').notNull(),
  repoFilesAccessed: text('repo_files_accessed'),
  analyzedAt: text('analyzed_at').notNull(),
  createdAt: text('created_at').notNull(),
});

// ─── evaluation_entry ────────────────────────────
export const evaluationEntry = sqliteTable(
  'evaluation_entry',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id),
    type: text('type').notNull(),
    date: text('date').notNull(),
    dateRangeStart: text('date_range_start'),
    quarter: text('quarter'),
    projectIds: text('project_ids').notNull(),
    description: text('description'),
    workloadScore: real('workload_score'),
    notes: text('notes'),
    aiInsights: text('ai_insights'),
    isAiGenerated: integer('is_ai_generated').notNull().default(0),
    source: text('source').notNull().default('native'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_eval_member_type').on(table.memberId, table.type),
    index('idx_eval_date').on(table.date),
    index('idx_eval_type_date').on(table.type, table.date),
    index('idx_eval_source').on(table.source, table.memberId, table.date),
  ],
);

// ─── task_tracker_credential ────────────────────
export const taskTrackerCredential = sqliteTable(
  'task_tracker_credential',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id),
    name: text('name').notNull(),
    platform: text('platform').notNull(),
    tokenEncrypted: text('token_encrypted').notNull(),
    instanceUrl: text('instance_url'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_ttc_project').on(table.projectId)],
);

// ─── task_pattern ────────────────────────────────
export const taskPattern = sqliteTable('task_pattern', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => project.id),
  regex: text('regex').notNull(),
  urlTemplate: text('url_template').notNull(),
  trackerCredentialId: text('tracker_credential_id').references(() => taskTrackerCredential.id),
  createdAt: text('created_at').notNull(),
});

// ─── scan_state ──────────────────────────────────
export const scanState = sqliteTable('scan_state', {
  id: text('id').primaryKey(),
  repoId: text('repo_id')
    .notNull()
    .references(() => repository.id)
    .unique(),
  lastCommitHash: text('last_commit_hash'),
  lastScannedAt: text('last_scanned_at'),
  status: text('status').notNull().default('idle'),
  errorMessage: text('error_message'),
  updatedAt: text('updated_at').notNull(),
});

// ─── sync_state ──────────────────────────────────
export const syncState = sqliteTable('sync_state', {
  id: text('id').primaryKey(),
  repoId: text('repo_id')
    .notNull()
    .references(() => repository.id)
    .unique(),
  lastSyncCursor: text('last_sync_cursor'),
  lastSyncedAt: text('last_synced_at'),
  status: text('status').notNull().default('idle'),
  errorMessage: text('error_message'),
  updatedAt: text('updated_at').notNull(),
});

// ─── identity_suggestion_dismissal ──────────
export const identitySuggestionDismissal = sqliteTable(
  'identity_suggestion_dismissal',
  {
    id: text('id').primaryKey(),
    authorRaw: text('author_raw').notNull(),
    suggestedMemberId: text('suggested_member_id').notNull(),
    dismissedAt: text('dismissed_at').notNull(),
  },
  (table) => [uniqueIndex('idx_isd_author_member').on(table.authorRaw, table.suggestedMemberId)],
);

// ─── app_config ──────────────────────────────────
export const appConfig = sqliteTable('app_config', {
  id: text('id').primaryKey(),
  accessPasswordHash: text('access_password_hash'),
  aiAutoTier1: integer('ai_auto_tier1').notNull().default(1),
  schemaVersion: integer('schema_version').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
