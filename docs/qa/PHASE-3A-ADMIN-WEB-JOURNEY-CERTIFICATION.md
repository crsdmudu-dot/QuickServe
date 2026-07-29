# Phase 3A — Admin Web Journey Connected Certification

> Test-only and documentation-only. No runtime code, routing, schema, migrations, RLS,
> storage, deployment config, or dependencies were changed. Results observed 2026-07-29
> against the dedicated, non-production QA project. Env vars referenced by name only; no
> secrets. **Full Platform Certification is not claimed.**

## 1. Executive Summary

Phase 3A began as "critical **customer** web journey" but reconnaissance proved the customer
workflow has **no web surface** — the QuickServe **web product surface is the Admin Panel**;
the customer and provider apps are **mobile**. With approval, the scope was corrected (before
any test was written) to **Admin Web Journey Connected Certification**.

**8 connected admin-web tests** now drive the **real admin UI** (login, Bookings, booking
detail, dispatch, status) against the QA backend and **pass deterministically** (two
consecutive 8/8 runs, ~68 s, **0 residual**). They cover admin authentication, non-admin
rejection, booking discovery, provider assignment (persisted + verified against the backend),
status change, and protected-route authorization. They run in a **separate connected-web lane**
(a dedicated Playwright config that serves the app pointed at QA) and are **intentionally kept
out of `qa:release`**, which remains green and unchanged.

## 2. Starting Baseline

