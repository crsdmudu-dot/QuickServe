# Slice 39 — QA Automation Framework (Playwright) Verification

**Branch:** `feat/slice-39-qa-automation-framework` · **Base:** `cd54329` (`git merge-base main HEAD`)
**Purpose:** prove the Playwright QA framework works end-to-end (browser, web server, admin login, reporters, artifacts), is isolated from the app, changes no production behaviour, and keeps the app's own gate green.

---

## 1. Framework Architecture

An isolated `qa/` workspace with its **own** `package.json` / `node_modules` / `tsconfig` / Playwright config, treating QuickServe Admin Web as a black box over HTTP.

- **Cross-tool (`qa/shared/`):** `env.ts` (typed env loader), `logger.ts` (leveled/timestamped), `data-factory.ts` (deterministic seeded value generators — no DB/network).
- **Playwright (`qa/playwright/`):** `pages/` (`BasePage` + `LoginPage` POM foundation), `fixtures/` (extended `test`/`expect` with `logger`/`testData`/`adminPage`), `support/` (`auth.ts`, `assertions.ts`, `global-setup.ts`, `global-teardown.ts`), `tests/` (`framework.spec.ts` self-tests, `smoke.spec.ts` infrastructure smoke), and `admin|customer|provider/` placeholders.
- **`qa/maestro/`:** empty placeholder reserving the multi-tool future (Android/iOS Maestro) without restructuring.
- **Config:** `playwright.config.ts` — 3 browser projects (Chromium/Firefox/WebKit), retries (CI 2 / local 0), HTML+list+JSON reporters, trace `on-first-retry` / screenshot `only-on-failure` / video `retain-on-failure`, `webServer` (auto-start `expo start --web` unless `BASE_URL` is set), guarded global setup/teardown.

## 2. Isolation Proof

`git diff --name-only cd54329..HEAD` — every change is under `qa/` or `docs/`, except **three** additive build-tool exclusions of the sibling `qa/` workspace:
- `jest.config.js` — `testPathIgnorePatterns += '/qa/'` (mirrors existing `/apps/website/`).
- `tsconfig.json` — `exclude += "qa"` (mirrors existing `"apps/website"`).
- `metro.config.js` — **new**; block-lists `qa/` from Metro's bundle graph (see §4). *This is a third file beyond the two originally approved — flagged for explicit sign-off.*

