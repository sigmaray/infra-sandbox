import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

const pgadminPort = process.env.PGADMIN_HTTP_PORT ?? '8085';
const pgadminUrl = `http://127.0.0.1:${pgadminPort}`;
const pgadminEmail = 'admin@example.com';
const pgadminPassword = 'test-pgadmin';

async function loginToPgAdmin(page: Page) {
  await page.goto(`${pgadminUrl}/login`, { waitUntil: 'networkidle' });

  const emailField = page.getByRole('textbox', { name: /email address \/ username/i });
  await emailField.waitFor({ state: 'visible', timeout: 30_000 });
  await emailField.fill(pgadminEmail);
  await page.getByRole('textbox', { name: /^password$/i }).fill(pgadminPassword);
  await page.getByRole('button', { name: /^login$/i }).click();
  await page.waitForURL(/\/browser\//i, { timeout: 30_000 });
}

function objectExplorer(page: Page) {
  return page.getByRole('tabpanel', { name: 'Object Explorer' });
}

async function expandObjectExplorerNode(page: Page, label: string) {
  const explorer = objectExplorer(page);
  const node = explorer.getByText(label, { exact: true });
  await expect(node).toBeVisible({ timeout: 30_000 });
  await node.dblclick();
}

test.describe('pgAdmin', () => {
  test('serves the login page', async ({ page }) => {
    const response = await page.goto(`${pgadminUrl}/login`, { waitUntil: 'networkidle' });

    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/pgAdmin/i);
    await expect(page.getByRole('textbox', { name: /email address \/ username/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^password$/i })).toBeVisible();
  });

  test('admin can log in and see the preconfigured PostgreSQL server', async ({ page }) => {
    await loginToPgAdmin(page);

    await expandObjectExplorerNode(page, 'Servers');
    await expect(objectExplorer(page).getByText('shared-postgres', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('can reach shared-postgres from the pgAdmin container', () => {
    const output = execFileSync(
      'docker',
      [
        'exec',
        'pgadmin',
        'python3',
        '-c',
        "import socket; socket.create_connection(('shared-postgres', 5432), 5).close(); print('connected')",
      ],
      { encoding: 'utf8' },
    ).trim();

    expect(output).toBe('connected');
  });

  test('preconfigured server definition targets shared-postgres', () => {
    const config = execFileSync('docker', ['exec', 'pgadmin', 'cat', '/pgadmin4/servers.json'], {
      encoding: 'utf8',
    });

    expect(config).toContain('"Name": "shared-postgres"');
    expect(config).toContain('"Host": "shared-postgres"');
  });
});
