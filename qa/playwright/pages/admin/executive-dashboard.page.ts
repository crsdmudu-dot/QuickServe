import { type Page, type Locator } from '@playwright/test';
import { BasePage } from '../base.page';

/**
 * Page Object for the Admin Executive Dashboard (`(admin-web)/analytics` index).
 *
 * Locators target user-visible, stable anchors only — section heading text,
 * unique KPI card labels, accessible button names, the app's exact error copy,
 * and the `testID`s the app already exposes (`kpi-skeleton`, chart ids,
 * `export-*`). No test-only hooks are added to the application.
 *
 * Value assertions are intentionally label-anchored + value-visible (see
 * `expectKpi`) rather than card-scoped: `ExecutiveKpiCard` renders no per-card
 * `testID`, and adding one is deferred unless a real blocker is proven. Distinct
 * fixture values keep value-visibility unambiguous.
 */
export class ExecutiveDashboardPage extends BasePage {
  readonly path = '/(admin-web)/analytics';

  readonly refreshButton: Locator;
  readonly viewDetailedButton: Locator;
  readonly lastUpdated: Locator;
  readonly kpiSkeletons: Locator;
  readonly retryButtons: Locator;
  readonly deltaBadges: Locator;

  /** All seven section headings, in render order. */
  static readonly SECTIONS = [
    'Platform Health',
    'Activity (selected period)',
    'Operational',
    'Growth',
    'Service analytics',
    'Provider analytics',
    'Geographic analytics',
  ] as const;

  /** Range filter preset button labels. */
  static readonly PRESETS = [
    'Today',
    'Last 7 days',
    'Last 30 days',
    'Last 90 days',
    'This year',
    'Custom',
  ] as const;

  constructor(page: Page) {
    super(page);
    this.refreshButton = page.getByRole('button', { name: 'Refresh' });
    this.viewDetailedButton = page.getByRole('button', { name: /view detailed analytics/i });
    this.lastUpdated = page.getByText(/Last updated/);
    this.kpiSkeletons = page.getByTestId('kpi-skeleton');
    this.retryButtons = page.getByRole('button', { name: 'Retry' });
    // GrowthDeltaBadge renders "▲ N%" / "▼ N%" / "– N%".
    this.deltaBadges = page.getByText(/[▲▼–]\s?\d/);
  }

  async waitForReady(): Promise<void> {
    // The dashboard is ready once a stable landmark (the first section heading)
    // has rendered — the admin shell + route resolved.
    await this.section('Platform Health').waitFor({ state: 'visible' });
  }

  section(title: string): Locator {
    return this.page.getByText(title, { exact: true });
  }

  kpiLabel(label: string): Locator {
    return this.page.getByText(label, { exact: true });
  }

  presetButton(label: string): Locator {
    return this.page.getByRole('button', { name: label, exact: true });
  }

  sectionError(copy: string): Locator {
    return this.page.getByText(copy, { exact: true });
  }

  chart(testId: string): Locator {
    return this.page.getByTestId(testId);
  }

  exportButton(kind: 'csv' | 'excel' | 'pdf'): Locator {
    return this.page.getByTestId(`export-${kind}`);
  }

  async selectPreset(label: string): Promise<void> {
    await this.presetButton(label).click();
  }

  async refresh(): Promise<void> {
    await this.refreshButton.click();
  }
}
