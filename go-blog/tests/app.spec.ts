import { expect, test } from '@playwright/test';

import { login } from './helpers';

test.describe('public', () => {
  test('serves the homepage', async ({ page }) => {
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });

    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/Go Blog/i);
    await expect(page.locator('body')).toContainText(/Go Blog/i);
  });

  test('redirects unauthenticated users from admin', async ({ page }) => {
    await page.goto('/admin/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('auth', () => {
  test('login page is available', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /login/i })).toBeVisible();
  });

  test('admin can log in and log out', async ({ page }) => {
    await login(page);
    await expect(page.locator('body')).toContainText(/Dashboard|Logout/i);

    await page.getByRole('button', { name: /logout/i }).click();
    await expect(page).toHaveURL(/\/(?:login)?$/);
  });

  test('rejects invalid credentials', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill('wrong-password');
    await page.getByRole('button', { name: /login/i }).click();

    await expect(page.locator('.error')).toContainText('Invalid username or password');
    await expect(page).toHaveURL(/\/login/);
  });
});
