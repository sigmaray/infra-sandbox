import { defineConfig } from '@playwright/test';

const goBlogPort =
  process.env.SKIP_DOCKER_SETUP === '1'
    ? (process.env.GO_BLOG_HTTP_PORT ?? '8083')
    : (process.env.GO_BLOG_HTTP_PORT ?? '18083');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 120_000,
  expect: {
    timeout: 30_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${goBlogPort}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
});
