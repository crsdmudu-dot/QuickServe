import { test, expect } from '../fixtures';
import { installMockAdminSession } from '../support/mock-admin-session';
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
  });

  // H5 — mockAdminSession goes THROUGH the real (admin-web) guard, and the same
  // guard redirects an unauthenticated visitor. Proves no guard bypass.
  test(
    'mockAdminSession authenticates through the real guard and does not bypass it',
    { tag: ['@p0'] },
    async ({ browser }) => {
      // (a) With the seeded admin session, the guard admits us to a protected screen.
      const authedCtx = await browser.newContext();
      const authed = await authedCtx.newPage();
      await installMockAdminSession(authed);
      await authed.goto('/(admin-web)/analytics/detailed');
      await expect(authed.getByText('Executive KPIs', { exact: true })).toBeVisible();
      await authedCtx.close();

      // (b) WITHOUT any session, the SAME guard redirects to the admin login.
      const anonCtx = await browser.newContext();
      const anon = await anonCtx.newPage();
      const login = new LoginPage(anon);
      await anon.goto('/(admin-web)/analytics/detailed');
      await expect(login.heading).toBeVisible();
      await expect(login.emailInput).toBeVisible();
      await anonCtx.close();
    },
  );

  // H6 — the network guard fails loudly on stray auth traffic (not decorative).
  test('the network guard detects unexpected auth traffic', { tag: ['@p1'] }, async ({ page }) => {
    const guard = await installMockAdminSession(page);
    await page.goto('/(admin-web)/login');
    // Plant a stray /auth/v1 request; the guard's fail-loud route must record it.
    await page.evaluate(() => fetch('/auth/v1/token', { method: 'POST' }).catch(() => {}));
    await expect.poll(() => guard.authRequests.length).toBeGreaterThan(0);
    expect(() => guard.assertClean()).toThrow(/auth/i);
  });

  // H7 — the download helper returns exact bytes, incl. CSV quoting/escaping.
  test('readDownloadText preserves exact file content including escaping', { tag: ['@p2'] }, async ({ page }) => {
    await page.goto('/(admin-web)/login');
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
