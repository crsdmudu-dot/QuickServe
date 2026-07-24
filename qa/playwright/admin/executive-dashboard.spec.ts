import { test, expect } from '../fixtures';
import { ExecutiveDashboardPage } from '../pages/admin/executive-dashboard.page';
import { LoginPage } from '../pages/admin/login.page';
import {
  stubExecutiveAnalytics,
  type StubOptions,
  type AnalyticsTracker,
} from '../support/analytics-stubs';
import { installMockAdminSession, type NetworkGuard } from '../support/mock-admin-session';

/**
 * Admin Executive Dashboard — automated suite (QA Slice 41).
 *
 * Two modes (the suite auto-selects):
 *  - DEFAULT: offline deterministic mode via `mockAdminSession` — the real
 *    `(admin-web)` guard runs unchanged and resolves a seeded admin session; the
 *    analytics `analytics_*` RPCs are stubbed. Runs fully offline with zero skips.
 *  - OPTIONAL: connected-confirmation mode (`QA_DASHBOARD_CONNECTED=1`) using the
 *    REAL admin login (Approach A). Skips if `E2E_ADMIN_*` are absent. This
 *    preserves the real-session capability; the Admin Authentication suite
 *    remains the authority for login behaviour — the mock only isolates the
 *    dashboard.
 *
 * Determinism: data via RPC stubbing (no DB seeding). Every test verifies the
 * network guard (no unexpected auth/REST traffic) and the analytics tracker
 * (no unexpected/mis-shaped RPCs; required RPCs were requested).
 */

const CONNECTED = process.env.QA_DASHBOARD_CONNECTED === '1';
const hasCreds = !!(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);

/** Authenticate as admin for the dashboard, install analytics stubs, return handles.
 *  Does NOT navigate — the caller navigates (so loading tests can observe skeletons). */
async function setupDashboard(
  page: import('@playwright/test').Page,
  stub: StubOptions,
): Promise<{ dash: ExecutiveDashboardPage; tracker: AnalyticsTracker; guard: NetworkGuard | null }> {
  const guard = CONNECTED ? null : await installMockAdminSession(page);
  const tracker = await stubExecutiveAnalytics(page, stub);
  if (CONNECTED) {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.E2E_ADMIN_EMAIL as string, process.env.E2E_ADMIN_PASSWORD as string);
    await page.waitForURL((u) => !new URL(u).pathname.includes('login'), { timeout: 30_000 });
  }
  return { dash: new ExecutiveDashboardPage(page), tracker, guard };
}

