import { expect, type Page } from '@playwright/test';

export function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function login(page: Page, username = 'admin', password = 'admin') {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /login/i }).click();
  await expect(page).toHaveURL(/\/admin/);
}

export async function createPost(
  page: Page,
  opts: { title?: string; content: string; tags?: string },
) {
  await page.goto('/admin/posts/new', { waitUntil: 'domcontentloaded' });

  if (opts.title) {
    await page.locator('#title').fill(opts.title);
  }
  await page.locator('#content').fill(opts.content);
  if (opts.tags) {
    await page.locator('#tags').fill(opts.tags);
  }

  await page.getByRole('button', { name: /create post/i }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
}

export async function acceptNextDialog(page: Page) {
  page.once('dialog', (dialog) => dialog.accept());
}
