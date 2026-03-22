import { sql, and, gte, lt, eq, isNotNull } from 'drizzle-orm';
import * as schema from '../data/schema.js';
import type { DrizzleDB } from '../data/db.js';
import type {
  BarChartEntry,
  TrendChartEntry,
  HeatmapMember,
  HeatmapProject,
  HeatmapCell,
} from '@twle/vantage-shared';

// ─── Helpers ────────────────────────────────────

/**
 * Compute the exclusive upper bound for a date range.
 * Since authored_at stores ISO 8601 timestamps (e.g., "2026-03-31T10:00:00Z"),
 * comparing with `< nextDay` correctly includes all timestamps on endDate.
 */
function nextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute the start date for a given "YYYY-WNN" bucket.
 * SQLite's %W is 0-padded week-of-year (Monday-based).
 */
export function weekBucketToMonday(bucket: string): string {
  // bucket format: "YYYY-WNN" where NN is 00-53
  const [yearStr, weekPart] = bucket.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekPart, 10);

  // Jan 1 of the year
  const jan1 = new Date(Date.UTC(year, 0, 1));
  // Day of week for Jan 1 (0=Sun, 1=Mon, ... 6=Sat)
  const jan1Day = jan1.getUTCDay();
  // Days to the Monday of week 0
  // strftime('%W') counts weeks starting from Monday, week 00 starts on the first Monday
  const daysToFirstMonday = jan1Day === 0 ? 1 : jan1Day === 1 ? 0 : 8 - jan1Day;
  const mondayOfWeek = new Date(Date.UTC(year, 0, 1 + daysToFirstMonday + (week - 1) * 7));

  // Handle week 0 (days before the first Monday of the year)
  if (week === 0) {
    // Week 0 starts on Jan 1 (regardless of day). Return Jan 1.
    return jan1.toISOString().slice(0, 10);
  }

  return mondayOfWeek.toISOString().slice(0, 10);
}

// ─── Service ────────────────────────────────────

export const WorkloadChartService = {
  /**
   * Bar chart data: commit count per member per project.
   * Excludes unmapped authors (author_member_id IS NULL).
   */
  async getBarData(db: DrizzleDB, startDate: string, endDate: string): Promise<BarChartEntry[]> {
    const rows = await db
      .select({
        memberId: schema.codeChange.authorMemberId,
        memberName: schema.member.name,
        projectId: schema.codeChange.projectId,
        projectName: schema.project.name,
        commits: sql<number>`count(*)`,
      })
      .from(schema.codeChange)
      .innerJoin(schema.member, eq(schema.codeChange.authorMemberId, schema.member.id))
      .innerJoin(schema.project, eq(schema.codeChange.projectId, schema.project.id))
      .where(
        and(
          gte(schema.codeChange.authoredAt, startDate),
          lt(schema.codeChange.authoredAt, nextDay(endDate)),
          isNotNull(schema.codeChange.authorMemberId),
        ),
      )
      .groupBy(schema.codeChange.authorMemberId, schema.codeChange.projectId)
      .all();

    return rows.map((r) => ({
      memberId: r.memberId!,
      memberName: r.memberName,
      projectId: r.projectId,
      projectName: r.projectName,
      commits: r.commits,
    }));
  },

  /**
   * Trend line data: commit count per week bucket.
   * Includes all commits by default (even unmapped authors).
   * Optional member/project filters narrow the result.
   */
  async getTrendData(
    db: DrizzleDB,
    startDate: string,
    endDate: string,
    memberId?: string,
    projectId?: string,
  ): Promise<TrendChartEntry[]> {
    const conditions = [
      gte(schema.codeChange.authoredAt, startDate),
      lt(schema.codeChange.authoredAt, nextDay(endDate)),
    ];

    if (memberId) {
      conditions.push(eq(schema.codeChange.authorMemberId, memberId));
    }
    if (projectId) {
      conditions.push(eq(schema.codeChange.projectId, projectId));
    }

    const rows = await db
      .select({
        weekBucket: sql<string>`strftime('%Y-W%W', ${schema.codeChange.authoredAt})`,
        commits: sql<number>`count(*)`,
      })
      .from(schema.codeChange)
      .where(and(...conditions))
      .groupBy(sql`strftime('%Y-W%W', ${schema.codeChange.authoredAt})`)
      .orderBy(sql`strftime('%Y-W%W', ${schema.codeChange.authoredAt})`)
      .all();

    return rows.map((r) => ({
      weekBucket: r.weekBucket,
      weekStart: weekBucketToMonday(r.weekBucket),
      commits: r.commits,
    }));
  },

  /**
   * Heatmap data: member × project activity matrix.
   * Excludes unmapped authors. Returns axis arrays + cell data + maxCommits.
   */
  async getHeatmapData(
    db: DrizzleDB,
    startDate: string,
    endDate: string,
  ): Promise<{
    members: HeatmapMember[];
    projects: HeatmapProject[];
    cells: HeatmapCell[];
    maxCommits: number;
  }> {
    const rows = await db
      .select({
        memberId: schema.codeChange.authorMemberId,
        memberName: schema.member.name,
        projectId: schema.codeChange.projectId,
        projectName: schema.project.name,
        commits: sql<number>`count(*)`,
      })
      .from(schema.codeChange)
      .innerJoin(schema.member, eq(schema.codeChange.authorMemberId, schema.member.id))
      .innerJoin(schema.project, eq(schema.codeChange.projectId, schema.project.id))
      .where(
        and(
          gte(schema.codeChange.authoredAt, startDate),
          lt(schema.codeChange.authoredAt, nextDay(endDate)),
          isNotNull(schema.codeChange.authorMemberId),
        ),
      )
      .groupBy(schema.codeChange.authorMemberId, schema.codeChange.projectId)
      .all();

    // Build unique member and project lists
    const memberMap = new Map<string, string>();
    const projectMap = new Map<string, string>();
    let maxCommits = 0;

    for (const row of rows) {
      memberMap.set(row.memberId!, row.memberName);
      projectMap.set(row.projectId, row.projectName);
      if (row.commits > maxCommits) {
        maxCommits = row.commits;
      }
    }

    const members: HeatmapMember[] = Array.from(memberMap.entries()).map(([id, name]) => ({
      id,
      name,
    }));

    const projects: HeatmapProject[] = Array.from(projectMap.entries()).map(([id, name]) => ({
      id,
      name,
    }));

    const cells: HeatmapCell[] = rows.map((r) => ({
      memberId: r.memberId!,
      projectId: r.projectId,
      commits: r.commits,
    }));

    return { members, projects, cells, maxCommits };
  },
};
