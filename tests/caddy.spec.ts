import { expect, test } from '@playwright/test';

test.describe('Caddy Reverse Proxy', () => {
  test('Drupal is accessible via subdomain on port 80', async ({ request }) => {
    const response = await request.get('http://127.0.0.1/', {
      headers: { Host: 'drupal.localhost' }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.text();
    expect(body).toMatch(/Drupal|My Drupal Site/i);
  });

  test('FreshRSS is accessible via subdomain on port 80', async ({ request }) => {
    const response = await request.get('http://127.0.0.1/', {
      headers: { Host: 'freshrss.localhost' }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.text();
    expect(body).toMatch(/FreshRSS/i);
  });

  test('Static Server (feeds) is accessible via subdomain on port 80', async ({ request }) => {
    const response = await request.get('http://127.0.0.1/manifest.json', {
      headers: { Host: 'feeds.localhost' }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('feeds');
  });

  test('Go Blog is accessible via subdomain on port 80', async ({ request }) => {
    const response = await request.get('http://127.0.0.1/', {
      headers: { Host: 'blog.localhost' }
    });
    expect(response.ok()).toBeTruthy();
  });
});
