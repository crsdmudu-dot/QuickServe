import { test, expect } from '../fixtures';
import { DetailedAnalyticsPage } from '../pages/admin/detailed-analytics.page';
import { ExecutiveDashboardPage } from '../pages/admin/executive-dashboard.page';
import { LoginPage } from '../pages/admin/login.page';
import {
  installDetailedAnalyticsStubs,
  DETAILED_ANALYTICS_RPCS,
  BOOKINGS_SUMMARY_NULL_COMPLETION,
  PROVIDERS_CSV,
  EXPECTED_KPIS_CSV,
  EXPECTED_PROVIDERS_CSV,
  type DetailedStubOptions,
  type DetailedAnalyticsTracker,
} from '../support/detailed-analytics-stubs';
import { stubExecutiveAnalytics } from '../support/analytics-stubs';
import { installMockAdminSession, type NetworkGuard } from '../support/mock-admin-session';
import { isConnected, hasAdminCreds, connectedAdminLogin } from '../support/connected-mode';
import { readDownloadText } from '../support/download';

/**
 * Admin Detailed Analytics — automated suite (QA Slice 42).
 *
 * Reuses the Slice-41 reference architecture: the bounded `mockAdminSession`
 * (unchanged) puts the real `(admin-web)` guard into an authenticated-admin state
 * offline, and a dedicated `detailed-analytics-stubs` module deterministically
 * serves the nine Slice-25/28 analytics RPCs. Optional connected mode
 * (`QA_DASHBOARD_CONNECTED=1` + `E2E_ADMIN_*`) preserves the real-login path.
 *
 * Chromium-only (Decision B): this is a desktop admin-web surface; the suite
 * skips on Firefox/WebKit so the full multi-project run stays deterministic.
 */

/** Every KPI card testID (for NaN/undefined sweeps). */
const ALL_KPI_TESTIDS = [
  'kpi-revenue', 'kpi-gross-bookings', 'kpi-completed-bookings', 'kpi-active-providers',
  'kpi-active-customers', 'kpi-avg-booking-value',
  'kpi-completion-rate', 'kpi-cancellation-rate', 'kpi-avg-completion', 'kpi-pending', 'kpi-completed',
  'kpi-fin-revenue', 'kpi-fin-payouts', 'kpi-fin-qs-revenue', 'kpi-fin-wallet', 'kpi-fin-promo',
  'kpi-new-customers', 'kpi-returning-customers', 'kpi-retention-rate', 'kpi-repeat-booking-rate',
] as const;

/** Install session + detailed stubs (mock by default; real login when connected). Does NOT navigate. */
async function setupDetailed(
  page: import('@playwright/test').Page,
  stub: DetailedStubOptions = {},
): Promise<{ dash: DetailedAnalyticsPage; tracker: DetailedAnalyticsTracker; guard: NetworkGuard | null }> {
  const guard = isConnected() ? null : await installMockAdminSession(page);
  const tracker = await installDetailedAnalyticsStubs(page, stub);
  if (isConnected()) {
    await connectedAdminLogin(page);
  }
  return { dash: new DetailedAnalyticsPage(page), tracker, guard };
}

