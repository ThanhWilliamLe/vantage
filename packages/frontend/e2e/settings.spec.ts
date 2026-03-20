import { test, expect } from '@playwright/test';
import { uid } from './helpers.js';

test.describe.serial('Settings Journey', () => {
  const suffix = uid();

  test('settings page shows all 5 section tabs', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Verify the Settings heading
    await expect(page.locator('h1').filter({ hasText: 'Settings' })).toBeVisible({ timeout: 10_000 });

    // Verify all 5 section buttons are visible in the settings tab nav (not the sidebar)
    const settingsNav = page.locator('main nav ul');
    await expect(settingsNav.locator('button', { hasText: 'Projects' })).toBeVisible({ timeout: 5_000 });
    await expect(settingsNav.locator('button', { hasText: 'Members' })).toBeVisible({ timeout: 5_000 });
    await expect(settingsNav.locator('button', { hasText: 'Credentials' })).toBeVisible({ timeout: 5_000 });
    await expect(settingsNav.locator('button', { hasText: 'AI Provider' })).toBeVisible({ timeout: 5_000 });
    await expect(settingsNav.locator('button', { hasText: 'Access Password' })).toBeVisible({ timeout: 5_000 });
  });

  test('create a credential via the Credentials tab', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Click Credentials tab
    const credentialsTab = page.locator('nav').locator('button', { hasText: 'Credentials' });
    await credentialsTab.click();

    // Verify the Credentials section header loads
    await expect(page.locator('h2').filter({ hasText: 'Git Credentials' })).toBeVisible({ timeout: 10_000 });

    // Fill in the credential form
    // Name input (placeholder "Name")
    const nameInput = page.locator('input[placeholder="Name"]');
    await nameInput.fill(`Test Token ${suffix}`);

    // Platform select -- default is "github", which is what we want
    const platformSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'GitHub' }) });
    await platformSelect.selectOption('github');

    // Token input (placeholder "API Token", type="password")
    const tokenInput = page.locator('input[placeholder="API Token"]');
    await tokenInput.fill('ghp_test123');

    // Click "Add Credential" button
    const createButton = page.locator('button', { hasText: 'Add Credential' });
    await createButton.click();

    // Wait for the credential to appear in the list
    await page.waitForLoadState('networkidle');

    // Verify the credential shows up -- the list item shows name and platform
    const credItem = page.locator(`text=Test Token ${suffix}`);
    await expect(credItem).toBeVisible({ timeout: 10_000 });
  });

  test('create an AI provider via the AI Provider tab', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Click AI Provider tab
    const aiTab = page.locator('nav').locator('button', { hasText: 'AI Provider' });
    await aiTab.click();

    // Verify the AI Provider section header loads
    await expect(page.locator('h2').filter({ hasText: 'AI Provider' })).toBeVisible({ timeout: 10_000 });

    // Fill in provider form
    // Provider name input (placeholder "Provider name")
    const provNameInput = page.locator('input[placeholder="Provider name"]');
    await provNameInput.fill(`Test Provider ${suffix}`);

    // Type select -- default is "api", which is what we want
    const typeSelect = page.locator('select').filter({ has: page.locator('option[value="api"]') });
    await typeSelect.selectOption('api');

    // Model name input (placeholder "Model name")
    const modelInput = page.locator('input[placeholder="Model name"]');
    await modelInput.fill('test-model-v1');

    // Click "Add Provider" button
    const createButton = page.locator('button', { hasText: 'Add Provider' });
    await createButton.click();

    // Wait for the provider to appear in the list
    await page.waitForLoadState('networkidle');

    // Verify the provider shows up in the list
    const providerItem = page.locator(`text=Test Provider ${suffix}`);
    await expect(providerItem).toBeVisible({ timeout: 10_000 });
  });

  test('verify created credential persists on page reload', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Click Credentials tab (use list role to find the settings nav, not the sidebar)
    await page.getByRole('list').getByRole('button', { name: 'Credentials' }).click();
    await page.waitForLoadState('networkidle');

    // Verify credentials section is shown
    await expect(page.locator('h2').filter({ hasText: 'Git Credentials' })).toBeVisible({ timeout: 10_000 });

    // Verify the previously created credential is still present
    const credItem = page.locator(`text=Test Token ${suffix}`);
    await expect(credItem).toBeVisible({ timeout: 10_000 });

    // Verify it shows the github platform label (scope to main to avoid matching select options)
    const platformLabel = page.locator('main').locator('span', { hasText: 'github' }).first();
    await expect(platformLabel).toBeVisible({ timeout: 5_000 });
  });

  test('verify created AI provider persists on page reload', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.getByRole('list').getByRole('button', { name: 'AI Provider' }).click();
    await page.waitForLoadState('networkidle');

    // Verify AI Provider section is shown
    await expect(page.locator('h2').filter({ hasText: 'AI Provider' })).toBeVisible({ timeout: 10_000 });

    // Verify the previously created provider is still present
    const providerItem = page.locator(`text=Test Provider ${suffix}`);
    await expect(providerItem).toBeVisible({ timeout: 10_000 });
  });
});
