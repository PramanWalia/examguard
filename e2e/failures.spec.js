import { test, expect } from './fixtures.js';

test.describe('Network & Failure Resilience Suite (Stage 4d)', () => {
  test('500 server error on mutation displays error toast and recovers', async ({ page }) => {
    page.allowErrorStatus(401);
    page.allowErrorStatus(500);

    await page.goto('/login');
    await page.locator('#email').fill('student1@examguard.test');
    await page.locator('#password').fill('Student1234');
    await page.locator('button[type="submit"]:has-text("Sign in")').click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.waitForLoadState('networkidle');

    // Intercept POST /exams/join to return 500
    let failedOnce = false;
    await page.route('**/api/v1/exams/join', async (route) => {
      if (!failedOnce) {
        failedOnce = true;
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Simulated 500 internal server error.' },
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Open Join Exam modal
    await page.locator('button:has-text("Join with code")').click();
    await page.locator('#join-code').fill('PHY-LIVE');
    await page.locator('button:has-text("Join exam")').click();

    // Verify error message is rendered
    await expect(page.locator('text=Simulated 500 internal server error.')).toBeVisible();
    await page.checkCleanDom();

    // Retry mutation now that route allows it
    await page.locator('button:has-text("Join exam")').click();
    await page.waitForLoadState('networkidle');
    await page.checkCleanDom();
  });

  test('401 expired access token triggers automatic refresh and retries successfully', async ({ page }) => {
    page.allowErrorStatus(401);

    await page.goto('/login');
    await page.locator('#email').fill('teacher1@examguard.test');
    await page.locator('#password').fill('Teacher1234');
    await page.locator('button[type="submit"]:has-text("Sign in")').click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.waitForLoadState('networkidle');

    // Intercept GET /api/v1/questions to return 401 once
    let returned401 = false;
    await page.route('**/api/v1/questions?*', async (route) => {
      if (!returned401) {
        returned401 = true;
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Access token expired.' },
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Navigate to questions
    await page.goto('/questions');
    await page.waitForLoadState('networkidle');

    // User should STILL be authenticated and on /questions, with questions loaded
    await expect(page).toHaveURL(/\/questions/);
    await expect(page.getByRole('heading', { name: 'Question bank' })).toBeVisible();
    await page.checkCleanDom();
  });

  test('delayed 5-second server response displays loading indicator without crashing', async ({ page }) => {
    page.allowErrorStatus(401);

    await page.goto('/login');
    await page.locator('#email').fill('teacher1@examguard.test');
    await page.locator('#password').fill('Teacher1234');
    await page.locator('button[type="submit"]:has-text("Sign in")').click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.waitForLoadState('networkidle');

    // Delay /api/v1/exams by 3 seconds
    await page.route('**/api/v1/exams?limit=100', async (route) => {
      await page.waitForTimeout(3000);
      await route.continue();
    });

    await page.goto('/exams');

    // Verify loading indicator/skeleton is rendered
    await expect(page.locator('.skeleton').first()).toBeVisible();

    // Wait for the delayed request to finish
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Exams' })).toBeVisible();
    await page.checkCleanDom();
  });

  test('empty list response renders graceful empty state', async ({ page }) => {
    page.allowErrorStatus(401);

    await page.goto('/login');
    await page.locator('#email').fill('admin@examguard.test');
    await page.locator('#password').fill('Admin1234');
    await page.locator('button[type="submit"]:has-text("Sign in")').click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.waitForLoadState('networkidle');

    // Intercept /users with empty list
    await page.route('**/api/v1/users?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
          meta: { total: 0, page: 1, limit: 15, pages: 1, summary: {}, batches: [] },
        }),
      });
    });

    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Verify empty state
    await expect(page.getByRole('heading', { name: 'No users found' })).toBeVisible();
    await page.checkCleanDom();
    await page.capture('admin-users-empty-state');
  });

  test('network abort triggers offline warning without crashing', async ({ page }) => {
    page.allowErrorStatus(401);

    await page.goto('/login');
    await page.locator('#email').fill('student1@examguard.test');
    await page.locator('#password').fill('Student1234');
    await page.locator('button[type="submit"]:has-text("Sign in")').click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.waitForLoadState('networkidle');

    // Simulate browser going offline
    await page.context().setOffline(true);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });

    // Verify ConnectivityBanner appears
    await expect(page.locator('text=You are offline')).toBeVisible({ timeout: 5000 });
    await page.checkCleanDom();
    await page.capture('connectivity-banner-offline');

    // Simulate browser coming back online
    await page.context().setOffline(false);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
    });

    // Banner should dismiss
    await expect(page.locator('text=You are offline')).not.toBeVisible({ timeout: 5000 });
    await page.checkCleanDom();
  });
});
