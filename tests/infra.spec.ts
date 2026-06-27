import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { readFeedManifest } from './helpers/feed-manifest';

const freshrssPort = process.env.FRESHRSS_HTTP_PORT ?? '8081';
const freshrssUrl = `http://127.0.0.1:${freshrssPort}`;
const goBlogPort = process.env.GO_BLOG_HTTP_PORT ?? '8083';
const goBlogUrl = `http://127.0.0.1:${goBlogPort}`;

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
        "SELECT datname FROM pg_database WHERE datname IN ('freshrss', 'goblog') ORDER BY datname",
      ],
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(Boolean);

    expect(databases).toEqual(['freshrss', 'goblog']);
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

  test('FreshRSS serves the login page', async ({ page }) => {
    const response = await page.goto(`${freshrssUrl}/`, { waitUntil: 'domcontentloaded' });

    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/FreshRSS/i);
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#passwordPlain')).toBeVisible();
  });

  test('Go Blog serves the homepage', async ({ page }) => {
    const response = await page.goto(`${goBlogUrl}/`, { waitUntil: 'domcontentloaded' });

    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/Go Blog/i);
    await expect(page.locator('body')).toContainText(/Go Blog/i);
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
});
