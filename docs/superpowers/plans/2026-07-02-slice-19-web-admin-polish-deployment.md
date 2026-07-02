# Slice 19 — Web Admin Polish + Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `(admin-web)` panel production-presentable and deployable — responsive/table/state polish, page titles/meta, a Vercel-first deploy setup, and docs.

**Architecture:** Presentation + config + docs only, on the existing Slice-18 admin-web. Reuse `src/lib/*`, RLS, and the design system unchanged. Centralize breakpoints; refine shared `admin-web` components so all 11 screens improve together. `expo-router/head` for titles. `vercel.json` for static SPA hosting.

**Tech Stack:** Expo Router + react-native-web, TypeScript, Jest + RNTL, Vercel (static).

## Global Constraints

- **Polish + deployment only.** NO DB schema change, NO RLS change, NO new admin business feature/action, NO customer/provider mobile workflow change, NO payment/auth/security weakening.
- Reuse existing admin-web screens + `src/lib/*` + design tokens. Component prop APIs stay stable; tests never weakened (update an assertion only for an intentional visual change).
- Web-only changes must not break native: components stay RN/RN-web safe; `expo-router/head` used only in admin-web screens.
- Vercel is PRIMARY; Netlify + generic static host documented as alternatives.
- Merge gate every task: `npm test` green, `npx tsc --noEmit` clean, `npx expo export --platform web` AND `--platform android` both succeed.

---

## File Structure

**Create**
- `src/constants/admin-web.ts` — shared breakpoints (`WIDE`, `TABLET`) + title suffix constant.
- `src/components/admin-web/page-meta.tsx` — thin `<PageMeta title=… description?=…>` wrapping `expo-router/head` (web) / no-op native.
- `vercel.json` — static build + SPA rewrite.
- `docs/pilot/web-admin-deploy.md`, `docs/pilot/web-admin-qa.md`.

**Modify**
- `src/components/admin-web/data-table.tsx` (+ test) — polish + error state.
- `src/components/admin-web/admin-shell.tsx`, `admin-sidebar.tsx` — responsive + focus/active polish.
- `src/app/(admin-web)/*` (all 11 screens) — `<PageMeta>`, inline error/retry, spacing/header polish.

---

## Task Order

1. **T1** — Breakpoint constants + `data-table` polish (error/empty/loading, alignment) (+ tests).
2. **T2** — `admin-shell` + `admin-sidebar` responsive (desktop/tablet) + focus/active polish.
3. **T3** — `PageMeta` component + apply `<PageMeta>` titles/meta to all 11 admin-web screens.
4. **T4** — Screen polish + inline error/retry across list screens (dashboard, bookings ±[id], providers ±[id], customers, payments, payment-attempts, earnings, reviews).
5. **T5** — `vercel.json` + deployment docs (Vercel primary; Netlify/generic alternatives) + env config.
6. **T6** — Verification: auth-guard confirm, mobile regression check, QA checklist doc, final gate.

Each task ends green (tests/tsc/web+android export). T3/T4 depend on T1 (shared pieces).

---

### Task 1: Breakpoints + data-table polish

**Files:** Create `src/constants/admin-web.ts`; Modify `src/components/admin-web/data-table.tsx` (+ `data-table.test.tsx`)

- `admin-web.ts`: `export const AdminBreakpoints = { tablet: 700, wide: 1024 } as const;` + `export const ADMIN_TITLE_SUFFIX = ' · QuickServe Admin';`.
- `data-table.tsx`: refine header/row rhythm + numeric/amount right-alignment (add optional `Column.align?: 'left'|'right'`), web hover affordance (Platform-guarded), sticky header where practical; keep existing `loading`→Skeleton and empty→EmptyState. ADD an optional **error state**: props `error?: boolean` + `onRetry?: () => void` → render an inline error row ("Couldn't load. Retry") when `error`. Preserve all existing props/testIDs.

**Tests:** existing data-table tests stay green; add: renders error+retry when `error` (retry fires `onRetry`); right-align column style applied. Never weaken.

**Checks:** `npm test`, `tsc`, web+android export. Commit `feat: slice19 breakpoints + data-table polish`.

---

### Task 2: Responsive shell + sidebar

**Files:** Modify `src/components/admin-web/admin-shell.tsx`, `admin-sidebar.tsx`

- Use `AdminBreakpoints` (from T1) for the wide/tablet logic (replace the local magic number). Desktop ≥ wide: fixed sidebar. Tablet (`< wide`): sidebar collapses to a compact top nav; content full-width with gutters. Ensure no clipped content; touch targets ≥ 44px.
- `admin-sidebar`: refined active state (token accent), clear focus ring (`accessibilityRole`/`Label` kept), sign-out affordance; consistent item spacing.

**Tests:** keep `admin-sidebar.test.tsx` green (update only if an intentional label/testID changed — avoid). Add a small assertion if practical (renders nav items at a mocked width). 

**Checks:** `npm test`, `tsc`, web+android export. Commit `feat: slice19 responsive shell + sidebar`.

---

### Task 3: Page titles & meta

