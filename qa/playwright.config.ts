import { defineConfig, devices } from '@playwright/test';

// Inline env resolution (Task 3 refactors this to `import { loadEnv } from './shared/env'`).
const providedBaseUrl = process.env.BASE_URL?.trim();
const BASE_URL = providedBaseUrl && providedBaseUrl.length > 0 ? providedBaseUrl : 'http://localhost:8081';
const START_SERVER = !(providedBaseUrl && providedBaseUrl.length > 0);
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './playwright',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 1 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: START_SERVER
    ? {
        command: 'npm run web',
        cwd: '..',
        url: BASE_URL,
        timeout: 180_000,
        reuseExistingServer: !CI,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { BROWSER: 'none' },
      }
    : undefined,
});
