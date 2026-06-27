import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const drupalPort = process.env.DRUPAL_HTTP_PORT ?? '8080';
const freshrssPort = process.env.FRESHRSS_HTTP_PORT ?? '8081';

const drupalUrl = `http://127.0.0.1:${drupalPort}`;
const freshrssUrl = `http://127.0.0.1:${freshrssPort}`;
const goBlogPort = process.env.GO_BLOG_HTTP_PORT ?? '8083';
const goBlogUrl = `http://127.0.0.1:${goBlogPort}`;

const manifestPath = process.env.STATIC_SERVER_CONTENT_DIR
  ? path.join(process.env.STATIC_SERVER_CONTENT_DIR, 'manifest.json')
  : path.resolve(__dirname, '../static-server/content/manifest.json');

type FeedManifest = {
  feeds: Array<{
    fileName: string;
    channelTitle: string;
    feedUrl: string;
    hostFeedUrl: string;
    articles: Array<{
      title: string;
    }>;
  }>;
};

function readFeedManifest(): FeedManifest {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as FeedManifest;
}

async function loginToFreshrss(page: import('@playwright/test').Page) {
  await page.goto(`${freshrssUrl}/i/?c=auth&a=login`, {
    waitUntil: 'domcontentloaded',
  });

  await page.locator('#username').fill('admin');
  await page.locator('#passwordPlain').fill('test-admin');
  await expect(page.locator('#loginButton')).toBeEnabled({ timeout: 15_000 });
  await page.locator('#loginButton').click();

  await expect(page).not.toHaveURL(/auth/);
}

test.describe('Infrastructure stack', () => {
  test('PostgreSQL is healthy and databases are accessible', () => {
    const health = execFileSync(
      'docker',
      ['inspect', '--format', '{{.State.Health.Status}}', 'shared-postgres'],
      { encoding: 'utf8' },
    ).trim();

    expect(health).toBe('healthy');

    const databases = execFileSync(
      'docker',
      [
        'exec',
        'shared-postgres',
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-tAc',
        "SELECT datname FROM pg_database WHERE datname IN ('drupal', 'freshrss', 'goblog') ORDER BY datname",
      ],
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(Boolean);

    expect(databases).toEqual(['drupal', 'freshrss', 'goblog']);

    execFileSync(
      'docker',
      ['exec', 'shared-postgres', 'psql', '-U', 'drupal', '-d', 'drupal', '-c', 'SELECT 1'],
      { stdio: 'pipe' },
    );
    execFileSync(
      'docker',
      ['exec', 'shared-postgres', 'psql', '-U', 'freshrss', '-d', 'freshrss', '-c', 'SELECT 1'],
      { stdio: 'pipe' },
    );
    execFileSync(
      'docker',
      ['exec', 'shared-postgres', 'psql', '-U', 'goblog', '-d', 'goblog', '-c', 'SELECT 1'],
      { stdio: 'pipe' },
    );
  });

  test('Drupal serves the site homepage', async ({ page }) => {
    const response = await page.goto(`${drupalUrl}/`, { waitUntil: 'domcontentloaded' });

    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/My Drupal Site|Drupal/i);
    await expect(page.locator('body')).toContainText(/Drupal|My Drupal Site/i);
  });

  test('Drupal admin login page is available', async ({ page }) => {
    await page.goto(`${drupalUrl}/user/login`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#edit-name')).toBeVisible();
    await expect(page.locator('#edit-pass')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  });

  test('FreshRSS serves the login page', async ({ page }) => {
    const response = await page.goto(`${freshrssUrl}/`, { waitUntil: 'domcontentloaded' });

    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/FreshRSS/i);
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#passwordPlain')).toBeVisible();
    await expect(page.locator('#loginButton')).toBeVisible();
  });

  test('FreshRSS admin can log in', async ({ page }) => {
    await loginToFreshrss(page);
    await expect(page.locator('body')).toContainText(/FreshRSS|Subscription|Main stream/i);
  });

  test('static server hosts generated RSS feeds', async ({ request }) => {
    const manifest = readFeedManifest();
    expect(manifest.feeds.length).toBeGreaterThan(0);

    for (const feed of manifest.feeds) {
      const response = await request.get(feed.hostFeedUrl);
      expect(response.ok()).toBeTruthy();

      const body = await response.text();
      expect(body).toContain('<rss version="2.0">');
      expect(body).toContain(`<title>${feed.channelTitle}</title>`);

      for (const article of feed.articles) {
        expect(body).toContain(`<title>${article.title}</title>`);
      }
    }
  });

  test('FreshRSS imports articles from the static RSS feed', async ({ page }) => {
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

  test('go-blog serves the homepage', async ({ page }) => {
    const response = await page.goto(`${goBlogUrl}/`, { waitUntil: 'domcontentloaded' });

    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/Go Blog/i);
    await expect(page.locator('body')).toContainText(/Go Blog/i);
  });

  test('go-blog admin login page is available', async ({ page }) => {
    await page.goto(`${goBlogUrl}/login`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /login/i })).toBeVisible();
  });

  test('go-blog admin can log in', async ({ page }) => {
    await page.goto(`${goBlogUrl}/login`, { waitUntil: 'domcontentloaded' });

    await page.locator('#username').fill('admin');
    await page.locator('#password').fill('admin');
    await page.getByRole('button', { name: /login/i }).click();

    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator('body')).toContainText(/Dashboard|Logout/i);
  });
});
