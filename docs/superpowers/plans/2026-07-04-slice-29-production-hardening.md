# Slice 29 — Production Hardening & Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pilot-ready reliability — crash visibility, network/offline resilience, upload reliability, bounded/paginated lists, double-submit safety, and an ops readiness doc set — with no business/schema/RLS/workflow change.

**Architecture:** Five additive engineering layers (`monitoring.ts`, `net.ts`, pagination helpers/hook, `photos.ts` retry, double-submit guards) + docs. Monitoring is env-gated (off unless `EXPO_PUBLIC_SENTRY_DSN` set). `withRetry` wraps idempotent reads only. New deps `@sentry/react-native` + `@react-native-community/netinfo` (Expo-supported; both exports must stay green).

**Tech Stack:** Expo RN + TS, Expo Router, Supabase, Sentry, NetInfo, Jest + RNTL.

## Global Constraints

- **No schema change, no RLS change/weakening, no payment/auth/business-logic change, no dispatch/ranking/payout change.** Fix ONLY verified reliability/security/performance issues; keep customer/provider/admin workflows unchanged.
- **Monitoring OFF unless configured** — `Sentry.init` runs only when `process.env.EXPO_PUBLIC_SENTRY_DSN` is set → no-op in dev/Expo Go/CI. DSN is env-only, NEVER committed.
- **`withRetry` wraps idempotent READS only** — never payments/wallet/promo/booking mutations.
- **Pagination is additive** — optional `(page, pageSize)` on list helpers; default first page; small fixtures (< pageSize) render unchanged. No workflow change.
- **Double-submit guards are additive** — a `submitting` flag → `disabled` button during the in-flight request; NO payment/business logic change.
- **New deps via `npx expo install`** (SDK-56-pinned): `@sentry/react-native`, `@react-native-community/netinfo`. **Android + web exports MUST stay green** every task. iOS parity is reserved for Slice 30.
- Gate every task: `npm test` green, `npx tsc --noEmit` clean, `expo export --platform web` AND `--platform android` succeed.

---

## File Structure

**Create**
- `src/lib/monitoring.ts` (+ test) — env-gated Sentry init + `reportError`.
- `src/lib/net.ts` (+ test) — `withRetry`, `friendlyError`.
- `src/hooks/use-online.ts` (+ test) — NetInfo `useOnline`.
- `src/components/ui/offline-banner.tsx` (+ test).
- `src/hooks/use-paginated-list.ts` (+ test).
- `src/components/ui/load-more-button.tsx` (+ test).
- `docs/pilot/production-readiness.md`, `docs/pilot/edge-function-health.md`, `docs/pilot/environment-secrets.md`, `docs/pilot/security-hardening.md`, `docs/pilot/pilot-monitoring.md`.

**Modify**
- `app.json` — `@sentry/react-native` config plugin.
- `src/app/_layout.tsx` — `initMonitoring()` + `<OfflineBanner/>`.
- `src/components/error-boundary.tsx` — `reportError` in `componentDidCatch`.
- List helpers: `src/lib/bookings.ts`, `payments.ts`, `reviews.ts`, `notifications.ts`, `wallet.ts`, `promotions.ts` — optional `(page,pageSize)`.
- Heavy list screens — `LoadMoreButton` + `usePaginatedList` (admin/customer/provider).
- `src/lib/photos.ts` — upload guard + retry + friendly messaging.
- Action screens — double-submit guards (M-Pesa pay / apply wallet / redeem promo / place booking / submit review).

**Reuse (do not modify):** RLS, business RPCs, all schema.

---

## Task Order (dependency-ordered)

1. **T1** — Monitoring: `@sentry/react-native`, `monitoring.ts` (env-gated), `ErrorBoundary` reporting, `RootLayout` init.
2. **T2** — Network: `net.ts` (`withRetry`/`friendlyError`), `@react-native-community/netinfo`, `useOnline`, `OfflineBanner` in `RootLayout`.
3. **T3** — Pagination: list-helper `(page,pageSize)` + `usePaginatedList` + `LoadMoreButton` + apply to heavy screens.
4. **T4** — Upload retry + double-submit guards (photos + action buttons).
5. **T5** — Ops docs (production-readiness + Edge-health/env-secrets/security-hardening[RLS audit]/pilot-monitoring) + isolation + final gate.

