import { test, expect } from './fixtures.js';

test.describe('Student Examination & Proctoring Suite', () => {
  test('student dashboard tabs and join exam with code', async ({ page }) => {
    page.allowErrorStatus(401);
    await page.goto('/login');
    await page.locator('#email').fill('student1@examguard.test');
    await page.locator('#password').fill('Student1234');
    await page.locator('button[type="submit"]:has-text("Sign in")').click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'My exams' })).toBeVisible();
    await page.checkCleanDom();
    await page.capture('student-dashboard-normal');

    // Switch tabs: Live, Upcoming, Past, All
    const tabs = ['Live', 'Upcoming', 'Past', 'All'];
    for (const tab of tabs) {
      const tabBtn = page.getByRole('tab', { name: new RegExp(tab, 'i') }).first();
      if (await tabBtn.isVisible()) {
        await tabBtn.click();
        await page.waitForTimeout(150);
      }
    }

    // Join with code button
    const joinBtn = page.locator('button:has-text("Join with code")');
    await joinBtn.click();
    await expect(page.getByRole('heading', { name: 'Join an exam' })).toBeVisible();

    // Input join code
    const codeInput = page.locator('#join-code');
    await codeInput.fill('PHY-LIVE');
    await page.locator('button:has-text("Join exam")').click();
    await page.waitForLoadState('networkidle');

    await page.checkCleanDom();
  });

  test('instructions, attempt flow, anti-cheat, autosave, and result view', async ({ page }) => {
    page.allowErrorStatus(401);
    let capturedAttemptData = null;

    // Listen for attempt payload to verify data leak (Stage 3E)
    page.on('response', async (response) => {
      const url = response.url();
      if ((url.includes('/api/v1/exams/') && url.endsWith('/start')) || url.match(/\/api\/v1\/attempts\/[a-f0-9]{24}$/)) {
        if (response.status() === 200 || response.status() === 201) {
          try {
            const json = await response.json();
            if (json.data?.questions) {
              capturedAttemptData = json.data;
            }
          } catch {
            // Ignore non-json
          }
        }
      }
    });

    // Use a fresh student so desktop and mobile runs never collide
    const uniqueEmail = `student.attempt.${Date.now()}.${Math.floor(Math.random() * 1000)}@examguard.test`;
    await page.goto('/register');
    await page.locator('#name').fill('Attempt Test Student');
    await page.locator('#email').fill(uniqueEmail);
    await page.locator('#password').fill('Student1234');
    await page.locator('#confirmPassword').fill('Student1234');
    await page.locator('button[type="submit"]:has-text("Create account")').click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.waitForLoadState('networkidle');

    // Join PHY-LIVE exam
    await page.locator('button:has-text("Join with code")').click();
    await page.locator('#join-code').fill('PHY-LIVE');
    await page.locator('button:has-text("Join exam")').click();
    await page.waitForLoadState('networkidle');

    // Locate Physics Fundamentals card and click Start exam
    const startLink = page.locator('a:has-text("Start exam")').first();
    await expect(startLink).toBeVisible();
    await startLink.click();
    await page.waitForLoadState('networkidle');

    // Instructions page
    await expect(page).toHaveURL(/\/exams\/.*\/instructions/);
    await page.checkCleanDom();
    await page.capture('student-instructions-normal');

    // Agreement checkbox
    const agreeCheckbox = page.locator('input[type="checkbox"]');
    await agreeCheckbox.check();

    // Start button
    const startBtn = page.getByRole('button', { name: 'Start exam' });
    await expect(startBtn).toBeEnabled();
    await startBtn.click();
    await page.waitForLoadState('networkidle');

    // Now on Attempt Page
    await expect(page).toHaveURL(/\/attempts\/[a-f0-9]{24}/);
    await page.checkCleanDom();
    await page.capture('student-attempt-active');

    // Stage 3E Data Leak Verification:
    // Assert that NO question item contains correct answers or explanations
    expect(capturedAttemptData).not.toBeNull();
    for (const q of capturedAttemptData.questions) {
      expect(q.question).not.toHaveProperty('correctOptionIds');
      expect(q.question).not.toHaveProperty('numericAnswer');
      expect(q.question).not.toHaveProperty('explanation');
      if (q.question.options) {
        for (const opt of q.question.options) {
          expect(opt).not.toHaveProperty('isCorrect');
        }
      }
    }

    // Select an option (radio or checkbox or numeric)
    const options = page.locator('.option-row input');
    const numericInput = page.locator('input[id^="numeric-"]');
    if ((await options.count()) > 0) {
      await options.first().click();
      await expect(page.getByText(/saved|saving/i).first()).toBeVisible();
    } else if (await numericInput.isVisible()) {
      await numericInput.fill('42');
      await expect(page.getByText(/saved|saving/i).first()).toBeVisible();
    }

    // Mark question for review
    const markBtn = page.locator('button:has-text("Mark for review")').first();
    if (await markBtn.isVisible()) {
      await markBtn.click();
      await expect(page.locator('button:has-text("Marked for review")').first()).toBeVisible();
    }

    // Navigate using Question Palette
    const mobilePaletteBtn = page.locator('button:has-text("Palette")');
    if (await mobilePaletteBtn.isVisible()) {
      await mobilePaletteBtn.click();
      await page.waitForTimeout(200);
    }
    const paletteBtns = page.locator('.palette-cell:visible');
    if ((await paletteBtns.count()) > 1) {
      await paletteBtns.nth(1).click();
      await page.waitForTimeout(200);
    }

    // Anti-cheat verification: trigger window blur event
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
    });
    // Verify anti-cheat warning modal appears
    await expect(page.getByRole('heading', { name: 'Proctoring signal recorded' })).toBeVisible({ timeout: 5000 });
    const continueBtn = page.getByRole('button', { name: 'Continue attempt' });
    await continueBtn.click();
    await expect(page.getByRole('heading', { name: 'Proctoring signal recorded' })).not.toBeVisible();

    // Review & Submit modal
    const reviewBtn = page.locator('button:has-text("Review & submit")').first();
    await reviewBtn.click();
    await expect(page.getByRole('heading', { name: 'Submit this attempt?' })).toBeVisible();

    // Confirm submit
    const confirmBtn = page.getByRole('button', { name: 'Submit attempt' });
    await confirmBtn.click();
    await page.waitForLoadState('networkidle');

    // Verify Attempt Submitted confirmation screen
    await expect(page.getByRole('heading', { name: 'Attempt submitted' })).toBeVisible();
    await page.checkCleanDom();
    await page.capture('student-attempt-submitted');

    // If result is immediately available, view it
    const viewResultLink = page.locator('a:has-text("View result")');
    if (await viewResultLink.isVisible()) {
      await viewResultLink.click();
      await expect(page).toHaveURL(/\/attempts\/.*\/result/);
      await page.checkCleanDom();
      await page.capture('student-result-detail');
    }
  });

  test('resume in-progress attempt and save-and-exit', async ({ page }) => {
    page.allowErrorStatus(401);
    await page.goto('/login');
    await page.locator('#email').fill('student2@examguard.test');
    await page.locator('#password').fill('Student1234');
    await page.locator('button[type="submit"]:has-text("Sign in")').click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.waitForLoadState('networkidle');

    // Student 2 has an attempt: click Resume attempt
    const actionLink = page.locator('a:has-text("Resume attempt")').first();
    if (await actionLink.isVisible()) {
      await actionLink.click();
      await page.waitForLoadState('networkidle');

      if (page.url().includes('/attempts/')) {
        await page.checkCleanDom();
        // Click Save & Exit
        const exitBtn = page.locator('button:has-text("Save & exit")').first();
        if (await exitBtn.isVisible()) {
          await exitBtn.click();
          await expect(page).toHaveURL(/\/dashboard/);
          await page.checkCleanDom();
        }
      }
    }
  });
});