test.describe('Admin Detailed Analytics', { tag: ['@admin', '@detailed-analytics'] }, () => {
  // Chromium-only (Decision B).
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Detailed Analytics suite is Chromium-only (admin desktop surface).');
  });

  // ── 1. Access (unauthenticated — no session, no mock) ───────────────────────
  test(
    'unauthenticated visit redirects to the admin login',
    { tag: ['@security', '@smoke', '@p0', '@access', '@regression'] },
    async ({ page }) => {
      await page.goto('/(admin-web)/analytics/detailed');
      const login = new LoginPage(page);
      await expect(login.heading).toBeVisible();
      await expect(login.emailInput).toBeVisible();
    },
  );

  // ── 2. Drill-down navigation from the Executive Dashboard ───────────────────
  test(
    'drill-down from the Executive Dashboard opens Detailed Analytics',
    { tag: ['@p1', '@nav', '@regression'] },
    async ({ page }) => {
      test.skip(isConnected(), 'Drill-down test runs in offline mock mode only.');
      const guard = await installMockAdminSession(page);
      await stubExecutiveAnalytics(page, { mode: 'populated' }); // Executive index RPCs
      await installDetailedAnalyticsStubs(page, { mode: 'populated' }); // Detailed screen RPCs
      const exec = new ExecutiveDashboardPage(page);
      await exec.goto();
      await expect(exec.viewDetailedButton).toBeVisible();
      await exec.viewDetailedButton.click();
      // Landing on the detailed screen: its unique first heading appears.
      const dash = new DetailedAnalyticsPage(page);
      await expect(dash.section('Executive KPIs')).toBeVisible();
      await expect.poll(() => new URL(page.url()).pathname).toContain('detailed');
      guard.assertClean();
    },
  );

  // ── Authenticated (mock by default; real-session when connected) ────────────
  test.describe('authenticated', () => {
    test.beforeEach(() => {
      if (isConnected()) {
        test.skip(!hasAdminCreds(), 'Connected mode requires E2E_ADMIN_* (a pre-existing admin) + a reachable backend.');
      }
    });

    // ── 3. Structure ──────────────────────────────────────────────────────────
    test(
      'renders all seven sections and the filter/bucket controls',
      { tag: ['@smoke', '@p0', '@structure', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page);
        await dash.goto();
        for (const s of DetailedAnalyticsPage.SECTIONS) await expect(dash.section(s)).toBeVisible();
        for (const p of DetailedAnalyticsPage.PRESETS) await expect(dash.presetButton(p)).toBeVisible();
        for (const b of DetailedAnalyticsPage.BUCKETS) await expect(dash.bucketButton(b)).toBeVisible();
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // ── 4. Default filter window (proved via request params, not brittle styling) ─
    test(
      'default preset "Last 30 days" and bucket "Day" drive the initial request window',
      { tag: ['@p1', '@filters', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page);
        await dash.goto();
        // The section headings render at mount (before data), so poll until the
        // initial timeseries request has actually been captured — no fixed sleep.
        await expect
          .poll(() => tracker.lastParamsFor('analytics_bookings_timeseries')?.p_bucket)
          .toBe('day');
        const p = tracker.lastParamsFor('analytics_bookings_timeseries')!;
        const spanDays = (Date.parse(p.p_to as string) - Date.parse(p.p_from as string)) / 86_400_000;
        expect(spanDays).toBeGreaterThan(29.5);
        expect(spanDays).toBeLessThan(30.5);
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // ── 5. Executive KPI values ───────────────────────────────────────────────
    test(
      'Executive KPI cards show exact fixture values',
      { tag: ['@p0', '@kpi', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page);
        await dash.goto();
        await dash.expectKpi('kpi-revenue', 'KES 125,000');
        await dash.expectKpi('kpi-gross-bookings', '48');
        await dash.expectKpi('kpi-completed-bookings', '35');
        await dash.expectKpi('kpi-active-providers', '12');
        await dash.expectKpi('kpi-active-customers', '31');
        await dash.expectKpi('kpi-avg-booking-value', 'KES 3,572');
        tracker.assertCalled(['analytics_kpis']);
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // ── 6. Booking summary KPI values ─────────────────────────────────────────
    test(
      'Booking summary KPIs show exact values',
      { tag: ['@p1', '@kpi', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page);
        await dash.goto();
        await dash.expectKpi('kpi-completion-rate', '73.0%');
        await dash.expectKpi('kpi-cancellation-rate', '10.0%');
        await dash.expectKpi('kpi-avg-completion', '47');
        await dash.expectKpi('kpi-pending', '5');
        await dash.expectKpi('kpi-completed', '35');
        tracker.assertCalled(['analytics_bookings_summary']);
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // ── 7. Financial summary KPI values ───────────────────────────────────────
    test(
      'Financial summary KPIs show exact KES values',
      { tag: ['@p1', '@kpi', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page);
        await dash.goto();
        await dash.expectKpi('kpi-fin-revenue', 'KES 98,000');
        await dash.expectKpi('kpi-fin-payouts', 'KES 68,000');
        await dash.expectKpi('kpi-fin-qs-revenue', 'KES 30,000');
        await dash.expectKpi('kpi-fin-wallet', 'KES 15,000');
        await dash.expectKpi('kpi-fin-promo', 'KES 4,000');
        tracker.assertCalled(['analytics_financial_summary']);
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // ── 8. Customer KPI values ────────────────────────────────────────────────
    test(
      'Customer KPIs show exact values',
      { tag: ['@p1', '@kpi', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page);
        await dash.goto();
        await dash.expectKpi('kpi-new-customers', '18');
        await dash.expectKpi('kpi-returning-customers', '13');
        await dash.expectKpi('kpi-retention-rate', '42.0%');
        await dash.expectKpi('kpi-repeat-booking-rate', '46.0%');
        tracker.assertCalled(['analytics_customers']);
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // ── 9. Charts render (populated) ──────────────────────────────────────────
    test(
      'all charts render in the populated state',
      { tag: ['@p1', '@charts', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page);
        await dash.goto();
        for (const id of [
          'chart-bookings-ts', 'chart-financial-ts', 'chart-providers-bar',
          'chart-services-bar', 'chart-services-pie', 'chart-geography-bar',
        ]) {
          await expect(dash.chart(id)).toBeVisible();
        }
        await expect(dash.chartsEmpty).toHaveCount(0);
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // ── 10. Lowest-rated providers list (ascending; nulls excluded) ───────────
    test(
      'lowest-rated providers list is ordered ascending by rating',
      { tag: ['@p2', '@providers', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page);
        await dash.goto();
        await expect(dash.lowestRatedHeading).toBeVisible();
        // The "★" rating badge is unique to the lowest-rated list. Exactly the
        // three non-null-rating providers appear, ascending by rating — the
        // null-rating provider (Nadia) is excluded (count 3, not 4).
        const stars = page.getByText(/★/);
        await expect(stars).toHaveCount(3);
        expect(await stars.allTextContents()).toEqual(['3.1 ★', '4.2 ★', '4.9 ★']);
        // Lowest rating (3.1) belongs to the null-name provider → "#33333333".
        await expect(page.getByText('#33333333', { exact: true })).toBeVisible();
        tracker.assertCalled(['analytics_providers']);
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // ── 11. RPC contract — all nine fire once, well-shaped ────────────────────
    test(
      'all nine detailed analytics RPCs fire with correct shapes and no anomalies',
      { tag: ['@smoke', '@p0', '@rpc', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page);
        await dash.goto();
        // Wait until the last-fired section's data has arrived.
        await dash.expectKpi('kpi-new-customers', '18');
        tracker.assertCalled(DETAILED_ANALYTICS_RPCS);
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // ── 12. Bucket change propagates to the timeseries RPCs ───────────────────
    test(
      'selecting bucket "Week" re-issues the timeseries RPCs with p_bucket=week',
      { tag: ['@p1', '@filters', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page);
        await dash.goto();
        await dash.selectBucket('Week');
        await expect
          .poll(() => tracker.lastParamsFor('analytics_bookings_timeseries')?.p_bucket)
          .toBe('week');
        expect(tracker.lastParamsFor('analytics_financial_timeseries')?.p_bucket).toBe('week');
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // ── 13. Custom date range drives p_from/p_to ──────────────────────────────
    test(
      'Custom preset reveals inputs and ISO dates drive p_from/p_to',
      { tag: ['@p1', '@filters', '@custom', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page);
        await dash.goto();
        await dash.enterCustomRange('2026-06-01', '2026-06-30');
        await expect(dash.customFromInput).toBeVisible();
        await expect
          .poll(() => tracker.lastParamsFor('analytics_kpis')?.p_to)
          .toBe('2026-06-30');
        expect(tracker.lastParamsFor('analytics_kpis')?.p_from).toBe('2026-06-01');
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // ── 14. "Today" preset sends a same-day window ────────────────────────────
    test(
      'preset "Today" sends a sub-24h request window',
      { tag: ['@p2', '@filters', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page);
        await dash.goto();
        await dash.selectPreset('Today');
        await expect
          .poll(() => {
            const p = tracker.lastParamsFor('analytics_kpis');
            if (!p?.p_from || !p?.p_to) return undefined;
            return (Date.parse(p.p_to) - Date.parse(p.p_from)) / 3_600_000; // hours
          })
          .toBeLessThan(24);
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // ── 15. Loading state ─────────────────────────────────────────────────────
    test(
      'loading state shows the caption and chart skeletons, then resolves',
      { tag: ['@p1', '@loading', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page, { delayMs: 1500 });
        await page.goto(dash.path); // do NOT waitForReady — observe the skeletons
        await expect(dash.loadingCaption).toBeVisible();
        await expect(dash.chartsLoading.first()).toBeVisible();
        // After data arrives the caption clears and a chart is populated.
        await expect(dash.loadingCaption).toHaveCount(0);
        await expect(dash.chart('chart-bookings-ts')).toBeVisible();
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // ── 16. Empty data ────────────────────────────────────────────────────────
    test(
      'empty data renders zeros and "No data" charts without broken values',
      { tag: ['@p0', '@empty', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page, { mode: 'empty' });
        await dash.goto();
        await dash.expectKpi('kpi-revenue', 'KES 0');
        await dash.expectKpi('kpi-pending', '0');
        await dash.expectKpi('kpi-completion-rate', '0.0%');
        // Charts collapse to the shared empty state; the pie & lowest-rated list hide.
        await expect(dash.chartsEmpty.first()).toBeVisible();
        await expect(dash.chart('chart-services-pie')).toHaveCount(0);
        await expect(dash.lowestRatedHeading).toHaveCount(0);
        await dash.expectNoBrokenValues(ALL_KPI_TESTIDS);
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // ── 17. Graceful degradation (documents the unreachable error banner) ─────
    // The nine wrappers convert every backend error (network- and query-level)
    // into safe defaults — they never throw — so `loadAll`'s try/catch and the
    // "Could not load analytics." + Retry UI are NOT reachable via network
    // stubbing. Aborting every RPC therefore degrades to zeros/No-data, not the
    // error banner. That reachable reality is what we assert here.
    test(
      'aborting every analytics RPC degrades to zeros without crashing (no error banner)',
      { tag: ['@p1', '@degradation', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page, {
          failing: [...DETAILED_ANALYTICS_RPCS],
        });
        await dash.goto();
        for (const s of DetailedAnalyticsPage.SECTIONS) await expect(dash.section(s)).toBeVisible();
        await dash.expectKpi('kpi-revenue', 'KES 0');
        await expect(dash.errorBanner).toHaveCount(0); // wrappers swallow errors → banner unreachable
        await dash.expectNoBrokenValues(ALL_KPI_TESTIDS);
        tracker.assertCalled(DETAILED_ANALYTICS_RPCS); // every RPC was attempted
        guard?.assertClean();
      },
    );

    // ── 18. Partial data — one empty section, the rest intact ─────────────────
    test(
      'one empty section leaves the other sections populated',
      { tag: ['@p1', '@partial', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page, {
          emptyRpcs: ['analytics_geography'],
        });
        await dash.goto();
        // Exactly the geography chart is empty; the others stay populated.
        await expect(dash.chart('chart-geography-bar')).toHaveCount(0);
        await expect(dash.chartsEmpty).toHaveCount(1);
        await expect(dash.chart('chart-bookings-ts')).toBeVisible();
        await dash.expectKpi('kpi-revenue', 'KES 125,000');
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // ── 19. Malformed-safe (explicitly-supported nulls) ───────────────────────
    test(
      'explicitly-supported null values render safely',
      { tag: ['@p2', '@malformed-safe', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page, {
          bookingsSummary: BOOKINGS_SUMMARY_NULL_COMPLETION,
        });
        await dash.goto();
        // null avg_completion_minutes → TrendCard renders the em-dash.
        await dash.expectKpi('kpi-avg-completion', '—');
        // null full_name → "#<id8>" in the lowest-rated list.
        await expect(page.getByText('#33333333', { exact: true })).toBeVisible();
        await dash.expectNoBrokenValues(ALL_KPI_TESTIDS);
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // ── 20. CSV export — Executive KPIs (full deterministic content) ──────────
    test(
      'Download CSV (Executive KPIs) exports the exact expected content',
      { tag: ['@p0', '@export', '@csv', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page);
        await dash.goto();
        const download = await dash.downloadCsv(DetailedAnalyticsPage.CSV_SECTION_INDEX.kpis);
        expect(download.suggestedFilename()).toBe('kpis.csv');
        const content = await readDownloadText(download);
        expect(content).toBe(EXPECTED_KPIS_CSV);
        expect(content.split('\n')).toHaveLength(2); // header + 1 row
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // ── 21. CSV export — Providers (escaping + formula-injection guard) ───────
    test(
      'Download CSV (Providers) exports quoted, escaped, injection-guarded content',
      { tag: ['@p1', '@export', '@csv', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page, { providers: PROVIDERS_CSV });
        await dash.goto();
        const download = await dash.downloadCsv(DetailedAnalyticsPage.CSV_SECTION_INDEX.providers);
        expect(download.suggestedFilename()).toBe('providers.csv');
        const content = await readDownloadText(download);
        expect(content).toBe(EXPECTED_PROVIDERS_CSV);
        expect(content.split('\n')).toHaveLength(4); // header + 3 rows
        expect(content).toContain("'=SUM(A1)"); // formula-injection guard applied
        expect(content).toContain('"Otieno, Grace"'); // comma quoting
        expect(content).toContain('"O""Brien"'); // embedded-quote doubling
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );

    // ── 22. Rapid filter changes settle deterministically (eventual consistency) ─
    // The app has no request-id/abort guard against overlapping loads, so we assert
    // the reachable guarantee: after rapid preset switches, the LAST-selected filter
    // is the effective one and the dashboard is populated and unbroken.
    test(
      'rapid preset changes settle on the last-selected filter',
      { tag: ['@p1', '@stale', '@regression'] },
      async ({ page }) => {
        const { dash, tracker, guard } = await setupDetailed(page);
        await dash.goto();
        await dash.selectPreset('Last 7 days');
        await dash.selectPreset('This month');
        await dash.selectPreset('Today');
        // The last effective request is the "Today" (sub-24h) window.
        await expect
          .poll(() => {
            const p = tracker.lastParamsFor('analytics_kpis');
            if (!p?.p_from || !p?.p_to) return undefined;
            return (Date.parse(p.p_to) - Date.parse(p.p_from)) / 3_600_000;
          })
          .toBeLessThan(24);
        await dash.expectKpi('kpi-revenue', 'KES 125,000');
        await dash.expectNoBrokenValues(ALL_KPI_TESTIDS);
        tracker.assertNoAnomalies();
        guard?.assertClean();
      },
    );
  });
});
