import { defineConfig } from '@playwright/test';

const freshrssPort = process.env.FRESHRSS_HTTP_PORT ?? '8081';
const staticServerPort = process.env.STATIC_SERVER_HTTP_PORT ?? '8082';
const goBlogPort = process.env.GO_BLOG_HTTP_PORT ?? '8083';
const portainerPort = process.env.PORTAINER_HTTP_PORT ?? '8084';
const pgadminPort = process.env.PGADMIN_HTTP_PORT ?? '8085';
const minioApiPort = process.env.MINIO_API_PORT ?? '9002';

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
  metadata: {
    freshrssPort,
    staticServerPort,
    goBlogPort,
    portainerPort,
    pgadminPort,
    minioApiPort,
  },
});
