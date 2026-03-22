import { test, expect, request as pwRequest } from '@playwright/test';
import { createProject, createMember, uid } from './helpers.js';

/**
 * Daily check-up journey: Navigate to evaluations -> Daily Check-Up tab ->
 * select member -> fill description + workload score -> save -> verify in Log.
 *
 * Uses `test.describe.serial()` because the save step depends on form fill.
 */
test.describe.serial('Daily check-up journey', () => {
  const suffix = uid();
  const memberName = `DailyMember ${suffix}`;
  const projectName = `DailyProject ${suffix}`;
  const evalDescription = `Worked on feature X during sprint ${suffix}`;
  let memberId: string;
  let projectId: string;

  test.beforeAll(async () => {
    const api = await pwRequest.newContext({ baseURL: 'http://localhost:24020' });
    const project = await createProject(api, projectName);
    projectId = project.id;
    const member = await createMember(api, memberName);
    memberId = member.id;
  });

  test('navigate to /evaluations and verify Daily Check-Up tab', async ({ page }) => {
    await page.goto('/evaluations');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1').filter({ hasText: 'Evaluations' })).toBeVisible({ timeout: 10_000 });

    // The "Daily Check-Up" tab should be visible and active by default
    const dailyTab = page.locator('button', { hasText: 'Daily Check-Up' });
    await expect(dailyTab).toBeVisible({ timeout: 10_000 });

    // Verify the tab has the active styling (border-accent)
    await expect(dailyTab).toHaveClass(/border-accent/, { timeout: 5_000 });
  });

  test('select a member and verify form appears', async ({ page }) => {
    await page.goto('/evaluations');
    await page.waitForLoadState('networkidle');

    // Select the member from the dropdown using the member ID as value
    const memberSelect = page.locator('select').filter({ has: page.locator('option', { hasText: memberName }) });
    await memberSelect.selectOption(memberId);

    // The form section "New Daily Check-Up" should appear
    await expect(page.locator('text=New Daily Check-Up')).toBeVisible({ timeout: 10_000 });

    // Verify the description textarea and workload score input are present
    await expect(page.locator('textarea[placeholder*="What did this member"]')).toBeVisible();
    await expect(page.locator('input[type="number"][min="1"][max="10"]').first()).toBeVisible();
  });

  test('fill description, select project, enter workload score, and save', async ({ page }) => {
    await page.goto('/evaluations');
    await page.waitForLoadState('networkidle');

    // Select member using the member ID value
    const memberSelect = page.locator('select').filter({ has: page.locator('option', { hasText: memberName }) });
    await memberSelect.selectOption(memberId);

    // Wait for the form to appear
    await expect(page.locator('text=New Daily Check-Up')).toBeVisible({ timeout: 10_000 });

    // Select the project checkbox -- click the label containing the project name
    const projectCheckbox = page.locator('label').filter({ hasText: projectName });
    await projectCheckbox.click();

    // Fill description
    await page.locator('textarea[placeholder*="What did this member"]').fill(evalDescription);

    // Fill workload score
    await page.locator('input[type="number"][min="1"][max="10"]').first().fill('7');

    // Click Save
    await page.locator('button', { hasText: 'Save Daily Check-Up' }).click();

    // Wait for save to complete (button text changes during save, then the toast appears)
    await page.waitForTimeout(2_000);
  });

  test('verify evaluation appears in the Log tab', async ({ page }) => {
    // Navigate directly to evaluations — fresh load to ensure saved data is fetched
    await page.goto('/evaluations');
    await page.waitForLoadState('networkidle');

    // Click the "Evaluation Log" tab
    const logTab = page.locator('button', { hasText: 'Evaluation Log' });
    await logTab.click();
    await page.waitForLoadState('networkidle');

    // The log should contain our evaluation — look in the main content area, not dropdowns
    const mainContent = page.locator('main');
    await expect(mainContent.locator('td', { hasText: memberName }).or(mainContent.locator('span', { hasText: memberName }))).toBeVisible({ timeout: 20_000 });

    // Also verify the "daily" type badge is present
    await expect(mainContent.locator('text=daily').first()).toBeVisible({ timeout: 10_000 });
  });
});
