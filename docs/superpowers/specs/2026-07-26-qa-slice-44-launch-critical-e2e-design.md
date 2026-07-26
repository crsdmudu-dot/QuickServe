# QA Slice 44 — Full Launch-Critical End-to-End Testing Program — Spec

**Status:** Discovery & specification only. No tests, no production changes, no fake flows.
**Branch:** `qa/slice-44-launch-e2e`
**Baseline:** `main` @ `e02a085` (Slices 40–43 merged). This slice designs the **production launch gate**.

> **Truth-telling mandate.** This spec reports what the code actually does. Where a requested workflow
> does not exist, it is listed as a **production blocker**, not mocked away. Two significant gaps were
> found (provider accept/reject; duplicate-booking protection) — see §6.

---

## 0. Headline discovery findings (read first)

1. **The Supabase backend is now REACHABLE from this environment** (auth `/health` → 200, REST → 200,
   `/auth/v1/signup` → 422). This is a change from Slices 40–43 (previously HTTP 000). **Connected
   Mode A is now technically feasible** — the single biggest unblock for launch testing.
2. **Admin is a web app** (`(admin-web)/*`) — natively Playwright-testable (already covered by Slices 40–42).
3. **Customer and Provider are the Expo React-Native mobile apps** (`(customer)/*`, `booking/*`,
   `provider/*`). They also compile to **react-native-web** (`expo export --platform web` passes), so their
   non-native logic is **Playwright-web-testable** — but native modules (camera, GPS, push, maps) are not.
4. **The booking lifecycle is DB-enforced** via RLS with forward-only provider transitions (real security,
   real state machine — see §1.3).
5. **Two launch-critical product gaps exist** (no provider accept/reject; no duplicate-booking protection).
6. **iOS cannot be automated in this environment** (Windows host, no macOS → no iOS Simulator).
7. **Local mobile tooling is not ready:** Android SDK dir exists but `adb`/`emulator`/`java` are not on
   PATH and **Maestro is not installed**; `eas-cli` 18.7 is available. Android-emulator automation is
   feasible **after setup**; iOS is not.

---

## 1. Full workflow map

Actors: **C** = Customer (RN app), **A** = Admin (web), **P** = Provider (RN app). Implementation status
from source audit. "Web-testable" = drivable via Playwright on the react-native-web build. "Native" =
requires emulator/device.

### 1.1 Customer workflow

| Step | Screen / route | Backend | DB effect | Status | Offline-testable | Connected req. | External dep. |
|---|---|---|---|---|---|---|---|
| Register | `(onboarding)/register` | `auth.signUp` (role in metadata) | `auth.users` + `profiles` row (trigger) | ✅ | form only | yes (real account) | email confirm setting |
| Login | `(onboarding)/login` | `auth.signInWithPassword` | session | ✅ | form only | yes | — |
| Session restore | `_layout` + `auth-context` | `auth.getSession` → `fetchProfile` | — | ✅ | web-testable (seeded) | partial | — |
| Role routing | `_layout` `roleHref(role)` | profiles.role | — | ✅ | web-testable | — | — |
| Browse services | `(customer)/index` | `services-catalog` / `ServicesProvider` | read `services` | ✅ | web-testable | optional | — |
| Search | `(customer)/search` | `lib/search` | read `services` | ✅ | web-testable | optional | — |
| Filter | `(customer)/search`, `providers` | client + queries | read | ✅ | web-testable | optional | — |
| Service details | service card → booking entry | catalog | read | ✅ | web-testable | optional | — |
| Booking: address | `booking/address` | places autocomplete (edge fn) | draft (client) | ✅ | form (autocomplete=native/edge) | partial | Google Places (edge) |
| Booking: schedule | `booking/schedule` | `lib/scheduling` | draft | ✅ | web-testable | — | — |
| Booking: notes | `booking/notes` | — | draft | ✅ | web-testable | — | — |
| Booking: review→submit | `booking/review` → `createBooking` | `bookings` INSERT (RLS: customer_id=auth.uid) | **new `bookings` row, status=`pending`** | ✅ | **connected only for persistence** | **yes** | — |
| Confirmation | `booking/success` | — | — | ✅ | web-testable | — | — |
| Booking history | `(customer)/bookings` | `getCustomerBookings` (RLS own) | read own | ✅ | connected for real data | yes | — |
| Booking detail | `booking/[id]` | `getBookingById` (RLS) | read | ✅ | connected | yes | — |
| Cancellation | booking detail | `updateBookingStatus('cancelled')` | status→cancelled | ✅ (customer path TBD-verify) | connected | yes | — |
| Track | `booking/track/[id]` | `lib/tracking`, tracking-map edge fn | read provider_locations | ✅ | **native (map/GPS)** | yes | Maps/GPS |
| Chat | `booking/chat/[id]` | `lib/messages`, realtime | booking_messages | ✅ | web-testable (text) | yes | Realtime |
| Rating/Review | `booking/review` (post-complete) | `lib/reviews` | reviews row, profiles.review_count | ✅ | connected | yes | — |
| Receipt/Invoice | `booking/receipt` | `lib/receipts`, `lib/payments` | read payments | ✅ | connected | yes | — |
| Payments (M-Pesa) | receipt/pay | `mpesa-stk-push` edge fn → Daraja; callback | payments/payment_attempts | ✅ | **not automatable E2E** | yes | **M-Pesa Daraja** |
| Wallet | `wallet` | `lib/wallet` RPCs | wallet_transactions | ✅ | connected | yes | — |
| Notifications | `(customer)/notifications` | `lib/notifications` + triggers→send-push | notifications rows | ✅ (rows) | rows web-testable; delivery native | yes | Expo Push |

