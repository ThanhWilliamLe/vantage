import { eq, and, gte, lte, desc } from 'drizzle-orm';
import * as schema from '../data/schema.js';
import type { DrizzleDB } from '../data/db.js';

// ─── Types ──────────────────────────────────────

interface ExportFilters {
  memberId?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
}

// ─── Constants ──────────────────────────────────

const UTF8_BOM = '\uFEFF';

const CSV_HEADERS = [
  'ID',
  'Member ID',
  'Type',
  'Date',
  'Quarter',
  'Project IDs',
  'Description',
  'Workload Score',
  'Notes',
  'AI Insights',
  'AI Generated',
  'Created At',
  'Updated At',
];

// ─── Service ────────────────────────────────────

export const ExportService = {
  /**
   * Export evaluation entries as a CSV string with UTF-8 BOM for Excel compatibility.
   */
  async exportEvaluations(db: DrizzleDB, filters?: ExportFilters): Promise<string> {
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

    const entries = await db
      .select()
      .from(schema.evaluationEntry)
      .where(whereClause)
      .orderBy(desc(schema.evaluationEntry.date))
      .all();

    // Build CSV
    const lines: string[] = [];

    // Header row
    lines.push(CSV_HEADERS.map(escapeCSVField).join(','));

    // Data rows
    for (const entry of entries) {
      const row = [
        entry.id,
        entry.memberId,
        entry.type,
        entry.date,
        entry.quarter ?? '',
        entry.projectIds,
        entry.description ?? '',
        entry.workloadScore !== null ? String(entry.workloadScore) : '',
        entry.notes ?? '',
        entry.aiInsights ?? '',
        entry.isAiGenerated ? 'Yes' : 'No',
        entry.createdAt,
        entry.updatedAt,
      ];

      lines.push(row.map(escapeCSVField).join(','));
    }

    return UTF8_BOM + lines.join('\r\n') + '\r\n';
  },
};

// ─── CSV Escaping ───────────────────────────────

/**
 * Escape a field value for CSV output.
 *
 * Fields containing commas, double quotes, or newlines are wrapped in
 * double quotes. Internal double quotes are doubled.
 */
function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
