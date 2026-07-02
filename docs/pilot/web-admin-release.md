# QuickServe Web Admin Panel — Release & Operator Guide

**Slice:** 18 (Web Admin Panel)
**Branch:** feat/slice-18-web-admin
**Base commit:** 4401d74

---

## Web export

Build a static bundle targeting browsers:

```bash
# Copy .env.example to .env.local and fill in the two required variables (see below).
npx expo export --platform web
```

Output directory: `dist/` (static HTML + JS assets, ready to serve from any CDN or web server).

### Required environment variables

Both variables must be set **before** the export command runs. They are baked into the JS bundle.

| Variable | Where to find it |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API → anon / public key |

Set them in `.env.local` (git-ignored) or via your CI/CD environment secrets. Never commit real values.

---

## Hosting / deployment

`dist/` is a standard static site (SPA). Host it on any static/CDN platform:

- **Netlify:** drag-and-drop `dist/` or connect the repo; set env vars in site settings.
- **Vercel:** `vercel --prod` from the repo root; set env vars in project settings.
- **Firebase Hosting / S3 + CloudFront / Cloudflare Pages:** upload `dist/` contents.
- **Any NGINX/Apache:** serve `dist/` with a catch-all rewrite to `index.html` (required for SPA routing — all unknown paths must return `index.html`).

**SPA note:** Expo Router generates a static SPA; the server must return `index.html` for every path, not a 404. Netlify and Vercel do this automatically. On NGINX add `try_files $uri /index.html;`.

No app-store submission is involved. The web panel is a separate deployment from the mobile apps.

---

## Admin login flow

1. Navigate to `/(admin-web)/login` (the root URL of the hosted site redirects here automatically when unauthenticated).
2. Enter the admin email and password and press **Sign in**.
3. The `(admin-web)/_layout.tsx` guard evaluates the session:
   - `role === 'admin'` (from the `profiles` table via `useAdminGuard`) → renders the dashboard.
   - Authenticated but `role !== 'admin'` → shows "Not authorized" with a **Sign out** button. No admin data is accessible.
   - No session → redirected back to `/login`.
4. Session is persisted in `localStorage` on web (the `webStorage` adapter in `src/lib/supabase.ts`); refreshes are handled automatically by the Supabase client.

---

## Admin role setup

Admin accounts are **never created through the public sign-up flow**. They must be provisioned manually:

1. Create (or find) the user in Supabase → Authentication → Users.
2. In the `public.profiles` table, set:
   - `role = 'admin'`
   - `approval_status = 'approved'`
3. The user can then sign in at `/(admin-web)/login`.

For full backend setup steps (migrations, RLS verification, service-role RPCs) see `docs/pilot/backend-readiness.md`. The `is_admin()` helper function (created in migration `0003_admin_dispatch.sql`) is what all admin RLS policies check.

There is no public admin registration path — the login screen deliberately omits a sign-up link.

---

## Route list

All routes live under the `(admin-web)` route group (`src/app/(admin-web)/`). The group prefix is stripped from the browser URL by Expo Router.

| File | Browser path | Purpose |
|---|---|---|
| `login.tsx` | `/login` | Admin sign-in (unauthenticated entry point) |
| `index.tsx` | `/` | Dashboard — summary tiles, recent bookings |
| `bookings/index.tsx` | `/bookings` | All bookings table with status filter |
| `bookings/[id].tsx` | `/bookings/:id` | Booking detail — assign provider, update status, add notes, set/accept/decline quote |
| `providers/index.tsx` | `/providers` | All service providers table |
| `providers/[id].tsx` | `/providers/:id` | Provider detail — verify, view jobs, view earnings |
| `customers/index.tsx` | `/customers` | All customers table |
| `payments/index.tsx` | `/payments` | All payment records with status filter |
| `payment-attempts/index.tsx` | `/payment-attempts` | M-Pesa payment attempt log |
| `earnings/index.tsx` | `/earnings` | Provider earnings — mark payout paid |
| `reviews/index.tsx` | `/reviews` | All reviews — hide/unhide moderation |

---

## Manual QA checklist

Work through these checks after deploying `dist/` to the target host.

### Auth & access control

- [ ] Admin login works: enter valid admin credentials → dashboard loads.
- [ ] Non-admin login blocked: sign in with a customer or provider account → "Not authorized" screen appears; no admin data is visible; **Sign out** button works.
- [ ] Unauthenticated access redirects: open any admin URL without a session → redirected to `/login`.
- [ ] Refresh persists session: reload the browser after logging in → still on dashboard (not redirected to login).

### Per-section smoke tests

- [ ] **Dashboard** (`/`) — summary tiles load without errors.
- [ ] **Bookings** (`/bookings`) — table loads; filter by status works.
- [ ] **Booking detail** (`/bookings/:id`) — assign provider (sets `assigned_provider_name`); advance status; add admin note; set quote amount.
- [ ] **Providers** (`/providers`) — table loads; provider count is correct.
- [ ] **Provider detail** (`/providers/:id`) — profile loads; mark provider verified works.
- [ ] **Customers** (`/customers`) — table loads; customer count is correct.
- [ ] **Payments** (`/payments`) — table loads; `override_payment_status` action works on a payment.
- [ ] **Payment attempts** (`/payment-attempts`) — M-Pesa attempt log loads.
- [ ] **Earnings** (`/earnings`) — table loads; **Mark paid** action calls `mark_payout_paid` and refreshes the row.
- [ ] **Reviews** (`/reviews`) — table loads; **Hide** / **Unhide** toggle calls `adminToggleReviewHidden` and refreshes the row.

### Mobile isolation

- [ ] Open the QuickServe mobile app (Android or iOS) — customer, provider, and mobile-admin flows are unaffected.
- [ ] On a mobile device, navigating to the `(admin-web)` path (if somehow reachable) is guarded by the layout and harmless — the mobile `_layout.tsx` early-return simply bypasses the mobile root navigator for that segment.

---

## RLS unchanged confirmation

**Zero `supabase/migrations/**` files were added or modified in Slice 18.**

All admin data access flows through existing Row Level Security policies that call the `is_admin()` helper (defined in `0003_admin_dispatch.sql`). No new policies, no new RPCs, no schema changes were introduced. The `git diff 4401d74..HEAD -- supabase/` output is empty.

---

## Mobile route isolation confirmation

The only change to `src/app/_layout.tsx` is one additive line in `RootNavigator`:

```ts
if ((segments[0] as string) === '(admin-web)') return;   // web-admin group manages its own auth/guard
```

This early-return means the mobile root navigator does not attempt to redirect users who are on an `(admin-web)` route. All existing mobile routes (`src/app/admin/**`, `src/app/(customer)/**`, `src/app/provider/**`, `src/app/(onboarding)/**`) are entirely unchanged.

---

## Rollback

The web admin panel is a pure additive layer with no schema or data changes. Rolling back is straightforward:

1. **Disable hosting:** stop serving (or unpublish) the `dist/` deployment. The panel becomes inaccessible instantly.
2. **Revert the code commit(s):** if a git revert is needed, revert the commits on this branch with `git revert <sha>`. No migration rollback is required.
3. **No schema/data rollback:** because zero `supabase/migrations/**` were changed, the database is unaffected. Existing mobile app users experience no disruption.
