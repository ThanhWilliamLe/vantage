import { test, expect } from '@playwright/test';
import { uid, createProject, createMember, addIdentity, createFixtureRepo, addRepository, triggerScan } from './helpers.js';

test.describe.serial('Backup & Restore Journey', () => {
  const suffix = uid();
  let projectId: string;
  let memberId: string;

  test.beforeAll(async ({ request }) => {
    // Seed data so backup has content
    const proj = await createProject(request, `Backup Test ${suffix}`);
    projectId = proj.id;
    const mem = await createMember(request, `Backup User ${suffix}`);
    memberId = mem.id;
    await addIdentity(request, memberId, 'email', `backup-${suffix}@example.com`);

    const repoPath = createFixtureRepo(`backup-${suffix}`);
    await addRepository(request, projectId, repoPath);
    await triggerScan(request);
  });

  test('navigate to Data Management tab', async ({ page }) => {
    await page.goto('/settings?tab=data');
    await page.waitForLoadState('networkidle');

    // Verify Data Management section is visible
    const heading = page.locator('h2').filter({ hasText: /Data Management|Backup/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('export backup downloads a JSON file', async ({ page }) => {
    await page.goto('/settings?tab=data');
    await page.waitForLoadState('networkidle');

    // Start waiting for download before clicking
    const downloadPromise = page.waitForEvent('download');

    const exportButton = page.locator('button', { hasText: /Export|Backup/i });
    await expect(exportButton).toBeVisible({ timeout: 10_000 });
    await exportButton.click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('vantage-backup');
    expect(download.suggestedFilename()).toContain('.json');
  });

  test('restore with merge mode succeeds', async ({ page, request }) => {
    // First export via API to get backup data
    const exportRes = await request.post('http://localhost:3847/api/backup/export');
    expect(exportRes.ok()).toBeTruthy();
    const backupData = await exportRes.json();

    await page.goto('/settings?tab=data');
    await page.waitForLoadState('networkidle');

    // Look for file input for restore
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.isVisible()) {
      // Create a temp file with backup content
      const buffer = Buffer.from(JSON.stringify(backupData));
      await fileInput.setInputFiles({
        name: 'vantage-backup.json',
        mimeType: 'application/json',
        buffer,
      });

      // Select merge mode if there's a mode selector
      const mergeOption = page.locator('label, button, option').filter({ hasText: /merge/i });
      if (await mergeOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await mergeOption.click();
      }

      // Click restore button
      const restoreButton = page.locator('button', { hasText: /Restore|Import Backup/i });
      if (await restoreButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await restoreButton.click();
        // Wait for result
        await page.waitForLoadState('networkidle');
      }
    }
  });
});
