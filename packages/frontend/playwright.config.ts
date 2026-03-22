import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:24020',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'cd ../.. && pnpm --filter @twle/vantage-frontend build && pnpm --filter @twle/vantage-backend dev',
    url: 'http://localhost:24020/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
