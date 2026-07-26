# QuickServe QA Automation

This is the QuickServe QA automation workspace.  Playwright runs today; the
folder is structured so that Maestro (Android/iOS) flows can be added later
without any repository restructuring.  Slice 39 establishes the infrastructure
only — the smoke test proves that the browser launches, the web server starts,
the Admin login page loads, and the reporters/artifacts engage.  No feature or
business behaviour is asserted here.

---

## Architecture & policy

The official architecture, locator/tagging rules, the shared-helper extraction
principle, and the merge/release gate policy live in
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** (the authoritative source); the
flake-management policy is in **[docs/FLAKES.md](docs/FLAKES.md)**.

Convenience scripts (thin wrappers — see `package.json`):

| Script | Purpose |
|---|---|
| `npm run qa:test:chromium` | default feature validation (Chromium) |
| `npm run qa:test:all-browsers` | multi-browser advisory run (`--workers=2`) |
| `npm run qa:test:connected` | connected run — set `QA_DASHBOARD_CONNECTED=1` + `E2E_ADMIN_*` first |
| `npm run qa:test:stability` | Gate B stability cycle (2 serial + 1 parallel, Chromium) |
| `npm run qa:health` | framework + infra health-tests |
| `npm run qa:typecheck` | QA TypeScript check |
| `npm run qa:report` | open the HTML report |

A full release aggregate lives at the repo root: `npm run qa:release` (Jest +
TypeScript + Expo web/android exports + the multi-browser QA suite).

## Prerequisites

- **Node 24+** (the same version used by the main project)
- Install workspace dependencies:
  ```bash
  npm install --prefix qa
  ```
- Install Playwright browsers (only needed once, or after a Playwright upgrade):
  ```bash
  npm --prefix qa run install:browsers
  ```
  To install Chromium only (faster for local smoke):
  ```bash
  npm --prefix qa run install:chromium
  ```

---

## Environment variables

Copy the example file and fill in values:

```bash
cp qa/.env.example qa/.env
```

| Variable              | Required? | Description                                                                                                        |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| `BASE_URL`            | Optional  | Full URL of the running app (e.g. `http://localhost:8081`).  **If unset**, Playwright auto-starts `expo start --web`. |
| `E2E_ADMIN_EMAIL`     | Optional  | Email of a pre-existing admin test account.  If unset, authenticated steps are skipped and only the public smoke runs. |
| `E2E_ADMIN_PASSWORD`  | Optional  | Password for the admin test account.                                                                                |

> `qa/.env` is git-ignored — never commit credentials.

### `BASE_URL` behaviour

- **Unset (default for local dev and CI without an existing server):** `playwright.config.ts` sets `START_SERVER=true` and launches `expo start --web` (from the repo root) before any test runs.  Playwright waits up to 3 minutes for `http://localhost:8081`.
- **Set:** Playwright uses the URL directly and does **not** start a server.  Point it at a staging URL or a server you already started.

---

## Running the tests

All commands are run from the **repo root** using `--prefix qa` so you never
need to `cd` into the `qa/` folder.

| Command                                                      | What it does                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| `npm --prefix qa run test:e2e`                               | Run every test on all three browser projects (chromium, firefox, webkit) |
| `npm --prefix qa run test:e2e:chromium`                      | Chromium only                                                   |
| `npm --prefix qa run test:e2e:headed`                        | Opens a visible browser window (useful for debugging)           |
| `npm --prefix qa run test:framework`                         | Framework self-tests only (no web server required)              |
| `npm --prefix qa run test:list`                              | List every test without running them                            |
| `npm --prefix qa run report`                                 | Open the last HTML report in your browser                       |

### Targeting a specific test file

Pass the path after `--`:

```bash
npm --prefix qa run test:e2e -- --project=chromium playwright/tests/smoke.spec.ts
```

### Running by tag

```bash
npm --prefix qa run test:e2e -- --grep "@smoke"
```

---

## Folder structure

