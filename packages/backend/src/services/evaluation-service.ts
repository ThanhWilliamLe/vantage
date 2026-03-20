import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as schema from '../data/schema.js';
import { NotFoundError, ValidationError } from '../errors/index.js';
import type { DrizzleDB } from '../data/db.js';

// ─── Types ──────────────────────────────────────

interface CreateDailyInput {
  memberId: string;
  date: string;
  projectIds: string[];
  description?: string;
  workloadScore?: number;
  notes?: string;
}

interface CreateQuarterlyInput {
  memberId: string;
  quarter: string;
  projectIds: string[];
  description?: string;
  workloadScore?: number;
  notes?: string;
  aiInsights?: unknown;
}

interface UpdateFields {
  description?: string;
  workloadScore?: number;
  notes?: string;
  projectIds?: string[];
  aiInsights?: unknown;
}

interface ListFilters {
  memberId?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

interface SearchFilters {
  memberId?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

// ─── Helpers ────────────────────────────────────

function parseEvalRow<T extends { projectIds: string | string[] | null }>(row: T): T {
  return {
    ...row,
    projectIds: typeof row.projectIds === 'string' ? JSON.parse(row.projectIds) : row.projectIds,
  };
}

// ─── Service ────────────────────────────────────

export const EvaluationService = {
  /**
   * Create a daily check-up entry.
   */
  async createDaily(db: DrizzleDB, input: CreateDailyInput) {
    if (!input.memberId) {
      throw new ValidationError('memberId is required', { field: 'memberId' });
    }
    if (!input.date) {
      throw new ValidationError('date is required', { field: 'date' });
    }
    if (!input.projectIds || input.projectIds.length === 0) {
      throw new ValidationError('At least one projectId is required', { field: 'projectIds' });
    }

    // Verify member exists
    const mem = await db
      .select()
      .from(schema.member)
      .where(eq(schema.member.id, input.memberId))
      .get();
    if (!mem) {
      throw new NotFoundError('Member', input.memberId);
    }

    const now = new Date().toISOString();
    const id = ulid();

    const row = {
      id,
      memberId: input.memberId,
      type: 'daily' as const,
      date: input.date,
      quarter: null,
      projectIds: JSON.stringify(input.projectIds),
      description: input.description ?? null,
      workloadScore: input.workloadScore ?? null,
      notes: input.notes ?? null,
      aiInsights: null,
      isAiGenerated: 0,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(schema.evaluationEntry).values(row);
    return { ...row, projectIds: input.projectIds };
  },

  /**
   * Update an existing evaluation entry (daily or quarterly).
   */
  async updateDaily(db: DrizzleDB, id: string, fields: UpdateFields) {
    const existing = await db
      .select()
      .from(schema.evaluationEntry)
      .where(eq(schema.evaluationEntry.id, id))
      .get();

    if (!existing) {
      throw new NotFoundError('EvaluationEntry', id);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };

    if (fields.description !== undefined) updates.description = fields.description;
    if (fields.workloadScore !== undefined) updates.workloadScore = fields.workloadScore;
    if (fields.notes !== undefined) updates.notes = fields.notes;
    if (fields.projectIds !== undefined) updates.projectIds = JSON.stringify(fields.projectIds);
    if (fields.aiInsights !== undefined) updates.aiInsights = JSON.stringify(fields.aiInsights);

    await db.update(schema.evaluationEntry).set(updates).where(eq(schema.evaluationEntry.id, id));

    return parseEvalRow({ ...existing, ...updates });
  },

  /**
   * Delete an evaluation entry.
   */
  async deleteDaily(db: DrizzleDB, id: string) {
    const existing = await db
      .select()
      .from(schema.evaluationEntry)
      .where(eq(schema.evaluationEntry.id, id))
      .get();

    if (!existing) {
      throw new NotFoundError('EvaluationEntry', id);
    }

    await db.delete(schema.evaluationEntry).where(eq(schema.evaluationEntry.id, id));
  },

  /**
   * Get data for a daily check-up: members with git activity that day + existing entries.
   */
  async getDailyData(db: DrizzleDB, date: string) {
    if (!date) {
      throw new ValidationError('date is required', { field: 'date' });
    }

    // Find the start and end of the given date
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;

    // Members who had git activity that day
    const activeMembers = await db
      .select({
        memberId: schema.codeChange.authorMemberId,
        commitCount: sql<number>`count(*)`,
      })
      .from(schema.codeChange)
      .where(
        and(
          gte(schema.codeChange.authoredAt, dayStart),
          lte(schema.codeChange.authoredAt, dayEnd),
          sql`${schema.codeChange.authorMemberId} IS NOT NULL`,
        ),
      )
      .groupBy(schema.codeChange.authorMemberId)
      .all();

    // Existing evaluation entries for that date
    const existingEntries = await db
      .select()
      .from(schema.evaluationEntry)
      .where(and(eq(schema.evaluationEntry.type, 'daily'), eq(schema.evaluationEntry.date, date)))
      .all();

    // Get member details for active members
    const memberIds = activeMembers
      .map((m) => m.memberId)
      .filter((id): id is string => id !== null);

    const members =
      memberIds.length > 0
        ? await db
            .select()
            .from(schema.member)
            .where(
              sql`${schema.member.id} IN (${sql.join(
                memberIds.map((id) => sql`${id}`),
                sql`, `,
              )})`,
            )
            .all()
        : [];

    const parsedEntries = existingEntries.map(parseEvalRow);

    return {
      date,
      members: members.map((m) => {
        const activity = activeMembers.find((a) => a.memberId === m.id);
        const entry = parsedEntries.find((e) => e.memberId === m.id);
        return {
          ...m,
          commitCount: activity?.commitCount ?? 0,
          existingEntry: entry ?? null,
        };
      }),
      existingEntries: parsedEntries,
    };
  },

  /**
   * List evaluation entries with optional filters.
   */
  async listDaily(db: DrizzleDB, filters?: ListFilters) {
    const limit = Math.min(filters?.limit || 50, 200);
    const offset = filters?.offset || 0;

    const conditions = [];

    if (filters?.memberId) {
      conditions.push(eq(schema.evaluationEntry.memberId, filters.memberId));
    }
    if (filters?.type) {
      conditions.push(eq(schema.evaluationEntry.type, filters.type));
    }
    if (filters?.startDate) {
      conditions.push(gte(schema.evaluationEntry.date, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(schema.evaluationEntry.date, filters.endDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const items = await db
      .select()
      .from(schema.evaluationEntry)
      .where(whereClause)
      .orderBy(desc(schema.evaluationEntry.date))
      .limit(limit)
      .offset(offset)
      .all();

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.evaluationEntry)
      .where(whereClause)
      .get();

    return {
      items: items.map(parseEvalRow),
      total: countResult?.count ?? 0,
      limit,
      offset,
    };
  },

  /**
   * Create a quarterly evaluation entry.
   */
  async createQuarterly(db: DrizzleDB, input: CreateQuarterlyInput) {
    if (!input.memberId) {
      throw new ValidationError('memberId is required', { field: 'memberId' });
    }
    if (!input.quarter) {
      throw new ValidationError('quarter is required', { field: 'quarter' });
    }
    if (!input.projectIds || input.projectIds.length === 0) {
      throw new ValidationError('At least one projectId is required', { field: 'projectIds' });
    }

    // Verify member exists
    const mem = await db
      .select()
      .from(schema.member)
      .where(eq(schema.member.id, input.memberId))
      .get();
    if (!mem) {
      throw new NotFoundError('Member', input.memberId);
    }

    const now = new Date().toISOString();
    const id = ulid();

    // Use the quarter start date as the date field
    const date = quarterToDate(input.quarter);

    const row = {
      id,
      memberId: input.memberId,
      type: 'quarterly' as const,
      date,
      quarter: input.quarter,
      projectIds: JSON.stringify(input.projectIds),
      description: input.description ?? null,
      workloadScore: input.workloadScore ?? null,
      notes: input.notes ?? null,
      aiInsights: input.aiInsights ? JSON.stringify(input.aiInsights) : null,
      isAiGenerated: 0,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(schema.evaluationEntry).values(row);
    return { ...row, projectIds: input.projectIds };
  },

  /**
   * Get data for quarterly evaluation: daily entries for the quarter.
   */
  async getQuarterlyData(db: DrizzleDB, quarter: string, memberIds?: string[]) {
    if (!quarter) {
      throw new ValidationError('quarter is required', { field: 'quarter' });
    }

    const { startDate, endDate } = quarterToDateRange(quarter);

    const conditions = [
      eq(schema.evaluationEntry.type, 'daily'),
      gte(schema.evaluationEntry.date, startDate),
      lte(schema.evaluationEntry.date, endDate),
    ];

    if (memberIds && memberIds.length > 0) {
      conditions.push(
        sql`${schema.evaluationEntry.memberId} IN (${sql.join(
          memberIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    }

    const dailyEntries = await db
      .select()
      .from(schema.evaluationEntry)
      .where(and(...conditions))
      .orderBy(schema.evaluationEntry.date)
      .all();

    // Existing quarterly entries for the quarter
    const quarterlyEntries = await db
      .select()
      .from(schema.evaluationEntry)
      .where(
        and(
          eq(schema.evaluationEntry.type, 'quarterly'),
          eq(schema.evaluationEntry.quarter, quarter),
        ),
      )
      .all();

    return {
      quarter,
      startDate,
      endDate,
      dailyEntries: dailyEntries.map(parseEvalRow),
      quarterlyEntries: quarterlyEntries.map(parseEvalRow),
    };
  },

  /**
   * Get an evaluation entry by ID.
   */
  async getById(db: DrizzleDB, id: string) {
    const entry = await db
      .select()
      .from(schema.evaluationEntry)
      .where(eq(schema.evaluationEntry.id, id))
      .get();

    if (!entry) {
      throw new NotFoundError('EvaluationEntry', id);
    }

    return parseEvalRow(entry);
  },

  /**
   * Search evaluation entries by text query and/or filters.
   */
  async search(db: DrizzleDB, query?: string, filters?: SearchFilters) {
    const limit = Math.min(filters?.limit || 50, 200);
    const offset = filters?.offset || 0;

    if (query && query.trim()) {
      // Use FTS5
      const sanitized = sanitizeFTS5QueryInternal(query);
      if (!sanitized) {
        return { items: [], total: 0, limit, offset };
      }

      const conditions: string[] = [];
      const params: unknown[] = [sanitized];

      if (filters?.memberId) {
        conditions.push('ee.member_id = ?');
        params.push(filters.memberId);
      }
      if (filters?.type) {
        conditions.push('ee.type = ?');
        params.push(filters.type);
      }
      if (filters?.startDate) {
        conditions.push('ee.date >= ?');
        params.push(filters.startDate);
      }
      if (filters?.endDate) {
        conditions.push('ee.date <= ?');
        params.push(filters.endDate);
      }

      const whereExtra = conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '';

      const stmt = db.$client.prepare(`
        SELECT ee.*, rank
        FROM evaluation_entry_fts
        JOIN evaluation_entry ee ON ee.rowid = evaluation_entry_fts.rowid
        WHERE evaluation_entry_fts MATCH ?${whereExtra}
        ORDER BY rank
        LIMIT ? OFFSET ?
      `);

      const items = stmt.all(...params, limit, offset) as Array<
        Record<string, unknown> & { projectIds: string | string[] | null }
      >;

      const countStmt = db.$client.prepare(`
        SELECT count(*) as count
        FROM evaluation_entry_fts
        JOIN evaluation_entry ee ON ee.rowid = evaluation_entry_fts.rowid
        WHERE evaluation_entry_fts MATCH ?${whereExtra}
      `);

      const countResult = countStmt.get(...params) as { count: number } | undefined;

      return {
        items: items.map(parseEvalRow),
        total: countResult?.count ?? 0,
        limit,
        offset,
      };
    }

    // No text query — use structured filters only
    return EvaluationService.listDaily(db, filters);
  },
};

// ─── Helpers ────────────────────────────────────

function sanitizeFTS5QueryInternal(input: string): string {
  let query = input.trim();
  if (!query) return '';

  query = query.replace(/"/g, '""');
  const words = query.split(/\s+/).filter((w) => w.length > 0);
  return words.map((w) => `"${w}"`).join(' ');
}

function quarterToDate(quarter: string): string {
  // Expected format: "2026-Q1"
  const match = quarter.match(/^(\d{4})-Q([1-4])$/);
  if (!match) return quarter;

  const year = match[1];
  const q = parseInt(match[2], 10);
  const month = String((q - 1) * 3 + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function quarterToDateRange(quarter: string): { startDate: string; endDate: string } {
  const match = quarter.match(/^(\d{4})-Q([1-4])$/);
  if (!match) {
    return { startDate: quarter, endDate: quarter };
  }

  const year = parseInt(match[1], 10);
  const q = parseInt(match[2], 10);
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;

  const startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;

  // Last day of end month
  const lastDay = new Date(year, endMonth, 0).getDate();
  const endDate = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return { startDate, endDate };
}
