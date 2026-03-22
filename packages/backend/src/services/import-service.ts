import { eq, and } from 'drizzle-orm';
import { ulid } from 'ulid';
import Papa from 'papaparse';
import * as schema from '../data/schema.js';
import { ValidationError } from '../errors/index.js';
import type { DrizzleDB } from '../data/db.js';

// ─── Types ──────────────────────────────────────

export interface ColumnMapping {
  memberName: string;
  date: string;
  description: string;
  projectName?: string;
  workloadScore?: string;
  notes?: string;
  type?: string;
}

export interface ParseResult {
  fileId: string;
  headers: string[];
  rowCount: number;
  preview: Record<string, string>[];
}

export interface ValidateResult {
  memberMatches: Array<{
    csvName: string;
    matchedMemberId: string | null;
    matchedMemberName: string | null;
    rowCount: number;
  }>;
  projectMatches: Array<{
    csvName: string;
    matchedProjectId: string | null;
    matchedProjectName: string | null;
    rowCount: number;
  }>;
  dateErrors: Array<{ row: number; value: string }>;
  duplicates: number;
  readyCount: number;
  totalRows: number;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  newMembers: number;
  newProjects: number;
  errors: string[];
}

// ─── In-memory file storage ─────────────────────

interface StoredFile {
  rows: Record<string, string>[];
  headers: string[];
  expiresAt: number;
}

const fileStore = new Map<string, StoredFile>();
const FILE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function cleanExpired(): void {
  const now = Date.now();
  for (const [key, stored] of fileStore) {
    if (stored.expiresAt < now) {
      fileStore.delete(key);
    }
  }
}

function getStoredFile(fileId: string): StoredFile {
  cleanExpired();
  const stored = fileStore.get(fileId);
  if (!stored) {
    throw new ValidationError('File not found or expired. Please re-upload.', { field: 'fileId' });
  }
  return stored;
}

// ─── Date parsing helpers ───────────────────────

/**
 * Attempt to parse a date string in ISO (YYYY-MM-DD), US (MM/DD/YYYY),
 * or EU (DD/MM/YYYY) format. Returns an ISO date string or null.
 */
function tryParseDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // ISO format: YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    if (!isNaN(date.getTime())) {
      return formatDate(date);
    }
  }

  // US format: MM/DD/YYYY
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, m, d, y] = usMatch;
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    if (!isNaN(date.getTime())) {
      return formatDate(date);
    }
  }

  // EU format: DD/MM/YYYY (only if day > 12, otherwise ambiguous — treat as US)
  // We already tried US above. For EU, try DD.MM.YYYY or DD-MM-YYYY
  const euMatch = trimmed.match(/^(\d{1,2})[.\u002D](\d{1,2})[.\u002D](\d{4})$/);
  if (euMatch) {
    const [, d, m, y] = euMatch;
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    if (!isNaN(date.getTime())) {
      return formatDate(date);
    }
  }

  return null;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Service ────────────────────────────────────

