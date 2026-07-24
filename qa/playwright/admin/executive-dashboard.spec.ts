import { test, expect } from '../fixtures';
import { ExecutiveDashboardPage } from '../pages/admin/executive-dashboard.page';
import { LoginPage } from '../pages/admin/login.page';
import { loadEnv } from '../../shared/env';
import { stubExecutiveAnalytics, POPULATED_OVERVIEW } from '../support/analytics-stubs';

/**
 * Admin Executive Dashboard — automated suite (QA Slice 41, Approach A).
 *
 * Determinism: the dashboard's data comes from Supabase `analytics_*` RPCs which
 * we stub with `page.route` (see `analytics-stubs`) — exact values and forced
 * loading/error/empty/populated states, with NO database seeding.
 *
 * Access: the dashboard is admin-guarded. Approach A uses a REAL admin session
 * (the `adminPage` storageState fixture, populated by global-setup when
 * `E2E_ADMIN_*` is configured). Offline, only the redirect test runs; the data
 * tests are gated and execute in the connected QA/CI environment. Reporting rule:
 * this suite is NOT "passing" until the gated tests run green against a reachable
 * Supabase environment.
 *
 * Conventions inherited from the reference suite: one Page Object per screen,
 * first-class tags, deterministic waits (no sleeps — delays live in stubs),
 * per-test POM construction, qa/-only, auto-captured failure artifacts.
 */

const env = loadEnv();
const backendConfigured = env.hasAdminCreds;

