# Slice 18 — Web Admin Panel (Design Spec)

**Date:** 2026-07-01
**Status:** Approved design → implementation plan
**Type:** New web-first admin surface — reuses existing data layer, RLS, and design system.

---

## 1. Goal & Non-Goals

A dedicated **web-first admin panel** for QuickServe operations, private and desktop-first, replacing admin-as-a-mobile-role. It reuses the existing Supabase tables, RLS, RPCs, and `src/lib/*` helpers — **no new business logic, no RLS weakening**.

**Non-goals (out of scope):** new analytics system, refund/dispute workflows, smart dispatch, live GPS tracking, provider auto-assignment, marketing site. No public admin signup. Existing **mobile** admin routes (`src/app/admin/*`) **stay as-is** for now (web becomes the preferred admin surface; they are not removed this slice). Customer/provider mobile app unchanged.

---

## 2. Architecture

- **Same Expo Router app, new web-first route group** `src/app/(admin-web)/`. The app already targets web (`app.json` `web.output: static`, `react-native-web`, `react-dom`), so no new toolchain. Deploy = `npx expo export --platform web` → static host.
- **Reuse everything:** the same `supabase` client, `src/lib/*` admin helpers, `@/constants/theme` tokens, and existing RLS (`is_admin()` policies). Admin data access is enforced **server-side by RLS** exactly as today — the web panel is only a new presentation surface.
- **Web-first, responsive desktop layout:** a persistent left **sidebar nav** + top bar + content area, constrained to a comfortable max width; usable down to tablet. Built with the existing RN primitives (`react-native-web`) + design tokens (Claude Design).
- **Isolation from mobile routing:** `(admin-web)` has its own `_layout.tsx` guard. The shared `RootNavigator` (in `src/app/_layout.tsx`) gets **one additive exclusion**: when `segments[0] === '(admin-web)'` it does not run its mobile redirect (same pattern already used for `(onboarding)`). Mobile customer/provider routing behavior stays **identical**; the customer/provider app never links into `(admin-web)`.

---

## 3. Auth & Access Control

- **Login:** `src/app/(admin-web)/login.tsx` — email/password via the existing `supabase.auth.signInWithPassword`. No public admin signup (unchanged from Slice-17 removal).
- **Admin role guard:** `(admin-web)/_layout.tsx` checks the signed-in user's `profiles.role`. Only `role === 'admin'` proceeds; a non-admin (customer/provider) session is shown **"Not authorized"** and offered sign-out — it never renders admin data. Unauthenticated → the admin login screen.
- **Server-side enforcement (unchanged):** every query still runs under existing RLS (`is_admin()` across profiles/bookings/payments/attempts/earnings/reviews/messages/photos/activity). The client guard is convenience; RLS is the real boundary. **No RLS change.**
- A small reusable `useAdminGuard` hook (or the layout) resolves `{ loading, isAdmin, session }` from the auth context / a profile fetch.

---

## 4. App Shell & Navigation

`(admin-web)/_layout.tsx` renders the authenticated shell:
- **Sidebar:** Dashboard, Bookings, Providers, Customers, Payments, Payment Attempts, Earnings & Payouts, Reviews — plus a footer with the admin's name + Sign out.
- **Top bar:** section title + optional search/filter slot.
- **Responsive:** desktop-first (sidebar fixed); collapses to a top nav on narrow widths. Premium Claude Design (tokens, `e1/e2` elevation, spacing rhythm, `Text`/`Card`/`Button` primitives, data-table styling).

---

## 5. Screens (each maps to REUSED helpers — no new logic)