export const ImportService = {
  /**
   * Parse a CSV file from a buffer. Stores parsed data in memory for subsequent
   * validate/execute calls. Returns headers, row count, and a preview.
   */
  parseCSV(buffer: Buffer, _filename: string): ParseResult {
    const text = buffer.toString('utf-8');
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });

    const headers = result.meta.fields ?? [];
    if (headers.length === 0) {
      throw new ValidationError('CSV file contains no headers', { field: 'file' });
    }

    // Filter out empty rows (all values empty)
    const nonEmptyRows = (result.data ?? []).filter((row) =>
      Object.values(row).some((v) => v && String(v).trim() !== ''),
    );

    if (nonEmptyRows.length === 0) {
      throw new ValidationError('CSV file contains no data rows', { field: 'file' });
    }

    const fileId = ulid();
    const rows = nonEmptyRows as Record<string, string>[];

    fileStore.set(fileId, {
      rows,
      headers,
      expiresAt: Date.now() + FILE_TTL_MS,
    });

    // Clean up old files
    cleanExpired();

    return {
      fileId,
      headers,
      rowCount: rows.length,
      preview: rows.slice(0, 10),
    };
  },

  /**
   * Validate mapped CSV data against the database. Checks member/project name
   * matches, date parsing, and duplicate detection.
   */
  validate(fileId: string, mapping: ColumnMapping, db: DrizzleDB): ValidateResult {
    const stored = getStoredFile(fileId);
    const { rows } = stored;

    // Validate required mappings
    if (!mapping.memberName) {
      throw new ValidationError('memberName mapping is required', { field: 'mapping.memberName' });
    }
    if (!mapping.date) {
      throw new ValidationError('date mapping is required', { field: 'mapping.date' });
    }
    if (!mapping.description) {
      throw new ValidationError('description mapping is required', {
        field: 'mapping.description',
      });
    }

    // ── Member matching ────────────────────────────
    const memberNameCounts = new Map<string, number>();
    for (const row of rows) {
      const name = (row[mapping.memberName] ?? '').trim();
      if (name) {
        memberNameCounts.set(name, (memberNameCounts.get(name) ?? 0) + 1);
      }
    }

    const allMembers = db.select().from(schema.member).all();
    const memberMatches: ValidateResult['memberMatches'] = [];

    for (const [csvName, rowCount] of memberNameCounts) {
      // Try exact match first
      let matched = allMembers.find((m) => m.name === csvName) ?? null;

      // Try case-insensitive match
      if (!matched) {
        const lower = csvName.toLowerCase();
        matched = allMembers.find((m) => m.name.toLowerCase() === lower) ?? null;
      }

      memberMatches.push({
        csvName,
        matchedMemberId: matched?.id ?? null,
        matchedMemberName: matched?.name ?? null,
        rowCount,
      });
    }

    // ── Project matching ───────────────────────────
    const projectNameCounts = new Map<string, number>();
    if (mapping.projectName) {
      for (const row of rows) {
        const name = (row[mapping.projectName] ?? '').trim();
        if (name) {
          projectNameCounts.set(name, (projectNameCounts.get(name) ?? 0) + 1);
        }
      }
    }

    const allProjects = mapping.projectName ? db.select().from(schema.project).all() : [];
    const projectMatches: ValidateResult['projectMatches'] = [];

    for (const [csvName, rowCount] of projectNameCounts) {
      let matched = allProjects.find((p) => p.name === csvName) ?? null;
      if (!matched) {
        const lower = csvName.toLowerCase();
        matched = allProjects.find((p) => p.name.toLowerCase() === lower) ?? null;
      }

      projectMatches.push({
        csvName,
        matchedProjectId: matched?.id ?? null,
        matchedProjectName: matched?.name ?? null,
        rowCount,
      });
    }

    // ── Date validation ────────────────────────────
    const dateErrors: ValidateResult['dateErrors'] = [];
    for (let i = 0; i < rows.length; i++) {
      const value = (rows[i][mapping.date] ?? '').trim();
      if (!value || tryParseDate(value) === null) {
        dateErrors.push({ row: i + 1, value });
      }
    }

    // ── Duplicate detection ────────────────────────
    let duplicates = 0;
    for (const row of rows) {
      const memberName = (row[mapping.memberName] ?? '').trim();
      const dateValue = (row[mapping.date] ?? '').trim();
      const projectValue = mapping.projectName ? (row[mapping.projectName] ?? '').trim() : '';
      const parsedDate = tryParseDate(dateValue);

      if (!parsedDate || !memberName) continue;

      // Find the member match
      const memberMatch = memberMatches.find((m) => m.csvName === memberName);
      if (!memberMatch?.matchedMemberId) continue;

      // Find the project match
      let projectId: string | null = null;
      if (projectValue) {
        const projectMatch = projectMatches.find((p) => p.csvName === projectValue);
        projectId = projectMatch?.matchedProjectId ?? null;
      }

      // Check for existing entry with same member + date + project
      const projectIds = projectId ? JSON.stringify([projectId]) : '[]';
      const existing = db
        .select({ id: schema.evaluationEntry.id })
        .from(schema.evaluationEntry)
        .where(
          and(
            eq(schema.evaluationEntry.memberId, memberMatch.matchedMemberId),
            eq(schema.evaluationEntry.date, parsedDate),
            eq(schema.evaluationEntry.projectIds, projectIds),
          ),
        )
        .get();

      if (existing) {
        duplicates++;
      }
    }

    const totalRows = rows.length;
    const readyCount = totalRows - dateErrors.length - duplicates;

    return {
      memberMatches,
      projectMatches,
      dateErrors,
      duplicates,
      readyCount,
      totalRows,
    };
  },

  /**
   * Execute the import: create evaluation entries from the CSV data.
   *
   * memberResolutions maps CSV name -> memberId | 'create:NewName' | 'skip'
   * projectResolutions maps CSV name -> projectId | 'create:NewName' | 'skip'
   */
  async execute(
    fileId: string,
    mapping: ColumnMapping,
    memberResolutions: Record<string, string>,
    projectResolutions: Record<string, string>,
    db: DrizzleDB,
  ): Promise<ImportResult> {
    const stored = getStoredFile(fileId);
    const { rows } = stored;

    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      newMembers: 0,
      newProjects: 0,
      errors: [],
    };

    // ── Resolve members: create new ones as needed ──
    const memberIdMap = new Map<string, string>(); // csvName -> memberId
    for (const [csvName, resolution] of Object.entries(memberResolutions)) {
      if (resolution === 'skip') {
        continue;
      }
      if (resolution.startsWith('create:')) {
        const newName = resolution.slice(7) || csvName;
        const now = new Date().toISOString();
        const id = ulid();
        await db.insert(schema.member).values({
          id,
          name: newName,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
        memberIdMap.set(csvName, id);
        result.newMembers++;
      } else {
        // resolution is an existing memberId
        memberIdMap.set(csvName, resolution);
      }
    }

    // ── Resolve projects: create new ones as needed ──
    const projectIdMap = new Map<string, string>(); // csvName -> projectId
    for (const [csvName, resolution] of Object.entries(projectResolutions)) {
      if (resolution === 'skip') {
        continue;
      }
      if (resolution.startsWith('create:')) {
        const newName = resolution.slice(7) || csvName;
        const now = new Date().toISOString();
        const id = ulid();
        await db.insert(schema.project).values({
          id,
          name: newName,
          description: null,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
        projectIdMap.set(csvName, id);
        result.newProjects++;
      } else {
        projectIdMap.set(csvName, resolution);
      }
    }

    // ── Process rows in batches ─────────────────────
    const BATCH_SIZE = 100;
    const pendingValues: Array<{
      id: string;
      memberId: string;
      type: string;
      date: string;
      quarter: string | null;
      projectIds: string;
      description: string | null;
      workloadScore: number | null;
      notes: string | null;
      aiInsights: string | null;
      isAiGenerated: number;
      source: string;
      createdAt: string;
      updatedAt: string;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Resolve member
      const memberName = (row[mapping.memberName] ?? '').trim();
      if (!memberName) {
        result.skipped++;
        continue;
      }

      const memberId = memberIdMap.get(memberName);
      if (!memberId) {
        result.skipped++;
        continue;
      }

      // Parse date
      const dateValue = (row[mapping.date] ?? '').trim();
      const parsedDate = tryParseDate(dateValue);
      if (!parsedDate) {
        result.skipped++;
        result.errors.push(`Row ${i + 1}: unparseable date "${dateValue}"`);
        continue;
      }

      // Resolve project
      const projectName = mapping.projectName ? (row[mapping.projectName] ?? '').trim() : '';
      let projectId: string | null = null;
      if (projectName) {
        projectId = projectIdMap.get(projectName) ?? null;
        // If project resolution was 'skip', projectId remains null
      }

      const projectIds = projectId ? JSON.stringify([projectId]) : '[]';

      // Check for duplicate
      const existing = db
        .select({ id: schema.evaluationEntry.id })
        .from(schema.evaluationEntry)
        .where(
          and(
            eq(schema.evaluationEntry.memberId, memberId),
            eq(schema.evaluationEntry.date, parsedDate),
            eq(schema.evaluationEntry.projectIds, projectIds),
          ),
        )
        .get();

      if (existing) {
        result.skipped++;
        continue;
      }

      // Build entry
      const description = (row[mapping.description] ?? '').trim() || null;
      const workloadStr = mapping.workloadScore ? (row[mapping.workloadScore] ?? '').trim() : '';
      const workloadScore = workloadStr ? parseFloat(workloadStr) : null;
      const notes = mapping.notes ? (row[mapping.notes] ?? '').trim() || null : null;
      const entryType = mapping.type ? (row[mapping.type] ?? '').trim() || 'daily' : 'daily';

      const now = new Date().toISOString();

      pendingValues.push({
        id: ulid(),
        memberId,
        type: entryType,
        date: parsedDate,
        quarter: null,
        projectIds,
        description,
        workloadScore: workloadScore !== null && !isNaN(workloadScore) ? workloadScore : null,
        notes,
        aiInsights: null,
        isAiGenerated: 0,
        source: 'imported',
        createdAt: now,
        updatedAt: now,
      });

      // Flush batch
      if (pendingValues.length >= BATCH_SIZE) {
        await flushBatch(db, pendingValues);
        result.imported += pendingValues.length;
        pendingValues.length = 0;
      }
    }

    // Flush remaining
    if (pendingValues.length > 0) {
      await flushBatch(db, pendingValues);
      result.imported += pendingValues.length;
      pendingValues.length = 0;
    }

    // Clean up stored file after successful import
    fileStore.delete(fileId);

    return result;
  },
};

// ─── Helpers ────────────────────────────────────

async function flushBatch(
  db: DrizzleDB,
  values: Array<{
    id: string;
    memberId: string;
    type: string;
    date: string;
    quarter: string | null;
    projectIds: string;
    description: string | null;
    workloadScore: number | null;
    notes: string | null;
    aiInsights: string | null;
    isAiGenerated: number;
    source: string;
    createdAt: string;
    updatedAt: string;
  }>,
): Promise<void> {
  // Use a transaction for batch insert
  db.$client.transaction(() => {
    for (const val of values) {
      db.insert(schema.evaluationEntry).values(val).run();
    }
  })();
}
