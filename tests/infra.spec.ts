import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { readFeedManifest } from './helpers/feed-manifest';

const drupalPort = process.env.DRUPAL_HTTP_PORT ?? '8080';
const drupalUrl = `http://127.0.0.1:${drupalPort}`;

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
