# Slice 39 — QA Automation Framework (Playwright) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, production-quality Playwright QA automation framework at `qa/` — infrastructure only, no feature automation — that future slices extend to hundreds of tests.

**Architecture:** An isolated `qa/` workspace with its own `package.json`/`node_modules`/`tsconfig`/Playwright config. Tool-agnostic code lives in `qa/shared/`; Playwright-specific code under `qa/playwright/`; a `qa/maestro/` placeholder reserves the multi-tool future. The framework treats QuickServe Admin Web as a black box over HTTP (auto-started via `expo start --web` or a `BASE_URL` override). The app is never imported. The only files touched outside `qa/` are two additive, precedented config exclusions.

**Tech Stack:** Playwright (`@playwright/test`), TypeScript (standalone), Node 24 / npm 11, `dotenv`. The app under test is Expo web (`expo start --web`, default `http://localhost:8081`).

## Global Constraints

- **Infrastructure only.** No automation of any app feature (no booking/wallet/analytics/notification/customer/provider/admin flow). Only a framework self-test + an infrastructure smoke test.
- **Isolation.** `qa/` is a standalone package with its own `node_modules`. Never `import` from `src/` or the app. No app dependency added to the root `package.json`.
- **Only two files outside `qa/` may change, additively (mirroring the existing `apps/website` exclusion):** `jest.config.js` (`testPathIgnorePatterns` += `'/qa/'`) and `tsconfig.json` (`exclude` += `"qa"`). No app behaviour change.
- **No DB / Supabase / schema / app functionality / UI-behaviour change.** No account creation; the admin account must pre-exist. Data factory generates values only (no DB, no network).
- **Security.** No secrets committed. Real values only in `qa/.env` (git-ignored). storageState under `qa/.auth/` (git-ignored). `qa/.env.example` documents keys.
- **webServer behaviour:** if `BASE_URL` is set → use it, do not start a server; else → auto-start `expo start --web` and wait on `http://localhost:8081`.
- **Browsers:** Chromium (primary), Firefox, WebKit as projects.
- **Admin login oracle:** the admin login page renders `getByPlaceholder('admin@example.com')` (onboarding login uses `you@example.com`) — the unique, infrastructure-level target for the smoke test.
- **Gate philosophy ("full"):** each task: `qa` typecheck + (browsers install when needed) + `npx playwright test` for the relevant specs; the app's own gate (`npm test`, root `tsc --noEmit`) stays green. **Honesty rule:** if the live web run is environmentally blocked, report it explicitly (never a false pass) — evidence via `playwright test --list` + self-tests remains.

Spec: `docs/superpowers/specs/2026-07-24-slice-39-playwright-qa-automation-framework-design.md`

---

## File Structure (created across the tasks)

```
qa/
  package.json                     (T1)  own deps + scripts
  tsconfig.json                    (T1)  standalone TS
  .gitignore                       (T1)
  .env.example                     (T1)
  README.md                        (T6)
  playwright.config.ts             (T1 minimal → T2 full)
  shared/
    env.ts                         (T3)  loadEnv(): QaEnv
    logger.ts                      (T3)  createLogger()
    data-factory.ts                (T3)  createDataFactory(seed), createRng(seed)
  playwright/
    admin/.gitkeep customer/.gitkeep provider/.gitkeep   (T1)
    pages/
      base.page.ts                 (T5)  BasePage
      admin/login.page.ts          (T5)  LoginPage
    fixtures/
      index.ts                     (T5)  extended test/expect + logger/testData fixtures
    support/
      assertions.ts                (T3)  isOnPath, filterSevereConsoleErrors, expect.extend
      auth.ts                      (T4)  loginAsAdmin, ADMIN_STORAGE_STATE_PATH
      global-setup.ts              (T4)  guarded storageState
      global-teardown.ts           (T4)  run summary
    tests/
      sanity.spec.ts               (T1)  proves the runner executes (removed in T3)
      framework.spec.ts            (T3)  framework self-tests
      smoke.spec.ts                (T6)  infrastructure smoke
  maestro/.gitkeep + README note   (T6)
  (runtime, git-ignored) .auth/  reports/  screenshots/  videos/  test-results/
docs/pilot/qa-framework-verification.md   (T7)
jest.config.js                     (T1)  += '/qa/' (additive)
tsconfig.json                      (T1)  += "qa" (additive)
```

---

### Task 1: Scaffold the `qa/` workspace + additive root exclusions

**Objective:** Create the isolated `qa/` package (config, folder tree, deps), install `@playwright/test` + Chromium, a minimal Playwright config, and a trivial `sanity.spec.ts` proving `npx playwright test` runs — plus the two additive root exclusions so the app gate stays green.

**Files:**
- Create: `qa/package.json`, `qa/tsconfig.json`, `qa/.gitignore`, `qa/.env.example`, `qa/playwright.config.ts` (minimal), `qa/playwright/tests/sanity.spec.ts`
- Create (empty placeholders): `qa/playwright/admin/.gitkeep`, `qa/playwright/customer/.gitkeep`, `qa/playwright/provider/.gitkeep`, `qa/shared/.gitkeep`, `qa/maestro/.gitkeep`
- Modify: `jest.config.js`, `tsconfig.json` (additive one-line each)

