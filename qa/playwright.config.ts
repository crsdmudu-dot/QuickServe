import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from './shared/env';
import { ADMIN_SERVER_COMMAND, ADMIN_SERVER_CWD, ADMIN_TEST_READY_URL } from './shared/qa-target';

const env = loadEnv();
const { BASE_URL, START_SERVER, CI } = env;

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
  globalSetup: require.resolve('./playwright/support/global-setup'),
  globalTeardown: require.resolve('./playwright/support/global-teardown'),
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
        // The suite drives the ADMIN application, not the consumer app. Administration was
        // separated into apps/admin, so the admin routes (/login, /dashboard, /analytics, ...)
        // are served by that project at its app root; the consumer app no longer has them at
        // all, and launching it here would 404 on every admin route.
        //
        // The command, the working directory and the base URL all come from the single set of
        // constants in shared/qa-target.ts, so the port in the command can never drift from the
        // port in the URL.
        //
        // reuseExistingServer is FALSE, unconditionally. Attaching to a process this suite did
        // not start is the vulnerability being closed here: the loopback guard cannot tell a
        // managed admin instance from an unrelated dev server on the same port, so a stray
        // server would have been accepted and then driven with real credentials. With reuse
        // disabled an occupied port makes Playwright fail to start the server, and the run stops
        // before global setup and before any credential is submitted.
        command: ADMIN_SERVER_COMMAND,
        cwd: ADMIN_SERVER_CWD,
        // Readiness is probed against /login, not the origin root. The admin application has no
        // `/` route, so the root answers 404, and Playwright does not treat 404 as ready — it
        // re-requests the root until the timeout expires and the run dies before global setup.
        // use.baseURL below stays the bare origin: this URL decides only when the server is up.
        url: ADMIN_TEST_READY_URL,
        timeout: 180_000,
        reuseExistingServer: false,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { BROWSER: 'none' },
      }
    : undefined,
});
