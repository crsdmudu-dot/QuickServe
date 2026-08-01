# Phase 3G — Native Entry Routing Correction

> Restores deterministic native entry to the customer/provider flow (fixing the Phase 3F
> blocker) while keeping the admin **web** surface behaving as before. **Native verification
> (10 consecutive cold launches) is the closure authority** and is recorded in §Native
> Verification.

- **Branch:** `fix/phase-3g-native-entry-routing`
- **Baseline (main):** `c015afe`

---

## 1. Root Cause (from Phase 3F, confirmed by repository evidence)

The native app opened on the **Admin Panel login** instead of the customer/provider
onboarding because the root route `/` was claimed by **two** files:
`src/app/(admin-web)/index.tsx` (admin dashboard) and `src/app/(customer)/index.tsx`
(customer home). Route groups are stripped from the URL, so both resolved to `/`; Expo
Router picked `(admin-web)` on essentially every launch, and the root gate
(`src/app/_layout.tsx`) never redirects away from `(admin-web)`. The same duplicate
ownership existed for `/login` (`(admin-web)/login.tsx` vs `(onboarding)/login.tsx`).

## 2. Architectural Intent (repository evidence)

1. **Default native entry:** customer/provider onboarding (`/welcome`). Evidence:
   `src/app/_layout.tsx` gate `if (!signedIn && !inOnboarding) router.replace('/welcome')`;
   `CLAUDE.md` — "premium on-demand services **mobile application for Android and iOS**".
2. **Default web entry:** admin. Evidence: `page-meta.tsx` `if (Platform.OS !== 'web') return null`
   (admin-web is web-oriented); Phase 3A certifies the admin **web** surface.
3. **Duplicate `/` (and `/login`) ownership is NOT intentional** — it is the defect.
4. **Native `/` should be owned by** the customer/provider flow.
5. **Web `/` should be owned by** the admin surface.

## 3. Chosen Solution — Option A: a single root `/` dispatcher

`/` is now owned by **one** platform-aware dispatcher, and the two group homes moved to
explicit, non-colliding paths:

- **`src/app/index.tsx`** (native): redirects to the customer/provider flow —
  unauthenticated → `/welcome`, signed-in → `roleHref(role)`.
- **`src/app/index.web.tsx`** (web): redirects to the admin dashboard
  (`/(admin-web)/dashboard`); the admin guard then behaves exactly as before.
- **`(admin-web)/index.tsx` → `(admin-web)/dashboard.tsx`** — admin dashboard now at
  `/dashboard` (reached on web via the dispatcher and the admin "Dashboard" nav).
- **`(customer)/index.tsx` → `(customer)/home.tsx`** — customer home now at `/home`
  (`roleHref('customer')` → `/home`; the customer "Home" tab uses `name="home"`).
- **`(onboarding)/login.tsx` → `(onboarding)/signin.tsx`** — the customer/provider login now
  at `/signin` (welcome/register "Log in"/"Login" links → `/signin`), removing the `/login`
  collision. The admin login stays at **`/login`** (`(admin-web)/login.tsx`), unchanged for web.

Result: `/` and `/login` each have a single deterministic owner. On native the app enters
the customer/provider flow; on web the admin surface is reached exactly as before.

**The Phase 3D/3E admin guard (`src/app/(admin-web)/_layout.tsx`) and `AdminShell` are
UNTOUCHED** — this fix is purely route-file structure + redirects, so the navigator
invariant (3D) and deferred-activation invariant (3E) are preserved verbatim.

## 4. Rejected Alternatives

- **Option C — platform-extension route files** (`(admin-web)/index.web.tsx` +
  `(customer)/index.native.tsx`): **rejected** — Expo Router requires a platform-specific
  route file to have a non-platform fallback sibling; web export fails with
  "`(admin-web)/index.web.tsx` does not have a fallback sibling file without a platform
  extension." Platform extensions cannot exclude a route from a platform or split one path
  across two groups. (Verified empirically.)
- **Option B — remove admin-web root ownership** (move admin off `/` only): rejected —
  leaves the web entry without a deterministic admin owner and still requires the customer
  side to change; no smaller than Option A.
- **Option D — `initialRouteName`/`unstable_settings`**: rejected — selects the initial
  child *within* a navigator; it does not disambiguate two files that both resolve to `/`.
- **Gate-only hack** (redirect away from `(admin-web)` on native in `_layout.tsx`):
  rejected — leaves the `/` and `/login` collisions in place (non-deterministic, flashes the
  admin login, and risks a redirect loop for signed-in customers when `roleHref` = `/`).

## 5. Files Changed

Route files:
- `src/app/index.tsx` (new — native `/` dispatcher)
- `src/app/index.web.tsx` (new — web `/` dispatcher → admin dashboard)
- `src/app/(admin-web)/index.tsx` → `src/app/(admin-web)/dashboard.tsx` (rename)
- `src/app/(customer)/index.tsx` → `src/app/(customer)/home.tsx` (rename)
- `src/app/(onboarding)/login.tsx` → `src/app/(onboarding)/signin.tsx` (rename)
- `src/app/(admin-web)/login.tsx` (admin login redirect target → `/(admin-web)/dashboard`)