Each task ends green (tests / tsc / both exports).

---

### Task 1: Crash/error monitoring (env-gated Sentry)

**Files:** Create `src/lib/monitoring.ts` (+ `monitoring.test.ts`); Modify `app.json`, `src/app/_layout.tsx`, `src/components/error-boundary.tsx`

**Build:**
- `npx expo install @sentry/react-native`. Add the Sentry Expo config plugin to `app.json` (`plugins: ["@sentry/react-native/expo", ...]` or the documented entry) — no DSN/org/token committed (env/EAS-secret at build time; the plugin is inert without them).
- `monitoring.ts`:
  - `const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;`
  - `export function initMonitoring(): void { if (!DSN) return; Sentry.init({ dsn: DSN, enableAutoSessionTracking: true, tracesSampleRate: 0 }); _active = true; }` (no-op without DSN).
  - `export function reportError(error: unknown, context?: Record<string, unknown>): void { if (_active) { Sentry.captureException(error, context ? { extra: context } : undefined); } else { console.error('[reportError]', error, context ?? ''); } }`.
- `_layout.tsx`: call `initMonitoring()` once at module top / first render (before `RootNavigator`). Sentry's init installs the global JS error handler.
- `error-boundary.tsx`: in `componentDidCatch(error, info)` → `reportError(error, { componentStack: info?.componentStack })`. Keep the existing friendly retry UI + `reset`.

**Tests (`monitoring.test.ts`, mock `@sentry/react-native`):** without `EXPO_PUBLIC_SENTRY_DSN` → `initMonitoring` does NOT call `Sentry.init`; `reportError` → `console.error`, no throw. With DSN set (mock env) → `initMonitoring` calls `Sentry.init`; `reportError` → `Sentry.captureException`. Keep the `error-boundary` test green (it now also calls a mocked `reportError`).

**Steps:** `tsc` → `npm test` → both exports (sentry added) → commit `feat: slice29 env-gated Sentry monitoring + error-boundary reporting`.

---

### Task 2: Network resilience + offline

**Files:** Create `src/lib/net.ts` (+ test), `src/hooks/use-online.ts` (+ test), `src/components/ui/offline-banner.tsx` (+ test); Modify `src/app/_layout.tsx`

