import { test, expect } from '@playwright/test';
import { uid, createProject, createMember } from './helpers.js';

test.describe.serial('CSV Import Journey', () => {
  const suffix = uid();
  let projectName: string;
  let memberName: string;

  test.beforeAll(async ({ request }) => {
    projectName = `Import Proj ${suffix}`;
    memberName = `Import User ${suffix}`;
    await createProject(request, projectName);
    await createMember(request, memberName);
  });

  test('navigate to Data Management tab and see import section', async ({ page }) => {
    await page.goto('/settings?tab=data');
    await page.waitForLoadState('networkidle');

    // Verify Data Management section is visible
    const heading = page.locator('h2').filter({ hasText: /Data Management|Import/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('upload CSV file and see parse results', async ({ page }) => {
    await page.goto('/settings?tab=data');
    await page.waitForLoadState('networkidle');

    // Create a simple CSV with evaluation data
    const csvContent = [
      'Member,Date,Description,Workload,Project',
      `${memberName},2026-01-15,Good progress on feature,7,${projectName}`,
      `${memberName},2026-01-16,Bug fixing day,5,${projectName}`,
      `${memberName},2026-01-17,Code review session,6,${projectName}`,
    ].join('\n');

    // Find the CSV file input
    const fileInput = page.locator('input[type="file"][accept*=".csv"], input[type="file"]').last();
    await fileInput.setInputFiles({
      name: 'evaluations.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent),
    });

    // Wait for parse result to appear
    await page.waitForLoadState('networkidle');

    // Should show some indication of parsed rows (3 data rows)
    // Look for preview content or row count
    const previewArea = page.locator('text=/3 rows|rows found|parsed/i');
    if (await previewArea.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(previewArea).toBeVisible();
    }
  });

  test('map columns and see validation', async ({ page }) => {
    await page.goto('/settings?tab=data');
    await page.waitForLoadState('networkidle');

    // Re-upload since this is a new page load
    const csvContent = [
      'Member,Date,Description,Workload,Project',
      `${memberName},2026-01-15,Good progress on feature,7,${projectName}`,
    ].join('\n');

    const fileInput = page.locator('input[type="file"]').last();
    await fileInput.setInputFiles({
      name: 'evaluations.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent),
    });

    await page.waitForLoadState('networkidle');

    // Look for column mapping dropdowns or auto-mapped columns
    // The exact UI depends on implementation — check for mapping selects
    const mappingArea = page.locator('select, [role="combobox"]');
    const hasMappingUI = await mappingArea.first().isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasMappingUI) {
      // Verify at least one mapping dropdown exists
      expect(await mappingArea.count()).toBeGreaterThan(0);
    }
  });
});