Reference updates (routing only):
- `src/constants/roles.ts` — `roleHref('customer')`: `/` → `/home`.
- `src/components/app-tabs.tsx` — customer "Home" tab `name="index"` → `name="home"`.
- `src/components/admin-web/admin-sidebar.tsx` — "Dashboard" nav → `/(admin-web)/dashboard`
  (segment `dashboard`); simplify `isActive`.
- `src/app/(onboarding)/welcome.tsx`, `src/app/(onboarding)/register.tsx` — "Log in"/"Login"
  → `/signin`.
- `src/app/booking/success.tsx` — "Back to Home" → `/home`.

Tests (assertions/imports updated to the new routes — no behaviour weakened):
- `admin-login-transition.test.tsx`, `admin-sidebar.test.tsx`, `roles.test.ts`,
  `welcome.test.tsx`, `booking-success.test.tsx`, `home-screen.test.tsx`,
  `customer-home-enhanced.test.tsx`, `s36-notification-bell-home.test.tsx`,
  `login.test.tsx`, `login-error.test.tsx`.

**Not changed:** the `(admin-web)/_layout.tsx` guard, `AdminShell`, `auth-context`, any auth
/ schema / backend / business / payment / storage / RLS / push / location code.

## 6. Validation

| Gate | Result |
|---|---|
| Root Jest | ✅ 222 suites / **2951** tests |
| Website Vitest | ✅ 102 |
| TypeScript (root + qa) | ✅ 0 / 0 (route types regenerated for `/home`, `/signin`, `/dashboard`) |
| Lint | ✅ 59 errors (**unchanged** baseline) |
| `expo config` / web export / android export | ✅ resolves / ✅ / ✅ (no route-conflict or fallback errors) |
| Connected certification | ✅ **116/116** |
| Phase 3A admin web | ✅ **8/8** (admin web reachable + behaves as before) |
| qa:release | ✅ Jest 2951 · export web+android · cert 116 · **non-cert 130 / 56 skipped / 0 failed** |
| Phase 3D tests (admin-navigator-invariant, admin-login-transition) | ✅ pass (guard untouched) |
| Phase 3E tests (executive-dashboard, useAdminReady gate) | ✅ pass |

## 7. Native Verification

Build `aa9fa606` (EAS `preview`, Android APK ~111 MB) on `Pixel_9_Pro_XL` / Android 16,
driven by Maestro 2.8.0:

| Check | Result |
|---|---|
| **10 consecutive cold launches** (clearState) → customer/provider **welcome** | ✅ **10/10** reach welcome; **0/10** admin login |
| Welcome screen (customer/provider) shown, admin login **not** shown | ✅ |
| "Get Started" → **role selection** ("Choose your role", Customer, Service Provider) | ✅ reachable |
| welcome → "Log in" → customer/provider **sign-in** ("Welcome back", not admin login) | ✅ reachable |
| **Customer login → `/home`** (QA customer → "What service do you need today?") | ✅ reached; no admin UI, no "Not authorized" |
| Admin web reachable via its intended path | ✅ (Phase 3A 8/8 + web export) |

Reproduction/regression flow: `qa/native/flows/entry-reachability.yaml` (cold launch →
welcome → role-select → sign-in). The 10-launch probe: `qa/native/flows/_cold-launch.yaml`.
Credentialed login flows are not committed (creds are read from `qa/.env` and never stored
in flow files).

## 8. Regressions Checked

- **Phase 3D navigator invariant:** guard file unchanged; its tests pass. Not regressed.
- **Phase 3E protected activation:** `useAdminReady` gate + analytics screen unchanged; tests
  pass. Not regressed.
- **Connected certification / Phase 3A:** 116/116 and 8/8. Not regressed.
- **Admin web behaviour:** admin login still at `/login`; dashboard reachable via the admin
  nav + post-login redirect; web `/` routes to admin. Behaves as before (internal dashboard
  path is now the explicit `/(admin-web)/dashboard`).

## 9. Remaining Limitations

- Deeper customer/provider journeys (booking creation, provider progression, review) are
  re-certified in the **Phase 3F re-run** on this fixed build; Phase 3G certifies the
  **entry** determinism only.
- The customer/provider surfaces have other admin-web/customer path collisions for
  in-navigator tab routes (`/bookings`, `/payments`, `/providers`, `/notifications`);
  these are reached within the mounted customer tab navigator and did not affect entry —
  to be validated in the Phase 3F re-run.
- iOS not built.

## 10. Final Status

- **Native entry determinism:** ✅ fixed — 10/10 cold launches reach the customer/provider
  welcome; never the admin login.
- **Entry reachability:** ✅ welcome, role-select, customer/provider sign-in, and customer
  `/home` all reachable natively; admin web reachable via its path.
- **Regressions:** none — Phase 3D/3E guard untouched (tests pass), cert 116/116, Phase 3A
  8/8, qa:release green.
- Full Native Journey Certification and Full Platform Certification are **NOT** claimed by
  this phase (it corrects entry routing; full customer/provider journey certification is the
  Phase 3F re-run).
