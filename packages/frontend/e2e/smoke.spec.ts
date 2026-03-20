import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('smoke', () => {
  test('app loads and shows dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Vantage/i);
  });

  test('sidebar navigation is visible', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('nav, [role="navigation"], aside');
    await expect(sidebar.first()).toBeVisible({ timeout: 10_000 });
  });

  test('no critical accessibility violations on dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(critical).toHaveLength(0);
  });
});
