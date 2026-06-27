import { defineConfig } from '@playwright/test';

const drupalPort = process.env.DRUPAL_HTTP_PORT ?? '8080';
const freshrssPort = process.env.FRESHRSS_HTTP_PORT ?? '8081';
const staticServerPort = process.env.STATIC_SERVER_HTTP_PORT ?? '8082';

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
    baseURL: `http://127.0.0.1:${drupalPort}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  metadata: {
    drupalPort,
    freshrssPort,
    staticServerPort,
  },
});
