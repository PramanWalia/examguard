import { test, expect } from './fixtures.js';

test.describe('Admin Workspace & User Management Suite', () => {
  test.beforeEach(async ({ page }) => {
    page.allowErrorStatus(401);
    await page.goto('/login');
    await page.locator('#email').fill('admin@examguard.test');
    await page.locator('#password').fill('Admin1234');
    await page.locator('button[type="submit"]:has-text("Sign in")').click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.waitForLoadState('networkidle');
  });

  test('admin dashboard and platform overview statistics', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Platform overview' })).toBeVisible();
    await expect(page.locator('text=Admin workspace')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Newest accounts' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Exam health' })).toBeVisible();

    await page.checkCleanDom();
    await page.capture('admin-dashboard-normal');

    // Click "Manage users" button to navigate to /users
    await page.locator('a:has-text("Manage users")').click();
    await expect(page).toHaveURL(/\/users/);
  });

  test('admin users table, search, filters, and account mutations', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    await page.checkCleanDom();
    await page.capture('admin-users-normal');

    // Filter by role: Teachers
    const roleSelect = page.locator('#user-role');
    await roleSelect.selectOption('teacher');
    await page.waitForTimeout(300);
    await page.checkCleanDom();

    // Clear filters
    const clearBtn = page.locator('button:has-text("Clear filters")');
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await page.waitForTimeout(300);
    }

    // Search for a user
    const searchInput = page.locator('#user-search');
    await searchInput.fill('student1');
    await page.waitForTimeout(400); // debounce
    await page.checkCleanDom();

    // Find the toggle switch for student1
    const student1Row = page.locator('tr:has-text("student1@examguard.test")');
    await expect(student1Row).toBeVisible();

    // Toggle active switch (Deactivate student1)
    const switchBtn = student1Row.locator('button[role="switch"]');
    if (await switchBtn.isVisible()) {
      await switchBtn.click();
      await expect(page.locator('text=User updated.').first()).toBeVisible();
      await page.waitForTimeout(400);

      // Toggle active switch back (Activate student1)
      await switchBtn.click();
      await expect(page.locator('text=User updated.').first()).toBeVisible();
      await page.waitForTimeout(400);
    }

    // Role select mutation for student1
    const roleDropdown = student1Row.locator('select[aria-label*="Role"]');
    if (await roleDropdown.isVisible()) {
      // Change to Teacher
      await roleDropdown.selectOption('teacher');
      await expect(page.locator('text=User updated.').first()).toBeVisible();
      await page.waitForTimeout(400);

      // Change back to Student
      await roleDropdown.selectOption('student');
      await expect(page.locator('text=User updated.').first()).toBeVisible();
      await page.waitForTimeout(400);
    }

    await page.checkCleanDom();
  });
});
