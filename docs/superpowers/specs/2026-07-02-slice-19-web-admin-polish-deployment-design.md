# Slice 19 — Web Admin Polish + Deployment (Design Spec)

**Date:** 2026-07-02
**Status:** Approved design → implementation plan
**Type:** Polish + deployment slice for the Slice-18 web admin. Presentation + config + docs only.

---

## 1. Goal & Hard Non-Goals

Make the `(admin-web)` panel production-presentable and deployable: layout/table/state polish, desktop + tablet responsiveness, page titles/meta, verified auth-guard behavior, a Vercel-first deployment setup, and deployment docs.

**Non-goals (hard):** no DB schema change, no RLS change, no new admin business features, no customer/provider mobile workflow change, no payment/auth/security weakening. Reuse the existing admin-web screens + `src/lib/*` + design system. **Polish + deployment only.** Out of scope: analytics, refunds/disputes, smart dispatch, live GPS, corporate accounts, public marketing site.

---

## 2. Responsiveness (desktop-first, tablet-safe)

Build on the existing `admin-shell` `useWindowDimensions` + `MaxContentWidth` foundation:
- **Desktop (≥ wide breakpoint):** fixed sidebar + content column, comfortable max width, consistent gutters.
- **Tablet (mid breakpoint):** sidebar collapses to a compact/top nav; tables reflow (horizontal scroll or priority columns) so no row is clipped; touch targets ≥ 44px.
- Centralize the breakpoints in one place (e.g. `src/constants/admin-web.ts` or reuse theme) so shell + `data-table` agree. Presentation only — no behavior/data change.

---

## 3. Component & Screen Polish

Reuse and refine the existing admin-web components/screens (no new screens, no new actions):
- **`data-table`:** consistent header/row rhythm, zebra/hover affordance (web), aligned numeric/amount columns, sticky header on scroll where practical, refined empty (`EmptyState`) + loading (`Skeleton`) + a simple inline **error state** (retry) for failed loads.
- **`admin-shell` / `admin-sidebar`:** refined active state, spacing, section titles, sign-out affordance; clear focus rings for keyboard nav.
- **Screens (dashboard, bookings ±[id], providers ±[id], customers, payments, payment-attempts, earnings, reviews):** consistent page headers, spacing, card/table alignment, and uniform empty/loading/error handling. Booking/provider detail two-column layouts tuned for desktop, stacking on tablet.
- Premium Claude Design tokens throughout; light-led, dark stays consistent. No data/logic change.

---

## 4. Page Titles & Meta

Add `expo-router/head` `<Head>` to each admin-web screen: a descriptive `<title>` (e.g. `Bookings · QuickServe Admin`, `Sign in · QuickServe Admin`) plus basic `<meta name="description">` and viewport. A tiny shared helper/constant supplies the `· QuickServe Admin` suffix for consistency. Web-only; no effect on native.

---

## 5. Auth Guard & Access Confirmation

No auth changes — **confirm and lock behavior** via tests + a manual checklist:
- Admin (`role === 'admin'`) → panel renders.
- Authenticated non-admin (customer/provider) → **"Not authorized"** + sign-out; never sees admin data.
- Unauthenticated → admin login; login route never loops.
- Server-side RLS (`is_admin()`) remains the real boundary (unchanged). Add/keep guard tests green; document the manual verification.

---

## 6. Deployment Setup (Vercel-first)

- **`vercel.json`** (committed): build the static web export (`expo export --platform web`), output `dist/`, and an **SPA rewrite** (`/(.*) → /`) so deep links (e.g. `/(admin-web)/bookings`) resolve to the client router. Env vars (`EXPO_PUBLIC_SUPABASE_URL/ANON_KEY`) documented as Vercel project settings.
- **Alternatives documented** (not committed unless trivial): Netlify (`netlify.toml` build/publish/redirect) and a generic static/CDN host (upload `dist/`, configure SPA fallback).
- Confirm `expo export --platform web` produces a hostable `dist/` and the SPA fallback is correct for route groups.

---

## 7. Environment Configuration

Document required env for the web build: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (public anon key only — never a service-role key in the web bundle). `.env.example` already lists these; the deploy doc maps them to Vercel/Netlify project env settings and notes they are build-time public values.

---

## 8. Web Admin QA & Browser Testing

- **Automated (no-regression):** existing suite stays green (guard + admin-web screen tests preserved/strengthened, never weakened); `npx tsc --noEmit` clean; `npx expo export --platform web` AND `--platform android` both succeed.
- **Manual (documented in `docs/pilot/web-admin-qa.md`):** desktop + tablet layout pass; browser matrix (Chrome, Edge, Safari, Firefox); login/guard/not-authorized paths; each section loads + one action works; deep-link + SPA-fallback works on the deployed host; page titles show correctly.

---

## 9. Testing

Unit/component (RNTL) for any polished shared piece (e.g. `data-table` error/empty/loading states, a `usePageMeta`/title helper, breakpoint helper). Keep all existing tests green; do not weaken assertions. Design-slice reality: "premium/responsive" is manual — automated tests prove no regression.

---

## 10. Deliverables

1. Responsive polish to `admin-shell`, `admin-sidebar`, `data-table`, and the 11 admin-web screens (presentation only) + centralized breakpoints.
2. Inline error state (+ retry) pattern for admin-web list loads.
3. `expo-router/head` titles/meta on every admin-web screen + a shared title helper.
4. `vercel.json` (build + SPA rewrite); documented Netlify + generic-host alternatives.
5. Guard/behavior tests confirmed green; `data-table`/helper tests.
6. `docs/pilot/web-admin-deploy.md` (Vercel-first deploy steps, env config, alternatives, rollback) and `docs/pilot/web-admin-qa.md` (responsive + browser + guard manual checklist).
7. Green gate: `npm test` / `tsc` / web + android export / `git status`.
