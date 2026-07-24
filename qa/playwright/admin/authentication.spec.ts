import { test, expect } from '../fixtures';
import { LoginPage } from '../pages/admin/login.page';
import { ADMIN_LOGIN_PATH } from '../support/auth';
import { loadEnv } from '../../shared/env';

/**
 * Admin Authentication — the reference automation suite for QuickServe.
 *
 * Scope: the admin sign-in behaviours a real administrator relies on —
 * the form renders, client validation blocks bad input, wrong credentials are
 * denied, protected routes require a session, and a valid admin reaches the
 * dashboard. Admin is a web app, so this is pure Playwright.
 *
 * Conventions this suite establishes for every future suite:
 *  - One Page Object per screen (`LoginPage`); specs never touch raw selectors.
 *  - Tags via Playwright's first-class `{ tag }` API: role (@admin), area
 *    (@authentication), suite membership (@smoke/@regression), priority (@p0…).
 *    Select with e.g. `--grep @smoke` or `--grep @p0`.
 *  - Deterministic waits only — we wait on real signals (a rendered element, an
 *    actual auth response), never on fixed timeouts.
 *  - The POM is constructed inside each test (safe under `fullyParallel`).
 *  - No application code is modified; locators target user-visible anchors only.
 *  - Failure diagnostics (screenshot / video / trace / HTML report) are produced
 *    automatically by the framework config — no per-test wiring needed.
 *
 * Backend gating: the render / validation / redirect tests are pure client-side
 * and run in any environment. The two tests that require a live, reachable
 * Supabase backend (invalid-credential rejection and the authenticated happy
 * path) are gated on `E2E_ADMIN_*` being configured — a proxy for "a real,
 * network-connected environment." Offline they skip cleanly; in CI (creds +
 * network) they run fully. The suite is therefore deterministically green in
 * both places.
 */

const env = loadEnv();

/** True when a real, reachable backend is available (admin creds configured). */
const backendConfigured = env.hasAdminCreds;

test.describe('Admin Authentication', { tag: ['@admin', '@authentication'] }, () => {
  test(
    'renders the admin login form',
    { tag: ['@smoke', '@p0', '@regression'] },
    async ({ page }) => {
      const login = new LoginPage(page);
      await login.goto();

      await expect(login.heading).toBeVisible();
      await expect(login.emailInput).toBeVisible();
      await expect(login.passwordInput).toBeVisible();
      await expect(login.submitButton).toBeVisible();
    },
  );

  test(
    'blocks submission of empty credentials with required-field validation',
    { tag: ['@p0', '@regression'] },
    async ({ page, logger }) => {
      const login = new LoginPage(page);
      await login.goto();

      await login.submit();

      // Client-side validation surfaces both messages and blocks the request.
      await expect(login.emailRequiredError).toBeVisible();
      await expect(login.passwordRequiredError).toBeVisible();
      // Still on the login screen — nothing was submitted.
      await expect(login.emailInput).toBeVisible();
      logger.info('Empty-credential submit correctly blocked by client validation.');
    },
  );

  test(
    'rejects a malformed email address',
    { tag: ['@p1', '@regression'] },
    async ({ page }) => {
      const login = new LoginPage(page);
      await login.goto();

      // `not-an-email` has no "@" → the app's client validation flags it.
      await login.fill('not-an-email', 'irrelevant');
      // Barrier: confirm the controlled state committed before submitting.
      await expect(login.emailInput).toHaveValue('not-an-email');
      await login.submit();

      await expect(login.invalidEmailError).toBeVisible();
      await expect(login.emailInput).toBeVisible();
    },
  );

  test(
    'denies invalid credentials and never reaches the dashboard',
    { tag: ['@p0', '@security', '@regression'] },
    async ({ page, testData, logger }) => {
      test.skip(!backendConfigured, 'Requires a reachable Supabase backend (configure E2E_ADMIN_*).');
      const login = new LoginPage(page);
      await login.goto();

      // A syntactically-valid but non-existent account (unique + deterministic).
      // Wait on the REAL auth round-trip so the assertion can't race ahead.
      const [authResponse] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/auth/v1/token'), { timeout: 15_000 }),
        login.login(testData.email(), 'wrong-password-123'),
      ]);

      // Supabase rejects bad credentials with a 4xx — access is denied...
      expect(authResponse.status()).toBeGreaterThanOrEqual(400);
      // ...and we remain on the admin login, never inside the admin shell.
      await expect(login.emailInput).toBeVisible();
      await expect(page.getByText('Dashboard', { exact: true })).toHaveCount(0);
      logger.info(`Invalid credentials denied (auth status ${authResponse.status()}).`);
      // We deliberately do NOT assert the exact backend error copy — it is
      // Supabase-owned and would make the test brittle. The 4xx + "still on
      // login" pair is the stable, security-meaningful signal.
    },
  );

  test(
    'redirects an unauthenticated visitor from a protected route to the login',
    { tag: ['@p0', '@security', '@regression'] },
    async ({ page }) => {
      const login = new LoginPage(page);

      // Fresh, unauthenticated context hitting a protected admin route.
      await page.goto('/(admin-web)/bookings');

      // The (admin-web) guard has no session → redirects to the admin login.
      // We assert the *rendered* admin login (heading + email), not the URL:
      // Expo Router strips route groups from the browser URL, so a path check
      // would be unreliable. The rendered form is the robust oracle.
      await expect(login.heading).toBeVisible();
      await expect(login.emailInput).toBeVisible();
    },
  );

  test(
    'signs a valid admin in and reaches the dashboard',
    { tag: ['@smoke', '@p0', '@regression'] },
    async ({ page, logger }) => {
      test.skip(
        !backendConfigured,
        'Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (pre-existing admin account) to run the authenticated happy path.',
      );
      const login = new LoginPage(page);
      await login.goto();

      await login.login(env.adminEmail as string, env.adminPassword as string);

      // Left the login screen and entered the authenticated admin shell.
      await expect(login.emailInput).toBeHidden();
      await expect(page.getByText('Dashboard', { exact: true })).toBeVisible();
      logger.info('Valid admin signed in and reached the dashboard.');
    },
  );
});