**Expected folder structure after this task:** `qa/` with `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `playwright.config.ts`, `playwright/{admin,customer,provider}/.gitkeep`, `playwright/tests/sanity.spec.ts`, `shared/.gitkeep`, `maestro/.gitkeep`, and `qa/node_modules/` + `qa/package-lock.json` from install.

**Interfaces — Produces:** the `qa/` package, `npm --prefix qa` scripts, and a runnable Playwright install.

**Implementation approach:** create config files verbatim (below); install deps inside `qa/`; add the two root exclusions.

- [ ] **Step 1: Create `qa/package.json`**

```json
{
  "name": "quickserve-qa",
  "version": "0.1.0",
  "private": true,
  "description": "QuickServe QA automation workspace (Playwright now; Maestro-ready).",
  "scripts": {
    "install:browsers": "playwright install",
    "install:chromium": "playwright install chromium",
    "typecheck": "tsc --noEmit",
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:chromium": "playwright test --project=chromium",
    "test:framework": "playwright test playwright/tests/framework.spec.ts playwright/tests/sanity.spec.ts",
    "test:list": "playwright test --list",
    "report": "playwright show-report reports/html"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@types/node": "^22.0.0",
    "dotenv": "^16.4.5",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `qa/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "lib": ["ES2022", "DOM"],
    "types": ["node", "@playwright/test"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["playwright/**/*.ts", "shared/**/*.ts", "playwright.config.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `qa/.gitignore`**

```
node_modules/
.auth/
reports/
screenshots/
videos/
test-results/
playwright-report/
.env
*.log
```

- [ ] **Step 4: Create `qa/.env.example`**

```
# QuickServe QA — copy to qa/.env (never commit qa/.env).

# Base URL of the Admin Web app under test.
# If set, Playwright uses it directly and does NOT start a server.
# If unset, Playwright auto-starts `expo start --web` and uses http://localhost:8081.
# BASE_URL=http://localhost:8081

# Admin test account (MUST already exist — this framework never creates accounts).
# If unset, authenticated storageState setup is skipped and only the public smoke runs.
# E2E_ADMIN_EMAIL=qa.admin@example.com
# E2E_ADMIN_PASSWORD=change-me
```

- [ ] **Step 5: Create minimal `qa/playwright.config.ts`** (full config comes in T2)

```ts
import { defineConfig } from '@playwright/test';

// Minimal config — hardened in Task 2.
export default defineConfig({
  testDir: './playwright',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results',
  reporter: [['list']],
});
```

- [ ] **Step 6: Create `qa/playwright/tests/sanity.spec.ts`** (proves the runner executes)

```ts
import { test, expect } from '@playwright/test';

test('framework runner executes (sanity)', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 7: Create placeholder files**

Create empty files: `qa/playwright/admin/.gitkeep`, `qa/playwright/customer/.gitkeep`, `qa/playwright/provider/.gitkeep`, `qa/shared/.gitkeep`, `qa/maestro/.gitkeep`.

- [ ] **Step 8: Add the two additive root exclusions**

In `jest.config.js`, extend the existing array:
```js
  testPathIgnorePatterns: ['/node_modules/', '/apps/website/', '/qa/'],
```
In `tsconfig.json`, add `"qa"` to the existing `exclude` array (first entry after `_parked`):
```json
  "exclude": [
    "_parked",
    "qa",
    "apps/website",
```

- [ ] **Step 9: Install deps + Chromium inside `qa/`**

Run: `npm install --prefix qa` then `npm --prefix qa run install:chromium`
Expected: dependencies install; Chromium downloads. (Commit `qa/package-lock.json`; `qa/node_modules` is git-ignored.)

- [ ] **Step 10: Verify the runner runs + app gate stays green**

Run: `npm --prefix qa run test:list`
Expected: lists `sanity.spec.ts`.
Run: `npm --prefix qa run test:e2e -- playwright/tests/sanity.spec.ts`
Expected: 1 passed.
Run (app gate unaffected): `npx tsc --noEmit` → clean; `npm test` → the app suite still green (jest ignores `/qa/`).

- [ ] **Step 11: Commit**

```bash
git add qa/package.json qa/package-lock.json qa/tsconfig.json qa/.gitignore qa/.env.example qa/playwright.config.ts qa/playwright/tests/sanity.spec.ts qa/playwright/admin/.gitkeep qa/playwright/customer/.gitkeep qa/playwright/provider/.gitkeep qa/shared/.gitkeep qa/maestro/.gitkeep jest.config.js tsconfig.json
git commit -m "feat: slice39 scaffold qa/ playwright workspace + additive root exclusions"
```

**Validation ("green"):** `qa` deps installed; `test:list` shows the sanity spec; sanity spec passes; root `tsc --noEmit` clean; app `npm test` still green; only `qa/**` + the two additive lines changed.

**Guardrails:** No `src/` import; the only non-`qa/` edits are the two additive exclusions; no app dependency in the root package.json.

**Review checklist:** ☐ `qa/` is standalone (own package.json/node_modules) ☐ two root edits are additive + precedented ☐ app gate green ☐ sanity spec runs ☐ `.env.example` has no secrets ☐ placeholders (incl. `maestro/`) present.

**Rollback:** delete `qa/`; revert the two one-line additions in `jest.config.js` and `tsconfig.json`.

---

### Task 2: Complete the Playwright configuration

**Objective:** Replace the minimal config with the production config: 3 browser projects, retries, HTML/list/JSON reporters, trace/video/screenshot, timeouts, outputDir, global setup/teardown wiring (files created in T4 — reference by path), and the `webServer` with `BASE_URL` override.

**Files:** Modify `qa/playwright.config.ts`. (Consumes `qa/shared/env.ts` — but that lands in T3; so this task adds a **local** minimal env read inline and T3 refactors it to import `./shared/env`. To avoid a forward dependency, this task inlines the env logic and T3 replaces the inline block with an import.)

**Interfaces — Produces:** the full `defineConfig` used by every future test; `use.baseURL`, reporters at `reports/`, artifacts on failure.

- [ ] **Step 1: Write `qa/playwright.config.ts` (full)**

```ts
import { defineConfig, devices } from '@playwright/test';

// Inline env resolution (Task 3 refactors this to `import { loadEnv } from './shared/env'`).
const providedBaseUrl = process.env.BASE_URL?.trim();
const BASE_URL = providedBaseUrl && providedBaseUrl.length > 0 ? providedBaseUrl : 'http://localhost:8081';
const START_SERVER = !(providedBaseUrl && providedBaseUrl.length > 0);
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './playwright',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 1 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: START_SERVER
    ? {
        command: 'npm run web',
        cwd: '..',
        url: BASE_URL,
        timeout: 180_000,
        reuseExistingServer: !CI,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { BROWSER: 'none' },
      }
    : undefined,
});
```

- [ ] **Step 2: Verify the config loads and lists across projects**

Run (no server started because BASE_URL is set): `BASE_URL=http://localhost:8081 npm --prefix qa run test:list`
Expected: the sanity spec is listed **3 times** (once per project: chromium/firefox/webkit).

- [ ] **Step 3: Verify sanity still passes on Chromium (no server needed)**

Run: `BASE_URL=http://localhost:8081 npm --prefix qa run test:e2e -- --project=chromium playwright/tests/sanity.spec.ts`
Expected: 1 passed; an HTML report is written to `qa/reports/html`.

- [ ] **Step 4: Confirm app gate unaffected**

Run: `npx tsc --noEmit` → clean; `npm test` → app suite green.

- [ ] **Step 5: Commit**

```bash
git add qa/playwright.config.ts
git commit -m "feat: slice39 full playwright config (browsers, reporters, artifacts, webServer)"
```

**Validation ("green"):** config compiles; `test:list` enumerates the sanity spec across all 3 projects; a Chromium run passes and produces an HTML report under `qa/reports/`; setting `BASE_URL` disables auto-start; app gate green.

**Guardrails:** webServer only starts when `BASE_URL` is unset; `cwd: '..'` runs the parent's `expo start --web`; `BROWSER: 'none'` prevents Expo from opening a browser tab; no app code touched.

**Review checklist:** ☐ 3 projects ☐ retries CI=2/local=0 ☐ HTML+list+JSON reporters ☐ trace on-first-retry, screenshot only-on-failure, video retain-on-failure ☐ webServer gated on `BASE_URL` with `cwd:'..'` ☐ outputDir/report dirs under `qa/`.

**Rollback:** restore the minimal config from Task 1.

---

### Task 3: Shared utilities (env, logger, data-factory, assertions) + framework self-tests

**Objective:** Build the tool-agnostic utilities in `qa/shared/` (env, logger, data-factory), the Playwright-coupled custom assertions in `qa/playwright/support/assertions.ts`, and TDD framework self-tests proving them. Refactor `playwright.config.ts` to import `loadEnv`.

**Files:**
- Create: `qa/shared/env.ts`, `qa/shared/logger.ts`, `qa/shared/data-factory.ts`, `qa/playwright/support/assertions.ts`, `qa/playwright/tests/framework.spec.ts`
- Delete: `qa/playwright/tests/sanity.spec.ts` (superseded by framework.spec.ts)
- Modify: `qa/playwright.config.ts` (replace the inline env block with `import { loadEnv } from './shared/env'`), `qa/package.json` (`test:framework` script → drop `sanity.spec.ts`)

**Interfaces — Produces:**
- `loadEnv(): QaEnv` where `QaEnv = { BASE_URL: string; START_SERVER: boolean; CI: boolean; adminEmail?: string; adminPassword?: string; hasAdminCreds: boolean }`
- `createLogger(scope?: string, minLevel?: 'debug'|'info'|'warn'|'error'): Logger` with `.debug/.info/.warn/.error/.child`
- `createDataFactory(seed?: number): DataFactory` with `.email()/.fullName()/.uuid()/.bookingDraft()`; `createRng(seed): () => number`
- `isOnPath(current: string, expected: string): boolean`; `filterSevereConsoleErrors(msgs: string[]): string[]`; `expect` (extended)

- [ ] **Step 1: Write the failing self-tests** — `qa/playwright/tests/framework.spec.ts`

```ts
import { test, expect } from '@playwright/test';
import { loadEnv } from '../../shared/env';
import { createLogger } from '../../shared/logger';
import { createDataFactory } from '../../shared/data-factory';
import { isOnPath, filterSevereConsoleErrors } from '../support/assertions';

test.describe('framework self-tests', () => {
  test('data factory is deterministic for a given seed', () => {
    const a = createDataFactory(42);
    const b = createDataFactory(42);
    expect(a.email()).toBe(b.email());
    expect(a.fullName()).toBe(b.fullName());
    expect(a.uuid()).toBe(b.uuid());
  });

  test('data factory differs across seeds', () => {
    expect(createDataFactory(1).uuid()).not.toBe(createDataFactory(2).uuid());
  });

  test('data factory produces valid-shaped values', () => {
    const f = createDataFactory(7);
    expect(f.email()).toMatch(/@example\.com$/);
    expect(f.fullName().split(' ').length).toBeGreaterThanOrEqual(2);
    const b = f.bookingDraft();
    expect(typeof b.service).toBe('string');
    expect(b.amount).toBeGreaterThan(0);
  });

  test('env loader returns a base URL and a creds flag', () => {
    const env = loadEnv();
    expect(env.BASE_URL).toMatch(/^https?:\/\//);
    expect(typeof env.hasAdminCreds).toBe('boolean');
    expect(typeof env.START_SERVER).toBe('boolean');
  });

  test('logger child scopes compose and never throw', () => {
    const log = createLogger('root').child('sub');
    expect(() => log.info('hello', { a: 1 })).not.toThrow();
    expect(() => log.error('boom')).not.toThrow();
  });

  test('isOnPath matches exact and prefix', () => {
    expect(isOnPath('/login', '/login')).toBe(true);
    expect(isOnPath('/(admin-web)/login', '/(admin-web)')).toBe(true);
    expect(isOnPath('/other', '/login')).toBe(false);
  });

  test('filterSevereConsoleErrors drops benign warnings', () => {
    const severe = filterSevereConsoleErrors([
      'Warning: componentWillMount is deprecated',
      'Download the React DevTools',
      'Uncaught TypeError: x is not a function',
    ]);
    expect(severe).toEqual(['Uncaught TypeError: x is not a function']);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `BASE_URL=http://localhost:8081 npm --prefix qa run test:e2e -- --project=chromium playwright/tests/framework.spec.ts`
Expected: FAIL — cannot resolve `../../shared/env` etc.

- [ ] **Step 3: Implement `qa/shared/env.ts`**

```ts
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export type QaEnv = {
  BASE_URL: string;
  START_SERVER: boolean;
  CI: boolean;
  adminEmail?: string;
  adminPassword?: string;
  hasAdminCreds: boolean;
};

const DEFAULT_BASE_URL = 'http://localhost:8081';

export function loadEnv(): QaEnv {
  const provided = process.env.BASE_URL?.trim();
  const hasProvided = !!(provided && provided.length > 0);
  const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim() || undefined;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim() || undefined;
  return {
    BASE_URL: hasProvided ? (provided as string) : DEFAULT_BASE_URL,
    START_SERVER: !hasProvided,
    CI: !!process.env.CI,
    adminEmail,
    adminPassword,
    hasAdminCreds: !!(adminEmail && adminPassword),
  };
}
```

- [ ] **Step 4: Implement `qa/shared/logger.ts`**

```ts
export type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type Logger = {
  debug: (msg: string, meta?: unknown) => void;
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
  child: (scope: string) => Logger;
};

export function createLogger(scope = 'qa', minLevel: Level = 'info'): Logger {
  const min = ORDER[minLevel];
  const emit = (level: Level, msg: string, meta?: unknown) => {
    if (ORDER[level] < min) return;
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${scope}] ${msg}`;
    const args = meta === undefined ? [line] : [line, meta];
    if (level === 'error') console.error(...args);
    else if (level === 'warn') console.warn(...args);
    else console.log(...args);
  };
  return {
    debug: (m, meta) => emit('debug', m, meta),
    info: (m, meta) => emit('info', m, meta),
    warn: (m, meta) => emit('warn', m, meta),
    error: (m, meta) => emit('error', m, meta),
    child: (childScope: string) => createLogger(`${scope}:${childScope}`, minLevel),
  };
}
```

- [ ] **Step 5: Implement `qa/shared/data-factory.ts`**

```ts
/** Deterministic PRNG (mulberry32): same seed → same sequence. No DB, no network. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type BookingDraft = { service: string; note: string; amount: number };
export type DataFactory = {
  email: () => string;
  fullName: () => string;
  uuid: () => string;
  bookingDraft: () => BookingDraft;
};

const FIRST = ['Amina', 'Brian', 'Chege', 'Dalia', 'Emeka', 'Faith', 'Grace', 'Hassan'];
const LAST = ['Otieno', 'Kamau', 'Mwangi', 'Achieng', 'Wanjiru', 'Njoroge'];
const SERVICES = ['house-cleaning', 'plumbing', 'ac-repair', 'handyman', 'massage'];

export function createDataFactory(seed = 1): DataFactory {
  const rng = createRng(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rng() * 16).toString(16)).join('');
  return {
    email: () => `qa+${hex(8)}@example.com`,
    fullName: () => `${pick(FIRST)} ${pick(LAST)}`,
    uuid: () => `${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${hex(12)}`,
    bookingDraft: () => ({ service: pick(SERVICES), note: `QA note ${hex(4)}`, amount: int(500, 5000) }),
  };
}
```

- [ ] **Step 6: Implement `qa/playwright/support/assertions.ts`**

```ts
import { expect as baseExpect, type Page } from '@playwright/test';

/** Pure: true when `current` equals `expected` or is nested under it. */
export function isOnPath(current: string, expected: string): boolean {
  if (current === expected) return true;
  const prefix = expected.endsWith('/') ? expected : `${expected}/`;
  return current.startsWith(prefix) || current.startsWith(expected);
}

/** Pure: drop benign console noise, keep severe errors. */
export function filterSevereConsoleErrors(messages: string[]): string[] {
  const BENIGN = [/^Warning:/i, /React DevTools/i, /\[expo\]/i, /Download the React/i];
  return messages.filter((m) => !BENIGN.some((re) => re.test(m)));
}

export const expect = baseExpect.extend({
  toBeOnPath(page: Page, expected: string) {
    const pathname = new URL(page.url()).pathname;
    const pass = isOnPath(pathname, expected);
    return {
      pass,
      message: () => `expected page path to be "${expected}", but was "${pathname}"`,
    };
  },
});
```

- [ ] **Step 7: Refactor `qa/playwright.config.ts` to import `loadEnv`**

Replace the inline env block (the 4 `const` lines) with:
```ts
import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from './shared/env';

const env = loadEnv();
const { BASE_URL, START_SERVER, CI } = env;
```
(leave the rest of the config identical.)

- [ ] **Step 8: Delete the superseded sanity spec + update the script**

Delete `qa/playwright/tests/sanity.spec.ts`. In `qa/package.json`, change `test:framework` to `"playwright test playwright/tests/framework.spec.ts"`.

- [ ] **Step 9: Run the self-tests green**

Run: `BASE_URL=http://localhost:8081 npm --prefix qa run test:e2e -- --project=chromium playwright/tests/framework.spec.ts`
Expected: all 7 self-tests pass, **no web server started** (BASE_URL set), no navigation.

- [ ] **Step 10: Typecheck + app gate**

Run: `npm --prefix qa run typecheck` → clean; `npx tsc --noEmit` → clean; `npm test` → app green.

- [ ] **Step 11: Commit**

```bash
git add qa/shared qa/playwright/support/assertions.ts qa/playwright/tests/framework.spec.ts qa/playwright.config.ts qa/package.json
git rm qa/playwright/tests/sanity.spec.ts
git commit -m "feat: slice39 shared utilities (env, logger, data-factory) + custom assertions + self-tests"
```

**Validation ("green"):** all 7 framework self-tests pass on Chromium without starting a server; `qa` typecheck clean; config imports `loadEnv`; app gate green.

**Guardrails:** utilities are pure/tool-agnostic (env/logger/data-factory in `shared/`); data-factory does no DB/network; assertions are generic (not feature-specific); no `src/` import.

**Review checklist:** ☐ env/logger/data-factory in `qa/shared/` ☐ assertions in `qa/playwright/support/` ☐ data-factory deterministic + no DB ☐ self-tests substantive (determinism, shape, env, logger, isOnPath, filter) ☐ config now imports `loadEnv` ☐ sanity spec removed.

**Rollback:** delete the new files; restore the inline env block in the config and re-add `sanity.spec.ts`.

---

### Task 4: Authentication helpers + global setup / teardown

**Objective:** Add the admin auth helper, the guarded global-setup (storageState when creds present; graceful skip otherwise), and global-teardown; wire them into the config.

**Files:**
- Create: `qa/playwright/support/auth.ts`, `qa/playwright/support/global-setup.ts`, `qa/playwright/support/global-teardown.ts`
- Modify: `qa/playwright.config.ts` (add `globalSetup`/`globalTeardown`)

**Interfaces — Produces:**
- `loginAsAdmin(page: Page): Promise<void>`; `ADMIN_STORAGE_STATE_PATH: string` (absolute, under `qa/.auth/admin.json`); `ADMIN_LOGIN_PATH = '/(admin-web)/login'`
- default-exported `globalSetup(config)`, `globalTeardown()`

- [ ] **Step 1: Implement `qa/playwright/support/auth.ts`**

```ts
import { type Page } from '@playwright/test';
import * as path from 'path';
import { loadEnv } from '../../shared/env';

/** Admin login route. The admin login page is uniquely identified by the
 *  email placeholder 'admin@example.com' (onboarding login uses 'you@example.com'). */
export const ADMIN_LOGIN_PATH = '/(admin-web)/login';
export const ADMIN_EMAIL_PLACEHOLDER = 'admin@example.com';
export const ADMIN_STORAGE_STATE_PATH = path.resolve(__dirname, '../../.auth/admin.json');

/** Drives the admin login form. Requires creds (caller must check hasAdminCreds). */
export async function loginAsAdmin(page: Page): Promise<void> {
  const env = loadEnv();
  if (!env.hasAdminCreds) throw new Error('loginAsAdmin: admin credentials are not set');
  await page.goto(ADMIN_LOGIN_PATH);
  await page.getByPlaceholder(ADMIN_EMAIL_PLACEHOLDER).fill(env.adminEmail as string);
  await page.getByPlaceholder('Your password').fill(env.adminPassword as string);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !new URL(url).pathname.includes('login'), { timeout: 30_000 });
}
```

> **Implementation note (one runtime confirmation, not a placeholder):** the constant `ADMIN_LOGIN_PATH` is the single value to confirm against the running dev server. Start `expo start --web`, open the admin login, and verify `getByPlaceholder('admin@example.com')` is visible at `/(admin-web)/login`. If the dev server resolves the admin login at `/login` instead, set `ADMIN_LOGIN_PATH = '/login'` — the placeholder oracle disambiguates it from the onboarding login. Do not change anything in the app.

- [ ] **Step 2: Implement `qa/playwright/support/global-setup.ts`** (guarded)

```ts
import { chromium, type FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loadEnv } from '../../shared/env';
import { createLogger } from '../../shared/logger';
import { loginAsAdmin, ADMIN_STORAGE_STATE_PATH } from './auth';

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const env = loadEnv();
  const log = createLogger('global-setup');
  log.info(`Base URL: ${env.BASE_URL} (auto-start server: ${env.START_SERVER})`);

  if (!env.hasAdminCreds) {
    log.warn('No E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD — skipping authenticated storageState. Public smoke only.');
    return;
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL: env.BASE_URL });
    await loginAsAdmin(page);
    fs.mkdirSync(path.dirname(ADMIN_STORAGE_STATE_PATH), { recursive: true });
    await page.context().storageState({ path: ADMIN_STORAGE_STATE_PATH });
    log.info(`Saved admin storageState → ${ADMIN_STORAGE_STATE_PATH}`);
  } catch (err) {
    log.error('Admin login failed during global-setup — continuing WITHOUT authed state.', err);
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 3: Implement `qa/playwright/support/global-teardown.ts`**

```ts
import { createLogger } from '../../shared/logger';

export default async function globalTeardown(): Promise<void> {
  createLogger('global-teardown').info('QA run complete.');
}
```

- [ ] **Step 4: Wire into `qa/playwright.config.ts`**

Add these two keys to the `defineConfig({ ... })` object (after `expect`):
```ts
  globalSetup: require.resolve('./playwright/support/global-setup'),
  globalTeardown: require.resolve('./playwright/support/global-teardown'),
```

- [ ] **Step 5: Verify global-setup runs guarded (no creds → skip, self-tests still pass)**

Run (no admin creds in env): `BASE_URL=http://localhost:8081 npm --prefix qa run test:e2e -- --project=chromium playwright/tests/framework.spec.ts`
Expected: global-setup logs the "skipping authenticated storageState" warning; the 7 self-tests still pass; **no crash** when creds are absent.

- [ ] **Step 6: Typecheck + app gate**

Run: `npm --prefix qa run typecheck` → clean; `npx tsc --noEmit` → clean; `npm test` → app green.

- [ ] **Step 7: Commit**

```bash
git add qa/playwright/support/auth.ts qa/playwright/support/global-setup.ts qa/playwright/support/global-teardown.ts qa/playwright.config.ts
git commit -m "feat: slice39 auth helper + guarded global setup/teardown (storageState)"
```

**Validation ("green"):** with no creds, global-setup skips gracefully and the run still passes; with creds present (local, optional), it saves `qa/.auth/admin.json`; `qa` typecheck clean; app gate green.

**Guardrails:** global-setup **never throws** on login failure (logs + continues); no account creation; `.auth/` is git-ignored; no `src/` import; no DB/network beyond the admin UI login.

**Review checklist:** ☐ guarded (skip when no creds) ☐ storageState path under `qa/.auth/` ☐ login uses the admin placeholder oracle ☐ teardown side-effect-free ☐ config wires both hooks ☐ never throws on failed login.

**Rollback:** remove the three support files + the two config keys.

---

### Task 5: Page Object Model foundation + fixtures

**Objective:** Add `BasePage`, the example `LoginPage` (POM pattern — not a feature test), and the extended `test`/`expect` with `logger`/`testData` fixtures that future tests import.

**Files:**
- Create: `qa/playwright/pages/base.page.ts`, `qa/playwright/pages/admin/login.page.ts`, `qa/playwright/fixtures/index.ts`

**Interfaces — Produces:**
- `abstract class BasePage { constructor(page); readonly path; goto(); waitForReady(); url() }`
- `class LoginPage extends BasePage { path='/(admin-web)/login'; emailInput; passwordInput; submitButton; waitForReady() }`
- `test` (extended with `logger: Logger`, `testData: DataFactory`), `expect`, `adminStorageState?: string`

- [ ] **Step 1: Implement `qa/playwright/pages/base.page.ts`**

```ts
import { type Page } from '@playwright/test';

/** Foundation for every Page Object. Subclasses set `path` and may override waitForReady. */
export abstract class BasePage {
  constructor(protected readonly page: Page) {}
  abstract readonly path: string;

  async goto(): Promise<void> {
    await this.page.goto(this.path);
    await this.waitForReady();
  }

  async waitForReady(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
  }

  url(): string {
    return this.page.url();
  }
}
```

- [ ] **Step 2: Implement `qa/playwright/pages/admin/login.page.ts`**

```ts
import { type Page, type Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import { ADMIN_LOGIN_PATH, ADMIN_EMAIL_PLACEHOLDER } from '../../support/auth';

/** POM EXAMPLE for the admin login page (the framework pattern — not a feature test). */
export class LoginPage extends BasePage {
  readonly path = ADMIN_LOGIN_PATH;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.getByPlaceholder(ADMIN_EMAIL_PLACEHOLDER);
    this.passwordInput = page.getByPlaceholder('Your password');
    this.submitButton = page.getByRole('button', { name: /sign in/i });
  }

  async waitForReady(): Promise<void> {
    await this.emailInput.waitFor({ state: 'visible' });
  }
}
```

- [ ] **Step 3: Implement `qa/playwright/fixtures/index.ts`**

```ts
import { test as base } from '@playwright/test';
import * as fs from 'fs';
import { createLogger, type Logger } from '../../shared/logger';
import { createDataFactory, type DataFactory } from '../../shared/data-factory';
import { ADMIN_STORAGE_STATE_PATH } from '../support/auth';
import { expect } from '../support/assertions';

type QaFixtures = {
  logger: Logger;
  testData: DataFactory;
};

/** Extended `test` every future test imports (adds logger + deterministic testData). */
export const test = base.extend<QaFixtures>({
  logger: async ({}, use, testInfo) => {
    await use(createLogger(testInfo.title));
  },
  testData: async ({}, use) => {
    await use(createDataFactory(1));
  },
});

/** Reusable authed storageState path — defined only when global-setup produced it.
 *  Future authed tests: `test.use({ storageState: adminStorageState })`. */
export const adminStorageState: string | undefined = fs.existsSync(ADMIN_STORAGE_STATE_PATH)
  ? ADMIN_STORAGE_STATE_PATH
  : undefined;

export { expect };
```

- [ ] **Step 4: Prove fixtures work via a temporary in-process check**

Add this test to `qa/playwright/tests/framework.spec.ts` (import from `../fixtures` at the top is NOT needed here — add a separate block that imports the extended test):

Append to `framework.spec.ts`:
```ts
import { test as qaTest, expect as qaExpect } from '../fixtures';

qaTest('fixtures provide logger and deterministic testData', ({ logger, testData }) => {
  qaExpect(typeof logger.info).toBe('function');
  qaExpect(testData.email()).toContain('@example.com');
});
```

- [ ] **Step 5: Run — fixtures + POM typecheck & self-test pass**

Run: `BASE_URL=http://localhost:8081 npm --prefix qa run test:e2e -- --project=chromium playwright/tests/framework.spec.ts`
Expected: all self-tests including the new fixtures test pass (no server needed).
Run: `npm --prefix qa run typecheck` → clean (BasePage/LoginPage compile).

- [ ] **Step 6: App gate**

Run: `npx tsc --noEmit` → clean; `npm test` → app green.

- [ ] **Step 7: Commit**

```bash
git add qa/playwright/pages qa/playwright/fixtures/index.ts qa/playwright/tests/framework.spec.ts
git commit -m "feat: slice39 POM foundation (BasePage, LoginPage) + fixtures (logger, testData)"
```

**Validation ("green"):** `BasePage`/`LoginPage` compile; the extended `test` exposes `logger` + `testData`; the fixtures self-test passes; `qa` typecheck clean; app gate green.

**Guardrails:** `LoginPage` is the POM **example**, asserts nothing about business behaviour; fixtures add only infra concerns (logger/testData); no `src/` import.

**Review checklist:** ☐ BasePage abstract with goto/waitForReady/url ☐ LoginPage uses the auth constants + placeholder oracle ☐ extended test exposes logger+testData ☐ adminStorageState guarded by fs.existsSync ☐ no feature assertion.

**Rollback:** delete the pages + fixtures files and the appended fixtures self-test.

---

### Task 6: Infrastructure smoke test + documentation + placeholders

**Objective:** Add the infrastructure smoke test (Admin login page loads), the `qa/README.md`, and the `maestro/` placeholder note — completing the framework.

**Files:**
- Create: `qa/playwright/tests/smoke.spec.ts`, `qa/README.md`, `qa/maestro/README.md`

**Interfaces — Consumes:** `test`/`expect` (fixtures), `LoginPage`.

- [ ] **Step 1: Write the smoke test** — `qa/playwright/tests/smoke.spec.ts`

```ts
import { test, expect } from '../fixtures';
import { LoginPage } from '../pages/admin/login.page';

/**
 * Infrastructure smoke — proves the pipeline works end to end:
 * browser launches → web server starts → Admin login page loads →
 * reporters/artifacts engage. Asserts NO business behaviour.
 */
test.describe('infrastructure smoke @smoke', () => {
  test('Admin login page loads', async ({ page, logger }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.emailInput).toBeVisible();
    await expect(login.passwordInput).toBeVisible();
    await expect(login.submitButton).toBeVisible();
    logger.info('Admin login rendered — infrastructure healthy.');
  });
});
```

- [ ] **Step 2: Run the smoke test (auto-starts the web server)**

Run (NO `BASE_URL`, so Playwright auto-starts `expo start --web`): `npm --prefix qa run test:e2e -- --project=chromium playwright/tests/smoke.spec.ts`
Expected: Playwright starts `expo start --web` (via `cwd:'..'`), waits for `http://localhost:8081`, launches Chromium, loads the admin login, all three locators visible → **1 passed**. An HTML report is written to `qa/reports/html`.
> If the Expo web server cannot start in this environment, STOP and report it explicitly (honesty rule); do not fake a pass. The framework is still evidenced by `test:list` + the self-tests.

- [ ] **Step 3: Write `qa/README.md`** — sections (real content, not placeholders):
  1. **What this is** — the QuickServe QA automation workspace (Playwright now; Maestro-ready); infrastructure only in Slice 39.
  2. **Prerequisites** — Node 24+, run `npm install --prefix qa` and `npm --prefix qa run install:browsers`.
  3. **Environment** — copy `qa/.env.example` → `qa/.env`; `BASE_URL` (optional; unset → auto-start `expo start --web`); `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` (optional; unset → public smoke only; the admin account must pre-exist).
  4. **Running** — `npm --prefix qa run test:e2e` (all), `test:e2e:chromium`, `test:e2e:headed`, `test:framework` (self-tests, no server), `test:list`, `report`.
  5. **Folder map** — `shared/` (tool-agnostic: env/logger/data-factory), `playwright/{pages,fixtures,support,tests,admin,customer,provider}`, `maestro/` (future), artifact dirs (`reports/screenshots/videos/.auth/`, git-ignored).
  6. **How to add a test** — import `{ test, expect }` from `../fixtures`; create a Page Object extending `BasePage`; keep selectors in the Page Object; use `testData` for values; example snippet using `LoginPage`.
  7. **How to add a Page Object** — extend `BasePage`, set `path`, expose `Locator`s, override `waitForReady`.
  8. **Authentication** — global-setup saves admin `storageState`; authed tests use `test.use({ storageState: adminStorageState })`.
  9. **Conventions for scale** — one Page Object per screen; `admin/`, `customer/`, `provider/` folders per role; `@smoke`/tags; deterministic `testData` seeds; no business logic in tests.
  10. **Guardrails** — never import from `src/`; no DB/Supabase; the framework is a black-box HTTP client.
  11. **Maintenance notes** — updating Playwright (`npm --prefix qa i -D @playwright/test@latest && npm --prefix qa run install:browsers`); where artifacts land; the two additive root exclusions and why.

- [ ] **Step 4: Write `qa/maestro/README.md`**

```markdown
# Maestro (placeholder)

Reserved for future mobile (Android/iOS) UI automation with Maestro.
Empty in Slice 39 by design — the `qa/` workspace is structured so Maestro
flows drop in here without repository restructuring, reusing `qa/shared/`
(env, logger, data-factory) and the `qa/reports|screenshots|videos` artifact
folders. No Maestro implementation in this slice.
```
(Delete `qa/maestro/.gitkeep` now that the folder has a real file — or keep both; keeping `.gitkeep` is harmless.)

- [ ] **Step 5: Typecheck + app gate**

Run: `npm --prefix qa run typecheck` → clean; `npx tsc --noEmit` → clean; `npm test` → app green.

- [ ] **Step 6: Commit**

```bash
git add qa/playwright/tests/smoke.spec.ts qa/README.md qa/maestro/README.md
git commit -m "feat: slice39 infrastructure smoke test + framework documentation"
```

**Validation ("green"):** the smoke test passes against the auto-started server (or the blocker is reported honestly); README covers all 11 sections; `maestro/` has a real note; `qa` typecheck clean; app gate green.

**Guardrails:** the smoke test asserts only that the admin login renders (infrastructure), NOT any business behaviour; no booking/wallet/analytics/notification/customer/provider assertions; no `src/` import.

**Review checklist:** ☐ smoke asserts login renders only (infra) ☐ auto-starts server without BASE_URL ☐ README lets a newcomer add a test ☐ maestro placeholder documented ☐ no feature assertion.

**Rollback:** delete the smoke test + the two READMEs.

---

### Task 7: Final verification, framework validation & independent whole-branch review

**Objective:** Prove the framework end-to-end (self-tests + smoke + artifact generation), confirm the app regression gate, write the verification doc, and run the independent whole-branch review.

**Files:** Create `docs/pilot/qa-framework-verification.md`.

- [ ] **Step 1: Full framework run (self-tests + smoke, auto-started server)**

Run: `npm --prefix qa run test:e2e -- --project=chromium`
Expected: framework self-tests + the smoke test pass; HTML report at `qa/reports/html`. (Optionally also run `--project=firefox` / `--project=webkit` if their browsers are installed via `install:browsers`.)

- [ ] **Step 2: Prove the artifact pipeline (screenshot/video/trace on failure)**

Temporarily change one smoke assertion to a value that will fail (e.g. assert a non-existent locator), run `npm --prefix qa run test:e2e -- --project=chromium playwright/tests/smoke.spec.ts`, and confirm a **screenshot**, **video**, and **trace** are produced under `qa/test-results/` (and referenced in `qa/reports/html`). Then **revert** the change and re-run to green. Record the evidence (paths) in the verification doc. (This is a validation action — no failing test is committed.)

- [ ] **Step 3: App regression gate**

Run: `npm test` (app suite green), `npx tsc --noEmit` (clean), `npx expo export --platform web` and `npx expo export --platform android` (both succeed) — proving no application behaviour changed.

- [ ] **Step 4: Write `docs/pilot/qa-framework-verification.md`** documenting, with evidence:
  - **Isolation proof:** `git diff --name-only <base>..HEAD | grep -v '^qa/'` → only `jest.config.js`, `tsconfig.json` (both additive, precedented), the spec, and the plan; no `src/`/DB/Supabase file.
  - **Guardrail greps:** no `from '@/` or `from '../../src` in `qa/**`; no DB/Supabase/secret; the smoke asserts only login render (no business feature).
  - **Framework evidence:** self-tests pass; smoke passes; the artifact pipeline produces screenshot/video/trace (Step 2 paths); reporters emit HTML/JSON.
  - **webServer behaviour:** BASE_URL set → no server; unset → auto-start.
  - **App regression:** `npm test`/`tsc`/exports green; the two root edits are additive and change no behaviour.
  - **Verdict** (pending whole-branch review).

- [ ] **Step 5: Commit the verification doc**

```bash
git add docs/pilot/qa-framework-verification.md
git commit -m "docs: slice39 QA framework verification"
```

- [ ] **Step 6: Independent whole-branch review**

Generate the review package for `<git merge-base main HEAD>..HEAD` and dispatch the whole-branch reviewer (most-capable model): isolation (only `qa/` + the two additive exclusions), no `src/` import / no DB / no secret, infrastructure-only (no feature automation), Playwright config correctness (browsers/retries/reporters/artifacts/webServer), auth guard, POM/fixtures design, docs quality, and maintainability for hundreds of tests. Fix only Critical/Important (one batched fix subagent). Then **pause before merge**.

**Validation ("green"):** self-tests + smoke pass; artifact pipeline proven; app gate (`npm test`/`tsc`/exports) green; diff limited to `qa/` + the two additive edits + docs; whole-branch review returns no Critical/Important.

**Guardrails:** no app/DB/Supabase change; no feature automation; the only non-`qa/` edits are the two additive exclusions.

**Review checklist:** ☐ full run green ☐ artifacts proven ☐ app regression green ☐ isolation proven ☐ whole-branch review clean ☐ paused before merge.

**Rollback:** the whole slice is additive under `qa/` + two one-line exclusions; `git checkout main` (branch unmerged) restores the pre-slice state, or drop `qa/` and revert the two lines.

---

## Rollback Plan (whole slice)

Everything is additive and isolated:
- **`qa/` workspace:** delete the `qa/` directory (own package/node_modules/config/tests/docs) — removes the entire framework with zero app impact.
- **Two root exclusions:** revert the one-line additions in `jest.config.js` (`'/qa/'`) and `tsconfig.json` (`"qa"`).
- **Docs:** delete `docs/pilot/qa-framework-verification.md` (+ spec/plan if desired).
- **Branch:** unmerged until approval — `git checkout main` restores the pre-slice state exactly; or revert the merge commit if already merged.
No migration, no schema, no Supabase, no app source touched → clean revert.

---

## Self-Review Notes

- **Spec coverage:** T1 ↔ spec §2 (isolated `qa/` + two additive exclusions) + §3 folder tree + §2.3 maestro placeholder; T2 ↔ §4 Playwright config + §6 webServer; T3 ↔ §4 env/logger/data-factory/assertions + §5.1 self-tests; T4 ↔ §4 auth + global setup/teardown + §7 security (guarded, .auth); T5 ↔ §4 POM + fixtures; T6 ↔ §5.2 smoke + §4 documentation + §2.3 maestro note; T7 ↔ §9 validation + §11 review + verification doc. Non-goals (§12) respected: no feature automation, no app/DB/Supabase change, maestro placeholder only.
- **Type consistency:** `QaEnv`, `Logger`, `DataFactory`, `BasePage`, `LoginPage`, `loadEnv`, `createLogger`, `createDataFactory`, `isOnPath`, `filterSevereConsoleErrors`, `ADMIN_LOGIN_PATH`, `ADMIN_STORAGE_STATE_PATH` are defined once and consumed with identical signatures across tasks.
- **No app dependency** is added to the root `package.json`; all deps live in `qa/package.json`. The only root edits are the two additive exclusions.
- **One runtime confirmation** (`ADMIN_LOGIN_PATH`) is explicitly bounded with an oracle (the `admin@example.com` placeholder) and a fallback — not a vague placeholder.