- **Dashboard** (`index.tsx`): at-a-glance counts + recent activity from existing reads (`getAllBookings`, `adminGetAllPayments`, pending providers, recent reviews). Read-only summary cards; links into sections.
- **Bookings** (`bookings/index.tsx` + `bookings/[id].tsx`): list (`getAllBookings`) with status/date/service; detail reuses the full admin toolkit — `getBookingById`, `updateBookingStatus`, `assignProvider` (+ `getApprovedProviders`), `updateAdminNotes`, **Quote** (`setBookingQuote` + share preview), **Photos/evidence** (`getBookingPhotos`, verify/delete via `setPhotoVerified`/`deleteBookingPhoto`), **Activity timeline** (`getBookingActivity`), **Chat oversight** (`getBookingMessages` + `labelSender`, read-only), **Payment** (`getPaymentForBooking`).
- **Providers** (`providers/index.tsx` + `providers/[id].tsx`): list (`getPendingProviders` / `getApprovedProviders`); detail = approve/reject (`setProviderApproval`), profile (`getProviderProfile`, `adminUpdateProviderProfile`), **reviews moderation** (`getProviderReviews`, `setReviewHidden`), **earnings/payout oversight** (`adminGetProviderEarnings`, `adminMarkPayoutPaid`).
- **Customers** (`customers/index.tsx`): **read-only** list of customer profiles (admin RLS permits) + their bookings; no edit actions.
- **Payments** (`payments/index.tsx`): `adminGetAllPayments`, amount/split/method/status, `adminOverridePaymentStatus`.
- **Payment Attempts** (`payment-attempts/index.tsx`): `adminGetPaymentAttempts`, Daraja refs, `adminConfirmAttempt` / `adminCancelAttempt`.
- **Earnings & Payouts** (`earnings/index.tsx`): all provider earnings + payout status, `adminMarkPayoutPaid`.
- **Reviews** (`reviews/index.tsx`): all reviews with hide/unhide (`setReviewHidden`).

---

## 6. Data Layer — reuse + thin additive READ helpers only

Reuse all existing `src/lib/*` admin functions unchanged. The panel needs a few **new client read helpers** that are plain `SELECT`s already permitted by existing admin RLS (no new RPC, no RLS change, no business logic):
- `adminGetAllCustomers()` in `providers.ts`/a new `customers.ts` — `profiles` where `role='customer'` (admin RLS permits).
- `adminGetAllEarnings()` in `earnings.ts` — all `provider_earnings` rows (admin RLS permits) for the payouts screen.
- `adminGetAllReviews()` in `reviews.ts` — all `reviews` rows (admin RLS permits) for the moderation screen.
Each is a small typed query returning rows/`[]`, mirroring existing helpers, with unit tests. If a needed read already exists, reuse it; add a helper only when none fits.

---

## 7. Design

Premium Claude Design, reusing `@/constants/theme` + the polished component kit. Desktop-first: sidebar + content grid, generous spacing, `Card`/data-table rows, semantic status badges (`StatusBadge`/`PaymentStatusBadge`/`AttemptStatusBadge`), `EmptyState`, `Skeleton` loading. Light-led (dark stays consistent). Accessible (focus states, roles/labels, ≥44px targets).

---

## 8. Testing

- **Lib:** unit tests (mocked Supabase) for the new read helpers (`adminGetAllCustomers`/`adminGetAllEarnings`/`adminGetAllReviews`) — success + `[]`-on-error.
- **Components/guard:** RNTL tests for `useAdminGuard`/the layout guard (admin → renders; non-admin → "Not authorized" + sign-out; unauthenticated → login) and 1–2 key screens (e.g. Bookings list renders rows; an action calls the right reused helper).
- **No regressions:** existing 478 tests stay green; mobile app + RLS + business logic untouched.
- Gate: `npm test` green, `npx tsc --noEmit` clean, `npx expo export --platform web` **and** `--platform android` both succeed.

---

## 9. Deployment

`npx expo export --platform web` produces static assets (existing `web.output: static`) → host on any static/CDN host; the app already reads `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` from env. Documented in `docs/pilot/web-admin-release.md` (build, host, env, admin-account creation reference, and that the panel is admin-role-gated). No app-store involvement.

---

## 10. Deliverables

1. `src/app/(admin-web)/` route group: `_layout.tsx` (shell + admin guard), `login.tsx`, `index.tsx` (dashboard), and section screens — bookings (+ `[id]`), providers (+ `[id]`), customers, payments, payment-attempts, earnings, reviews.
2. `useAdminGuard` hook + shared web-admin shell/nav components (sidebar, topbar, data-table/list primitives) reusing the design system.
3. Thin additive read helpers (`adminGetAllCustomers`, `adminGetAllEarnings`, `adminGetAllReviews`) + unit tests.
4. One additive `RootNavigator` exclusion for `(admin-web)` (mobile routing unchanged).
5. Guard/screen tests; green `npm test` / `tsc` / web + android export.
6. `docs/pilot/web-admin-release.md` deployment doc.