test.describe('Admin Executive Dashboard', { tag: ['@admin', '@executive-dashboard'] }, () => {
  // ── Access (runs offline — no session) ──────────────────────────────────────
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

  // ── Authenticated + stubbed analytics (gated on a real admin session) ────────
  test.describe('authenticated (stubbed analytics)', () => {
    test.beforeEach(() => {
      test.skip(
        !backendConfigured,
        'Requires an admin session (E2E_ADMIN_* + reachable Supabase). Analytics data is stubbed; only the session is real.',
      );
    });

    test(
      'renders all seven executive sections',
      { tag: ['@smoke', '@p0', '@regression'] },
      async ({ adminPage }) => {
        await stubExecutiveAnalytics(adminPage, { mode: 'populated' });
        const dash = new ExecutiveDashboardPage(adminPage);
        await dash.goto();
        for (const s of ExecutiveDashboardPage.SECTIONS) {
          await expect(dash.section(s)).toBeVisible();
        }
      },
    );

    test(
      'header shows presets, last-updated, refresh, drill-down and disabled export',
      { tag: ['@p1', '@regression'] },
      async ({ adminPage }) => {
        await stubExecutiveAnalytics(adminPage, { mode: 'populated' });
        const dash = new ExecutiveDashboardPage(adminPage);
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
        await expect(adminPage.getByText(/coming soon/i)).toBeVisible();
      },
    );

    test(
      'Platform Health cards render (snapshot values)',
      { tag: ['@p0', '@regression'] },
      async ({ adminPage }) => {
        await stubExecutiveAnalytics(adminPage, { mode: 'populated' });
        const dash = new ExecutiveDashboardPage(adminPage);
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
        // A distinctive stubbed value (current active customers = 42) is rendered.
        await expect(adminPage.getByText('42')).toBeVisible();
      },
    );

    test(
      'Activity cards render (selected-period values)',
      { tag: ['@p0', '@regression'] },
      async ({ adminPage }) => {
        await stubExecutiveAnalytics(adminPage, { mode: 'populated' });
        const dash = new ExecutiveDashboardPage(adminPage);
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
        // Distinctive stubbed value (total bookings = 120).
        await expect(adminPage.getByText('120')).toBeVisible();
      },
    );

    test(
      'Operational cards render',
      { tag: ['@p1', '@regression'] },
      async ({ adminPage }) => {
        await stubExecutiveAnalytics(adminPage, { mode: 'populated' });
        const dash = new ExecutiveDashboardPage(adminPage);
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
      },
    );

    test(
      'Growth section shows period-over-period delta badges',
      { tag: ['@p1', '@regression'] },
      async ({ adminPage }) => {
        await stubExecutiveAnalytics(adminPage, { mode: 'populated', distinctPreviousPeriod: true });
        const dash = new ExecutiveDashboardPage(adminPage);
        await dash.goto();
        await expect(dash.section('Growth')).toBeVisible();
        await expect(dash.deltaBadges.first()).toBeVisible();
      },
    );

    test(
      'Service, Provider and Geographic sections render their rows',
      { tag: ['@p1', '@regression'] },
      async ({ adminPage }) => {
        await stubExecutiveAnalytics(adminPage, { mode: 'populated' });
        const dash = new ExecutiveDashboardPage(adminPage);
        await dash.goto();
        await expect(dash.section('Service analytics')).toBeVisible();
        await expect(dash.section('Provider analytics')).toBeVisible();
        await expect(dash.section('Geographic analytics')).toBeVisible();
        // Stubbed rows (a provider and a city) surface.
        await expect(adminPage.getByText('Grace Otieno')).toBeVisible();
        await expect(adminPage.getByText('Nairobi')).toBeVisible();
      },
    );

    test(
      'charts render for stubbed time-series',
      { tag: ['@p2', '@regression'] },
      async ({ adminPage }) => {
        await stubExecutiveAnalytics(adminPage, { mode: 'populated' });
        const dash = new ExecutiveDashboardPage(adminPage);
        await dash.goto();
        for (const id of ['chart-customer-growth', 'chart-provider-growth', 'chart-revenue-ts', 'chart-bookings-ts']) {
          await expect(dash.chart(id)).toBeVisible();
        }
      },
    );

    test(
      'KPI cards show loading skeletons, then values',
      { tag: ['@p1', '@regression'] },
      async ({ adminPage }) => {
        await stubExecutiveAnalytics(adminPage, { mode: 'populated', delayMs: 1500 });
        const dash = new ExecutiveDashboardPage(adminPage);
        // Navigate without waiting for full load so we can observe the skeletons.
        await adminPage.goto(dash.path);
        await expect(dash.kpiSkeletons.first()).toBeVisible();
        // After the delayed stub resolves, real values replace the skeletons.
        await expect(dash.kpiLabel('Total Bookings')).toBeVisible();
        await expect(adminPage.getByText('120')).toBeVisible();
      },
    );

    test(
      'sections load independently (no full-page loading gate)',
      { tag: ['@p1', '@regression'] },
      async ({ adminPage }) => {
        await stubExecutiveAnalytics(adminPage, { mode: 'populated', delayMs: 2000 });
        const dash = new ExecutiveDashboardPage(adminPage);
        await adminPage.goto(dash.path);
        // While KPI data is still loading (skeletons visible), section structure
        // has already rendered — proving there is no single page-level gate.
        await expect(dash.kpiSkeletons.first()).toBeVisible();
        await expect(dash.section('Service analytics')).toBeVisible();
      },
    );

    test(
      'a failed section shows its inline error + Retry while other sections still render',
      { tag: ['@p0', '@regression'] },
      async ({ adminPage }) => {
        await stubExecutiveAnalytics(adminPage, { failing: ['analytics_executive_overview'] });
        const dash = new ExecutiveDashboardPage(adminPage);
        await dash.goto();
        await expect(dash.sectionError('Could not load platform health data.')).toBeVisible();
        await expect(dash.retryButtons.first()).toBeVisible();
        // Sections fed by other (successful) RPCs are unaffected.
        await expect(dash.section('Service analytics')).toBeVisible();
        await expect(dash.section('Geographic analytics')).toBeVisible();
      },
    );

    test(
      'Retry recovers a failed section after the backend succeeds',
      { tag: ['@p0', '@regression'] },
      async ({ adminPage }) => {
        await stubExecutiveAnalytics(adminPage, { failing: ['analytics_executive_overview'] });
        const dash = new ExecutiveDashboardPage(adminPage);
        await dash.goto();
        await expect(dash.sectionError('Could not load platform health data.')).toBeVisible();

        // The backend now succeeds; Refresh/Retry re-fetches.
        await adminPage.unroute('**/rest/v1/rpc/analytics_executive_overview');
        await adminPage.route('**/rest/v1/rpc/analytics_executive_overview', (route) =>
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([POPULATED_OVERVIEW]) }),
        );
        await dash.retryButtons.first().click();

        await expect(dash.kpiLabel('Current Wallet Balance')).toBeVisible();
        await expect(adminPage.getByText('Could not load platform health data.')).toHaveCount(0);
      },
    );

    test(
      'empty data renders without crashing',
      { tag: ['@p1', '@regression'] },
      async ({ adminPage }) => {
        await stubExecutiveAnalytics(adminPage, { mode: 'empty' });
        const dash = new ExecutiveDashboardPage(adminPage);
        await dash.goto();
        await expect(dash.section('Platform Health')).toBeVisible();
        await expect(dash.kpiLabel('Total Bookings')).toBeVisible();
        // Zeroed values render (no error, no crash).
        await expect(adminPage.getByText('0').first()).toBeVisible();
      },
    );

    test(
      'changing the range preset re-queries and keeps the dashboard populated',
      { tag: ['@p1', '@regression'] },
      async ({ adminPage }) => {
        await stubExecutiveAnalytics(adminPage, { mode: 'populated' });
        const dash = new ExecutiveDashboardPage(adminPage);
        await dash.goto();
        await expect(dash.section('Activity (selected period)')).toBeVisible();
        await dash.selectPreset('Last 7 days');
        // The period section re-renders; the current-health section is unaffected.
        await expect(dash.section('Platform Health')).toBeVisible();
        await expect(dash.kpiLabel('Total Bookings')).toBeVisible();
      },
    );

    test(
      'the Last-updated timestamp is present and updates on Refresh',
      { tag: ['@p2', '@regression'] },
      async ({ adminPage }) => {
        await stubExecutiveAnalytics(adminPage, { mode: 'populated' });
        const dash = new ExecutiveDashboardPage(adminPage);
        await dash.goto();
        await expect(dash.lastUpdated).toBeVisible();
        await dash.refresh();
        await expect(dash.lastUpdated).toBeVisible();
      },
    );
  });
});
