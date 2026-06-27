import { expect, test, type Page } from '@playwright/test';
import { readFeedManifest } from './helpers/feed-manifest';

const freshrssPort = process.env.FRESHRSS_HTTP_PORT ?? '8081';
const freshrssUrl = `http://127.0.0.1:${freshrssPort}`;

async function loginToFreshrss(page: Page) {
  await page.goto(`${freshrssUrl}/i/?c=auth&a=login`, {
    waitUntil: 'domcontentloaded',
  });

  await page.locator('#username').fill('admin');
  await page.locator('#passwordPlain').fill('test-admin');
  await expect(page.locator('#loginButton')).toBeEnabled({ timeout: 15_000 });
  await page.locator('#loginButton').click();

  await expect(page).not.toHaveURL(/auth/);
}

test.describe('FreshRSS', () => {
  test('serves the login page', async ({ page }) => {
    const response = await page.goto(`${freshrssUrl}/`, { waitUntil: 'domcontentloaded' });

    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/FreshRSS/i);
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#passwordPlain')).toBeVisible();
    await expect(page.locator('#loginButton')).toBeVisible();
  });

  test('admin can log in', async ({ page }) => {
    await loginToFreshrss(page);
    await expect(page.locator('body')).toContainText(/FreshRSS|Subscription|Main stream/i);
  });

  test('imports articles from the static RSS feed', async ({ page }) => {
    const manifest = readFeedManifest();
    const [feed] = manifest.feeds;

    await loginToFreshrss(page);

    await page.goto(`${freshrssUrl}/i/?c=subscription&a=add`, {
      waitUntil: 'domcontentloaded',
    });

    await page.locator('#url_rss').fill(feed.feedUrl);
    await page.locator('#add_rss button[type="submit"]').click();

    const notification = page.getByRole('dialog');
    await expect(notification).toContainText(/has been added|already subscribed/i, {
      timeout: 30_000,
    });
    await page.getByRole('button', { name: '❌' }).click();

    await page.goto(`${freshrssUrl}/i/`, { waitUntil: 'domcontentloaded' });

    for (const article of feed.articles) {
      await expect(page.locator('body')).toContainText(article.title, { timeout: 30_000 });
    }
  });
});
