import { expect, test } from '@playwright/test';

const portainerPort = process.env.PORTAINER_HTTP_PORT ?? '8084';
const portainerUrl = `http://127.0.0.1:${portainerPort}`;
const adminPassword = 'test-portainer-admin-password';

test.describe('Portainer', () => {
  test('serves the login or setup page', async ({ page }) => {
    const response = await page.goto(`${portainerUrl}/`, { waitUntil: 'domcontentloaded' });

    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('body')).toContainText(/portainer/i);
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test('admin can authenticate via API and list the local Docker environment', async ({ request }) => {
    const authResponse = await request.post(`${portainerUrl}/api/auth`, {
      data: { Username: 'admin', Password: adminPassword },
    });
    expect(authResponse.ok()).toBeTruthy();

    const { jwt } = await authResponse.json();
    expect(jwt).toBeTruthy();

    const endpointsResponse = await request.get(`${portainerUrl}/api/endpoints`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    expect(endpointsResponse.ok()).toBeTruthy();

    const endpoints = (await endpointsResponse.json()) as Array<{ Name: string; URL: string }>;
    expect(endpoints.length).toBeGreaterThan(0);
    expect(endpoints.some((endpoint) => endpoint.URL.includes('docker.sock'))).toBeTruthy();
  });
});
