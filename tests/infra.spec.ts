import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

const drupalPort = process.env.DRUPAL_HTTP_PORT ?? '8080';
const freshrssPort = process.env.FRESHRSS_HTTP_PORT ?? '8081';

const drupalUrl = `http://127.0.0.1:${drupalPort}`;
const freshrssUrl = `http://127.0.0.1:${freshrssPort}`;

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
        "SELECT datname FROM pg_database WHERE datname IN ('drupal', 'freshrss') ORDER BY datname",
      ],
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(Boolean);

    expect(databases).toEqual(['drupal', 'freshrss']);

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
    await page.goto(`${freshrssUrl}/i/?c=auth&a=login`, {
      waitUntil: 'domcontentloaded',
    });

    await page.locator('#username').fill('admin');
    await page.locator('#passwordPlain').fill('test-admin');
    await expect(page.locator('#loginButton')).toBeEnabled({ timeout: 15_000 });
    await page.locator('#loginButton').click();

    await expect(page).not.toHaveURL(/auth/);
    await expect(page.locator('body')).toContainText(/FreshRSS|Subscription|Main stream/i);
  });
});
