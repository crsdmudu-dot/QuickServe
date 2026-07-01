# Slice 18 — Web Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A web-first admin panel in the existing Expo app (`src/app/(admin-web)/`), reusing all existing Supabase libs/RLS/RPCs, gated by an admin role guard.

**Architecture:** New `(admin-web)` route group rendered via `react-native-web` (existing `web.output: static`). Reuses `src/lib/*`, `@/constants/theme`, and `is_admin()` RLS unchanged. Desktop-first shell (sidebar + topbar). A few thin additive admin READ helpers only. Mobile routing stays identical (one additive `RootNavigator` exclusion).

**Tech Stack:** Expo Router + react-native-web, TypeScript, Supabase (existing), Jest + RNTL.

## Global Constraints

- **Same Expo app, no new toolchain.** All admin routes live under `src/app/(admin-web)/`.
- **Reuse only:** existing `src/lib/*` admin helpers + existing RLS (`is_admin()`) + existing design tokens/components. **No new RPC, no RLS change, no RLS weakening, no new business logic.** The only new DB-adjacent code is thin client READ helpers that existing admin RLS already permits.
- **No public admin signup.** Admin login = `supabase.auth.signInWithPassword`; access gated to `role === 'admin'` (non-admins → "Not authorized" + sign-out). RLS is the real boundary.
- **Do not change customer/provider mobile workflows.** The only shared-file change is ONE additive exclusion in `RootNavigator` for `(admin-web)`; mobile redirect behavior stays identical, and existing mobile admin routes (`src/app/admin/*`) are untouched.
- Design: premium Claude Design, desktop-first responsive, reuse the polished kit.
- Merge gate every task: `npm test` green, `npx tsc --noEmit` clean, `npx expo export --platform web` AND `--platform android` both succeed.

---

## File Structure

**Create**
- `src/app/(admin-web)/_layout.tsx` — admin guard + desktop shell (sidebar/topbar).
- `src/app/(admin-web)/login.tsx` — email/password admin login.
- `src/app/(admin-web)/index.tsx` — dashboard.
- `src/app/(admin-web)/bookings/index.tsx`, `bookings/[id].tsx`.
- `src/app/(admin-web)/providers/index.tsx`, `providers/[id].tsx`.
- `src/app/(admin-web)/customers/index.tsx`.
- `src/app/(admin-web)/payments/index.tsx`.
- `src/app/(admin-web)/payment-attempts/index.tsx`.
- `src/app/(admin-web)/earnings/index.tsx`.
- `src/app/(admin-web)/reviews/index.tsx`.
- `src/hooks/use-admin-guard.ts` (+ test).
- `src/components/admin-web/sidebar.tsx`, `admin-shell.tsx`, `data-table.tsx` (+ tests as noted).
- `src/lib/customers.ts` (+ test) — `adminGetAllCustomers`.
- `docs/pilot/web-admin-release.md`.

**Modify**
- `src/lib/earnings.ts` (+ test) — add `adminGetAllEarnings`.
- `src/lib/reviews.ts` (+ test) — add `adminGetAllReviews`.
- `src/app/_layout.tsx` — one additive `(admin-web)` exclusion in `RootNavigator`.

---

## Task Order (dependency-ordered)

1. **T1** — Thin additive read helpers (`adminGetAllCustomers`, `adminGetAllEarnings`, `adminGetAllReviews`) + tests.
2. **T2** — `useAdminGuard` hook + `(admin-web)/_layout.tsx` shell/guard + `login.tsx` + RootNavigator exclusion.
3. **T3** — Shell components: `sidebar`, `admin-shell`, `data-table` + dashboard `index.tsx`.
4. **T4** — Bookings (list + detail: status/assign/notes/quote/photos/activity/chat/payment).
5. **T5** — Providers (list + detail: approve/reject, profile, reviews moderation, earnings/payouts).
6. **T6** — Payments + Payment Attempts + Earnings & Payouts.
7. **T7** — Customers (read-only) + Reviews moderation.
8. **T8** — Verification: web + android export, deployment doc, final gate.

T2 depends on T1 (guard uses profile read). T3+ depend on T2 (shell/guard). Each task ends green.

---

### Task 1: Thin additive admin READ helpers

**Files:** Create `src/lib/customers.ts` (+ `.test.ts`); Modify `src/lib/earnings.ts` (+ test), `src/lib/reviews.ts` (+ test)

**Build (mirror existing helpers; plain admin-permitted SELECTs — RLS unchanged):**
- `customers.ts`: `type CustomerProfile` (id, full_name, phone, created_at) + `adminGetAllCustomers(): Promise<CustomerProfile[]>` — `profiles` where `role='customer'`, order created_at desc, `[]` on error.
- `earnings.ts`: `adminGetAllEarnings(): Promise<ProviderEarning[]>` — all `provider_earnings`, newest first, `[]` on error.
- `reviews.ts`: `adminGetAllReviews(): Promise<Review[]>` — all `reviews`, newest first, `[]` on error.