### 1.2 Admin workflow (web — Playwright-native)

| Step | Route | Backend | DB effect | Status | Testable |
|---|---|---|---|---|---|
| Login | `(admin-web)/login` | `auth` + `is_admin()` guard | session | ✅ | Slice 40 (mock + connected) |
| Booking queue | `(admin-web)/bookings` | `getAllBookings` (RLS admin) | read all | ✅ | connected + mock |
| Booking detail | `(admin-web)/bookings/[id]` | `getBookingById` | read | ✅ | connected + mock |
| Assign provider | detail → `assignProvider` | `bookings` UPDATE (RLS admin) | assigned_provider_id + status=`provider_assigned` | ✅ | connected |
| Reassign | detail → `assignProvider` again | UPDATE | overwrites assignment | ✅ (last-write-wins, no guard) | connected |
| Status controls | detail `ALL_STATUSES` → `updateBookingStatus` | UPDATE | any status | ✅ | connected |
| Reject / cancel | status→`cancelled` (no explicit "reject") | UPDATE | status=cancelled | ⚠️ no dedicated reject | connected |
| Quote/pricing | detail quote | `lib/quotes` | quoted_amount, provider_share | ✅ | connected |
| Notes / audit | admin_notes, `lib/operations` audit | UPDATE / operations tables | notes, audit rows | ✅ | connected |
| Payments/invoice ctrl | `(admin-web)/payments` | `override_payment_status` RPC | payments | ✅ | connected |
| Dispatch/operations | `(admin-web)/operations/*` | `lib/operations` | operations portal | ✅ | connected |

### 1.3 Provider workflow (RN app) — the DB-enforced state machine

Canonical statuses (`constants/booking-status.ts`) + RLS (`0003`, `0004`):
`pending → provider_assigned → on_the_way → in_progress → completed` (+ `cancelled`; `accepted` exists but
is not provider-reachable). Provider RLS `bookings_update_provider` allows **forward-only** `on_the_way /
in_progress / completed`, pins assignment/name/phone, and only for `assigned_provider_id = auth.uid()`.

| Step | Route | Backend | DB effect | Status | Testable |
|---|---|---|---|---|---|
| Login | `(onboarding)/login` → `provider/` | auth + role=provider | session | ✅ | connected |
| Dashboard / assigned jobs | `provider/(tabs)/index` | `getProviderJobs` (RLS assigned) | read assigned | ✅ | connected |
| **Accept job** | — | — | — | ❌ **DOES NOT EXIST** | n/a — see §6 B1 |
| **Reject job** | — | — | — | ❌ **DOES NOT EXIST** | n/a — see §6 B1 |
| On the way | `provider/job/[id]` → `updateBookingStatus('on_the_way')` | UPDATE (RLS forward-only) | status=on_the_way | ✅ | connected |
| In progress (start) | job → `updateBookingStatus('in_progress')` | UPDATE | status=in_progress | ✅ | connected |
| Completed | job → `updateBookingStatus('completed')` | UPDATE | status=completed | ✅ | connected |
| Completion evidence (photos) | job → `lib/photos` upload | Storage + booking_photos | photo rows | ✅ | **native (camera/gallery)** |
| Job history | `provider/(tabs)` | `getProviderJobs` | read | ✅ | connected |
| Notifications | `provider/(tabs)/notifications` | `lib/notifications` | rows | ✅ | rows testable; delivery native |
| Quality/achievements | `provider/quality` | `lib/provider-quality` | read | ✅ | connected |

