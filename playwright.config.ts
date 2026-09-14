import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  expect: { timeout: 30_000 },
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:3000', reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'landscape-tablet', use: { ...devices['iPad (gen 7) landscape'], deviceScaleFactor: 1 } },
  ],
});
