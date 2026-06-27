import { expect, test } from '@playwright/test';

test.describe('Caddy Reverse Proxy', () => {
  test('FreshRSS is accessible via subdomain on port 80', async ({ request }) => {
    const response = await request.get('http://freshrss.localhost/');
    expect(response.ok()).toBeTruthy();
    const body = await response.text();
    expect(body).toMatch(/FreshRSS/i);
  });

  test('Static Server (feeds) is accessible via subdomain on port 80', async ({ request }) => {
    const response = await request.get('http://feeds.localhost/manifest.json');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('feeds');
  });

  test('Go Blog is accessible via subdomain on port 80', async ({ request }) => {
    const response = await request.get('http://blog.localhost/');
    expect(response.ok()).toBeTruthy();
  });
});