**Build:**
- `npx expo install @react-native-community/netinfo`.
- `net.ts`:
  - `export async function withRetry<T>(fn: () => Promise<T>, opts?: { retries?: number; baseMs?: number }): Promise<T>` — up to `retries` (default 3) attempts; on a **transient** error (network/timeout/5xx-ish; use `isTransient(err)`) wait `baseMs * 2^attempt + jitter` and retry; rethrow immediately on a non-transient error; throw the last error after exhaustion. Pure (inject a `sleep`/no real timers in tests, or use fake timers). **Docstring: reads only — never wrap a mutation.**
  - `export function friendlyError(error: unknown): string` — offline/network → 'You appear to be offline. Check your connection.'; else 'Something went wrong. Please try again.' (+ pass through a known friendly `.message` when it's already user-facing).
- `use-online.ts`: `export function useOnline(): boolean` — subscribe to `NetInfo.addEventListener`; return `isConnected !== false` (default true until known); cleanup on unmount.
- `offline-banner.tsx`: `OfflineBanner` — `const online = useOnline(); if (online) return null;` → a small full-width banner ("You're offline") with a warning surface + `testID="offline-banner"`.
- `_layout.tsx`: render `<OfflineBanner/>` above the navigator (inside the providers, RN-web safe).

**Tests:** `withRetry` (mock fn: transient error N times then resolve → resolves; always transient → throws after `retries`; non-transient → throws immediately, called once); `friendlyError` (offline vs generic); `useOnline` (NetInfo mocked: offline → false); `OfflineBanner` (renders when offline, null when online).

**Steps:** `tsc` → `npm test` → both exports (netinfo added) → commit `feat: slice29 withRetry + friendlyError + NetInfo offline banner`.

---

### Task 3: Pagination (heavy lists)

**Files:** Create `src/hooks/use-paginated-list.ts` (+ test), `src/components/ui/load-more-button.tsx` (+ test); Modify list helpers (`bookings.ts`/`payments.ts`/`reviews.ts`/`notifications.ts`/`wallet.ts`/`promotions.ts`) + the heavy screens

**Build:**
- **Helper signature** (additive, backward-compatible): add optional `(page = 0, pageSize = 25)` → `.order('created_at', { ascending:false }).range(page * pageSize, page * pageSize + pageSize - 1)`. Apply to: `getAllBookings`, `getCustomerBookings`, `getProviderJobs`, `adminGetAllPayments`, `adminGetAllReviews`, `getMyNotifications`, `adminGetPromoRedemptions`, `adminGetWalletTransactions`, admin payment-attempts. (Existing callers passing no args → page 0, first `pageSize`.)
- `use-paginated-list.ts`: `usePaginatedList<T>(fetchPage: (page: number) => Promise<T[]>, pageSize = 25)` → `{ items, loading, error, hasMore, loadMore, reload }`; `loadMore` fetches the next page, appends, sets `hasMore = lastPage.length === pageSize`; wrap `fetchPage` in `withRetry` + `friendlyError`.
- `load-more-button.tsx`: `LoadMoreButton { onPress; loading; hasMore }` → renders a "Load more" Button when `hasMore` (spinner when loading), nothing otherwise. `testID="load-more"`.
- **Apply to the heavy screens** (admin bookings list `admin/index.tsx` + `(admin-web)/bookings`, admin payments/reviews/promos-redemptions/wallet-history, customer bookings/notifications, provider jobs): swap the single load for `usePaginatedList` + `LoadMoreButton`. Keep filters/sorting UX; append pages.

**Tests:** each updated helper calls `.range(from,to)` for `(page,pageSize)` (extend the lib tests); `usePaginatedList` (appends pages, `hasMore` flips to false when a page < pageSize, error surfaced); `LoadMoreButton` (shows when hasMore, hidden otherwise, loading spinner); one screen shows "Load more" and appends a second page. Keep existing list-screen tests green (small fixtures ⇒ one page, no "Load more").

**Steps:** `tsc` → `npm test` → both exports → commit `feat: slice29 pagination (range helpers + usePaginatedList + LoadMoreButton)`.

---

### Task 4: Upload reliability + double-submit guards

**Files:** Modify `src/lib/photos.ts` (+ test); Modify the action screens (M-Pesa pay / apply wallet / redeem promo / place booking / submit review) (+ their tests)

**Build:**
- `photos.ts` `uploadBookingPhoto`: guard `if (!input.uri) return { ok:false, error:'No photo selected.' }`; wrap the **storage upload** call in `withRetry(fn, { retries: 2 })` (idempotent — unique object path); on failure return `friendlyError`-based messaging. The DB insert stays single-shot (create-once). No schema/behavior change beyond retry+message.
- **Double-submit audit + guards:** ensure each action disables its button while its request is in flight (a `submitting`/`loading` state → `disabled`):
  - `booking/[id].tsx` — "Pay with M-Pesa", "Apply wallet credit", "Apply promo" (add/confirm a per-action in-flight flag → disabled while awaiting).
  - `booking/review.tsx` — "Place Booking" (already has `submitting` — verify).
  - `booking/[id].tsx` — "Submit review" (add a `submittingReview` guard).
  Additive guards only; NO payment/business logic change. (This fixes the verified double-tap → duplicate-request reliability risk.)

**Tests:** `photos.test.ts` — a transient storage error then success → `{ ok:true }` (retry); persistent → `{ ok:false, error }`; no uri → `{ ok:false }`. Action screens — pressing a guarded button twice quickly triggers the handler once / the button is `disabled` while the promise is pending (assert `disabled`), for at least the M-Pesa pay + apply promo + submit review buttons. Keep existing booking/review tests green.

**Steps:** `tsc` → `npm test` → both exports → commit `feat: slice29 upload retry + double-submit guards`.

---

### Task 5: Ops readiness docs + security audit + isolation + final gate

**Files:** Create `docs/pilot/production-readiness.md`, `edge-function-health.md`, `environment-secrets.md`, `security-hardening.md`, `pilot-monitoring.md`

- **`production-readiness.md`** (umbrella): the release-readiness gate — `npm test`/`tsc`/`expo export` web+android green; env/secrets set; monitoring configured (DSN); RLS audit clean; Edge functions deployed + secrets set — linking the checklists + the existing `crash-logging.md`/`performance-checklist.md`/`backend-readiness.md`/`pilot-launch-checklist.md`.
- **`edge-function-health.md`:** per Edge function (send-push, mpesa-stk-push, mpesa-callback, places-autocomplete/place-details, tracking-map) — deploy command, required secrets, `verify_jwt` setting, always-200/kill-switch behavior, a smoke-check.
- **`environment-secrets.md`:** every env/secret (EXPO_PUBLIC_SUPABASE_URL/ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PUSH_WEBHOOK_SECRET, GOOGLE_PLACES_API_KEY, DARAJA_*, MPESA_MODE, EXPO_PUBLIC_SENTRY_DSN) — where it lives (app config vs Supabase secret vs EAS secret), client-safe vs server-only, and a **never-commit** list.
- **`security-hardening.md`:** an **RLS spot-audit** (documented SQL) of the newest tables — wallets/wallet_transactions, promo_codes/promo_redemptions, review_private_feedback, customer_addresses, notification_preferences, provider_locations — confirming owner/admin-only select, no-provider leakage, append-only ledgers, and the analytics RPC admin-guard. **Record findings; fix ONLY verified issues** (dispatch a fix commit if any real gap is found — expected none). Note Sentry DSN handling + no-secrets-in-bundle.
- **`pilot-monitoring.md`:** what to watch during the pilot (Sentry error rate/new issues, failed pushes/token pruning, failed payment attempts, Edge logs, DB error rate) + escalation. Extend, don't duplicate, `crash-logging.md`.
- **Isolation:** `git diff <base>..HEAD --stat` — only reliability/doc files + the 2 dep additions changed; **NO schema/migration change, NO RLS change, NO payment/auth/business-logic change, NO dispatch/ranking/payout change.** Confirm `withRetry` wraps no mutation.
- **Final gate:** `expo export` web + android, `tsc` clean, `npm test` green, `git status` clean.
- Commit `test: slice29 production-readiness docs + security audit`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-29-hardening`. Abandon = `git checkout main` + delete branch.
- **Per-task revert:** independent commits — `git revert <commit>` rolls back one. Reverting T1 removes Sentry+plugin; T2 removes NetInfo/banner/net; T3 restores the unbounded list helpers + screens; T4 restores the pre-guard uploads/buttons.
- **Disable without revert:** monitoring is already off unless `EXPO_PUBLIC_SENTRY_DSN` is set (unset it to disable). `withRetry`/pagination/guards are behavioral-safe (retry only reads; pagination default page; guards only disable during in-flight).
- **Dependency rollback:** `git revert` the T1/T2 commits (removes `@sentry/react-native` / `@react-native-community/netinfo` from package.json + app.json). No schema/data to roll back (none added).
- **No business-table / RLS / payment / dispatch involvement** — rollback is confined to the additive reliability layers + docs + the 2 deps.

---

## Self-Review

- **Spec coverage:** Sentry env-gated + ErrorBoundary reporting + global handler (T1); withRetry(reads only)+friendlyError+NetInfo useOnline+OfflineBanner (T2); pagination helpers + usePaginatedList + LoadMoreButton (T3); upload retry/messaging + double-submit guards (T4); production-readiness + Edge-health + env-secrets + security-hardening(RLS audit) + pilot-monitoring docs + isolation (T5). No schema/RLS/payment/auth/business/dispatch/ranking/payout change (constraints; T5 isolation). Monitoring off-unless-configured (T1). Retry reads-only (T2 docstring; T4 upload is idempotent storage). Android+web exports green each task (deps in T1/T2). iOS parity → Slice 30 (out of scope here).
- **Placeholder scan:** none; concrete signatures/tests per task.
- **Name consistency:** `initMonitoring`/`reportError` (T1) used by ErrorBoundary/RootLayout; `withRetry`/`friendlyError` (T2) used by `usePaginatedList` (T3) + `photos.ts` (T4); `useOnline` (T2) used by `OfflineBanner`; `usePaginatedList`/`LoadMoreButton` (T3) used by the heavy screens; list-helper `(page,pageSize)` shape consistent T3↔screens.
