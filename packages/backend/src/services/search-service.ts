import { sql } from 'drizzle-orm';
import * as schema from '../data/schema.js';
import type { DrizzleDB } from '../data/db.js';

// ─── Types ──────────────────────────────────────

interface CodeChangeSearchResult {
  id: string;
  title: string;
  aiSummary: string | null;
  status: string;
  authoredAt: string;
  authorMemberId: string | null;
  authorRaw: string;
  authorName: string | null;
  linesAdded: number;
  linesDeleted: number;
  projectId: string;
}

interface EvaluationSearchResult {
  id: string;
  type: string;
  date: string;
  memberId: string;
  description: string | null;
}

interface SearchHit<T> {
  score: number;
  item: T;
}

export interface SearchResults {
  changes: SearchHit<CodeChangeSearchResult>[];
  evaluations: SearchHit<EvaluationSearchResult>[];
}

// ─── Service ────────────────────────────────────

export const SearchService = {
  /**
   * Full-text search across code changes and evaluations.
   */
  async search(
    db: DrizzleDB,
    query: string,
    scope: string = 'all',
    limit: number = 20,
    offset: number = 0,
  ): Promise<SearchResults> {
    const sanitized = sanitizeFTS5Query(query);
    const results: SearchResults = { changes: [], evaluations: [] };

    if (!sanitized) {
      return results;
    }

    const clampedLimit = Math.min(Math.max(1, limit), 100);
    const clampedOffset = Math.max(0, offset);

    // Search code changes
    if (scope === 'all' || scope === 'changes') {
      const stmt = db.$client.prepare(`
        SELECT
          cc.id, cc.title, cc.ai_summary, cc.status, cc.authored_at,
          cc.author_member_id, cc.author_raw, cc.author_name,
          cc.lines_added, cc.lines_deleted, cc.project_id,
          rank
        FROM code_change_fts
        JOIN code_change cc ON cc.rowid = code_change_fts.rowid
        WHERE code_change_fts MATCH ?
        ORDER BY rank
        LIMIT ? OFFSET ?
      `);

      const rows = stmt.all(sanitized, clampedLimit, clampedOffset) as Array<{
        id: string;
        title: string;
        ai_summary: string | null;
        status: string;
        authored_at: string;
        author_member_id: string | null;
        author_raw: string;
        author_name: string | null;
        lines_added: number;
        lines_deleted: number;
        project_id: string;
        rank: number;
      }>;

      results.changes = rows.map((row) => ({
        score: row.rank,
        item: {
          id: row.id,
          title: row.title,
          aiSummary: row.ai_summary,
          status: row.status,
          authoredAt: row.authored_at,
          authorMemberId: row.author_member_id,
          authorRaw: row.author_raw,
          authorName: row.author_name,
          linesAdded: row.lines_added,
          linesDeleted: row.lines_deleted,
          projectId: row.project_id,
        },
      }));
    }

    // Search evaluations
    if (scope === 'all' || scope === 'evaluations') {
      const stmt = db.$client.prepare(`
        SELECT
          ee.id, ee.type, ee.date, ee.member_id, ee.description,
          rank
        FROM evaluation_entry_fts
        JOIN evaluation_entry ee ON ee.rowid = evaluation_entry_fts.rowid
        WHERE evaluation_entry_fts MATCH ?
        ORDER BY rank
        LIMIT ? OFFSET ?
      `);

      const rows = stmt.all(sanitized, clampedLimit, clampedOffset) as Array<{
        id: string;
        type: string;
        date: string;
        member_id: string;
        description: string | null;
        rank: number;
      }>;

      results.evaluations = rows.map((row) => ({
        score: row.rank,
        item: {
          id: row.id,
          type: row.type,
          date: row.date,
          memberId: row.member_id,
          description: row.description,
        },
      }));
    }

    return results;
  },

  /**
   * Search members by name using LIKE (not FTS).
   */
  async searchMembers(db: DrizzleDB, query: string) {
    if (!query || !query.trim()) {
      return [];
    }

    const pattern = `%${query.trim()}%`;

    const results = await db
      .select({
        id: schema.member.id,
        name: schema.member.name,
        status: schema.member.status,
      })
      .from(schema.member)
      .where(sql`${schema.member.name} LIKE ${pattern}`)
      .orderBy(schema.member.name)
      .limit(10)
      .all();

    return results;
  },

  /**
   * Search projects by name using LIKE (not FTS).
   */
  async searchProjects(db: DrizzleDB, query: string) {
    if (!query || !query.trim()) {
      return [];
    }

    const pattern = `%${query.trim()}%`;

    const results = await db
      .select({
        id: schema.project.id,
        name: schema.project.name,
        status: schema.project.status,
      })
      .from(schema.project)
      .where(sql`${schema.project.name} LIKE ${pattern}`)
      .orderBy(schema.project.name)
      .limit(10)
      .all();

    return results;
  },
};

// ─── Query Sanitization ─────────────────────────

/**
 * Sanitize user input for FTS5 queries.
 *
 * - Escapes double quotes (FTS5 phrase delimiter)
 * - Wraps each word in double quotes to prevent FTS5 operators
 *   (AND, OR, NOT, NEAR) from being interpreted as operators.
 */
export function sanitizeFTS5Query(input: string): string {
  let query = input.trim();
  if (!query) return '';

  // Escape double quotes
  query = query.replace(/"/g, '""');

  // Wrap each word in double quotes for literal matching
  const words = query.split(/\s+/).filter((w) => w.length > 0);
  return words.map((w) => `"${w}"`).join(' ');
}
