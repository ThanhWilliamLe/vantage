import { test, expect, request as pwRequest } from '@playwright/test';
import {
  uid,
  createFixtureRepo,
  createProject,
  createMember,
  addIdentity,
  addRepository,
  triggerScan,
  createEvaluation,
} from './helpers.js';

test.describe.serial('Member Drilldown Journey', () => {
  const suffix = uid();
  const projectName = `MemberProj-${suffix}`;
  const memberName = `Bob-${suffix}`;
  let projectId: string;
  let memberId: string;

  test.beforeAll(async () => {
    const api = await pwRequest.newContext({ baseURL: 'http://localhost:24020' });

    // Seed project
    const project = await createProject(api, projectName, 'Member drilldown e2e');
    projectId = project.id;

    // Seed member
    const member = await createMember(api, memberName);
    memberId = member.id;
    await addIdentity(api, memberId, 'email', 'alice@example.com');

    // Create fixture repo, attach, scan
    const repoPath = createFixtureRepo(`member-drill-${suffix}`);
    await addRepository(api, projectId, repoPath);
    await triggerScan(api);

    // Create an evaluation for this member
    await createEvaluation(api, {
      type: 'daily',
      memberId,
      date: new Date().toISOString().slice(0, 10),
      projectIds: [projectId],
      description: `E2E eval for ${memberName}`,
      workloadScore: 7,
    });

    await api.dispose();
  });

  test('members list shows the seeded member', async ({ page }) => {
    await page.goto('/members');
    await page.waitForLoadState('networkidle');

    // Verify the Members heading
    await expect(page.locator('h1').filter({ hasText: 'Members' })).toBeVisible({ timeout: 10_000 });

    // Verify the member table is visible
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    // Verify our seeded member appears in the table
    const memberCell = table.locator('td').filter({ hasText: memberName });
    await expect(memberCell).toBeVisible({ timeout: 10_000 });
  });

  test('click member row navigates to member detail', async ({ page }) => {
    await page.goto('/members');
    await page.waitForLoadState('networkidle');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    // Click the row containing our member
    const memberRow = table.locator('tr').filter({ hasText: memberName });
    await memberRow.click();

    // Verify navigation to member detail page
    await page.waitForURL(`**/members/${memberId}`, { timeout: 10_000 });

    // Verify member name is displayed on the detail page
    await expect(page.locator('h1').filter({ hasText: memberName })).toBeVisible({ timeout: 10_000 });
  });

  test('member detail page shows reviews, evaluations, and project sections', async ({ page }) => {
    await page.goto(`/members/${memberId}`);
    await page.waitForLoadState('networkidle');

    // Verify member name is displayed
    await expect(page.locator('h1').filter({ hasText: memberName })).toBeVisible({ timeout: 10_000 });

    // Verify section headings exist: Pending Reviews, Identity Mappings, Project Assignments, Evaluation History
    await expect(page.locator('h2').filter({ hasText: 'Pending Reviews' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('h2').filter({ hasText: 'Identity Mappings' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('h2').filter({ hasText: 'Project Assignments' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('h2').filter({ hasText: 'Evaluation History' })).toBeVisible({ timeout: 10_000 });

    // Verify the evaluation we created is visible
    const evalItem = page.locator(`text=E2E eval for ${memberName}`);
    await expect(evalItem).toBeVisible({ timeout: 10_000 });
  });

  test('click project link on member detail navigates to project page', async ({ page }) => {
    await page.goto(`/members/${memberId}`);
    await page.waitForLoadState('networkidle');

    // Wait for the Project Assignments section to load
    await expect(page.locator('h2').filter({ hasText: 'Project Assignments' })).toBeVisible({ timeout: 10_000 });

    // The member needs to be assigned to the project first.
    // Use the "Assign to Project" form to assign.
    const assignForm = page.locator('text=Assign to Project').locator('..');
    const projectSelect = assignForm.locator('select');
    await projectSelect.selectOption(projectId);

    const assignButton = assignForm.locator('button', { hasText: 'Assign' });
    await assignButton.click();

    // Wait for the assignment to appear
    await page.waitForLoadState('networkidle');

    // Now click the project name in the assignment row (it's a span inside a clickable div)
    const mainContent = page.locator('main');
    const projectLink = mainContent.locator('span.text-accent-text', { hasText: projectName });
    await expect(projectLink).toBeVisible({ timeout: 10_000 });
    await projectLink.click();

    // Verify navigation to project detail page
    await page.waitForURL(`**/projects/${projectId}`, { timeout: 10_000 });

    // Verify project name on the detail page
    await expect(page.locator('h1').filter({ hasText: projectName })).toBeVisible({ timeout: 10_000 });
  });
});
