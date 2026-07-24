import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from '../base.page';

/**
 * Page Object for the Admin **Detailed Analytics** screen
 * (`(admin-web)/analytics/detailed`) — QA Slice 42.
 *
 * Locators target user-visible anchors (section heading text, accessible button
 * names, input placeholders, the app's exact copy) and the testIDs the app
 * already exposes (`kpi-*`, `chart-*`). No test-only production hooks are added.
 *
 * Unlike the Executive Dashboard, every KPI card here exposes a stable testID,
 * so value assertions are scoped per card (`expectKpi`) with no ambiguity.
 */
export class DetailedAnalyticsPage extends BasePage {
  readonly path = '/(admin-web)/analytics/detailed';

  /** All seven section headings, in render order. */
  static readonly SECTIONS = [
    'Executive KPIs',
    'Booking analytics',
    'Financial analytics',
    'Provider analytics',
    'Service analytics',
    'Geographic analytics',
    'Customer analytics',
  ] as const;

  /** Range preset button labels. */
  static readonly PRESETS = ['Today', 'Last 7 days', 'Last 30 days', 'This month', 'Custom'] as const;

  /** Time-bucket button labels. */
  static readonly BUCKETS = ['Day', 'Week', 'Month'] as const;

  /** "Download CSV" button order == section order (no per-button testID exists). */
  static readonly CSV_SECTION_INDEX = {
    kpis: 0,
    bookings: 1,
    financial: 2,
    providers: 3,
    services: 4,
    geography: 5,
    customers: 6,
  } as const;

  readonly loadingCaption: Locator;
  readonly errorBanner: Locator;
  readonly retryButton: Locator;
  readonly downloadCsvButtons: Locator;
  readonly chartsLoading: Locator;
  readonly chartsEmpty: Locator;
  readonly customFromInput: Locator;
  readonly customToInput: Locator;
  readonly lowestRatedHeading: Locator;

  constructor(page: Page) {
    super(page);
    this.loadingCaption = page.getByText('Loading analytics…', { exact: true });
    this.errorBanner = page.getByText('Could not load analytics.', { exact: true });
    this.retryButton = page.getByRole('button', { name: 'Retry' });
    this.downloadCsvButtons = page.getByRole('button', { name: 'Download CSV' });
    // Bar/Line/Pie charts hard-code these testIDs in their loading/empty states,
    // overriding the id passed in — so both are intentionally non-unique.
    this.chartsLoading = page.getByTestId('chart-loading');
    this.chartsEmpty = page.getByTestId('chart-empty');
    this.customFromInput = page.getByPlaceholder('e.g. 2026-06-01');
    this.customToInput = page.getByPlaceholder('e.g. 2026-06-30');
    this.lowestRatedHeading = page.getByText(/Lowest-rated providers/);
  }

  /** Ready once the first section heading has rendered (route + shell resolved). */
  async waitForReady(): Promise<void> {
    await this.section('Executive KPIs').waitFor({ state: 'visible' });
  }

  section(title: string): Locator {
    return this.page.getByText(title, { exact: true });
  }

  kpiCard(testId: string): Locator {
    return this.page.getByTestId(testId);
  }

  chart(testId: string): Locator {
    return this.page.getByTestId(testId);
  }

  presetButton(label: string): Locator {
    return this.page.getByRole('button', { name: label, exact: true });
  }

  bucketButton(label: string): Locator {
    return this.page.getByRole('button', { name: label, exact: true });
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  async selectPreset(label: string): Promise<void> {
    await this.presetButton(label).click();
  }

  async selectBucket(label: string): Promise<void> {
    await this.bucketButton(label).click();
  }

  /**
   * Select the Custom preset, then type ISO dates into the From/To inputs.
   *
   * The inputs are React-Native-Web controlled `TextInput`s: on a cold dev
   * server they render before React wires `onChangeText`, so early keystrokes are
   * dropped. We type-and-verify per field (`toPass`) so each value is committed
   * before we move on — no fixed sleeps.
   */
  async enterCustomRange(from: string, to: string): Promise<void> {
    await this.selectPreset('Custom');
    await this.typeInto(this.customFromInput, from);
    await this.typeInto(this.customToInput, to);
  }

  private async typeInto(input: Locator, value: string): Promise<void> {
    await input.waitFor({ state: 'visible' });
    await expect(async () => {
      await input.fill('');
      await input.pressSequentially(value);
      await expect(input).toHaveValue(value, { timeout: 1500 });
    }).toPass({ timeout: 30_000, intervals: [300, 800, 1500] });
  }

  /** Click the "Download CSV" for a section index and return the captured download. */
  async downloadCsv(sectionIndex: number): Promise<import('@playwright/test').Download> {
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.downloadCsvButtons.nth(sectionIndex).click(),
    ]);
    return download;
  }

  // ── Reusable assertions ──────────────────────────────────────────────────────

  /** Assert a KPI card (by testID) contains an exact value substring. */
  async expectKpi(testId: string, text: string): Promise<void> {
    await expect(this.kpiCard(testId)).toContainText(text);
  }

  /** Assert no visible KPI card renders a broken value (NaN / undefined). */
  async expectNoBrokenValues(kpiTestIds: readonly string[]): Promise<void> {
    for (const id of kpiTestIds) {
      await expect(this.kpiCard(id)).not.toContainText('NaN');
      await expect(this.kpiCard(id)).not.toContainText('undefined');
    }
  }
}