**Files:** Create `src/components/admin-web/page-meta.tsx`; Modify all `src/app/(admin-web)/*` screens

- `page-meta.tsx`: `export function PageMeta({ title, description }: { title: string; description?: string })` — on web renders `expo-router/head` `<Head>` with `<title>{title}{ADMIN_TITLE_SUFFIX}</title>` + optional `<meta name="description">` + viewport; on native returns null. (Guard with `Platform.OS === 'web'` and/or dynamic import of `expo-router/head` so native/tests don't break.)
- Add `<PageMeta title="…">` to each screen: Sign in, Dashboard, Bookings, Booking detail, Providers, Provider detail, Customers, Payments, Payment Attempts, Earnings & Payouts, Reviews.

**Tests:** a `page-meta` test (web-mode renders title; native → null, no crash). Keep screen tests green.

**Checks:** `npm test`, `tsc`, web+android export (confirm titles appear in exported HTML if easy). Commit `feat: slice19 page titles + meta`.

---

### Task 4: Screen polish + inline error/retry

**Files:** Modify the 11 `src/app/(admin-web)/*` screens

- Consistent page header + spacing rhythm; align cards/tables; ensure every list screen wires the `data-table` `loading`/empty/`error`+`onRetry` states (track a local `error` flag on failed loads; retry re-runs the fetch). Detail screens (bookings/providers) stack cleanly on tablet.
- No new data calls, no new actions — presentation + the error-state wiring only. Preserve all reused-helper calls, labels, testIDs.

**Checks:** keep all admin-web screen tests green (update intentional assertions only, never weaken); `npm test`, `tsc`, web+android export. Commit `feat: slice19 admin screen polish + error states`.

---

### Task 5: Vercel deploy setup + docs

**Files:** Create `vercel.json`, `docs/pilot/web-admin-deploy.md`

- `vercel.json`:
  ```json
  {
    "buildCommand": "npx expo export --platform web",
    "outputDirectory": "dist",
    "rewrites": [{ "source": "/(.*)", "destination": "/" }]
  }
  ```
  (SPA fallback so `(admin-web)` deep links resolve to the client router.)
- `web-admin-deploy.md`: Vercel primary (connect repo OR `vercel deploy`; set env `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` in project settings — public anon key only, NEVER service-role); **Netlify** alternative (`netlify.toml` build=`npx expo export --platform web`, publish=`dist`, redirect `/* → /index.html 200`); **generic static host** alternative (build `dist/`, upload, configure SPA fallback); custom domain + HTTPS note; admin-account provisioning reference (`backend-readiness.md`); rollback = redeploy previous build / stop hosting.

**Checks:** `vercel.json` valid JSON; `npx expo export --platform web` produces `dist/`; `npm test`, `tsc`, both exports. Commit `feat: slice19 vercel deploy config + docs`.

---

### Task 6: Verification, QA doc, guard + mobile regression, final gate

**Files:** Create `docs/pilot/web-admin-qa.md`

- **Auth-guard confirmation:** run/confirm the guard tests (admin renders; non-admin → "Not authorized" + sign-out; unauth → login, no loop). Document in the QA doc.
- **Mobile regression check:** confirm the diff touched NO `supabase/migrations/**`, NO `supabase/functions/**`, NO business logic in `src/lib/*` (only presentation/meta), and NO customer/provider mobile screen (`src/app/(customer)/**`, `src/app/provider/**`, `src/app/admin/**` untouched); mobile customer/provider/mobile-admin tests green.
- **`web-admin-qa.md`:** desktop + tablet layout checklist; browser matrix (Chrome/Edge/Safari/Firefox); login/guard/not-authorized; each section loads + one action; deep-link + SPA fallback on the deployed host; page titles correct.
- **Final gate:** `npx expo export --platform web` AND `--platform android` succeed → `npx tsc --noEmit` clean → `npm test` green → `git status` clean.
- Commit `test: slice19 web admin QA + verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-19-web-admin-polish`. Abandon = `git checkout main` + delete branch; `main` untouched.
- **Per-task revert:** each task is an independent commit — `git revert <commit>` rolls back one (data-table/shell/meta/screens/deploy) without affecting others.
- **Deploy config:** `vercel.json` is additive; reverting it leaves the app buildable (default static). Hosting can be disabled by pausing the Vercel project — no code impact.
- **No schema/RLS/data/logic change** — nothing to migrate or restore; rollback is purely presentation + config + docs.

---

## Self-Review

- **Spec coverage:** responsive (T2 + T1 breakpoints), data-table polish + loading/empty/error (T1/T4), page titles/meta (T3), screen polish (T4), Vercel setup + docs + env (T5), QA checklist + auth-guard confirm + mobile regression + final gate (T6 + sections). Non-goals repeated in Global Constraints + per task.
- **Placeholder scan:** none; checks concrete.
- **Type/name consistency:** `AdminBreakpoints`/`ADMIN_TITLE_SUFFIX` (T1) consumed by shell (T2) + `PageMeta` (T3); `data-table` new `error`/`onRetry`/`align` props (T1) consumed by screens (T4); `PageMeta` prop shape consistent T3↔T4.
