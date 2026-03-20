import { test, expect, request as pwRequest } from '@playwright/test';
import { createProject, createMember, createEvaluation, uid } from './helpers.js';

/**
 * Quarterly evaluation journey: Navigate to evaluations -> Quarterly tab ->
 * select member -> per-member mode -> type description + score -> save ->
 * verify in Log tab.
 *
 * Uses `test.describe.serial()` because save depends on prior form state.
 */
test.describe.serial('Quarterly evaluation journey', () => {
  const suffix = uid();
  const memberName = `QuarterlyMember ${suffix}`;
  const projectName = `QuarterlyProject ${suffix}`;
  const quarterlyDescription = `Quarterly review summary for ${suffix}`;
  let memberId: string;
  let projectId: string;

  test.beforeAll(async () => {
    const api = await pwRequest.newContext({ baseURL: 'http://localhost:3847' });
    const project = await createProject(api, projectName);
    projectId = project.id;
    const member = await createMember(api, memberName);
    memberId = member.id;

    // Seed a daily evaluation so there is existing data for synthesis context
    await createEvaluation(api, {
      type: 'daily',
      memberId,
      date: new Date().toISOString().slice(0, 10),
      projectIds: [projectId],
      description: `Daily work entry for ${suffix}`,
      workloadScore: 6,
    });
  });

  test('navigate to /evaluations and click Quarterly tab', async ({ page }) => {
    await page.goto('/evaluations');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1').filter({ hasText: 'Evaluations' })).toBeVisible({ timeout: 10_000 });

    // Click the Quarterly tab — use exact match to avoid ambiguity
    const quarterlyTab = page.getByRole('button', { name: 'Quarterly', exact: true });
    await quarterlyTab.click();
    await page.waitForLoadState('networkidle');

    // Verify the tab becomes active (the active class includes border-accent)
    await expect(quarterlyTab).toHaveClass(/border-accent/, { timeout: 10_000 });

    // The quarter selector and member selector should be visible
    await expect(page.locator('label', { hasText: 'Quarter' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('label', { hasText: 'Member' })).toBeVisible({ timeout: 10_000 });
  });

  test('select member and verify quarterly form appears', async ({ page }) => {
    await page.goto('/evaluations');
    await page.waitForLoadState('networkidle');

    // Switch to Quarterly tab
    await page.locator('button', { hasText: 'Quarterly' }).click();

    // Select the member using the member ID as value
    const memberSelect = page.locator('select').filter({ has: page.locator('option', { hasText: memberName }) });
    await memberSelect.selectOption(memberId);

    // The form should appear with "New Quarterly Evaluation" heading
    await expect(page.locator('text=New Quarterly Evaluation')).toBeVisible({ timeout: 10_000 });

    // Verify per-member mode buttons are shown
    await expect(page.locator('text=Evaluation Mode')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Per-member (all projects)' })).toBeVisible();

    // Verify the AI Synthesis button exists (we do not click it since no AI provider)
    await expect(page.locator('button', { hasText: 'AI Synthesis' })).toBeVisible();
  });

  test('fill description and score then save', async ({ page }) => {
    await page.goto('/evaluations');
    await page.waitForLoadState('networkidle');

    // Switch to Quarterly tab
    await page.locator('button', { hasText: 'Quarterly' }).click();

    // Select the member using the member ID as value
    const memberSelect = page.locator('select').filter({ has: page.locator('option', { hasText: memberName }) });
    await memberSelect.selectOption(memberId);
    await expect(page.locator('text=New Quarterly Evaluation')).toBeVisible({ timeout: 10_000 });

    // Verify per-member mode is active by default
    const perMemberBtn = page.locator('button', { hasText: 'Per-member (all projects)' });
    await expect(perMemberBtn).toHaveClass(/border-accent/, { timeout: 5_000 });

    // Fill the summary/description textarea
    await page.locator('textarea[placeholder*="Quarterly evaluation summary"]').fill(quarterlyDescription);

    // Fill workload score
    await page.locator('input[type="number"][min="1"][max="10"]').first().fill('8');

    // Click Save
    await page.locator('button', { hasText: 'Save Quarterly Evaluation' }).click();

    // Wait for save to complete
    await page.waitForTimeout(2_000);
  });

  test('switch to Log tab and verify quarterly evaluation listed', async ({ page }) => {
    await page.goto('/evaluations');
    await page.waitForLoadState('networkidle');

    // Click the "Evaluation Log" tab
    await page.locator('button', { hasText: 'Evaluation Log' }).click();
    await page.waitForLoadState('networkidle');

    // The log should show at least one "quarterly" type entry for our member (scope to main, not dropdown options)
    const mainContent = page.locator('main');
    await expect(mainContent.locator('td', { hasText: memberName }).first()).toBeVisible({ timeout: 15_000 });

    // Verify the "quarterly" type badge is present in the table
    await expect(mainContent.locator('text=quarterly').first()).toBeVisible({ timeout: 5_000 });
  });
});
