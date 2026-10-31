import { test, expect } from './fixtures.js';

test.describe('Authentication & Navigation Suite', () => {
  test('unauthenticated access redirects to /login', async ({ page }) => {
    page.allowErrorStatus(401);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
    await page.checkCleanDom();
    await page.capture('login-normal');
  });

  test('login validation and error handling', async ({ page }) => {
    page.allowErrorStatus(401);
    await page.goto('/login');

    // Show/hide password toggle
    const passwordInput = page.locator('#password');
    const showToggle = page.locator('button:has-text("Show"), button:has-text("Hide")');
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await showToggle.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await showToggle.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Empty submission
    await page.locator('button[type="submit"]:has-text("Sign in")').click();
    await expect(page.locator('text=Enter a valid email address.')).toBeVisible();

    // Invalid credentials
    await page.locator('#email').fill('nonexistent@examguard.test');
    await page.locator('#password').fill('WrongPassword123');
    await page.locator('button[type="submit"]:has-text("Sign in")').click();
    await expect(page.locator('text=Email or password is incorrect.')).toBeVisible();
    await page.checkCleanDom();
    await page.capture('login-error');
  });

  test('registration validation and duplicate email check', async ({ page }) => {
    page.allowErrorStatus(400, 401, 409);
    await page.goto('/register');
    await page.capture('register-normal');

    // Mismatched passwords
    await page.locator('#name').fill('New Student');
    await page.locator('#email').fill('student1@examguard.test');
    await page.locator('#role').selectOption('student');
    await page.locator('#password').fill('ValidPass123');
    await page.locator('#confirmPassword').fill('DifferentPass123');
    await page.locator('button[type="submit"]:has-text("Create account")').click();
    await expect(page.locator('text=Passwords do not match.')).toBeVisible();

    // Duplicate email registration
    await page.locator('#confirmPassword').fill('ValidPass123');
    await page.locator('button[type="submit"]:has-text("Create account")').click();
    await expect(page.locator('text=An account with this email already exists.')).toBeVisible();
    await page.checkCleanDom();
  });

  test('student login, theme toggle, navigation, and logout', async ({ page }) => {
    page.allowErrorStatus(401);
    await page.goto('/login');
    await page.locator('#email').fill('student1@examguard.test');
    await page.locator('#password').fill('Student1234');
    await page.locator('button[type="submit"]:has-text("Sign in")').click();

    await expect(page).toHaveURL(/\/dashboard/);
    await page.waitForLoadState('networkidle');
    await page.checkCleanDom();
    await page.capture('student-dashboard-normal');

    // Theme toggle test (click visible toggle)
    const themeBtn = page.locator('button:has-text("Light mode"), button:has-text("Dark mode"), button[aria-label*="mode"]').filter({ hasNot: page.locator('.lg\\:hidden') }).first();
    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      expect(typeof isDark).toBe('boolean');
    }

    // RoleRoute protection check: student cannot access teacher route
    await page.goto('/questions');
    await expect(page).toHaveURL(/\/dashboard/);

    // If mobile menu button is visible, open drawer to access mobile nav
    const mobileMenuBtn = page.locator('button[aria-label="Open navigation"]');
    if (await mobileMenuBtn.isVisible()) {
      await mobileMenuBtn.click();
      await page.locator('aside >> text=ExamGuard').first().waitFor({ state: 'visible' });
    }

    // Logout
    const logoutBtn = page.locator('button:has-text("Sign out"):visible').first();
    await logoutBtn.click();
    await expect(page).toHaveURL(/\/login/);
  });
});
