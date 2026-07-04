# Slice 29 — Production Hardening & Reliability (Design Spec)

**Date:** 2026-07-04
**Status:** Approved design → (implementation plan pending approval)
**Builds on / touches (additively):** `RootLayout` + `ErrorBoundary`, the list helpers in `bookings.ts`/`payments.ts`/`reviews.ts`/`notifications.ts`/`wallet.ts`/`promotions.ts` (all currently `select('*')` — unbounded), `photos.ts` (uploads), the payment/wallet/promo action buttons, and the existing `docs/pilot/*` (crash-logging, performance-checklist, backend-readiness, pilot-launch-checklist).

---

## 1. Goal & Non-Goals

Make QuickServe pilot-ready: crash visibility, network resilience, offline UX, upload reliability, bounded lists/pagination, double-submit safety, and an operational readiness doc set — **without changing any business/payment/auth logic, schema, RLS, or workflows.**

**Non-goals / out of scope (rules):** no new business features, store assets, public website, provider availability, referral, refund/dispute, or UI redesign. **No schema change** (unless a *verified* reliability bug strictly needs it), **no payment/auth/business-logic change**, **no dispatch/ranking/payout change**, **no RLS weakening**. Fix ONLY verified reliability/security/performance issues; keep customer/provider/admin workflows unchanged.

---

## 2. Architecture — additive reliability layers + ops docs

Five thin, additive engineering layers + a documentation set. Nothing touches business rules; pagination changes *how much* a list fetches (bounded + "Load more"), not the workflow.

### 2a. Crash/error monitoring — `src/lib/monitoring.ts` (+ error boundary + root init)
- Add `@sentry/react-native` (+ the Expo config plugin in `app.json`). **`initMonitoring()`** calls `Sentry.init({ dsn })` **only when `process.env.EXPO_PUBLIC_SENTRY_DSN` is set** → a **no-op in dev / Expo Go / when unconfigured** (safe); called once in `RootLayout`.
- `reportError(error, context?)` → `Sentry.captureException` when active, else `console.error`. `ErrorBoundary.componentDidCatch` calls `reportError` (keeps the existing friendly retry UI). Sentry's init installs the global handler (unhandled JS errors). **DSN is env-only, never committed.**

### 2b. Network resilience + offline — `src/lib/net.ts` + `OfflineBanner`
- **`withRetry<T>(fn, { retries=3, baseMs=300 })`** — retries an **idempotent read** with exponential backoff + jitter, only on network/transient errors; throws after exhaustion. **NEVER wraps mutations** (payments/wallet/promo/booking writes).
- **`friendlyError(error): string`** — maps Supabase/network errors to clear messages ("You appear to be offline.", "Something went wrong. Please try again.").
- Add `@react-native-community/netinfo` → **`useOnline()`** hook + a small **`OfflineBanner`** shown app-wide (RootLayout) when offline. Apply `withRetry`/`friendlyError` + a **Retry** button at high-value read sites (dashboard/list loads) — additive, non-breaking.

### 2c. Pagination — bounded "Load more" on heavy lists
- Add optional `(page = 0, pageSize = 25)` to the heavy list helpers → `.order('created_at', desc).range(page*pageSize, page*pageSize + pageSize − 1)`. Helpers: `getAllBookings`, `getCustomerBookings`, `getProviderJobs`, `adminGetAllPayments`, `adminGetAllReviews`, `getMyNotifications`, `adminGetPromoRedemptions`, `adminGetWalletTransactions`, admin payment-attempts.
- A reusable **`usePaginatedList(fetchPage)`** hook (rows + `loadMore` + `hasMore` + loading/error) and a **`LoadMoreButton`**; screens append pages until a page returns `< pageSize`. Backward-compatible: helpers keep their return shape; omitting page → first page (small pilot fixtures < 25 rows render unchanged).

### 2d. Upload reliability — `photos.ts`
- Guard the input (uri present); wrap the **storage upload** (idempotent — unique object path) in a bounded `withRetry` (≤2) on transient errors; clearer failure messaging via `friendlyError`. The DB insert stays single-shot. No behavior/schema change.

### 2e. Double-submit safety — action buttons
- Verify/ensure the in-flight guard (a `submitting` flag → disabled button) on the reliability-sensitive actions: **M-Pesa pay**, **apply wallet**, **redeem promo**, **place booking**, **submit review**. Additive guard only — no payment/business logic change. (Fixes the verified "double-tap → duplicate request" reliability risk.)

