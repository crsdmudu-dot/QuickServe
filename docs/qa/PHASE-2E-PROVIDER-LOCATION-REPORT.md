# Phase 2E — Provider Location Authorization Connected Coverage Report

> Connected certification of the **existing** provider-location backend against the
> dedicated, non-production QA project. No new feature, no product-behavior change, no
> migration. Results observed 2026-07-29. Env vars referenced by name only; no secrets.

## 1. Executive Summary

**13 new connected tests** were added for provider-location authorization & integrity,
raising the connected certification suite **92 → 105**, all passing serially with
deterministic cleanup (**0 residual** locations/bookings). The tests drive the **real**
`provider_locations` RLS + RPCs of the QA project — write authorization (assigned provider,
active booking, server-set provider_id), referential + status gates, coordinate handling,
in-place update / last-write-wins, participant read scope, provider-or-admin clear, and
booking isolation. **One implemented-behavior gap was recorded** (no server-side coordinate
range validation) — documented, not silently accepted, and not "fixed" (no migration).

**This certifies connected database/RLS behavior only** — NOT live GPS acquisition,
foreground/background tracking, device permissions, map rendering, geofencing, the realtime
location UI, or native mobile behavior. **Full Platform Certification is not claimed.**

## 2. Starting Baseline

| Item | Value |
|---|---|
| Branch | `qa/phase-2e-provider-location` |
| Pre-work main | `1927f8aebd2f4efc5800601ef4a4e9ca8cf58673` |
| Node / npm | v24.14.1 / 11.11.0 |
| Playwright / supabase-js | 1.61.1 / 2.108.2 |
| Connected certification (before) | 92 |
| Location env vars | `GOOGLE_PLACES_API_KEY` (maps/places — not used by the DB layer) |

## 3. Existing Location Architecture

Verified from migration `0018`:

- **`provider_locations`** — `booking_id` **PRIMARY KEY** (one row per booking; FK bookings,
  **cascade**), `provider_id` (FK profiles, not null), `latitude`/`longitude`
  (`double precision`, **NOT NULL, no range CHECK**), `heading`/`speed` (nullable),
  `updated_at` (default `now()`).
- **RLS select** (`provider_locations_select`): booking participants — customer / assigned
  provider / admin. **No write policies** (all writes via RPC).
- **`upsert_provider_location`** (RPC) — booking must exist; caller must be the booking's
  `assigned_provider_id` (else "Not the assigned provider"); status must be
  `on_the_way`/`in_progress` (else "not active for tracking"); upserts on `booking_id` with
  **`provider_id` server-set to `auth.uid()`** and `updated_at = now()`.
- **`clear_provider_location`** (RPC) — assigned provider **or** admin; deletes the row.
- **Realtime:** `provider_locations` **is** added to the `supabase_realtime` publication
  (migration-level fact) — the DB supports realtime; websocket delivery is out of scope here.

### Internal coverage matrix (implemented → covered)

| Operation | Authorized actor | Booking precond. | Assignment precond. | Persisted | Constraint | New coverage |
|---|---|---|---|---|---|---|
| write location | assigned provider | on_the_way/in_progress | must be assigned | provider_locations row | one-per-booking (PK); provider_id server-set | ✅ + all negatives |
| read location | customer / provider / admin | — | — | — | RLS participant scope | ✅ + unrelated/anon denial |
| update location | assigned provider | active | assigned | same row | in-place, last-write-wins | ✅ |
| clear location | assigned provider / admin | — | assigned (or admin) | row removed | RPC-only | ✅ + customer/other denied |
| coordinate validation | — | — | — | lat/lng | NOT NULL only (**no range check**) | ✅ (+ documented gap) |

Cleanup: the row cascades on booking delete → teardown reuses `deleteBookingsByIds`.

## 4. Location Lifecycle Verified

`booking created → provider assigned → provider goes on_the_way (tracking active) → assigned
provider upserts location (one row per booking, updated in place) → customer/provider/admin
read it → provider or admin clears it (or it cascades when the booking is deleted)`. Writing
is blocked outside the active window and for anyone but the assigned provider. All exercised
connected.

## 5. Connected Coverage Added

13 tests in `qa/playwright/certification/provider-location.spec.ts` (helper
`qa/playwright/support/connected/qa-location.ts`): write success + persistence, unassigned/
customer/anon write denial, unknown-booking rejection, status gate, no-direct-write, coordinate
handling (valid + null + malformed), the out-of-range **FINDING**, in-place update + provider_id
non-reassignment, last-write-wins, read authorization, clear authorization (provider + admin;
customer/other denied; no direct delete), and booking isolation. Existing helpers reused; no
existing test modified.

## 6. Provider Assignment and Booking Integrity

- Only the booking's **assigned provider** may write; an **unassigned** provider, the
  **customer**, and an **anonymous** caller are all denied.
- `provider_id` is **server-set to `auth.uid()`** by the RPC (no client parameter) — a caller
  cannot impersonate another provider, and repeated writes never reassign it.
- A write to an **unknown booking** is rejected ("Booking not found"); the location is keyed by
  `booking_id` (PK) so it cannot be reassigned to a different booking.
- Writing requires the booking to be **active for tracking** (`on_the_way`/`in_progress`) — a
  `provider_assigned` (not-yet-active) booking is denied.

## 7. Authorization and RLS Coverage

- **Write:** RPC-enforced (assigned provider, active booking). There is **no write RLS policy**,
  so even the assigned provider cannot INSERT directly — verified.
- **Read:** customer, assigned provider, and admin can read; an unrelated provider and anonymous
  read **nothing** (participant-scoped RLS).
- **Clear:** assigned provider or admin only; customer and unrelated provider denied
  ("Permission denied"); a direct table DELETE removes nothing (no delete RLS policy).

