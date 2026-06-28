import { expect, test } from '@playwright/test';

import { acceptNextDialog, login, uniqueId } from './helpers';

test.describe.serial('users', () => {
  test('lists users in admin panel', async ({ page }) => {
    await login(page);
    await page.goto('/admin/users', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    await expect(page.locator('body')).toContainText('admin');
    await expect(page.getByRole('link', { name: 'Create New User' })).toBeVisible();
  });

  test('creates a user', async ({ page }) => {
    await login(page);
    const username = uniqueId('e2e-user');

    await page.goto('/admin/users/new', { waitUntil: 'domcontentloaded' });
    await page.locator('#username').fill(username);
    await page.locator('#password').fill('test-password');
    await page.locator('#password_confirm').fill('test-password');
    await page.getByRole('button', { name: /create user/i }).click();

    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.locator('body')).toContainText(username);
  });

  test('new user can log in', async ({ page }) => {
    const username = uniqueId('e2e-login-user');
    const password = 'login-test-password';

    await login(page);
    await page.goto('/admin/users/new', { waitUntil: 'domcontentloaded' });
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('#password_confirm').fill(password);
    await page.getByRole('button', { name: /create user/i }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);

    await page.getByRole('button', { name: /logout/i }).click();
    await login(page, username, password);
    await expect(page.locator('body')).toContainText(/Dashboard|Logout/i);
  });

  test('edits a user', async ({ page }) => {
    await login(page);
    const username = uniqueId('e2e-edit-user');
    const updatedUsername = uniqueId('e2e-edit-user-renamed');

    await page.goto('/admin/users/new', { waitUntil: 'domcontentloaded' });
    await page.locator('#username').fill(username);
    await page.locator('#password').fill('edit-password');
    await page.locator('#password_confirm').fill('edit-password');
    await page.getByRole('button', { name: /create user/i }).click();

    const row = page.locator('tr').filter({ hasText: username });
    await row.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByRole('heading', { name: 'Edit User' })).toBeVisible();

    await page.locator('#username').fill(updatedUsername);
    await page.getByRole('button', { name: /update user/i }).click();

    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.locator('body')).toContainText(updatedUsername);
    await expect(page.locator('body')).not.toContainText(username);
  });

  test('deletes a user', async ({ page }) => {
    await login(page);
    const username = uniqueId('e2e-delete-user');

    await page.goto('/admin/users/new', { waitUntil: 'domcontentloaded' });
    await page.locator('#username').fill(username);
    await page.locator('#password').fill('delete-password');
    await page.locator('#password_confirm').fill('delete-password');
    await page.getByRole('button', { name: /create user/i }).click();

    await acceptNextDialog(page);
    const row = page.locator('tr').filter({ hasText: username });
    await row.getByRole('button', { name: 'Delete' }).click();

    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.locator('body')).not.toContainText(username);
  });
});
