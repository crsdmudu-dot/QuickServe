import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

/**
 * Phase 3A — Connected admin-web journey lane (SEPARATE from the main config).
 *
 * Why separate: these tests drive the REAL admin web UI against the dedicated QA
 * Supabase project. The served Expo web app normally reads the app's own `.env`
 * (the app backend), so this lane starts `npm run web` with `EXPO_PUBLIC_SUPABASE_*`
 * OVERRIDDEN to the QA project's values (read from `qa/.env`) — a non-standard
 * environment override. The main `playwright.config.ts` (testDir `./playwright`)
 * never collects these specs (they live under `./web-journeys`), so `qa:release`
 * and the 116-test connected suite are completely unaffected.
 *
 * Run:  npm --prefix qa run qa:test:web   (self-starts the QA-pointed web server)
 * or:   BASE_URL=http://localhost:8081 ... (reuse an already-running server)
 *
 * No secret values are committed here — QA creds are read from `qa/.env` at runtime.
 */
dotenv.config({ path: path.resolve(__dirname, '.env') });

const QA_URL = process.env.QA_SUPABASE_URL;
const QA_ANON = process.env.QA_SUPABASE_ANON_KEY;
const BASE_URL = process.env.BASE_URL?.trim() || 'http://localhost:8081';
const USE_EXTERNAL = !!process.env.BASE_URL?.trim();

export default defineConfig({
  testDir: './web-journeys',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results/web', // under the gitignored test-results/
  fullyParallel: false, // serial — shared admin session + seeded booking state
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: USE_EXTERNAL
    ? undefined
    : {
        command: 'npm run web',
        cwd: '..',
        url: BASE_URL,
        timeout: 240_000,
        reuseExistingServer: true,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          BROWSER: 'none',
          // Point the served web app at the dedicated QA project (never production).
          EXPO_PUBLIC_SUPABASE_URL: QA_URL ?? '',
          EXPO_PUBLIC_SUPABASE_ANON_KEY: QA_ANON ?? '',
        },
      },
});