**Tests:** each — success returns rows, error → `[]`, correct table/filter/order asserted.

**Checks:** `npm test` green, `tsc` clean. Commit `feat: slice18 admin read helpers`.

---

### Task 2: Admin guard + login + route isolation

**Files:** Create `src/hooks/use-admin-guard.ts` (+ `.test.ts`), `src/app/(admin-web)/_layout.tsx`, `src/app/(admin-web)/login.tsx`; Modify `src/app/_layout.tsx`

**Build:**
- `useAdminGuard()`: reads `useAuth()` session; if a session exists, resolves the profile role (reuse the auth context's `role`, else a `profiles` read); returns `{ loading, session, isAdmin }` (`isAdmin = role === 'admin'`).
- `(admin-web)/_layout.tsx`: while `loading` → spinner; no session → render `<Redirect href="/(admin-web)/login">` (or show the login screen); session but `!isAdmin` → **"Not authorized"** screen + Sign out; `isAdmin` → render the shell `<Slot/>` (shell added in T3; for now a minimal authenticated container).
- `login.tsx`: email/password form → `supabase.auth.signInWithPassword`; on success the guard re-evaluates; friendly error via existing `mapAuthError`. No signup link.
- `src/app/_layout.tsx` `RootNavigator`: add ONE additive exclusion so mobile redirects skip the web-admin group:
  ```ts
  const inAdminWeb = segments[0] === '(admin-web)';
  if (inAdminWeb) return;           // web-admin group manages its own auth/guard
  ```
  Place it right after the `isLoading` guard, before the existing onboarding redirect logic. **Do not change any other redirect branch.**

**Tests:** `use-admin-guard.test.ts` (admin → isAdmin true; customer/provider → false; no session → not authed). If feasible, a layout test: non-admin session renders "Not authorized"; unauth renders login. Keep existing `_layout`/auth tests green.

**Checks:** `npm test`, `tsc`, both exports. Commit `feat: slice18 admin guard + login + route isolation`.

---

### Task 3: Desktop shell + dashboard

**Files:** Create `src/components/admin-web/{sidebar,admin-shell,data-table}.tsx` (+ tests for data-table + sidebar), `src/app/(admin-web)/index.tsx`

**Build:**
- `sidebar.tsx`: nav items (Dashboard, Bookings, Providers, Customers, Payments, Payment Attempts, Earnings & Payouts, Reviews) using `router`/`Link`; active-state via `useSegments`; footer admin name + Sign out. Desktop-first; collapses to top nav on narrow width.
- `admin-shell.tsx`: layout wrapper (sidebar + topbar with section title + content area, max width, token spacing); consumed by `_layout.tsx`.
- `data-table.tsx`: a reusable responsive table/list (header row + rows, empty state, loading Skeleton) for the section screens.
- `index.tsx` (dashboard): summary cards from existing reads (`getAllBookings`, `adminGetAllPayments`, `getPendingProviders`, `adminGetAllReviews`) — counts + a few recent rows; links into sections. Read-only.
- Wire `_layout.tsx` (from T2) to render `<AdminShell><Slot/></AdminShell>` for the `isAdmin` branch.

**Tests:** `data-table` renders rows + empty state; `sidebar` renders items + Sign out. Dashboard optional smoke.

**Checks:** `npm test`, `tsc`, both exports. Commit `feat: slice18 admin shell + dashboard`.

---

### Task 4: Bookings (list + detail)

**Files:** Create `src/app/(admin-web)/bookings/index.tsx`, `bookings/[id].tsx`

**Build (reuse helpers only):**
- List: `getAllBookings` → DataTable (service/status badge/date), row → detail.
- Detail: `getBookingById`; sections reusing — status (`updateBookingStatus`), assign provider (`getApprovedProviders` + `assignProvider`), admin notes (`updateAdminNotes`), **quote** (`setBookingQuote` + live QuickServe-share preview via `computeQuickServeShare`), **photos/evidence** (`getBookingPhotos`, `setPhotoVerified`, `deleteBookingPhoto`), **activity** (`getBookingActivity` → `ActivityTimeline`), **chat oversight** (`getBookingMessages` + `labelSender`, read-only `ChatThread` mode="readonly"), **payment** (`getPaymentForBooking` + `PaymentStatusBadge`). Desktop two-column layout.

**Checks:** component test for the quote share-preview / a reused action call; `npm test`, `tsc`, both exports. Commit `feat: slice18 admin web bookings`.

---

### Task 5: Providers (list + detail)

**Files:** Create `src/app/(admin-web)/providers/index.tsx`, `providers/[id].tsx`

**Build:** list (`getPendingProviders` + `getApprovedProviders`) with approve/reject inline (`setProviderApproval`); detail — profile (`getProviderProfile`, `adminUpdateProviderProfile`), **reviews moderation** (`getProviderReviews`, `setReviewHidden`), **earnings/payouts** (`adminGetProviderEarnings`, `adminMarkPayoutPaid`).

**Checks:** `npm test`, `tsc`, both exports. Commit `feat: slice18 admin web providers`.

---

### Task 6: Payments + Attempts + Earnings

**Files:** Create `src/app/(admin-web)/payments/index.tsx`, `payment-attempts/index.tsx`, `earnings/index.tsx`

**Build:** payments (`adminGetAllPayments`, `adminOverridePaymentStatus`); attempts (`adminGetPaymentAttempts`, `adminConfirmAttempt`, `adminCancelAttempt`, Daraja refs); earnings & payouts (`adminGetAllEarnings`, `adminMarkPayoutPaid`). DataTable + status badges.

**Checks:** `npm test`, `tsc`, both exports. Commit `feat: slice18 admin web payments/attempts/earnings`.

---

### Task 7: Customers (read-only) + Reviews

**Files:** Create `src/app/(admin-web)/customers/index.tsx`, `reviews/index.tsx`

**Build:** customers — `adminGetAllCustomers` read-only list (name/phone/joined; optionally their bookings via `getAllBookings` filtered client-side); NO edit actions. reviews — `adminGetAllReviews` with hide/unhide (`setReviewHidden`).

**Checks:** `npm test`, `tsc`, both exports. Commit `feat: slice18 admin web customers + reviews`.

---

### Task 8: Verification & final gate

**Files:** Create `docs/pilot/web-admin-release.md`

- **Deployment doc:** `npx expo export --platform web` → static assets → host (CDN/static); env (`EXPO_PUBLIC_SUPABASE_URL/ANON_KEY`); admin-account creation reference (`backend-readiness.md` / manual promote); note the panel is admin-role-gated and separate from mobile; browser support + desktop-first note.
- **Manual verification checklist (documented):** admin login works; non-admin login → "Not authorized"; each section loads via RLS; an action per section (assign/quote/confirm/override/mark-payout/hide-review) works; mobile customer/provider flows unaffected; deep-linking to `(admin-web)` on mobile is harmless (guarded).
- **RLS confirmation:** no policy changed (diff shows zero `supabase/migrations/**` changes); all admin data flows through existing `is_admin()` policies.
- **Final gate:** `npx expo export --platform web` AND `--platform android` succeed → `npx tsc --noEmit` clean → `npm test` green → `git status` clean.
- Commit `test: slice18 web admin verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-18-web-admin`. Abandon = `git checkout main` + delete branch; `main` untouched.
- **Per-task revert:** each task is an independent commit — `git revert <commit>` rolls back one wave (helpers/guard/shell/section) without affecting others.
- **Route isolation revert:** the single `RootNavigator` exclusion is one additive branch; reverting T2 restores it exactly; mobile routing was never otherwise touched.
- **No schema/RLS/data changes** — nothing to migrate or restore; rollback is purely additive frontend code + doc + 3 read helpers. Removing the `(admin-web)` group has zero effect on the mobile app.
- **Deployment revert:** the web build is a separate static export; simply stop hosting it — no impact on the mobile app or backend.

---

## Self-Review

- **Spec coverage:** read helpers (T1), auth guard + login + isolation (T2), shell/nav/dashboard (T3), bookings incl. chat/photos/activity/quote (T4), providers incl. reviews moderation + payouts (T5), payments/attempts/earnings (T6), customers read-only + reviews (T7), web export + deployment doc + verification (T8 + sections). No RLS/logic change; reuse-only; no public admin signup; mobile unchanged.
- **Placeholder scan:** none; checks concrete.
- **Type/name consistency:** reused helper names verified against `src/lib/*` (`adminGetAllPayments`, `adminGetPaymentAttempts`, `adminGetProviderEarnings`, `adminMarkPayoutPaid`, `setBookingQuote`, `computeQuickServeShare`, `setReviewHidden`, `getBookingMessages`/`labelSender`, `getBookingPhotos`/`setPhotoVerified`/`deleteBookingPhoto`, `getBookingActivity`, `assignProvider`/`getApprovedProviders`, `setProviderApproval`, `adminUpdateProviderProfile`); new helpers (`adminGetAllCustomers`/`adminGetAllEarnings`/`adminGetAllReviews`) consistent T1↔consumers.
