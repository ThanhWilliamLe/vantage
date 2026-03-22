/**
 * Marketing asset capture — screenshots + demo video.
 * Run with: npx playwright test capture-marketing --project=chromium
 *
 * Captures 5 screenshots + 1 video for README and landing page.
 * Output: ../../../7A-marketing/assets/
 */
import { test, expect } from '@playwright/test';
import { uid, createProject, createMember, addIdentity, createFixtureRepo, addRepository, triggerScan, createEvaluation } from './helpers.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);
const ASSETS_DIR = join(__dir, '..', '..', '..', '..', '7A-marketing', 'assets');
const suffix = uid();

// Shared state across tests
let projectIds: string[] = [];
let memberIds: string[] = [];

test.describe.serial('Marketing Asset Capture', () => {

  test.beforeAll(async ({ request }) => {
    // Seed realistic demo data — 3 projects, 5 members
    const projects = [
      { name: `Payments API ${suffix}`, desc: 'Core payment processing service' },
      { name: `Web Dashboard ${suffix}`, desc: 'Customer-facing React dashboard' },
      { name: `Auth Service ${suffix}`, desc: 'Authentication and authorization service' },
    ];
    for (const p of projects) {
      const proj = await createProject(request, p.name, p.desc);
      projectIds.push(proj.id);
    }

    const members = [
      { name: `Alice Chen ${suffix}`, email: `alice.chen.${suffix}@company.com` },
      { name: `Bob Martinez ${suffix}`, email: `bob.martinez.${suffix}@company.com` },
      { name: `Carol Kim ${suffix}`, email: `carol.kim.${suffix}@company.com` },
      { name: `David Park ${suffix}`, email: `david.park.${suffix}@company.com` },
      { name: `Eva Singh ${suffix}`, email: `eva.singh.${suffix}@company.com` },
    ];
    for (const m of members) {
      const mem = await createMember(request, m.name);
      memberIds.push(mem.id);
      await addIdentity(request, mem.id, 'email', m.email);
    }

    // Create fixture repos and scan
    for (const pid of projectIds) {
      const repoPath = createFixtureRepo(`mkt-${suffix}`);
      await addRepository(request, pid, repoPath);
    }
    await triggerScan(request);

    // Seed evaluations
    for (let i = 0; i < 3; i++) {
      await createEvaluation(request, {
        type: 'daily',
        memberId: memberIds[i],
        date: `2026-03-${20 + i}`,
        projectIds: [projectIds[i]],
        description: [
          'Solid progress on payment validation refactor. Clean separation of concerns.',
          'Completed dashboard chart components. Good test coverage, responsive design.',
          'Fixed OAuth token refresh race condition. Critical security improvement.',
        ][i],
        workloadScore: [7, 6, 8][i],
      });
    }
  });

  test('1-dashboard', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Wait for dashboard content to render
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(ASSETS_DIR, 'screenshot-dashboard.png'), fullPage: false });
  });

  test('2-review-queue', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/reviews');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(ASSETS_DIR, 'screenshot-review-queue.png'), fullPage: false });
  });

  test('3-review-detail', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/reviews');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    // Click first review item to open detail
    const firstItem = page.locator('main').locator('tr, [role="row"], li, article').first();
    if (await firstItem.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstItem.click();
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: join(ASSETS_DIR, 'screenshot-review-detail.png'), fullPage: false });
  });

  test('4-workload-charts', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/workload');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: join(ASSETS_DIR, 'screenshot-workload.png'), fullPage: false });
  });

  test('5-evaluations', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/evaluations');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(ASSETS_DIR, 'screenshot-evaluations.png'), fullPage: false });
  });

  test('6-settings', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/settings?tab=credentials');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: join(ASSETS_DIR, 'screenshot-settings.png'), fullPage: false });
  });

  test('7-demo-video', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: ASSETS_DIR, size: { width: 1280, height: 800 } },
    });
    const page = await context.newPage();

    // Scene 1: Dashboard
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Scene 2: Navigate to reviews
    const reviewNav = page.locator('nav, aside').locator('a, button').filter({ hasText: /review/i }).first();
    if (await reviewNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await reviewNav.click();
    } else {
      await page.goto('/reviews');
    }
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Scene 3: Click a review item
    const reviewItem = page.locator('main').locator('tr, [role="row"], li, article').first();
    if (await reviewItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await reviewItem.click();
      await page.waitForTimeout(2000);
    }

    // Scene 4: Navigate to workload
    const workloadNav = page.locator('nav, aside').locator('a, button').filter({ hasText: /workload/i }).first();
    if (await workloadNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await workloadNav.click();
    } else {
      await page.goto('/workload');
    }
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Scene 5: Navigate to evaluations
    const evalNav = page.locator('nav, aside').locator('a, button').filter({ hasText: /evaluation/i }).first();
    if (await evalNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await evalNav.click();
    } else {
      await page.goto('/evaluations');
    }
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await context.close(); // This saves the video
  });
});
