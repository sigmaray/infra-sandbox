import { chromium } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  return readFileSync(filePath, 'utf8')
    .split('\n')
    .reduce<Record<string, string>>((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return env;
      }
      const separator = trimmed.indexOf('=');
      if (separator === -1) {
        return env;
      }
      env[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
      return env;
    }, {});
}

async function isDrupalInstalled(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/`, { redirect: 'follow' });
    return !response.url.includes('/core/install.php');
  } catch {
    return false;
  }
}

async function installDrupal() {
  const repoRoot = path.resolve(scriptDir, '..');
  const env = {
    ...loadEnv(path.join(repoRoot, 'drupal', '.env')),
    ...process.env,
  };

  const port = env.DRUPAL_HTTP_PORT ?? '8080';
  const baseUrl = `http://127.0.0.1:${port}`;

  if (await isDrupalInstalled(baseUrl)) {
    console.log('[install-drupal] Site already installed');
    return;
  }

  console.log('[install-drupal] Running web installer...');
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(`${baseUrl}/core/install.php?langcode=en`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    await page.getByRole('button', { name: /save and continue/i }).click();

    await page.getByLabel('PostgreSQL').check();
    await page.locator('#edit-drupalpgsqldriverdatabasepgsql-database').fill(
      env.DRUPAL_DATABASE_NAME ?? 'drupal',
    );
    await page.locator('#edit-drupalpgsqldriverdatabasepgsql-username').fill(
      env.DRUPAL_DATABASE_USER ?? 'drupal',
    );
    await page.locator('#edit-drupalpgsqldriverdatabasepgsql-password').fill(
      env.DRUPAL_DATABASE_PASSWORD ?? '',
    );
    await page.locator('#edit-drupalpgsqldriverdatabasepgsql').getByText('Advanced options').click();
    await page.locator('#edit-drupalpgsqldriverdatabasepgsql-host').fill(
      env.DRUPAL_DATABASE_HOST ?? 'shared-postgres',
    );
    await page.locator('#edit-drupalpgsqldriverdatabasepgsql-port').fill(
      env.DRUPAL_DATABASE_PORT ?? '5432',
    );
    await page.getByRole('button', { name: /save and continue/i }).click();

    await page.getByRole('button', { name: /save and continue/i }).click({ timeout: 300_000 });

    await page.getByLabel(/^site name/i).fill(env.DRUPAL_SITE_NAME ?? 'My Drupal Site');
    await page.getByLabel(/^site email address/i).fill(env.DRUPAL_ADMIN_EMAIL ?? 'admin@example.com');
    await page.locator('#edit-account-name').fill(env.DRUPAL_ADMIN_USER ?? 'admin');
    await page.locator('#edit-account-pass-pass1').fill(env.DRUPAL_ADMIN_PASSWORD ?? 'test-admin');
    await page.locator('#edit-account-pass-pass2').fill(env.DRUPAL_ADMIN_PASSWORD ?? 'test-admin');
    await page.locator('#edit-update-status-module-enable').uncheck({ force: true }).catch(() => undefined);
    await page.getByRole('button', { name: /save and continue/i }).click({ timeout: 120_000 });

    await page.waitForURL((url) => !url.pathname.includes('/core/install.php'), {
      timeout: 120_000,
    });
    console.log('[install-drupal] Installation complete');
  } finally {
    await browser.close();
  }
}

installDrupal().catch((error) => {
  console.error('[install-drupal] Failed:', error);
  process.exit(1);
});