### 1.4 Cross-role golden path (the launch spine)

`C registers/logs in → C books (row pending) → A sees booking in queue → A assigns Provider (status
provider_assigned, assigned_provider_id) → P sees job in assigned list → P advances on_the_way → in_progress
→ completed → C sees status updates + can rate → data consistent across all three roles + RLS enforced.`
Every arrow is a real DB transition verifiable via the connected backend.

### 1.5 Backend integration inventory

- **Auth:** Supabase email/password; role in `profiles` (trigger from signup metadata); `approval_status`
  exists (provider approval semantics to confirm).
- **DB:** 32 migrations; `bookings` is the spine; RLS on bookings/profiles/etc. `is_admin()` SECURITY DEFINER.
- **RPCs:** analytics_* (Slices 41/42), `get_booking_professional`, `override_payment_status`, wallet/promo/quality RPCs.
- **Storage:** `booking_photos` (tightened RLS, 0016) — evidence upload.
- **Realtime:** chat (`booking_messages`), tracking (`provider_locations`).
- **Edge Functions:** `mpesa-stk-push`, `mpesa-callback`, `send-push`, `register-device`,
  `places-autocomplete`, `place-details`, `tracking-map`.
- **External deps:** M-Pesa Daraja (payments), Expo Push (notifications), Google Places/Maps (address/track).
- **Security:** RLS role guards + `is_admin()`; tenant isolation (customer own / provider assigned / admin all).

---

## 2. P0 / P1 / P2 classification