No `src/`, `supabase/`, `app.json`, **root** `package.json`, or **root** `package-lock.json` change. (A *new* `qa/package-lock.json` is committed — the isolated workspace's own lockfile, which is correct and intended; the root lockfile is untouched.) Confirmed:
`git diff --name-only cd54329..HEAD | grep -vE '^qa/|^docs/'` → `jest.config.js`, `tsconfig.json`, `metro.config.js` only.

## 3. No Production Code / No Business Automation

- **No production code modified:** the app source (`src/`), database, Supabase, and `app.json` are untouched. The three root files are build/test-tool exclusions of the QA dir — they change no application behaviour (proven by the app gate staying green, §6).
- **No business automation:** the only tests are framework self-tests (data-factory determinism, env, logger, custom assertions) and the infrastructure smoke test (asserts only that the admin login page renders — `emailInput`/`passwordInput`/`submitButton` visible). No booking/wallet/analytics/notification/customer/provider flow is automated. Grep confirms no business terms in `qa/playwright/tests/*` or `qa/playwright/pages/*`.
- **No `src/` import** anywhere under `qa/`.

## 4. Critical Finding & Fix — Metro / `expo export`

**Finding (Critical):** with `qa/` present, `expo export` (web and android) failed — `Unable to resolve module ../../App from node_modules/expo/AppEntry.js`. The isolated `qa/` sub-package (nested `package.json` + `node_modules`) made Metro crawl `qa/` and mis-resolve the app entry. Empirically isolated: moving `qa/` aside → export succeeds; restoring `qa/` → export fails.

**Fix:** added `metro.config.js` (there was none; the app used Metro defaults) that extends the Expo default config with a `resolver.blockList` regex excluding the top-level `qa/` directory. Build-tool exclusion only — no application behaviour change; same category as the `jest.config.js`/`tsconfig.json` exclusions.

**Result:** both exports succeed with `qa/` present, and the QA smoke test still passes (the app under test starts normally). **This third root file is flagged for explicit user approval before merge.**

## 5. Framework Verification (all green)

| Check | Result |
|---|---|
| Framework self-tests (Chromium) | **9 passed** (data-factory determinism/shape, env, logger, isOnPath, filter, fixtures, adminPage) |
| Infrastructure smoke (Chromium, auto-started Expo web) | **1 passed** — admin login rendered at `/(admin-web)/login`, 3 locators visible |
| Full framework run (Chromium) | **10 passed** (27.9 s) |
| Browser projects recognized | chromium, firefox, webkit (via `test:list`, 3×) |
| HTML report | generated → `qa/reports/html/index.html` |
| JSON report | generated → `qa/reports/results.json` |

## 6. Application Regression Gate (all green — with the metro fix)

| Check | Result |
|---|---|
| `npm test` (app jest) | **2943 / 2943 passed** (220 suites) |
| `npx tsc --noEmit` (root) | clean |
| `npx expo export --platform web` | **success** (`Exported: dist`) |
| `npx expo export --platform android` | **success** (`Exported: dist`) |

## 7. Artifact Pipeline Verification

A single smoke assertion was **temporarily** broken (assert a non-existent locator) and run with `--retries=1` (so the config's `trace: on-first-retry` fires). Playwright produced, under `qa/test-results/…/`:
- **screenshots** — `test-failed-1.png` (×2, one per attempt; `screenshot: only-on-failure`)
- **videos** — `video.webm` (×2; `video: retain-on-failure`)
- **trace** — `trace.zip` (on the retry; `trace: on-first-retry`)
- **HTML report entry** — `qa/reports/html/index.html`

The temporary failure was **reverted immediately** and the suite re-run **10 passed** — the branch is green. (No failing test is committed.)

## 8. Artifact Locations

- HTML report: `qa/reports/html/` · JSON report: `qa/reports/results.json`
- Screenshots/videos/traces: `qa/test-results/<test>/…` — all git-ignored.

## 9. Browser Support

Chromium (primary), Firefox, WebKit — three Playwright projects. Chromium + Firefox + WebKit binaries installed via `playwright install`. Chromium exercised in this verification; all three are listable/runnable.

## 10. Environment Variables

- `BASE_URL` (optional): if set → use it (no server auto-start); if unset → auto-start `expo start --web` on `http://localhost:8081`.
- `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` (optional): admin creds for storageState; if absent → global-setup logs a notice and skips authenticated state (framework never fails on missing creds). The admin account must pre-exist (no account creation). Secrets live only in `qa/.env` (git-ignored); `qa/.env.example` documents the keys.

## 11. Future Maestro Integration

`qa/maestro/` is an empty placeholder (`.gitkeep` + README note). Future Android/iOS Maestro flows drop in here as a sibling of `qa/playwright/`, reusing `qa/shared/` (env/logger/data-factory) and the `qa/reports|screenshots|videos` artifact folders — no repository restructuring required.

## 12. Maintenance Recommendations

- **Add tests** by role folder (`playwright/admin|customer|provider/`), one Page Object per screen extending `BasePage`, importing the extended `test`/`expect` from `../fixtures`; keep selectors in Page Objects and business logic out of tests.
- **Update Playwright:** `npm --prefix qa i -D @playwright/test@latest && npm --prefix qa run install:browsers`.
- **CI:** set `CI=true` (serial, retries=2, no `test.only`); prefer a pre-started server via `BASE_URL`; on Linux install browsers with `--with-deps`; upload `qa/reports/` + `qa/test-results/` as artifacts.
- **Keep the three root exclusions in sync** if the QA dir is ever renamed (jest/tsconfig/metro all reference `qa`).

## 13. Independent Whole-Branch Review

Independent whole-branch review (opus, base `cd54329`): **READY TO MERGE — 0 Critical, 0 Important.** Confirmed: infrastructure-only (smoke asserts only the admin login renders; the only `booking` reference is `data-factory.bookingDraft()`, a value generator); isolation (no `src/`/`@/` import in `qa/**`; no root `package.json` change; `qa/node_modules` not committed); all three root edits additive/behaviour-neutral; the `metro.config.js` regex has **no** over-match (verified `find node_modules -path '*/qa/*'` → 0); no secrets; deps minimal; README accurate; config correct; guarded global-setup never throws.

**Minor findings (documented, non-blocking — not fixed per the "cosmetic → document" rule):**
1. **metro regex is unanchored** (`metro.config.js`: `/[\\/]qa[\\/].*/`) — it would also block any *future* nested dir literally named `qa` (none exists today under `src/`/`app/`; `docs/qa/` matches but docs never enter Metro's RN graph, so it's inconsequential). If a real `qa` *source* folder is ever added, anchor the regex to the repo root (`path.resolve(__dirname, 'qa')`). Left as-is now because the current regex is proven-green and changing the flagged third file adds risk for no present benefit.
2. **qa/.gitignore** ignores `screenshots/` and `videos/` though the config routes artifacts under `test-results/` + `reports/` — harmless leftover lines from the spec's folder map.
3. (Wording clarified in §2 above re: the root vs `qa/` lockfile.)

## 14. Verdict

Framework verified end-to-end; app regression gate green; isolation proven; no business automation; independent whole-branch review clean (0 Critical, 0 Important). **READY TO MERGE — pending only explicit user sign-off on the third additive root file (`metro.config.js`).** The branch is **not** merged.
