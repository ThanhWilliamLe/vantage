import { test, expect, request as pwRequest } from '@playwright/test';
import {
  uid,
  createProject,
  createMember,
  createEvaluation,
} from './helpers.js';

test.describe.serial('Export CSV Journey', () => {
  const suffix = uid();
  const projectName = `ExportProj-${suffix}`;
  const memberName = `Charlie-${suffix}`;
  let projectId: string;
  let memberId: string;

  test.beforeAll(async () => {
    const api = await pwRequest.newContext({ baseURL: 'http://localhost:24020' });

    // Seed project
    const project = await createProject(api, projectName, 'Export e2e');
    projectId = project.id;

    // Seed member
    const member = await createMember(api, memberName);
    memberId = member.id;

    // Create 3 evaluations via API
    await createEvaluation(api, {
      type: 'daily',
      memberId,
      date: '2025-03-10',
      projectIds: [projectId],
      description: 'Export eval 1',
      workloadScore: 5,
    });
    await createEvaluation(api, {
      type: 'daily',
      memberId,
      date: '2025-03-11',
      projectIds: [projectId],
      description: 'Export eval 2',
      workloadScore: 6,
    });
    await createEvaluation(api, {
      type: 'daily',
      memberId,
      date: '2025-03-12',
      projectIds: [projectId],
      description: 'Export eval 3',
      workloadScore: 7,
    });

    await api.dispose();
  });

  test('evaluations page shows seeded evaluations in the log tab', async ({ page }) => {
    await page.goto('/evaluations');
    await page.waitForLoadState('networkidle');

    // Verify the Evaluations heading
    await expect(page.locator('h1:has-text("Evaluations")')).toBeVisible({ timeout: 10_000 });

    // Click on "Evaluation Log" tab to see the list
    const logTab = page.locator('button:has-text("Evaluation Log")');
    await logTab.click();
    await page.waitForLoadState('networkidle');

    // Wait for the evaluation table to appear
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    // Verify at least some evaluations exist in the table
    const rows = table.locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(3);
  });

  test('export CSV button triggers download with correct content', async ({ page }) => {
    await page.goto('/evaluations');
    await page.waitForLoadState('networkidle');

    // Switch to Evaluation Log tab
    const logTab = page.locator('button:has-text("Evaluation Log")');
    await logTab.click();
    await page.waitForLoadState('networkidle');

    // Wait for the table to load
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    // The Export CSV button creates a Blob download via JavaScript.
    // Use Playwright's download event to capture it.
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });

    // Click the Export CSV button
    const exportButton = page.locator('button:has-text("Export CSV")');
    await expect(exportButton).toBeVisible({ timeout: 5_000 });
    await exportButton.click();

    const download = await downloadPromise;

    // Verify the downloaded filename matches pattern
    expect(download.suggestedFilename()).toMatch(/^evaluations-\d{4}-\d{2}-\d{2}\.csv$/);

    // Read the CSV content
    const filePath = await download.path();
    expect(filePath).toBeTruthy();

    // Read file content to verify structure
    const { readFileSync } = await import('node:fs');
    const content = readFileSync(filePath!, 'utf-8');
    const lines = content.trim().split('\n');

    // CSV should have a header row plus data rows
    // Header: Member,Type,Date,Description,Score,Notes
    expect(lines[0]).toContain('Member');
    expect(lines[0]).toContain('Type');
    expect(lines[0]).toContain('Date');
    expect(lines[0]).toContain('Description');

    // Should have at least 3 data rows (our seeded evaluations) plus the header
    expect(lines.length).toBeGreaterThanOrEqual(4);
  });
});
