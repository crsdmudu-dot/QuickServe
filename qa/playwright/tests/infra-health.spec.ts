import { test, expect } from '../fixtures';
import {
  ADMIN_SHELL_LANDMARK,
  installMockAdminSession,
  mockAdminSessionConfigured,
  MOCK_ADMIN_SESSION_SKIP_REASON,
  waitForAdminAuthOutcome,
} from '../support/mock-admin-session';
import { readDownloadText } from '../support/download';
import { LoginPage } from '../pages/admin/login.page';

/**
 * QA infrastructure health-tests (L1 — browser). Slice 43.
 *
 * These verify the shared QA infrastructure itself, not any application feature:
 * the mock session authenticates through the REAL guard (and does not bypass it),
 * the network guard actually detects stray auth traffic, and the download helper
 * preserves exact file bytes. Chromium-only (matches the admin-web feature policy).
 */
test.describe('QA infrastructure health (browser) @infra @meta', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Infra health browser tests are Chromium-only.');
    test.skip(!mockAdminSessionConfigured(), MOCK_ADMIN_SESSION_SKIP_REASON);
  });

  // H5 — mockAdminSession goes THROUGH the real admin application guard, and the same
  // guard redirects an unauthenticated visitor. Proves no guard bypass.
  test(
    'mockAdminSession authenticates through the real guard and does not bypass it',
    { tag: ['@p0'] },
    async ({ browser }) => {
      // (a) With the seeded admin session, the guard admits us to a protected screen.
      const authedCtx = await browser.newContext();
      const authed = await authedCtx.newPage();
      await installMockAdminSession(authed);
      await authed.goto('/analytics/detailed');

      // This assertion used to read the Executive KPIs heading straight after goto(). The admin
      // app is built with web.output "static", so that string is in the SERVER-RENDERED HTML:
      // the check passed before hydration, before AuthProvider settled and before the guard
      // could redirect. It therefore passed for three commits while the seeded key was wrong and
      // every other dashboard test was landing on /login.
      //
      // kpi-revenue is NOT usable either - it is also present in the exported
      // analytics/detailed.html. The admin shell sign-out control is: AdminShell renders it only
      // for an authorized admin, so it is absent from all exported HTML and from /login.
      const outcome = await waitForAdminAuthOutcome(authed);
      expect(outcome, 'the real guard must ACCEPT the seeded session').toBe('authenticated');

      const pathname = new URL(authed.url()).pathname;
      expect(pathname, 'must not have been redirected to the login route').not.toContain('login');
      expect(pathname.startsWith('/analytics/detailed'), 'stayed on the requested route').toBe(true);
      await expect(
        authed.getByRole('button', { name: ADMIN_SHELL_LANDMARK }).first(),
      ).toBeVisible();
      await authedCtx.close();

      // (b) WITHOUT any session, the SAME guard redirects to the admin login.
      const anonCtx = await browser.newContext();
      const anon = await anonCtx.newPage();
      const login = new LoginPage(anon);
      await anon.goto('/analytics/detailed');
      await expect(login.heading).toBeVisible();
      await expect(login.emailInput).toBeVisible();
      await anonCtx.close();
    },
  );

  // H6 — the network guard fails loudly on stray auth traffic (not decorative).
  test('the network guard detects unexpected auth traffic', { tag: ['@p1'] }, async ({ page }) => {
    const guard = await installMockAdminSession(page);
    await page.goto('/login');
    // Plant a stray /auth/v1 request; the guard's fail-loud route must record it.
    await page.evaluate(() => fetch('/auth/v1/token', { method: 'POST' }).catch(() => {}));
    await expect.poll(() => guard.authRequests.length).toBeGreaterThan(0);
    expect(() => guard.assertClean()).toThrow(/auth/i);
  });

  // H7 — the download helper returns exact bytes, incl. CSV quoting/escaping.
  test('readDownloadText preserves exact file content including escaping', { tag: ['@p2'] }, async ({ page }) => {
    await page.goto('/login');
    const expected = 'a,b\n"x,y","z""q"';
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate((content) => {
        const blob = new Blob([content], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'health.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }, expected),
    ]);
    expect(await readDownloadText(download)).toBe(expected);
  });
});