## 8. Coordinate Integrity

- **Valid** latitude/longitude persist exactly (asserted to 4 decimals).
- **Null** latitude/longitude are rejected (NOT NULL); **non-numeric** values are rejected
  (type coercion error).
- **FINDING — no range validation:** the schema has **no CHECK** on latitude/longitude range,
  so out-of-range values (e.g. `lat=200`, `lng=999`) are **accepted and persisted**. This is
  recorded as an implemented-behavior data-integrity gap (see §15), **not** asserted as
  desirable and **not** modified in this phase.

## 9. Update, Ordering, and Stale-Data Behavior

- Repeated writes **update the single row in place** (one row per booking, PK); the latest value
  wins and `updated_at` advances.
- **Stale-update rejection is not implemented:** the RPC accepts no client timestamp and always
  overwrites (last-write-wins). Verified and documented (no ordering/history — a single current
  location per booking).

## 10. Booking and Tenant Isolation

- A location written for booking A is **not** visible when reading booking B; a write to B never
  mutates A's row (keyed by `booking_id` PK).
- An unrelated provider and anonymous caller can neither read nor write; the customer of the
  booking can read but not write. Cross-booking reassignment is impossible.

## 11. Read and Delete Behavior

- **Read:** participants (customer / assigned provider / admin) only.
- **Delete (clear):** assigned provider or admin via `clear_provider_location`; customer/other
  denied; **no user-facing direct DELETE** (no delete RLS policy). The row also **cascades** when
  the booking is deleted (verified via cleanup — 0 residual).

## 12. Cleanup and Residual Data

Every created booking is tracked and deleted in `afterAll`; `provider_locations` cascades on
booking delete. Verified after the full certification run: **0 residual QA-CERT bookings, 0
`provider_locations` project-wide**. Shared QA accounts are untouched.

## 13. Files Changed

| File | Type |
|---|---|
| `qa/playwright/certification/provider-location.spec.ts` | new — 13 connected tests |
| `qa/playwright/support/connected/qa-location.ts` | new — location RPC/read helpers |
| `docs/qa/PHASE-2E-PROVIDER-LOCATION-REPORT.md` | new — this report |

No `src/`, `supabase/`, migrations, existing tests, QA scripts, configuration, or deployment
files changed. No new dependency.

## 14. Validation Matrix

| Command | Status | Exit | Result |
|---|---|---|---|
| Provider-location spec alone (serial) | **Pass** | 0 | 13/13 (~55 s) |
| Full connected certification (serial) | **Pass** | 0 | **105/105** (92 + 13), ~3.6 m; 0 residual |
| Root Jest | **Pass** | 0 | 220/220, 2943/2943 |
| Website Vitest | **Pass** | 0 | 7 files, 102 tests |
| TypeScript (root) | **Pass** | 0 | 0 errors |
| TypeScript (qa) | **Pass** | 0 | 0 errors |
| Lint | **Deterministic; unchanged** | 1 | 489 pre-existing (qa/ ignored; no new findings) |
| Health | **Pass** | 0 | 19/19 |
| `qa:release` | **Pass** | 0 | 533s: jest 2943 → tsc 0 → web+android exports → serial cert **105/105** → non-cert browsers 130 passed / 56 skipped / 0 failed; 2 deterministic teardowns |
| Deterministic cleanup / residual | **Clean** | — | 0 bookings, 0 locations |

## 15. Defects or Limitations Found

- **FINDING (data-integrity gap, P2/P3): no server-side coordinate range validation.**
  `provider_locations.latitude`/`longitude` have no CHECK, so out-of-range values are accepted.
  Severity is low (write is already restricted to the assigned provider on an active booking;
  the value feeds a client-side map only, no server calculation). The smallest safe correction
  would be a CHECK constraint (`latitude BETWEEN -90 AND 90`, `longitude BETWEEN -180 AND 180`)
  via a new migration — **NOT made here** (schema change is out of Phase 2E scope; reported for a
  decision). Not converted into an "expected" pass — it is tagged `@finding` and documented.
- **No stale-update rejection** (last-write-wins) and **no location history** (single row per
  booking) — implemented behavior, recorded (not gaps to "fix").

## 16. Remaining Location Gaps

- Live GPS acquisition, foreground/background tracking, device permissions (native).
- Map rendering, geofencing, the `tracking-map` edge, and Google Maps/Places (external).
- Realtime location UI / websocket propagation (the DB is realtime-published; delivery untested).
- Coordinate range validation (see §15).

## 17. Pilot-Readiness Impact

Provider-location gains **connected DB/RLS certification** for a limited internal pilot:
write/read/clear authorization, the active-booking + assignment gates, server-set ownership,
and booking isolation are proven. Native GPS/tracking/maps/realtime surfaces remain
**uncertified** and are required for external pilot / public launch. The coordinate-validation
finding is flagged for a decision. No native or realtime claim is made.

## 18. Recommended Phase 2F Scope

Per the Phase 2A sequence, **Phase 2F — Push device-token registration (connected) + storage-
drift resolution (investigation)**: `device_tokens` RLS/ownership/dedup; and — once a QA
`SUPABASE_ACCESS_TOKEN`/DB connection is available (F3) — confirm/resolve the `storage.objects`
policy drift. External push delivery remains out of scope (no devices/relay). The coordinate-
range CHECK decision (§15) can be batched with any approved schema-hardening pass.

## 19. Final Status

Connected certification **105/105** (provider-location added), release gate green, **0 residual**.
Connected DB/RLS location behavior is certified; **native GPS, tracking, maps, geofencing, and
realtime UI are not**. One coordinate-validation gap is documented (no schema change made). No
migration or feature was introduced, and **Full Platform Certification is not claimed**.