```
qa/
├── .env.example                  # Template — copy to qa/.env
├── .env                          # Your local env (git-ignored)
├── .gitignore
├── package.json
├── playwright.config.ts          # Playwright configuration (reporters, projects, webServer)
├── tsconfig.json
│
├── shared/                       # Tool-agnostic utilities (used by Playwright AND future Maestro)
│   ├── env.ts                    # Loads and validates environment variables
│   ├── logger.ts                 # Lightweight scoped logger (structlog-style)
│   └── data-factory.ts           # Deterministic fake-data generator (seeded)
│
├── playwright/
│   ├── fixtures/
│   │   └── index.ts              # Extended test/expect — import here, not from @playwright/test
│   ├── pages/
│   │   ├── base.page.ts          # BasePage — all Page Objects extend this
│   │   └── admin/
│   │       └── login.page.ts     # Example POM: Admin login
│   ├── support/
│   │   ├── auth.ts               # Admin login path + storageState helper
│   │   ├── assertions.ts         # Custom expect matchers + utility helpers
│   │   ├── global-setup.ts       # Runs once before all tests (saves admin storageState)
│   │   └── global-teardown.ts    # Runs once after all tests
│   ├── tests/
│   │   ├── smoke.spec.ts         # Infrastructure smoke (@smoke tag)
│   │   └── framework.spec.ts     # Framework self-tests (no browser)
│   ├── admin/                    # Future admin-role test files
│   ├── customer/                 # Future customer-role test files
│   └── provider/                 # Future provider-role test files
│
├── maestro/
│   └── README.md                 # Placeholder — future Android/iOS Maestro automation
│
├── .auth/                        # Saved storageState (git-ignored; written by global-setup)
│   └── admin.json
├── reports/
│   ├── html/                     # HTML report (open with `npm --prefix qa run report`)
│   └── results.json              # JSON report (useful for CI parsing)
├── test-results/                 # Raw Playwright test artefacts (git-ignored)
├── screenshots/                  # Failure screenshots (git-ignored)
└── videos/                       # Failure videos (git-ignored)
```

---

## How to add a Page Object

1. Create a file under `qa/playwright/pages/<role>/<screen>.page.ts`.
2. Extend `BasePage`, set `path`, and expose all `Locator`s as `readonly` properties.
3. Override `waitForReady()` if `domcontentloaded` is not a reliable signal for that page.

```ts
// qa/playwright/pages/admin/bookings.page.ts
import { type Page, type Locator } from '@playwright/test';
import { BasePage } from '../base.page';

export class BookingsPage extends BasePage {
  readonly path = '/(admin-web)/bookings';
  readonly bookingTable: Locator;
  readonly newBookingButton: Locator;

  constructor(page: Page) {
    super(page);
    this.bookingTable  = page.getByRole('table', { name: /bookings/i });
    this.newBookingButton = page.getByRole('button', { name: /new booking/i });
  }

  async waitForReady(): Promise<void> {
    await this.bookingTable.waitFor({ state: 'visible' });
  }
}
```

Rules:
- **Keep all selectors inside the Page Object** — tests never contain `getByRole`/`getByPlaceholder` calls.
- One file per screen.
- Group by role: `admin/`, `customer/`, `provider/`.

---

## How to add fixtures

All fixtures live in `qa/playwright/fixtures/index.ts`.  To add a new fixture,
extend the `QaFixtures` type and add a property to the `base.extend<>({})` call:

```ts
type QaFixtures = {
  logger: Logger;
  testData: DataFactory;
  adminPage: Page;
  myNewFixture: MyType;   // ← add here
};

export const test = base.extend<QaFixtures>({
  // ... existing fixtures ...
  myNewFixture: async ({}, use) => {
    const value = await createMyThing();
    await use(value);
    await value.teardown?.();  // optional cleanup
  },
});
```

Every test file imports `{ test, expect }` from `../fixtures` (not from
`@playwright/test`) so all fixtures are available automatically.

---

## How to add tests

1. Create a `*.spec.ts` file under `qa/playwright/tests/` or inside the role
   folder (`admin/`, `customer/`, `provider/`).