| Item | Value |
|---|---|
| Branch | `qa/phase-3a-web-critical-journeys` |
| Pre-work commit | `7cdcd08b45862b8f5dc5b121d153450377e09dfc` |
| Node / npm | v24.14.1 / 11.11.0 |
| Playwright / Chromium | 1.61.1 / chromium-1228 |
| Web server command | `npm run web` (expo start --web) → `http://localhost:8081` |
| QA project (redacted) | `wjvj…ws.supabase.co` (distinct from the app project) |
| Env override names (values never shown) | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` set to `QA_SUPABASE_URL` / `QA_SUPABASE_ANON_KEY` |
| QA accounts | `QA_ADMIN_*`, `QA_CUSTOMER_*`, `QA_PROVIDER1_*`, `QA_SERVICE_ROLE_KEY` |

## 3. Architecture-Aligned Scope Correction

The original objective (customer web booking → review) is **not architecture-aligned**: on web,
`/` and `/login` render the Admin Panel; the customer/provider apps are mobile. Certifying a
"customer web journey" would **misrepresent the product**. The scope was therefore corrected —
**before implementation** — to the admin web surface. This is an **Architecture-aligned scope
correction**, **not a routing defect**, and no runtime routing was changed.

## 4. Web and Mobile Surface Boundaries

**Web (this phase):** Admin Panel — admin authentication, booking management, provider
assignment, operational views.

**Mobile (deferred to a later native phase):** customer authentication/onboarding, customer
booking creation, provider assigned-work workflow, customer review flow, customer payment flow,
native push/location. Their **backend is already certified** by the 116-test connected suite;
their **UI is uncertified** and requires native/mobile E2E (out of scope here).

Evidence (live, against the QA-pointed app): `/` and `/login` → Admin Panel login; `/welcome`,
`/role-select` render onboarding screens but `/(customer)`, `/search`, `/provider` redirect to
`/welcome`; a customer login lands on `/` → "Not authorized". Admin login → full dashboard.

## 5. Admin Web Architecture

- The web app is the Expo export served by react-native-web; the authenticated web experience
  is the `(admin-web)` route group, guarded by `useAdminGuard` (role = `admin`).
- Login (`(admin-web)/login`): email/password → `signIn` → on success `router.replace('/(admin-web)')`;
  the guard renders the dashboard for admins and "Not authorized" for non-admins.
- Booking detail (`(admin-web)/bookings/[id]`): Booking Summary, Quote, **Update Status**
  (Pending…Completed), and **Assign Provider** (Manual | In-app) controls.

## 6. Journey Map

| Journey | Screen(s) | Action | Verification |
|---|---|---|---|
| A — Admin authentication | `/login`, `/` | login form renders; admin authenticates; logout | panel nav visible; logout → login; unauth → login redirect |
| B — Non-admin rejection | `/login`, `/bookings` | customer authenticates | "Not authorized"; no admin nav/data; direct route stays denied |
| C — Booking discovery | `/bookings`, `/bookings/:id` | open Bookings; open seeded booking | Bookings area + detail fields (service/status/address/marker) |
| D — Dispatch & assignment | `/bookings/:id` | assign provider (In-app) | UI shows "Provider assigned"; backend `assigned_provider_id` + status persisted |
| E — Status handling | `/bookings/:id` | set status "Accepted" | backend `status = 'accepted'` |
| F — Authorization/isolation | `/bookings/:id` | no session | login redirect; booking data not exposed |
| G — Cleanup | — | delete seeded bookings | 0 residual |

## 7. Connected Web Coverage Added

8 tests in `qa/web-journeys/admin-journey.spec.ts` (helper `qa/web-journeys/support/admin-web.ts`),
run via the dedicated `qa/playwright.web.config.ts` (`npm --prefix qa run qa:test:web`). API/
service-role is used **only** to seed a booking and to verify persisted effects + clean up;
every journey action goes through the real admin UI. Serial, Chromium-only.

## 8. Admin Authentication

- The login page renders (`admin@example.com` / `Your password` fields, "Sign in").
- A valid admin authenticates and reaches the panel (Dashboard + Bookings nav visible).
- **Logout** returns to the admin login.
- **Unauthenticated** access to `/bookings` redirects to the login (no admin data shown).

## 9. Non-Admin Rejection

- A valid **non-admin** (customer) account authenticates but the guard shows **"Not authorized —
  does not have admin access"**; no admin navigation or protected data is exposed.
- Direct navigation to `/bookings` under the non-admin session stays denied.

## 10. Booking Discovery

- A uniquely-marked booking is seeded via the API (as the QA customer).
- The admin opens the **Bookings** area (renders), then the seeded booking's **detail** by its
  route; the UI shows **House Cleaning**, **Pending**, the address, and the unique marker.
- (Testability note: the bookings **list** renders RN cards without stable row anchors/hrefs and
  is date-filtered; deterministic discovery uses the booking's detail route. Documented in §18.)

## 11. Dispatch and Provider Assignment

- On the detail page the admin selects **In-app** mode and clicks the **QA Provider One** button
  (In-app assignment is a direct button click; there is no separate "Assign" button in that mode).
- **Persisted (verified against the QA backend via service-role read, polled — no sleeps):**
  `assigned_provider_id` equals the provider1 id, `status = 'provider_assigned'`, and
  `assigned_provider_name` contains "QA Provider One".
- The UI reflects the assignment ("Provider assigned").

## 12. Authorization and Data Isolation

- A protected booking-detail route is **inaccessible without an admin session** — the guard shows
  the admin login, and the booking summary/marker are **not** rendered.
- The non-admin session (§9) cannot reach admin data. (Backend tenant isolation is separately
  certified by the connected suite.)

## 13. Backend Persistence Verification

Assignment and status changes performed through the UI are confirmed against the QA backend by a
polled service-role read (`bookings.status`, `bookings.assigned_provider_id`) — proving the UI
action actually persisted, without the test performing the write itself.

## 14. Connected-Web Test Lane

**Why separate (documented):** the served Expo web app normally reads the app's own `.env` (the
app backend). This lane starts `npm run web` with `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` **overridden
to the QA project** (read from `qa/.env` at runtime by `playwright.web.config.ts`) — a
non-standard environment override. The main `playwright.config.ts` has `testDir: './playwright'`,
so it **never collects** `web-journeys/` specs; `qa:release`, the 116-test connected suite, and
the admin mock suite are **completely unaffected**. Integrating this lane into `qa:release` would
require changing the shared web-server env (cross-suite blast radius) — deliberately **not** done.

- **Server:** config-managed (`webServer` block self-starts the QA-pointed server; reused if one
  is already running).
- **Run:** `npm --prefix qa run qa:test:web` (self-starts) — or `BASE_URL=http://localhost:8081
  npm --prefix qa run qa:test:web` to reuse an external server.
- **Config:** `qa/playwright.web.config.ts` (chromium, serial `workers=1`, output under the
  gitignored `test-results/web`). No secrets are committed; QA creds are read from `qa/.env`.

## 15. Cleanup and Residual Data

Seeded bookings carry a `QA-CERT-M3-P3A-*` marker; each is deleted and a marker sweep runs in
`afterAll`, plus an explicit residual assertion. Their reviews/payments/etc. cascade on booking
delete. Verified after two full runs: **0 residual Phase-3A bookings, 0 residual QA-CERT
bookings**. Shared QA accounts were never modified.

## 16. Files Changed

| File | Type |
|---|---|
| `qa/web-journeys/admin-journey.spec.ts` | new — 8 connected admin-web tests |
| `qa/web-journeys/support/admin-web.ts` | new — admin-web UI + seed/verify/cleanup helpers |
| `qa/playwright.web.config.ts` | new — separate connected-web lane config |
| `qa/package.json` | +1 script `qa:test:web` (test-only registration) |
| `docs/qa/PHASE-3A-ADMIN-WEB-JOURNEY-CERTIFICATION.md` | new — this report |

No `src/`, routing, `supabase/`, migrations, storage, deployment, or dependency changes.

## 17. Validation Matrix

| Command | Status | Exit | Result |
|---|---|---|---|
| Phase 3A web lane (`qa:test:web`, ×2) | **Pass** | 0 | 8/8 both runs (~68 s); 0 residual; config-managed QA-pointed server |
| Existing admin mock suite (`playwright/admin`) | **Pass** | 0 | 41 passed + 2 backend-gated skipped (= 43; unaffected) |
| Connected certification (serial) | **Pass** | 0 | 116/116 (via qa:release) |
| Root Jest | **Pass** | 0 | 220/220, 2943/2943 |
| Website Vitest | **Pass** | 0 | 7 files, 102 tests |
| TypeScript (root) | **Pass** | 0 | 0 errors |
| TypeScript (qa, incl. web-journeys) | **Pass** | 0 | 0 errors |
| Lint | **Deterministic; unchanged** | 1 | 489 pre-existing (qa/ ignored) |
| Health | **Pass** | 0 | 19/19 |
| `qa:release` | **Pass** | 0 | Re-run: 474s — jest 2943 → tsc 0 → web+android exports → serial cert **116/116** → non-cert 130 passed / 56 skipped / 0 failed; 2 teardowns. (An initial run hit **2 transient webkit flakes** in the pre-existing non-cert lane — `smoke › Admin login page loads` and `executive-dashboard › Last-updated timestamp`; both passed **16/16** on a clean standalone re-run and green on the qa:release re-run. Pre-existing cross-browser flakiness (documented P2), **not** caused by Phase 3A — my chromium-only web lane is separate and not collected by the main config.) |

Connected-web lane details — server: config-managed (`EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY`
overridden to `QA_*`); command: `npm --prefix qa run qa:test:web`; browser: chromium; **8 passed,
0 failed, 0 skipped**; cleanup: 0 residual.

## 18. Defects or Limitations

**No product defect found.** Limitations / testability notes (no runtime change):

- **RN-Web controlled inputs:** Playwright `.fill()` did not reliably trigger the app's
  `onChangeText`; the helper uses `pressSequentially` (real key events). Test-helper detail only.
- **Bookings list anchoring:** list rows are RN cards without stable anchors/hrefs and are
  date-filtered; deterministic discovery uses the booking's detail route (a UI testability gap,
  not a defect). A future `testID` on list rows would enable list-click discovery.
- The lane requires the non-standard QA-pointed web server (documented in §14).

## 19. Deferred Mobile Journeys

Explicitly **not certified** here (mobile surfaces; backend already certified 116/116):
customer authentication/onboarding, customer booking creation, provider assigned-work workflow,
customer review UI, customer payment UI, native push/location. These require a later
**Native Mobile Smoke** phase (blocked on EAS initialization + devices).

## 20. Pilot-Readiness Impact

The **admin web application** gains connected UI certification for the critical operational
journey (auth, dispatch, status) against a real backend — strengthening the operational layer
for a controlled pilot. The customer/provider **mobile** UIs remain uncertified at the UI level
(backend certified). No native, push, payment-settlement, or performance claim is made.

## 21. Recommended Next Phase

**Native Mobile Smoke Certification** — but it is **blocked** (EAS not initialized:
`app.json extra.eas.projectId` empty, `associatedDomains` placeholder; needs credentials +
physical devices). Therefore the recommended actionable next phase is **EAS build initialization
+ a single-device native smoke** (P0 for any device pilot), after which the deferred customer/
provider mobile journeys can be certified. Alternatively, a small **web admin list-row testID +
list-click discovery** enhancement (test-only) can close the §18 list gap.

## 22. Final Status

The original customer-web objective was **not architecture-aligned** and the scope was corrected
**before implementation**; the web surface is **admin-only**. Eight connected admin-web journeys
pass deterministically against the QA backend (2×8/8, 0 residual) in a separate lane that leaves
`qa:release` (116/116) green. Customer/provider flows remain **mobile and uncertified at the UI
level**. No runtime or routing change was introduced, and **Full Platform Certification is not
claimed**.