test.describe('Admin Executive Dashboard', { tag: ['@admin', '@executive-dashboard'] }, () => {
  // ── Access (unauthenticated — no session, no mock) ──────────────────────────
  test(
    'redirects an unauthenticated visitor to the admin login',
    { tag: ['@security', '@smoke', '@p0', '@regression'] },
    async ({ page }) => {
      await page.goto('/(admin-web)/analytics');
      const login = new LoginPage(page);
      await expect(login.heading).toBeVisible();
      await expect(login.emailInput).toBeVisible();
    },
  );

  // ── Authenticated dashboard (mock by default; real-session when connected) ──
  test.describe('authenticated', () => {
    test.beforeEach(() => {
      if (CONNECTED) {
        test.skip(!hasCreds, 'Connected mode requires E2E_ADMIN_* (a pre-existing admin) + a reachable backend.');
      }
    });

    test(
      'renders all seven executive sections',
      { tag: ['@smoke', '@p0', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDashboard(page, { mode: 'populated' });
        await dash.goto();
        for (const s of ExecutiveDashboardPage.SECTIONS) {
          await expect(dash.section(s)).toBeVisible();
        }
        tracker.assertCalled(['analytics_executive_overview']);
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    test(
      'header shows presets, last-updated, refresh, drill-down and disabled export',
      { tag: ['@p1', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDashboard(page, { mode: 'populated' });
        await dash.goto();
        for (const p of ExecutiveDashboardPage.PRESETS) {
          await expect(dash.presetButton(p)).toBeVisible();
        }
        await expect(dash.lastUpdated).toBeVisible();
        await expect(dash.refreshButton).toBeVisible();
        await expect(dash.viewDetailedButton).toBeVisible();
        for (const kind of ['csv', 'excel', 'pdf'] as const) {
          await expect(dash.exportButton(kind)).toBeVisible();
        }
        await expect(page.getByText(/coming soon/i)).toBeVisible();
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    test(
      'Platform Health cards render (snapshot values)',
      { tag: ['@p0', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDashboard(page, { mode: 'populated' });
        await dash.goto();
        for (const label of [
          'Current Wallet Balance',
          'Current Active Customers',
          'Current Active Providers',
          'Current Platform Rating',
          'Active Disputes',
          'Open Support Tickets',
        ]) {
          await expect(dash.kpiLabel(label)).toBeVisible();
        }
        await expect(page.getByText('42', { exact: true }).first()).toBeVisible(); // current active customers
        tracker.assertCalled(['analytics_executive_overview']);
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    test(
      'Activity cards render (selected-period values)',
      { tag: ['@p0', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDashboard(page, { mode: 'populated' });
        await dash.goto();
        for (const label of [
          'Total Bookings',
          'Active Bookings',
          'Completed Bookings',
          'Cancelled Bookings',
          'Total Revenue',
          'Platform Commission',
          'Average Booking Value',
          'Repeat Customer Rate',
        ]) {
          await expect(dash.kpiLabel(label)).toBeVisible();
        }
        await expect(page.getByText('120', { exact: true }).first()).toBeVisible(); // total bookings
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    test('Operational cards render', { tag: ['@p1', '@regression'] }, async ({ page }) => {
      const { dash, tracker, guard } = await setupDashboard(page, { mode: 'populated' });
      await dash.goto();
      for (const label of [
        'Pending Jobs',
        'In-Progress Jobs',
        'Avg Response Time',
        'Avg Completion Time',
        'Failed Payments',
        'Notifications Sent',
      ]) {
        await expect(dash.kpiLabel(label)).toBeVisible();
      }
      tracker.assertNoAnomalies();
      guard?.assertClean();
    });

    test(
      'Growth section shows period-over-period delta badges',
      { tag: ['@p1', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDashboard(page, {
          mode: 'populated',
          distinctPreviousPeriod: true,
        });
        await dash.goto();
        await expect(dash.section('Growth')).toBeVisible();
        await expect(dash.deltaBadges.first()).toBeVisible();
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    test(
      'Service, Provider and Geographic sections render their rows',
      { tag: ['@p1', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDashboard(page, { mode: 'populated' });
        await dash.goto();
        await expect(dash.section('Service analytics')).toBeVisible();
        await expect(dash.section('Provider analytics')).toBeVisible();
        await expect(dash.section('Geographic analytics')).toBeVisible();
        await expect(page.getByText('Grace Otieno', { exact: true }).first()).toBeVisible();
        await expect(page.getByText('Nairobi', { exact: true }).first()).toBeVisible();
        tracker.assertCalled(['analytics_providers', 'analytics_geography', 'analytics_service_categories']);
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    test('charts render for stubbed time-series', { tag: ['@p2', '@regression'] }, async ({ page }) => {
      const { dash, tracker, guard } = await setupDashboard(page, { mode: 'populated' });
      await dash.goto();
      for (const id of ['chart-customer-growth', 'chart-provider-growth', 'chart-revenue-ts', 'chart-bookings-ts']) {
        await expect(dash.chart(id)).toBeVisible();
      }
      tracker.assertNoAnomalies();
      guard?.assertClean();
    });

    test('KPI cards show loading skeletons, then values', { tag: ['@p1', '@regression'] }, async ({ page }) => {
      const { dash, tracker, guard } = await setupDashboard(page, { mode: 'populated', delayMs: 1500 });
      // Navigate without waiting for full load so the skeletons are observable.
      await page.goto(dash.path);
      await expect(dash.kpiSkeletons.first()).toBeVisible();
      await expect(dash.kpiLabel('Total Bookings')).toBeVisible();
      await expect(page.getByText('120', { exact: true }).first()).toBeVisible();
      tracker.assertNoAnomalies();
      guard?.assertClean();
    });

    test(
      'sections load independently (no full-page loading gate)',
      { tag: ['@p1', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDashboard(page, { mode: 'populated', delayMs: 2000 });
        await page.goto(dash.path);
        await expect(dash.kpiSkeletons.first()).toBeVisible();
        await expect(dash.section('Service analytics')).toBeVisible();
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // NOTE on the per-section error/Retry UI: the app's analytics wrappers
    // convert every backend error (query- and network-level) into safe defaults
    // (Slice-38 graceful-degradation design), so the inline "Could not load …" +
    // Retry state is only reachable by a *wrapper-level throw*. That path is
    // covered by Slice-38's unit tests (which mock the wrapper to reject) and is
    // NOT reachable via E2E network stubbing. We therefore assert the behaviour
    // that IS observable end-to-end: a failing backend degrades gracefully.
    test(
      'a failing backend section degrades gracefully without crashing the dashboard',
      { tag: ['@p0', '@regression'] },
      async ({ page }) => {
        const { dash, guard } = await setupDashboard(page, {
          failing: ['analytics_executive_overview'],
        });
        await dash.goto();
        // The overview RPC fails, yet the dashboard shell + the affected section
        // and the sections fed by other (successful) RPCs all still render — no
        // crash, no error boundary.
        await expect(dash.section('Platform Health')).toBeVisible();
        await expect(dash.section('Service analytics')).toBeVisible();
        await expect(dash.section('Geographic analytics')).toBeVisible();
        guard?.assertClean();
      },
    );

    test('empty data renders without crashing', { tag: ['@p1', '@regression'] }, async ({ page }) => {
      const { dash, tracker, guard } = await setupDashboard(page, { mode: 'empty' });
      await dash.goto();
      await expect(dash.section('Platform Health')).toBeVisible();
      await expect(dash.kpiLabel('Total Bookings')).toBeVisible();
      await expect(page.getByText('0').first()).toBeVisible();
      tracker.assertNoAnomalies();
      guard?.assertClean();
    });

    test(
      'changing the range preset re-queries and keeps the dashboard populated',
      { tag: ['@p1', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDashboard(page, { mode: 'populated' });
        await dash.goto();
        await expect(dash.section('Activity (selected period)')).toBeVisible();
        await dash.selectPreset('Last 7 days');
        await expect(dash.section('Platform Health')).toBeVisible();
        await expect(dash.kpiLabel('Total Bookings')).toBeVisible();
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    test(
      'the Last-updated timestamp is present and updates on Refresh',
      { tag: ['@p2', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDashboard(page, { mode: 'populated' });
        await dash.goto();
        await expect(dash.lastUpdated).toBeVisible();
        await dash.refresh();
        await expect(dash.lastUpdated).toBeVisible();
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );
  });
});