2. Import from `../fixtures` (not `@playwright/test`).
3. Use a Page Object — never inline selectors.
4. Use `testData` for values that need to be deterministic across runs.

```ts
import { test, expect, adminStorageState } from '../fixtures';
import { BookingsPage } from '../pages/admin/bookings.page';

test.describe('admin bookings @admin', () => {
  // Authed tests: tell Playwright to restore the admin session.
  test.use({ storageState: adminStorageState });   // from fixtures/index.ts

  test('booking table is visible', async ({ page }) => {
    const bookings = new BookingsPage(page);
    await bookings.goto();
    await expect(bookings.bookingTable).toBeVisible();
  });
});
```

Tag conventions: `@smoke` (infrastructure), `@admin`, `@customer`, `@provider`.

---

## How reports work

Playwright writes three report formats after every run:

| Format       | Location                   | How to open                                              |
| ------------ | -------------------------- | -------------------------------------------------------- |
| **HTML**     | `qa/reports/html/index.html` | `npm --prefix qa run report` (opens in your browser)   |
| **JSON**     | `qa/reports/results.json`  | Parse in CI pipelines / dashboards                       |
| **List**     | stdout                     | Printed live during the run                              |

Screenshots (on failure), videos (on failure), and traces (on first retry) are
written to `qa/test-results/` and `qa/reports/` — all git-ignored.

---

## Authentication

`qa/playwright/support/global-setup.ts` runs **once** before all tests.  If
`E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` are set and valid, it logs in as the
admin and saves the browser storage state to `qa/.auth/admin.json`.

To use the saved session in a test:

```ts
import { test, adminStorageState } from '../fixtures';

test.use({ storageState: adminStorageState });
```

`adminStorageState` is `undefined` when the file does not exist (no creds
provided), so the test context starts unauthenticated.  Only the public smoke
test runs without creds.

---

## Troubleshooting

**`expo start --web` times out (3-minute limit)**
- Check that Expo CLI is installed: `npm ls expo` in the repo root.
- Try running `npm run web` from the repo root yourself — look for port conflicts
  on 8081, Metro bundling errors, or missing `.env` in the main project.
- Set `BASE_URL=http://localhost:8081` in `qa/.env` and start the server in a
  separate terminal.  This bypasses the auto-start.

**Admin login page does not render at `/(admin-web)/login`**
- The admin login is uniquely identified by `getByPlaceholder('admin@example.com')`.
  If the route changes, update the single constant `ADMIN_LOGIN_PATH` in
  `qa/playwright/support/auth.ts`.

**`Timeout 10 000ms exceeded` on a locator**
- Increase `expect.timeout` in `playwright.config.ts` if the app is slow to
  hydrate on the first load.
- Run `--headed` to watch what the browser actually renders.

**Browsers not installed**
- Run `npm --prefix qa run install:browsers` (all browsers) or
  `npm --prefix qa run install:chromium` (Chromium only).

**`storageState` file missing**
- This is expected when no admin credentials are configured.  Only the public
  smoke test runs.  Set `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` in `qa/.env`
  and re-run.

**TypeScript errors after adding a new file**
- Run `npm --prefix qa run typecheck` and fix reported errors before committing.
- The `qa/tsconfig.json` includes `playwright/**/*.ts` and `shared/**/*.ts`.
  Files outside those globs are not type-checked.

**Flaky test on CI**
- Increase `retries` in `playwright.config.ts` (CI is already set to 2).
- Use `--debug` to record a Playwright trace: `playwright test --debug`.
  The trace viewer shows the exact DOM at every action.

---

## CI notes

- Set `CI=true` in the environment.  This switches `workers` to 1 (sequential),
  `retries` to 2, `forbidOnly` to `true` (a `test.only` in the tree fails the
  build), and `reuseExistingServer` to `false`.
