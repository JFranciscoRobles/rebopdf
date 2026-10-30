// The tests in a browser: the playground, driven as a person would.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'apps/playground/test',
  timeout: 45_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5300', trace: 'retain-on-failure' },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1280, height: 860 } } }],
  webServer: { command: 'npm run dev', url: 'http://localhost:5300', reuseExistingServer: true },
});