### 2f. Operational docs — `docs/pilot/` (extend, don't duplicate)
- **`production-readiness.md`** (umbrella): release-readiness gates (tests/tsc/exports green, env/secrets set, RLS audit clean, monitoring on) linking the checklists below.
- **Edge Function health checklist** (send-push / mpesa-stk-push / mpesa-callback / places / tracking-map — deploy, secrets, `verify_jwt`, 200-always, kill-switches).
- **Environment/secrets checklist** (EXPO_PUBLIC_SUPABASE_*, service-role, PUSH_WEBHOOK_SECRET, GOOGLE_PLACES_API_KEY, DARAJA_*, EXPO_PUBLIC_SENTRY_DSN — where each lives, never-commit list).
- **Security hardening checklist** — an RLS spot-audit of the newest tables (wallets/wallet_transactions, promo_codes/promo_redemptions, review_private_feedback, customer_addresses, notification_preferences, provider_locations) confirming owner/admin-only + no-provider leakage + analytics admin-guard; record findings. **Fix only verified issues.**
- **Pilot monitoring checklist** — what to watch during the pilot (Sentry errors, failed pushes/payments, Edge logs). Extend the existing `crash-logging.md`/`performance-checklist.md`/`backend-readiness.md` rather than duplicating.

---

## 3. Backward Compatibility & Guardrails

- **Monitoring is off unless `EXPO_PUBLIC_SENTRY_DSN` is set** → zero impact in dev/Expo Go/CI. `withRetry` only wraps reads. Pagination is additive (optional params; default first page; small fixtures unchanged); the double-submit guard only disables a button during its own in-flight request.
- **No schema change, no RLS change/weakening, no payment/auth/business-logic change, no dispatch/ranking/payout change.** Existing customer/provider/admin workflows are unchanged (bounded lists + retry are UX/reliability, not workflow). New deps: `@sentry/react-native`, `@react-native-community/netinfo` (Expo-supported; both exports must stay green).
- The **security audit fixes only verified issues** — expected to be a no-op given prior slices' verifications; any fix is scoped + justified in the doc.

---

## 4. Testing

- **`monitoring.test.ts`:** `reportError` → console when no DSN (no throw); `initMonitoring` no-ops without DSN (Sentry mocked). **`net.test.ts`:** `withRetry` retries N times on transient error then throws / succeeds on a later attempt; does not retry a non-transient error; `friendlyError` maps offline/generic. **`useOnline`/`OfflineBanner`:** renders when offline (netinfo mocked).
- **Pagination:** each updated helper calls `.range(from,to)` for `(page,pageSize)`; `usePaginatedList` appends pages + stops when `< pageSize`; `LoadMoreButton`; a screen shows "Load more" and appends. Keep existing list-screen tests green (small fixtures ⇒ one page).
- **Uploads:** `uploadBookingPhoto` retries a transient storage error then succeeds / fails with a friendly message.
- **Double-submit:** the guarded buttons are disabled while submitting (assert `disabled` during the in-flight promise).
- **Gate:** `npm test`, `npx tsc --noEmit`, `expo export --platform web` + `--platform android` (both must pass WITH sentry + netinfo added).

---

## 5. Deliverables

1. `src/lib/monitoring.ts` (+ tests) — env-gated Sentry init + `reportError`; `ErrorBoundary` reports; `RootLayout` init; `@sentry/react-native` + `app.json` plugin.
2. `src/lib/net.ts` (+ tests) — `withRetry`, `friendlyError`; `@react-native-community/netinfo` + `useOnline` + `OfflineBanner` (in `RootLayout`).
3. Pagination — optional `(page,pageSize)` on the heavy list helpers + `usePaginatedList` + `LoadMoreButton`; applied to the heavy admin/customer/provider lists (+ tests).
4. Upload reliability — `photos.ts` guard + bounded retry + friendly messaging (+ tests).
5. Double-submit guards on M-Pesa pay / apply wallet / redeem promo / place booking / submit review (verify/add; + tests).
6. `docs/pilot/production-readiness.md` + Edge-health / env-secrets / security-hardening (RLS spot-audit) / pilot-monitoring checklists (extending existing docs); verification + isolation; green gate.