- Install browsers in CI before running tests:
  ```bash
  npm install --prefix qa
  npm --prefix qa run install:chromium
  ```
  On Linux CI runners, the browsers also need OS libraries. Install them from
  the `qa/` directory with `npx playwright install --with-deps chromium` (the
  `--with-deps` flag pulls the required system packages; it is unnecessary on
  Windows/macOS).
- Provide `BASE_URL` pointing at a pre-started server (or a staging URL) to
  avoid the auto-start path in CI — the expo bundler can be slow and the
  3-minute timeout may not be enough on slow runners.
- Artifacts (HTML report, JSON, traces, screenshots, videos) are all written
  under `qa/reports/` and `qa/test-results/` — upload these as CI artefacts
  for post-run inspection.
- `package-lock.json` lives at the repo root (not inside `qa/`).  If it drifts
  after installing qa dependencies, restore it with `git checkout -- package-lock.json`.

---

## Dashboard isolation testing (Executive Dashboard suite)

The **Admin Executive Dashboard** suite (`qa/playwright/admin/executive-dashboard.spec.ts`)
intentionally uses the **`mockAdminSession`** fixture (`qa/playwright/support/mock-admin-session.ts`)
to establish an authenticated admin deterministically, so the dashboard can be
isolated and thoroughly tested offline (with the analytics RPCs stubbed).

- `mockAdminSession` exists **only** for deterministic dashboard isolation — it
  is not a substitute for real-login testing. It satisfies the real `(admin-web)`
  route guard through the normal application route (no guard bypass, no direct
  component mount) and stubs only the minimum auth/session/profile traffic.
- The **Admin Authentication suite** (`qa/playwright/admin/authentication.spec.ts`)
  remains the **source of truth for real authentication behavior**.
- An **optional connected-environment confirmation** using real authentication
  (`QA_DASHBOARD_CONNECTED=1` with `E2E_ADMIN_*` against a reachable backend) is
  **recommended before production releases**, to confirm the mocked dashboard and
  the real dashboard agree.

## Detailed Analytics suite (Slice 42)

The **Admin Detailed Analytics** suite (`qa/playwright/admin/detailed-analytics.spec.ts`,
`/(admin-web)/analytics/detailed`) follows the same isolation pattern as the Executive Dashboard:

- It **reuses `mockAdminSession` unchanged** — no fork, no duplicate — to satisfy the real admin
  route guard offline.
- It adds a **separate, detailed-scoped stub module** (`qa/playwright/support/detailed-analytics-stubs.ts`)
  for the nine Slice-25/28 analytics RPCs (`analytics_kpis`, `bookings_timeseries`/`summary`,
  `financial_timeseries`/`summary`, `providers`, `services`, `geography`, `customers`), with strict
  request-shape validation (incl. `p_bucket`/`p_limit`) and called/missing/unexpected tracking. It is
  **not** a generic mocking framework.
- CSV exports are verified against the **real download content** (headers, ordering, escaping, row
  count, and the formula-injection guard).
- The suite is **Chromium-only** (desktop admin-web); it skips on Firefox/WebKit.
- Optional connected real-session mode (`QA_DASHBOARD_CONNECTED=1` + `E2E_ADMIN_*`) is preserved; a
  connected confirmation is recommended before production releases.
- It **reuses the shared QA infrastructure** introduced in previous slices (`mockAdminSession`, the
  network guard, and the strict RPC tracker pattern). New admin-analytics suites should **extend those
  shared components rather than duplicating them**.

## Future Maestro integration

`qa/maestro/` is reserved for native Android/iOS UI automation using
[Maestro](https://maestro.mobile.dev/).  Nothing is implemented in Slice 39.

The folder exists so the directory structure is established now:

- Maestro YAML flows will live under `qa/maestro/flows/`.
- Maestro will reuse `qa/shared/` (env, logger, data-factory) for consistent
  test data and configuration.
- The `qa/reports/`, `qa/screenshots/`, and `qa/videos/` artifact directories
  are shared between Playwright and Maestro runs.
- No additional repository restructuring is required when Maestro is added.

See `qa/maestro/README.md` for the current placeholder note.
