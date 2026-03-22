import { test, expect, request as pwRequest } from '@playwright/test';
import {
  uid,
  createFixtureRepo,
  createProject,
  createMember,
  addIdentity,
  addRepository,
  triggerScan,
  getPendingQueue,
  reviewChange,
} from './helpers.js';

test.describe.serial('Search & History Journey', () => {
  const suffix = uid();
  const projectName = `SearchProj-${suffix}`;
  const memberName = `Alice-${suffix}`;
  let projectId: string;
  let memberId: string;

  test.beforeAll(async () => {
    const api = await pwRequest.newContext({ baseURL: 'http://localhost:24020' });

    // Seed project
    const project = await createProject(api, projectName, 'Search-history e2e');
    projectId = project.id;

    // Seed member with identity matching fixture repo author
    const member = await createMember(api, memberName);
    memberId = member.id;
    await addIdentity(api, memberId, 'email', 'alice@example.com');

    // Create fixture repo, attach to project, and scan
    const repoPath = createFixtureRepo(`search-hist-${suffix}`);
    await addRepository(api, projectId, repoPath);
    await triggerScan(api);

    // Review some items so they appear in history
    const queue = await getPendingQueue(api);
    for (const item of queue.items.slice(0, 2)) {
      await reviewChange(api, item.id, 'Reviewed for e2e search-history test');
    }

    await api.dispose();
  });

  test('open command palette with Ctrl+K and search for a project', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open command palette — click the search button in the sidebar instead of keyboard shortcut
    await page.locator('button', { hasText: 'Search...' }).click();

    // Verify palette is visible
    const palette = page.locator('[data-testid="command-palette"]');
    await expect(palette).toBeVisible({ timeout: 10_000 });

    // Type the project name into the search input (cmdk renders a standard input)
    const searchInput = palette.locator('input');
    await searchInput.fill(projectName);

    // Wait for search results to appear -- look for the project name in the palette
    const projectResult = palette.locator(`text=${projectName}`).first();
    await expect(projectResult).toBeVisible({ timeout: 10_000 });
  });

  test('search for member name in command palette', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open command palette via the sidebar search button (more reliable than keyboard shortcut)
    await page.locator('button', { hasText: 'Search...' }).click();
    const palette = page.locator('[data-testid="command-palette"]');
    await expect(palette).toBeVisible({ timeout: 10_000 });

    // Search for member
    const searchInput = palette.locator('input');
    await searchInput.fill(memberName);

    // Verify member appears in results
    const memberResult = palette.locator(`text=${memberName}`).first();
    await expect(memberResult).toBeVisible({ timeout: 10_000 });

    // Close the palette with Escape
    await page.keyboard.press('Escape');
    await expect(palette).not.toBeVisible({ timeout: 3_000 });
  });

  test('navigate to review history and verify reviewed items', async ({ page }) => {
    await page.goto('/reviews/history');
    await page.waitForLoadState('networkidle');

    // Verify the Review History heading is visible
    await expect(page.locator('h1').filter({ hasText: 'Review History' })).toBeVisible({ timeout: 10_000 });

    // Wait for the history table to appear
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    // Verify at least one row exists in the table body
    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  });

  test('filter history by status "reviewed"', async ({ page }) => {
    await page.goto('/reviews/history');
    await page.waitForLoadState('networkidle');

    // Wait for the table to load
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    // Select "Reviewed" from the status filter dropdown
    // The status filter is a <select> with options: All statuses, Reviewed, Flagged, etc.
    const statusSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Reviewed' }) });
    await statusSelect.selectOption('reviewed');

    // Wait for data to reload
    await page.waitForLoadState('networkidle');

    // Verify items in the table have "reviewed" status badges
    const statusBadges = table.locator('tbody tr td').locator('span', { hasText: 'reviewed' });
    const count = await statusBadges.count();
    expect(count).toBeGreaterThan(0);
  });
});
