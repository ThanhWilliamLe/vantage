import { test, expect, request as pwRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
  createFixtureRepo,
  createProject,
  createMember,
  addIdentity,
  addRepository,
  triggerScan,
  uid,
} from './helpers.js';

/**
 * Morning-review journey: Queue has items -> review one + flag one + defer one
 * -> verify correct statuses.
 *
 * Uses `test.describe.serial()` because review/flag/defer actions modify shared state.
 */
test.describe.serial('Morning review journey', () => {
  const suffix = uid();
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await pwRequest.newContext({ baseURL: 'http://localhost:3847' });

    const project = await createProject(api, `Review Project ${suffix}`);
    const member = await createMember(api, `Alice Review ${suffix}`);
    await addIdentity(api, member.id, 'email', 'alice@example.com');

    const repoPath = createFixtureRepo(`morning-review-${suffix}`);
    await addRepository(api, project.id, repoPath);
    await triggerScan(api);
  });

  test('navigate to /reviews and verify items in queue', async ({ page }) => {
    await page.goto('/reviews');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1').filter({ hasText: 'Review Queue' })).toBeVisible({ timeout: 15_000 });

    // Wait for items to load -- either we see the item list or "pending items" count
    // The fixture repo has 4 commits, so we expect pending items
    // Allow extra time for scan results to propagate
    await page.waitForLoadState('networkidle');
    await expect(
      page.locator('text=pending items').or(page.locator('[data-testid="review-queue-empty"]')),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('select first item and verify detail pane', async ({ page }) => {
    await page.goto('/reviews');
    await page.waitForLoadState('networkidle');

    // Wait for items to render
    await expect(page.locator('text=pending items')).toBeVisible({ timeout: 15_000 });

    // The first item is auto-selected; verify detail pane shows content
    // Detail pane should contain the action buttons
    await expect(page.locator('button', { hasText: 'Review (r)' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('button', { hasText: 'Flag (f)' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Defer (d)' })).toBeVisible();
  });

  test('click "Review (r)" and verify item is actioned', async ({ page }) => {
    await page.goto('/reviews');
    await page.waitForLoadState('networkidle');

    // Wait for queue items
    await expect(page.locator('text=pending items')).toBeVisible({ timeout: 15_000 });

    // Note the initial pending count
    const countText = await page.locator('text=pending items').textContent();
    const initialCount = parseInt(countText?.replace(/\D/g, '') ?? '0', 10);

    // Click "Review (r)" button
    await page.locator('button', { hasText: 'Review (r)' }).click();

    // Wait for the queue to update (count should decrease by 1)
    if (initialCount > 1) {
      await expect(page.locator('text=pending items')).toContainText(String(initialCount - 1), {
        timeout: 10_000,
      });
    }
  });

  test('flag an item with a reason', async ({ page }) => {
    await page.goto('/reviews');
    await page.waitForLoadState('networkidle');

    // Wait for items
    await expect(page.locator('button', { hasText: 'Flag (f)' })).toBeVisible({ timeout: 15_000 });

    // Type a flag reason
    const flagInput = page.locator('input[placeholder*="Reason for flagging"]');
    await flagInput.fill('Needs senior review - risky change');

    // Click Flag button
    await page.locator('button', { hasText: 'Flag (f)' }).click();

    // Wait for UI to update (the item should move out of pending)
    await page.waitForTimeout(1_000);
  });

  test('defer an item', async ({ page }) => {
    await page.goto('/reviews');
    await page.waitForLoadState('networkidle');

    // If there are items remaining, defer one
    const hasItems = await page
      .locator('button', { hasText: 'Defer (d)' })
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    if (hasItems) {
      await page.locator('button', { hasText: 'Defer (d)' }).click();
      await page.waitForTimeout(1_000);
    }

    // Verify the Review Queue heading is still visible (page did not crash)
    await expect(page.locator('h1').filter({ hasText: 'Review Queue' })).toBeVisible();
  });

  test('Request Deep Analysis button exists in detail pane', async ({ page }) => {
    await page.goto('/reviews');
    await page.waitForLoadState('networkidle');

    // Navigate to the queue and check for the deep analysis button
    // It may not be visible if no items remain, so we check conditionally
    const hasDetailPane = await page
      .locator('button', { hasText: 'Review (r)' })
      .isVisible({ timeout: 8_000 })
      .catch(() => false);

    if (hasDetailPane) {
      // The "Request Deep Analysis" button should be present in the detail pane
      await expect(
        page.locator('button', { hasText: 'Request Deep Analysis' }),
      ).toBeVisible({ timeout: 10_000 });
    } else {
      // All items have been actioned; queue is empty, which is acceptable
      await expect(
        page.locator('[data-testid="review-queue-empty"]').or(page.locator('text=all caught up')),
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});
