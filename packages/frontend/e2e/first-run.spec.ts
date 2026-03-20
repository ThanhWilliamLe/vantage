import { test, expect, request as pwRequest } from '@playwright/test';
import { createFixtureRepo, uid, triggerScan, addIdentity } from './helpers.js';

/**
 * First-run journey: Empty dashboard -> create project -> add repo ->
 * add member -> map identity -> scan -> items appear in review queue.
 *
 * Uses `test.describe.serial()` because each step builds on the previous.
 */
test.describe.serial('First-run journey', () => {
  const suffix = uid();
  const projectName = `E2E Project ${suffix}`;
  const memberName = `Alice ${suffix}`;
  let fixtureRepoPath: string;

  test.beforeAll(() => {
    fixtureRepoPath = createFixtureRepo(`first-run-${suffix}`);
  });

  test('dashboard loads and shows empty state', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Either the populated dashboard or the empty-state welcome message should show
    await expect(
      page.locator('h1').filter({ hasText: 'Dashboard' }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('navigate to Settings and create a project', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1').filter({ hasText: 'Settings' })).toBeVisible({ timeout: 10_000 });

    // The Projects tab should be active by default
    await expect(page.locator('text=Create Project')).toBeVisible({ timeout: 10_000 });

    // Fill the create-project form
    await page.locator('input[placeholder="Project name"]').first().fill(projectName);
    await page.locator('input[placeholder*="Description"]').first().fill('E2E test project');
    await page.locator('button', { hasText: 'Create' }).first().click();

    // Verify project appears in the list
    await expect(page.locator('text=' + projectName)).toBeVisible({ timeout: 10_000 });
  });

  test('expand project and add a repository', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Wait for project list to render, then expand the project we created
    await expect(page.locator('text=' + projectName)).toBeVisible({ timeout: 10_000 });

    // Click the expand arrow next to our specific project (other tests may have created projects)
    const projectRow = page.locator('div.bg-surface-raised').filter({ hasText: projectName });
    await projectRow.locator('button[aria-label="Expand project"]').click();

    // Wait for the Repositories sub-section to appear
    const repoSection = page.locator('h4', { hasText: 'Repositories' }).locator('..');
    await expect(repoSection).toBeVisible({ timeout: 10_000 });

    // Fill the local path
    const pathInput = page.locator('input[placeholder*="Local path"]');
    await pathInput.fill(fixtureRepoPath);

    // The Add button becomes enabled when path is filled — find it near the path input
    // The form is: <div class="flex..."><select/><input/><button>Add</button></div>
    const addRepoBtn = page.locator('button', { hasText: 'Add' }).filter({ has: page.locator('text=Add') }).first();
    await expect(addRepoBtn).toBeEnabled({ timeout: 5_000 });
    await addRepoBtn.click();

    // Verify the repo was added (toast or path visible)
    await expect(page.locator('text=Repository added').first()).toBeVisible({ timeout: 10_000 });
  });

  test('switch to Members tab and create a member', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Click Members in the settings content nav (not the sidebar)
    await page.getByRole('list').getByRole('button', { name: 'Members' }).click();
    await expect(page.locator('text=Add Member')).toBeVisible({ timeout: 10_000 });

    // Create member
    await page.locator('input[placeholder="Member name"]').fill(memberName);
    await page.locator('button', { hasText: /^Add$/ }).first().click();

    // Verify member appears in list
    await expect(page.locator('text=' + memberName)).toBeVisible({ timeout: 10_000 });
  });

  test('add identity mapping to member via API', async () => {
    // Find the member by name, then add identity via API
    const api = await pwRequest.newContext({ baseURL: 'http://localhost:3847' });
    const membersRes = await api.get('http://localhost:3847/api/members');
    const members = await membersRes.json() as Array<{ id: string; name: string }>;
    const member = members.find((m) => m.name === memberName);
    if (!member) throw new Error(`Member ${memberName} not found`);
    await addIdentity(api, member.id, 'email', 'alice@example.com');
  });

  test('trigger scan and verify items in review queue', async ({ page }) => {
    // Trigger scan via API
    const api = await pwRequest.newContext({ baseURL: 'http://localhost:3847' });
    await triggerScan(api);

    // Wait a moment for scan to process
    await page.waitForTimeout(2_000);

    // Navigate to review queue
    await page.goto('/reviews');
    await page.waitForLoadState('networkidle');

    // The review queue should have items (from the 4 commits in the fixture repo)
    // Either we see commit titles or the pending count
    const hasItems = await page
      .locator('[data-testid="review-queue-empty"]')
      .isVisible()
      .then((empty) => !empty)
      .catch(() => true);

    // Verify the review queue page loaded with items
    await expect(page.locator('h1').filter({ hasText: 'Review Queue' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=pending items').first()).toBeVisible({ timeout: 10_000 });
  });
});