**P0 — launch blocker (must pass to ship):**
- Customer auth (register, login, session restore) · Customer booking creation + **persistence** ·
  Admin visibility of new bookings · Admin provider assignment · Provider visibility of assigned job ·
  Provider status progression (on_the_way→in_progress→completed) · Completion visible to customer ·
  **Role security / RLS** (customer can't see others' bookings; provider can't touch unassigned; non-admin
  can't reach admin) · **Data consistency** across roles · Cross-role golden path (§1.4).

**P1 — required soon after launch:**
- Search/filter quality · Cancellation · Ratings/reviews persistence · Notifications rows ·
  Invoice/receipt data · Wallet · Chat · Quote/pricing controls · Admin audit logs · Reassignment ·
  Duplicate-submit protection (**currently a gap — see §6**; classified P1-gate because it is a
  data-integrity risk, escalate to P0 if launch volume is high).

**P2 — can wait:**
- Provider quality/achievements · Favorites · Promotions/coupons · Executive/Detailed analytics (already
  automated) · Advanced scheduling recurrence · Broadcast · Provider completeness gamification.

**Verdict on the requested P0 list:** Customer auth ✅P0, Customer booking ✅P0, Booking persistence ✅P0,
Admin visibility ✅P0, Provider assignment ✅P0, Provider visibility ✅P0, Status progression ✅P0,
Completion ✅P0, Customer visibility ✅P0, Role security ✅P0, **Duplicate protection → P0-GAP (feature
absent, §6 B2)**, Data consistency ✅P0.

---

## 3. Automated test inventory (smallest complete launch suite)

Classification: **[web]** Playwright react-native-web (connected), **[web-mock]** offline deterministic,
**[native]** Maestro/Android emulator, **[manual]** cannot be automated. All connected tests run against
isolated QA accounts (§7) with cleanup.

### 3.1 Customer (Playwright-web, connected unless noted)

| # | Test | Pri | Actor | Route(s) | Backend dep | Cleanup | Class |
|---|---|---|---|---|---|---|---|
| C1 | register a new customer (unique email) reaches app | P0 | C | register | signUp, profiles | delete user | web (connected) |
| C2 | login with valid creds routes to customer home | P0 | C | login | signIn | — | web (connected) |
| C3 | invalid login is rejected, stays on login | P0 | C | login | signIn 4xx | — | web (connected) |
| C4 | session restores on reload | P0 | C | _layout | getSession | — | web |
| C5 | browse service catalog renders services | P1 | C | index | services | — | web-mock + web |
| C6 | search returns matching services | P1 | C | search | search | — | web-mock |
| C7 | filter narrows results | P2 | C | search/providers | queries | — | web-mock |
| C8 | open service details / start booking | P1 | C | index→booking | catalog | — | web-mock |
| C9 | complete booking flow persists a `pending` row | P0 | C | address→schedule→notes→review | bookings INSERT | delete booking | web (connected) |
| C10 | booking validation blocks empty required fields | P1 | C | review | client validation | — | web-mock |
| C11 | duplicate submit does **not** create two bookings | P0-GAP | C | review | bookings | delete | web (connected) — **expected to FAIL; see §6 B2** |
| C12 | booking history shows the created booking | P0 | C | bookings | getCustomerBookings | delete | web (connected) |
| C13 | customer cannot see another customer's booking | P0 | C | bookings/[id] | RLS | — | web (connected) |

### 3.2 Admin (Playwright-web; extends Slices 40–42)

| # | Test | Pri | Route | Backend | Cleanup | Class |
|---|---|---|---|---|---|---|
| A1 | admin login reaches dashboard | P0 | login | auth/is_admin | — | web (connected + mock) |
| A2 | new booking appears in admin queue | P0 | bookings | getAllBookings | delete booking | web (connected) |
| A3 | open booking detail shows customer data | P0 | bookings/[id] | getBookingById | — | web (connected) |
| A4 | assign provider sets provider_assigned + id | P0 | bookings/[id] | assignProvider | reset | web (connected) |
| A5 | reassign provider updates assignment | P1 | bookings/[id] | assignProvider | reset | web (connected) |
| A6 | admin status control advances/cancels | P1 | bookings/[id] | updateBookingStatus | reset | web (connected) |
| A7 | non-admin cannot reach admin routes | P0 | (admin-web)/* | guard | — | web-mock + connected |
| A8 | admin notes / audit persists | P1 | bookings/[id] | updateAdminNotes/operations | reset | web (connected) |
| A9 | notification row created on assignment | P1 | notifications | triggers | delete | web (connected) |

### 3.3 Provider (Playwright-web for logic; native for evidence)

| # | Test | Pri | Route | Backend | Cleanup | Class |
|---|---|---|---|---|---|---|
| P1 | provider login reaches provider app | P0 | login→provider | auth role=provider | — | web (connected) |
| P2 | assigned job appears in provider list | P0 | provider/(tabs)/index | getProviderJobs (RLS) | reset | web (connected) |
| P3 | provider advances on_the_way→in_progress→completed | P0 | provider/job/[id] | updateBookingStatus (RLS forward-only) | reset | web (connected) |
| P4 | provider cannot skip/reverse status (RLS) | P0 | job/[id] | RLS with-check | — | web (connected) |
| P5 | provider cannot act on an unassigned job (RLS) | P0 | job/[id] | RLS | — | web (connected) |
| P6 | completion evidence photo upload | P1 | job/[id] | Storage/booking_photos | delete | **native (camera)** |
| P7 | provider job history shows completed job | P1 | (tabs) | getProviderJobs | — | web (connected) |

### 3.4 Cross-role golden path (connected — the launch spine)

| # | Test | Pri | Actors | Backend | Cleanup | Class |
|---|---|---|---|---|---|---|
| X1 | C books → A sees it | P0 | C,A | bookings INSERT→admin read | delete | web (connected) |
| X2 | A assigns → P sees it | P0 | A,P | assignProvider→provider read | reset | web (connected) |
| X3 | P completes → C & A see completed | P0 | P,C,A | status progression→reads | reset | web (connected) |
| X4 | full golden path end to end (single test) | P0 | C,A,P | full spine (§1.4) | full cleanup | web (connected) |
| X5 | data consistency: one booking id, consistent across role reads | P0 | C,A,P | reads | delete | web (connected) |

### 3.5 Security & integrity

| # | Test | Pri | Focus | Class |
|---|---|---|---|---|
| S1 | unauthenticated cannot read bookings | P0 | RLS anon | web (connected) |
| S2 | customer cannot read admin data / other tenants | P0 | RLS tenant isolation | web (connected) |
| S3 | provider cannot update a non-assigned booking | P0 | RLS | web (connected) |
| S4 | invalid status transition rejected (provider) | P0 | RLS forward-only | web (connected) |
| S5 | duplicate provider assignment (concurrency) | P1-GAP | last-write-wins, no guard | web (connected) — documents behavior |
| S6 | duplicate booking submit (idempotency) | P0-GAP | **no protection** | web (connected) — **documents the gap** |
| S7 | backend-error degradation (network abort) does not corrupt UI | P1 | resilience | web-mock |

### 3.6 Native / external (Maestro-Android + manual)

| # | Test | Pri | Class |
|---|---|---|---|
| N1 | customer real-app auth + book on Android emulator | P0 | native (Maestro) |
| N2 | provider real-app status progression on Android emulator | P0 | native (Maestro) |
| N3 | completion evidence via camera/gallery | P1 | native + **manual perms** |
| N4 | live tracking map + GPS | P1 | native + **manual GPS** |
| N5 | push notification receipt | P1 | **manual** |
| N6 | M-Pesa STK push + settlement | P0(payments) | **manual (Daraja sandbox)** |
| N7 | iOS rendering + flow parity | P1 | **manual (no macOS here)** |

**Suite size:** ~**40 automated** (13 C + 9 A + 7 P + 5 X + 7 S − overlap) + ~**2 native (Maestro)** as the
mobile-app smoke + **7 manual** items. Web-automatable core ≈ **35–38 tests**.

---

## 4. Connected strategy (Mode A — real backend)

- **Target:** the reachable Supabase project (confirmed 200s). **Open Decision A:** confirm whether this is
  a *production* project (then a **dedicated QA project/branch is mandatory** — never write tests to prod) or
  a dev project safe for isolated, cleaned test data.
- **Driver:** Playwright against the react-native-web build (customer/provider) + the existing admin-web
  suites — one browser tool, three roles, real persistence, real RLS.
- **Proof standard:** connected tests assert **actual DB state transitions** (row created, status advanced,
  RLS denial) — never mocked persistence. Cross-role tests use **separate browser contexts** per role with
  real sessions.
- **Isolation:** every test creates its own booking with a QA-tagged marker; asserts; then deletes/reverts.
  Parallel-safe via unique per-worker data (§7).
- **Gating:** connected tests are tagged `@connected` and run only when `QA_*` creds + `QA_CONNECTED=1` are
  set (reuse Slice 43 `connected-mode.ts`, extended to customer/provider creds). They **skip cleanly**
  offline — but the launch gate REQUIRES them to have run green (§9).

## 5. Offline strategy (Mode B — deterministic local)

- Reuse Slice 43 infra: `mockAdminSession` (admin), RPC interceptor, network guards, shape validation.
- Offline covers: pure client validation, catalog/search/filter rendering, routing/guards, form flows up to
  (but not including) persistence, and graceful-degradation/resilience.
- **Hard rule:** offline mode **never** asserts persistence, cross-role visibility, or RLS as "proven." Those
  are connected-only claims. A mocked insert is never presented as backend correctness.

---

## 6. Production blockers (honest)

**B1 — Provider accept/reject does not exist (missing functionality).** `PROVIDER_NEXT_STATUSES` and the
provider job screen offer only forward-advance from `provider_assigned → on_the_way`. A provider cannot
**decline** an assignment or explicitly **accept** it. Real dispatch needs provider consent/decline
(unavailability, wrong skill). *Impact:* the requested "Provider accept/reject" workflow cannot be tested
because it isn't built. *Recommendation:* product decision before launch — implement accept/reject, or
document that dispatch is admin-forced for v1. **Do not mock this to fake a pass.**

**B2 — No duplicate-booking protection (data-integrity risk).** `createBooking` is a plain `INSERT` with no
idempotency key, unique constraint, or client double-submit guard. A double-tap / retry creates duplicate
`pending` bookings. Test C11/S6 will demonstrate this. *Recommendation:* add a client submit-lock +
server-side idempotency (e.g., unique (customer_id, service_id, scheduled_for) within a window) before
launch. **Classified P0-GAP.**

**B3 — Concurrency / duplicate assignment (integrity).** Admin `assignProvider` is last-write-wins with no
optimistic-lock; two admins reassigning concurrently silently overwrite. Low likelihood, but no guard exists.

**B4 — Connected test-account provisioning is unresolved.** No `service_role` key locally (correct for
security); public signup may require email confirmation (project setting unknown), and providers may need
`approval_status = approved`. Without a provisioning path, connected auth tests for provider/approved states
can't self-serve. *Recommendation:* a **one-time** operator-run provisioning (service-role script or Supabase
dashboard) to create durable QA accounts (§7); this is a **prerequisite**, not a code blocker.

**B5 — Payments are external (M-Pesa Daraja).** STK push + callback require Daraja sandbox/live; real
settlement is not automatable E2E. Admin `override_payment_status` gives a **testable proxy** for the
paid-state transition, but real money movement is manual.

**B6 — Push notifications are external (Expo Push).** DB `notifications` rows are testable; actual device
delivery is manual.

**B7 — iOS is not automatable in this environment** (Windows host, no macOS/Xcode). iOS validation is manual
(physical iPhone) or requires a cloud Mac / EAS. Report as an environment limitation, not a product defect.

**B8 — Native-only flows** (camera evidence, GPS tracking, maps rendering) cannot be proven on web; they need
the Android emulator (Maestro) + a small manual perms checklist.

**B9 — Local mobile tooling not ready:** `adb`/`emulator`/`java` not on PATH, Maestro not installed. Android
automation needs a one-time environment setup (PATH + JDK + Maestro + an AVD). *Not a product blocker* — a QA
environment task.

---

## 7. Test-account strategy

Provision **once** (operator step B4), store as QA env vars (never committed), reuse across runs:

| Account | Purpose | Provisioning | Notes |
|---|---|---|---|
| `QA_CUSTOMER_*` | customer flows | signup or service-role, confirmed | primary booker |
| `QA_CUSTOMER2_*` | tenant-isolation negative tests | confirmed | proves C13/S2 |
| `QA_ADMIN_*` | admin flows (reuse existing `E2E_ADMIN_*`) | profiles.role=admin | already used by Slices 40–42 |
| `QA_PROVIDER1_*` | assigned-job happy path | role=provider, approved | golden path |
| `QA_PROVIDER2_*` | reassignment + RLS negative (unassigned) | role=provider, approved | proves P5/S3 |

Reusable fixtures: a small set of **QA-tagged** services (from the real catalog — do not invent), reusable
addresses, and per-test booking IDs captured at creation for teardown. **Parallel-safety:** each worker
derives unique markers (e.g., notes = `QA-{workerId}-{uuid}`); tests query/cleanup by their own marker only.
**Cleanup:** each connected test deletes the rows it created (or reverts status) in an `afterEach`; a
`qa:cleanup` script sweeps stale `QA-*` rows as a safety net. **Never** touch non-QA data.

## 8. Execution phases

- **Phase 1 — Discovery & blockers (this slice):** workflow map, P0 path, blockers B1–B9. ✅
- **Phase 2 — Connected infra & accounts:** decide QA-vs-prod backend (Dec A); provision QA accounts (B4);
  extend `connected-mode.ts` for customer/provider; add cleanup/`qa:cleanup`. Health-test the connection.
- **Phase 3 — Customer suite** (C1–C13) against connected backend.
- **Phase 4 — Admin suite** (A1–A9) — extends existing admin infra.
- **Phase 5 — Provider suite** (P1–P5, P7) web + define native P6.
- **Phase 6 — Cross-role & security** (X1–X5, S1–S7) — the launch spine + RLS.
- **Phase 7 — Native + launch gate:** Maestro Android smoke (N1–N2); assemble the launch gate (§9) and the
  minimal manual checklist (§13).

Each phase is independently mergeable; Phases 3–6 are pure `qa/` additions (no production change). Phase 2
may require the operator-run provisioning step (external to the repo).

## 9. Launch gate (production readiness)

Ship only when ALL hold:

1. **All P0 automated tests pass** (C1–4/9/12/13, A1–4/7, P1–5, X1–5, S1–4) against the **connected** backend.
2. **No unexplained skips** — every skip is either an environment-gated native/manual item (§13) or has a
   written reason; connected P0 tests must have actually executed (not skipped).
3. **No open P0 blockers** — B1 (accept/reject) and B2 (duplicate protection) are **resolved or explicitly
   accepted by the product owner in writing** (they are currently open).
4. **Role security verified** — S1–S4 green against real RLS.
5. **Database verified** — connected tests asserted real row/status transitions; `qa:cleanup` leaves zero
   stray `QA-*` rows.
6. **Cleanup verified** — post-run DB scan shows no QA residue.
7. **Exports successful** — `expo export` web + android green.
8. **Full app gate green** — Playwright (all suites) + Jest + tsc.
9. **Connected backend run successful** — Mode A executed, not just mock.
10. **Minimal manual checklist complete** (§13).
11. **Rollback documented** — release/rollback runbook exists.
12. **Monitoring configured** — Sentry (already integrated) + payment/push dashboards confirmed.

## 10. Estimated implementation effort

- **Phase 2 (infra + accounts + cleanup):** ~2–3 focused sessions (plus the one-time operator provisioning).
- **Phases 3–6 (Playwright-web connected suites):** ~4–6 sessions (~35–38 tests + POMs for customer/provider
  screens, which don't exist yet — the largest net-new work).
- **Phase 7 (Maestro Android smoke + gate):** ~2–3 sessions **only if** the Android env is set up (B9);
  otherwise deferred with iOS to manual.
- **Total:** ~8–12 sessions for the web-automatable launch suite; native/iOS additional and environment-gated.

## 11. Estimated test count

- **Automated (Playwright-web, connected+mock):** ~**35–38**.
- **Native (Maestro Android smoke):** ~**2** (customer + provider real-app spine).
- **Manual checklist:** ~**7** (§13).
- Health/meta (Slice 43) unchanged.

## 12. Estimated runtime

- Offline/mock subset: seconds–~1 min.
- Connected Playwright-web suite (~35 tests, real network round-trips, cross-role contexts): **~6–12 min**
  serial; **~3–6 min** parallel (Chromium, `--workers`≈2–4, bounded by backend rate).
- Maestro Android smoke: **~5–10 min** on a warm emulator (setup excluded).
- Full launch gate (all suites + Jest + tsc + exports): **~20–30 min**.

## 13. Minimal manual checklist (only what automation genuinely cannot prove)

1. **Real M-Pesa settlement** — pay a live/sandbox STK push and confirm callback → paid.
2. **Real push notification receipt** on a physical device.
3. **Real SMS/email** delivery (if used for OTP/receipts).
4. **Camera + gallery permission dialogs** and real photo capture for completion evidence.
5. **Real GPS / live tracking** on a moving device.
6. **iOS device** rendering + one golden-path pass (no macOS in this environment).
7. **Physical-device rendering / real network conditions** (one Android + one iOS smoke).

Everything else is automated (auth, booking, persistence, dispatch, provider progression, cross-role
visibility, RLS/security, history, ratings-data, invoice-data, notification-rows).

---

## 14. Recommended Launch Testing Stack (mandatory)

**Principle:** maximize confidence while minimizing manual effort. The backend is reachable and the whole app
compiles to web, so **Playwright-connected is the highest-ROI engine for the launch spine across all three
roles** — no emulator, real persistence, real RLS. Native tooling is reserved for the small native-only slice.

| Tool | Scope | Strengths | Weaknesses | Maint. | Speed | Reliability | Why chosen |
|---|---|---|---|---|---|---|---|
| **Playwright (RN-web), connected** | Admin + Customer + Provider **business logic** across roles | reuse Slice 40–43 infra; real backend; cross-role contexts; fast; CI-ready; proven | can't do native modules (camera/GPS/push/maps) | Low | Fast | High (Chromium) | **primary** — covers ~75% of launch-critical logic today |
| **Playwright (mock)** | validation, routing, guards, resilience | deterministic, instant, offline | not proof of persistence | Low | Fastest | High | fast inner loop; never persistence proof |
| **Maestro + Android emulator** | real customer & provider app **native** smoke (camera evidence, native rendering) | tests the actual installed app; simple YAML | needs SDK/JDK/Maestro/AVD setup (B9); slower; flakier | Med | Slow | Med | **secondary** — native-only coverage the web build can't prove |
| **Android Studio / AVD** | host the emulator | official, scriptable via `emulator`/`adb` | heavy; PATH/JDK setup needed | Med | — | Med | required substrate for Maestro |
| **iOS Simulator / Xcode** | iOS parity | needed for iOS | **impossible on Windows** | — | — | — | **not available here** → manual/cloud Mac |
| **Expo dev/preview build (EAS 18.7)** | installable app for emulator/device | `eas` available; real binary | build time; store/credentials | Med | — | Med | to produce the APK Maestro drives |
| **Physical devices** | final smoke (push/GPS/camera/iOS) | ground truth | manual, slow | — | — | High | **final verification only** |
| **VS Code** | author/run Playwright + Maestro; debug | integrated; tasks/launch configs | — | Low | — | High | day-to-day driver's seat |
| **CI (GitHub Actions)** | run Playwright suites on PRs | none configured today | new setup; secrets for connected | Med | — | High | **recommended** for mock + gated-connected; Slice 43 gates map onto it |

**Recommended stack & execution order:**
1. **Playwright-web mock** (fast gate on every change) →
2. **Playwright-web connected** (the launch spine: C/A/P + cross-role + RLS) — the bulk of confidence →
3. **Maestro on Android emulator** (native smoke: real app auth+book+progress+evidence) — *after* the B9
   setup →
4. **Manual checklist** (§13) on physical Android + iOS →
5. **iOS** via physical iPhone / cloud Mac (this environment cannot).

- **Android Emulator usage:** customer + provider native smoke (N1–N2), evidence capture (N3) with a manual
  perms tap. Launched via `emulator`/`adb` from VS Code tasks once SDK/JDK on PATH.
- **iOS Simulator usage:** **none here** — Windows host; document as manual/cloud.
- **VS Code / Android Studio workflow:** VS Code for Playwright + Maestro authoring/running; Android Studio
  to create/boot the AVD; `eas build --profile preview` for the installable APK.
- **Xcode:** not applicable in this environment.
- **CI:** add a GitHub Actions workflow running the mock suite on every PR and the connected suite on a
  schedule / release branch (secrets-gated), mapping onto Slice 43 Gates A–C.
- **Estimated automation coverage:** **~75–85%** of launch-critical scenarios automatable
  (**~70–75% via Playwright-connected** + **~8–10% via Maestro-Android**).
- **Estimated manual coverage:** **~15–25%** — payments settlement, real push/SMS/email, camera/GPS
  permissions, physical-device + **iOS** rendering.
- **Expected runtime:** full launch gate **~20–30 min**; inner-loop mock **<1 min**.
- **Maintenance cost:** Low for Playwright (shared Slice-43 primitives); Medium for Maestro/emulator.

**Can Claude run the full launch testing automatically here?** **Partially and importantly, yes:** the
Playwright-connected launch spine (the ~75% that matters most) is runnable now that the backend is reachable —
pending the QA-vs-prod backend decision (A) and one-time account provisioning (B4). **Android-emulator +
Maestro** require a one-time environment setup (B9) before Claude can drive them. **iOS cannot be automated
in this environment** and stays manual.

---

## 15. Open decisions requiring approval

- **A. Connected backend target.** Is the reachable Supabase project **production** or a **dev** project?
  If production (or unknown), provision a **dedicated QA Supabase project/branch** before any write tests.
  *(Blocks Phase 2.)*
- **B. Test-account provisioning method.** Operator-run **service-role script** (create confirmed QA
  customer/admin/2 providers, set approvals) vs. **manual dashboard** setup vs. **email-confirmation OFF** +
  public signup. Recommend the service-role script (one-time, durable). *(Blocks connected auth tests.)*
- **C. Two open product blockers (B1, B2).** Before launch: **implement** provider accept/reject and
  duplicate-booking protection, or **formally accept** them as v1 limitations in writing. Tests C11/S5/S6
  will document current behavior either way.
- **D. Android/Maestro environment setup (B9).** Approve the one-time setup (SDK PATH + JDK + Maestro + AVD +
  EAS preview build) to enable native automation, or defer native+iOS entirely to the manual checklist for v1.
- **E. Scope of Slice 44 implementation.** Recommend implementing **Phases 2–6 (Playwright-connected launch
  spine, ~35 tests)** first as the highest-confidence, immediately-runnable deliverable; treat Phase 7
  (Maestro/native) as a follow-up gated on Decision D.
- **F. CI.** Add a GitHub Actions workflow now (mock on PR, connected on release) or defer? Recommend a
  minimal mock-on-PR workflow first.

---

## 16. Non-goals (Slice 44 planning)

No test implementation, no production code changes, no fake/mocked product flows presented as proof, no new
features, no hiding of blockers, and no start on Slice 45.
