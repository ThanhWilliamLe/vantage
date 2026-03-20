import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDatabase } from '../data/test-helpers.js';
import { ExportService } from './export-service.js';
import { ProjectService } from './project-service.js';
import { MemberService } from './member-service.js';
import * as schema from '../data/schema.js';

const { db, sqlite } = createTestDatabase();

let projectId: string;
let memberId: string;

beforeAll(async () => {
  const project = await ProjectService.create(db, { name: 'Export Test Project' });
  projectId = project.id;

  const member = await MemberService.create(db, { name: 'ExportTester' });
  memberId = member.id;

  const now = new Date().toISOString();

  // Insert entries with various content to test CSV escaping
  await db.insert(schema.evaluationEntry).values({
    id: ulid(),
    memberId,
    type: 'daily',
    date: '2026-03-15',
    quarter: null,
    projectIds: JSON.stringify([projectId]),
    description: 'Simple description',
    workloadScore: 5,
    notes: 'Simple notes',
    aiInsights: null,
    isAiGenerated: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Entry with commas in description
  await db.insert(schema.evaluationEntry).values({
    id: ulid(),
    memberId,
    type: 'daily',
    date: '2026-03-16',
    quarter: null,
    projectIds: JSON.stringify([projectId]),
    description: 'Worked on feature A, feature B, and feature C',
    workloadScore: 7,
    notes: null,
    aiInsights: null,
    isAiGenerated: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Entry with double quotes in notes
  await db.insert(schema.evaluationEntry).values({
    id: ulid(),
    memberId,
    type: 'daily',
    date: '2026-03-17',
    quarter: null,
    projectIds: JSON.stringify([projectId]),
    description: 'Regular work',
    workloadScore: 5,
    notes: 'Said "good job" to the team',
    aiInsights: null,
    isAiGenerated: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Entry with newlines in description
  await db.insert(schema.evaluationEntry).values({
    id: ulid(),
    memberId,
    type: 'daily',
    date: '2026-03-18',
    quarter: null,
    projectIds: JSON.stringify([projectId]),
    description: 'Line one\nLine two\nLine three',
    workloadScore: 6,
    notes: null,
    aiInsights: null,
    isAiGenerated: 0,
    createdAt: now,
    updatedAt: now,
  });
});

afterAll(() => {
  sqlite.close();
});

// ═══════════════════════════════════════════════════════════════
// CSV Export
// ═══════════════════════════════════════════════════════════════
describe('ExportService.exportEvaluations', () => {
  it('exports CSV with UTF-8 BOM', async () => {
    const csv = await ExportService.exportEvaluations(db);

    // Check BOM
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it('includes header row', async () => {
    const csv = await ExportService.exportEvaluations(db);
    const lines = csv.split('\r\n');

    // First line (after BOM) should be headers
    const headerLine = lines[0].replace(/^\uFEFF/, '');
    expect(headerLine).toContain('ID');
    expect(headerLine).toContain('Member ID');
    expect(headerLine).toContain('Description');
    expect(headerLine).toContain('Workload Score');
  });

  it('properly escapes fields with commas', async () => {
    const csv = await ExportService.exportEvaluations(db);

    // The entry with commas should be wrapped in double quotes
    expect(csv).toContain('"Worked on feature A, feature B, and feature C"');
  });

  it('properly escapes fields with double quotes', async () => {
    const csv = await ExportService.exportEvaluations(db);

    // Internal double quotes should be doubled
    expect(csv).toContain('"Said ""good job"" to the team"');
  });

  it('properly escapes fields with newlines', async () => {
    const csv = await ExportService.exportEvaluations(db);

    // Fields with newlines should be wrapped in double quotes
    expect(csv).toContain('"Line one\nLine two\nLine three"');
  });

  it('uses CRLF line endings', async () => {
    const csv = await ExportService.exportEvaluations(db);

    // Remove the BOM and check line endings
    const content = csv.replace(/^\uFEFF/, '');
    const crlfCount = (content.match(/\r\n/g) || []).length;
    expect(crlfCount).toBeGreaterThanOrEqual(2); // header + at least 1 data row + trailing
  });

  it('filters by memberId', async () => {
    const csv = await ExportService.exportEvaluations(db, { memberId: 'nonexistent' });

    // Should have only the header row (plus trailing CRLF)
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(lines.length).toBe(1); // Only header
  });

  it('includes all entries when no filter', async () => {
    const csv = await ExportService.exportEvaluations(db);
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');

    // Header + 4 data rows
    expect(lines.length).toBe(5);
  });
});
