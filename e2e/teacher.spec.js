import { test, expect } from './fixtures.js';

test.describe('Teacher Assessment & Proctoring Suite', () => {
  test.beforeEach(async ({ page }) => {
    page.allowErrorStatus(401);
    await page.goto('/login');
    await page.locator('#email').fill('teacher1@examguard.test');
    await page.locator('#password').fill('Teacher1234');
    await page.locator('button[type="submit"]:has-text("Sign in")').click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.waitForLoadState('networkidle');
  });

  test('teacher dashboard and stat cards', async ({ page }) => {
    await expect(page.locator('text=Teacher workspace')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await page.checkCleanDom();
    await page.capture('teacher-dashboard-normal');

    // Quick action link to Question Bank
    await page.locator('a:has-text("Browse the question bank"), a:has-text("Question bank"):visible').first().click();
    await expect(page).toHaveURL(/\/questions/);
  });

  test('question bank filtering, creation, and validation', async ({ page }) => {
    await page.goto('/questions');
    await page.waitForLoadState('networkidle');
    await page.checkCleanDom();
    await page.capture('questions-list-normal');

    // Open question creation modal
    await page.locator('button:has-text("New question")').first().click();
    await expect(page.getByRole('heading', { name: 'Create question' })).toBeVisible();

    // Validation: prompt too short
    await page.locator('#q-prompt').fill('Hi');
    await page.getByRole('button', { name: 'Create question' }).click();
    await expect(page.locator('text=Prompt must be at least 5 characters.')).toBeVisible();

    // Option A and Option B texts
    await page.locator('#q-prompt').fill('What is the time complexity of binary search?');
    const optInputs = page.locator('input[placeholder*="Option text"]');
    if ((await optInputs.count()) >= 2) {
      await optInputs.nth(0).fill('O(log n)');
      await optInputs.nth(1).fill('O(n)');
    }

    // Select first option as correct
    const checkBtns = page.locator('button[title*="correct"]');
    if ((await checkBtns.count()) > 0) {
      await checkBtns.first().click();
    }

    // Save valid question
    await page.getByRole('button', { name: 'Create question' }).click();
    await page.waitForLoadState('networkidle');

    // Filter questions by search
    const searchInput = page.locator('#question-search');
    await searchInput.fill('binary search');
    await page.waitForTimeout(400); // debounce
    await page.checkCleanDom();
  });

  test('exam builder and publishing flow', async ({ page }) => {
    await page.goto('/exams/new');
    await page.waitForLoadState('networkidle');
    await page.checkCleanDom();
    await page.capture('exam-builder-step1');

    // Step 1: Basic Info
    await page.locator('#exam-title').fill('Automated E2E Exam');
    await page.locator('#exam-description').fill('Created by full suite automated test.');
    await page.locator('#exam-duration').fill('45');

    // Click Next -> Step 2
    await page.locator('button:has-text("Next →")').first().click();
    await expect(page.locator('text=Attempt rules')).toBeVisible();

    // Click Next -> Step 3
    await page.locator('button:has-text("Next →")').first().click();
    await expect(page.getByRole('heading', { name: 'Audience' })).toBeVisible();

    // Click Next -> Step 4
    await page.locator('button:has-text("Next →")').first().click();
    await expect(page.getByRole('heading', { name: 'Selected questions' })).toBeVisible();

    // Step 4: Add question from bank
    const addBtns = page.locator('button:has-text("Add")');
    if ((await addBtns.count()) > 0) {
      await addBtns.first().click();
    }

    // Click Next -> Step 5
    await page.locator('button:has-text("Next →")').first().click();
    await expect(page.getByRole('heading', { name: 'Review before you publish' })).toBeVisible();
    await page.capture('exam-builder-review');

    // Save draft
    await page.locator('button:has-text("Save draft")').first().click();
    await expect(page).toHaveURL(/\/exams\/[a-f0-9]{24}/);
    await page.checkCleanDom();
  });

  test('live monitor, analytics, and CSV export', async ({ page }) => {
    await page.goto('/exams');
    await page.waitForLoadState('networkidle');
    await page.checkCleanDom();
    await page.capture('exams-list-normal');

    // Navigate to Physics exam monitor if available
    const monitorLinks = page.locator('a:has-text("Monitor")');
    if ((await monitorLinks.count()) > 0) {
      await monitorLinks.first().click();
      await expect(page).toHaveURL(/\/exams\/.*\/monitor/);
      await expect(page.locator('text=Auto-refreshing every 10 seconds')).toBeVisible();
      await page.checkCleanDom();
      await page.capture('teacher-monitor-normal');
    }

    // Navigate to an exam's results
    await page.goto('/exams');
    const overviewLinks = page.locator('a:has-text("Overview")');
    if ((await overviewLinks.count()) > 0) {
      await overviewLinks.first().click();
      await page.waitForLoadState('networkidle');

      // Click Analytics link
      const analyticsLink = page.locator('a:has-text("Analytics")').first();
      if (await analyticsLink.isVisible()) {
        await analyticsLink.click();
        await expect(page).toHaveURL(/\/analytics/);
        await page.checkCleanDom();
        await page.capture('exam-analytics-normal');
      }

      // Click Results link
      const resultsLink = page.locator('a:has-text("Results")').first();
      if (await resultsLink.isVisible()) {
        await resultsLink.click();
        await expect(page).toHaveURL(/\/results/);
        await page.checkCleanDom();

        // Export CSV button
        const exportBtn = page.locator('button:has-text("Export CSV")');
        if (await exportBtn.isVisible()) {
          const downloadPromise = page.waitForEvent('download');
          await exportBtn.click();
          const download = await downloadPromise;
          expect(download.suggestedFilename()).toContain('.csv');
        }
      }
    }
  });
});
