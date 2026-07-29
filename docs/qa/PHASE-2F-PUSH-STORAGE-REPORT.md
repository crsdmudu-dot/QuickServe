# Phase 2F — Push Device-Token Authorization and Storage Drift Report

> Connected certification of the **existing** device-token model + a read-only
> investigation of the suspected QA storage-policy drift, against the dedicated,
> non-production QA project. No external push sent, no real device token used, no
> storage/schema/policy/migration change. Results observed 2026-07-29. Env vars
> referenced by name only; no secrets.

## 1. Executive Summary

**11 new connected tests** were added for device-token authorization & integrity,
raising the connected certification suite **105 → 116**, all passing serially with
deterministic cleanup (**0 residual** tokens). The tests drive the **real**
`device_tokens` RLS + constraints — owner-only registration/update/delete, admin
read-only oversight, unrelated/anon denial, `(user_id, push_token)` uniqueness + upsert
idempotency, platform/provider validation, and the notification dispatch scaffolding —
**without sending any external push**.

**The Phase 1B/2A storage "drift" is resolved: it was a TEST ASSUMPTION MISMATCH, not a
remote policy drift.** A plain authenticated object insert **succeeds (200)** exactly as
migration `0006` grants; the earlier "denied" observation was caused by the test helper's
`x-upsert: true` header (an UPSERT needs an UPDATE policy that `0006`/`0016` never grant).
No storage correction is required.

Two device-token **findings** were documented (no schema change): the same push token can
be registered by multiple users (no global uniqueness), and `push_token` has no non-empty
server-side check. **Full Platform Certification is not claimed.**

## 2. Starting Baseline

| Item | Value |
|---|---|
| Branch | `qa/phase-2f-push-storage` |
| Pre-work main | `8b4c1165a5035b7a315abfad16228305b90ea90a` |
| Node / npm | v24.14.1 / 11.11.0 |
| Playwright / supabase-js | 1.61.1 / 2.108.2 |
| Supabase CLI | 2.110.0 (project devDependency) |
| Connected certification (before) | 105 |
| Push/storage env vars | `PUSH_WEBHOOK_SECRET`, `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` (by name) |
| Supabase access token / DB connection | **Absent** (no `SUPABASE_ACCESS_TOKEN`/DB URL/password) |

## 3. Existing Push-Token Architecture

Verified from migration `0014` (only migration touching `device_tokens`):

- **`device_tokens`** — `id`, `user_id` (FK profiles, **cascade**), `platform`
  (CHECK `ios/android/web`), `provider` (default `expo`, CHECK `expo/fcm/apns`),
  `push_token` (**text NOT NULL, no non-empty/length CHECK**), `native_push_token`,
  `device_name`, `last_seen_at`, `created_at`, **`unique(user_id, push_token)`**.
- **RLS:** select = own **or admin** (read-only oversight); insert/update/delete =
  **owner only** (`user_id = auth.uid()`); **admin has no write path**.
- **Registration:** the app calls the `register-device` **edge** (JWT-verified) which
  upserts the caller's own row (`onConflict user_id,push_token`, updates `last_seen_at`).
  The RLS is the actual boundary — this phase tests the direct PostgREST path.
- **Dispatch (not invoked):** `send-push` (secret-gated) reads `device_tokens` by
  `user_id` and updates `notifications.push_status` (`pending/sent/skipped/no_token/
  failed`); external Expo delivery is out of scope here.

### Internal coverage matrix (implemented → covered)

| Operation | Authorized actor | Persisted | Uniqueness | Authorization | External delivery? | New coverage |
|---|---|---|---|---|---|---|
| register token | owner | device_tokens row | (user_id, push_token) | insert user_id=self | no | ✅ + spoof/anon denial |
| re-register | owner | same row | upsert on unique | — | no | ✅ (idempotent) |
| shared token (2 users) | each owner | two rows | per-user only | — | no | ✅ (**finding**) |
| update metadata | owner | row | — | update user_id=self | no | ✅ + non-owner/reassign |
| unregister | owner | row removed | — | delete user_id=self | no | ✅ + admin/anon/other denied |
| read | owner / admin | — | — | select own/admin | no | ✅ + unrelated/anon denial |
| validation | — | — | — | platform/provider CHECK | no | ✅ (+ empty-token **finding**) |
| notification link | trigger | push_status | — | — | **no** | ✅ (scaffolding only) |

Cleanup: created tokens use a `QA-P2F-*` push_token prefix and are swept by the service
role in `afterAll`; the persistent QA accounts are never deleted.

## 4. Device-Token Lifecycle Verified

`authenticated user registers own token → re-registration is an idempotent upsert →
owner updates metadata → owner unregisters (or the row cascades when the profile is
deleted)`. Admin has read-only oversight; no other actor may write. Delivery
(`send-push` → Expo) is **not** exercised. All exercised connected.

## 5. Connected Coverage Added

11 tests in `qa/playwright/certification/push-tokens.spec.ts` (helper
`qa/playwright/support/connected/qa-push.ts`): registration + linkage, register-for-
another-user denial, anon denial, unique/upsert idempotency, shared-token **finding**,
owner-update + non-owner + ownership-reassignment denial, platform/provider validation,
null-rejected + empty-accepted **finding**, unregister authorization (owner/admin/other/
anon + repeat), read authorization, and the notification→push_status scaffolding. Existing
helpers reused; no existing test modified.

## 6. Token Ownership and Authorization

- **Register:** only the authenticated owner (`user_id = auth.uid()`); registering on
  behalf of another user is denied; anonymous registration is denied.
- **Update:** only the owner; a non-owner's update changes nothing; **ownership cannot be
  reassigned** (WITH CHECK pins `user_id = auth.uid()`).
- **Delete:** only the owner; a non-owner, **admin** (read-only), and anonymous cannot
  delete; a repeated unregister is a deterministic no-op.
- **Read:** owner and admin (oversight) only; unrelated users and anonymous read nothing.

## 7. Duplicate and Idempotency Behavior

- A second plain insert of the same `(user_id, push_token)` is rejected with **409**
  (unique); the edge's re-registration path is an **idempotent upsert** (no second row).
- **FINDING — no global token uniqueness:** the unique key is `(user_id, push_token)`,
  **not** `(push_token)`, so the *same* device token registered by two different users
  creates **two separate rows** (each owner sees only their own; admin oversight sees
  both). Severity: low–moderate — on a device that changes hands, a stale row could keep a
  previous user's account associated with the device token until pruned by `send-push`'s
  dead-token cleanup. **Not converted to a pass** — tagged `@finding`; no behavior change.

## 8. Token Validation and Integrity

- **Platform** outside `ios/android/web` and **provider** outside `expo/fcm/apns` are
  rejected (CHECK constraints).
- **Null** `push_token` is rejected (NOT NULL).
- **FINDING — no non-empty check:** `push_token` is `text NOT NULL` with **no** non-empty/
  length CHECK, so an **empty string is accepted at the DB layer** (the `register-device`
  edge rejects a falsy token, but the table does not). Documented; the empty row is deleted
  in-test so no residual remains. Not fixed (schema change out of scope).

## 9. Notification Relationship

Verified DB scaffolding only (no delivery): creating a booking fires
`tg_notify_booking_created`, producing a customer notification that carries a
`push_status` column (the value `send-push` would advance). `device_tokens` are keyed by
`user_id`, the same key `send-push` uses to look up delivery targets. **No external push
was sent; APNs/FCM/Expo and the secret-gated `send-push` edge were not invoked.**

## 10. Storage Architecture Reviewed

- Only `0006` (bucket `booking-photos` **private** + `for insert to authenticated with
  check (bucket_id='booking-photos')`, `for select to authenticated`, delete admin-only)
  and `0016` (tightened **select** to booking participants) touch `storage.objects`. **No
  later storage migration exists.** There is **no UPDATE policy** on `storage.objects` for
  authenticated users.
- `booking_photos` metadata RLS is the app's booking-scoped access boundary (certified in
  Phase 1B).

## 11. Storage Drift Investigation

Read-only, with a disposable QA object under a swept prefix (deterministic cleanup;
0 residual):

| Attempt (fresh path) | Result | Consistent with 0006/0016? |
|---|---|---|
| Bucket metadata (service) | exists, `public=false` | ✅ |
| **Customer** plain insert (no `x-upsert`) | **200** | ✅ (`for insert to authenticated`) |
| **Provider** plain insert (no `x-upsert`) | **200** | ✅ (role-agnostic) |
| Customer insert **with `x-upsert: true`** | **400** RLS | ✅ (upsert needs UPDATE policy — none exists) |
| Anonymous insert | **400** | ✅ (`to authenticated` only) |
| `pg_policies` text via PostgREST | 404 `PGRST205` (schema not exposed) | policy text unreadable |

**Root cause of the earlier finding:** Phase 1B/2A used the test helper's `x-upsert:
true` header, turning the INSERT into an UPSERT (INSERT … ON CONFLICT DO UPDATE), which
requires an authenticated **UPDATE** policy that `0006`/`0016` deliberately do not grant →
RLS `400`. A **plain** authenticated insert (what `supabase-js` `.upload()` does by
default, `upsert:false`) **succeeds**, exactly as the migration defines.

## 12. Storage Drift Classification

**Classification: TEST ASSUMPTION MISMATCH.**

- **Evidence supporting it:** plain authenticated insert → 200 (customer + provider);
  `x-upsert` insert → 400 with the same account/path; anon → 400; all consistent with the
  `0006`/`0016` policy set (insert+select authenticated, delete admin-only, **no** update).
- **Evidence unavailable:** the deployed policy **text** (`pg_policies`/`supabase db diff`)
  — `storage` schema is not PostgREST-exposed and no `SUPABASE_ACCESS_TOKEN`/DB connection
  is available. The classification rests on **behavior**, which fully matches the migration.
- **Expected policy behavior:** any authenticated user may INSERT/SELECT within
  `booking-photos`; no UPDATE; delete admin-only.
- **Observed policy behavior:** matches expected (upsert fails only because it also needs
  UPDATE).
- **Security impact:** none — the deployed policy behaves as designed; booking-scoped access
  is enforced by the `booking_photos` metadata RLS.
- **Pilot-readiness impact:** the storage-drift **blocker is removed** — no remote
  reconciliation is required. Object-level upload can be certified in a future phase using a
  plain insert (see §18).
- **Exact next corrective action:** **none on storage.** (Optional test enhancement: update
  the Phase 1B `uploadObject` helper to not send `x-upsert` and add an object-upload-success
  test. No migration, deployment step, or environment repair is required.)

## 13. Security and Pilot-Readiness Impact

Device-token authorization is fully connected-certified (owner-scoped write, admin read-
only, tenant isolation) — a limited-internal-pilot gate. The two findings are low-severity
data-integrity gaps (no global token uniqueness; no empty-token check), flagged for a
schema-hardening decision. The storage question is resolved (no drift). **Actual push
delivery** (APNs/FCM/Expo, native receipt) remains **uncertified** and is required for
external pilot / public launch.

## 14. Cleanup and Residual Data

Created tokens use a `QA-P2F-*` prefix, swept by the service role in `afterAll`; the
empty-token row is deleted in-test; the storage probe used a swept `qa-p2f-probe/` prefix.
Verified: **0 residual QA-P2F device_tokens, 0 residual probe storage objects, 0 residual
QA-CERT bookings**. Shared QA accounts were never deleted.

## 15. Files Changed

| File | Type |
|---|---|
| `qa/playwright/certification/push-tokens.spec.ts` | new — 11 connected tests |
| `qa/playwright/support/connected/qa-push.ts` | new — device-token helpers |
| `docs/qa/PHASE-2F-PUSH-STORAGE-REPORT.md` | new — this report |

No `src/`, `supabase/`, migrations, storage policies, buckets, existing tests, QA scripts,
configuration, or deployment files changed. No new dependency.

## 16. Validation Matrix

| Command | Status | Exit | Result |
|---|---|---|---|
| Push-token spec alone (serial) | **Pass** | 0 | 11/11 (~37 s) |
| Full connected certification (serial) | **Pass** | 0 | **116/116** (105 + 11), ~3.0 m; 0 residual |
| Existing storage spec alone (serial) | **Pass** | 0 | 8/8 (~32 s) |
| Root Jest | **Pass** | 0 | 220/220, 2943/2943 |
| Website Vitest | **Pass** | 0 | 7 files, 102 tests |
| TypeScript (root) | **Pass** | 0 | 0 errors |
| TypeScript (qa) | **Pass** | 0 | 0 errors |
| Lint | **Deterministic; unchanged** | 1 | 489 pre-existing (qa/ ignored) |
| Health | **Pass** | 0 | 19/19 |
| `qa:release` | **Pass** | 0 | 533s: jest 2943 → tsc 0 → web+android exports → serial cert **116/116** → non-cert browsers 130 passed / 56 skipped / 0 failed; 2 deterministic teardowns |
| Deterministic cleanup / residual | **Clean** | — | 0 tokens, 0 probe objects, 0 bookings |

## 17. Defects, Findings, or Limitations

- **FINDING (P2/P3): no global push-token uniqueness** — same token can be registered by
  multiple users (§7). Smallest correction: a partial/unique index or `send-push`-side
  single-owner reconciliation — **deferred for decision** (not made).
- **FINDING (P3): no non-empty `push_token` check** — the DB accepts `''` (§8). Smallest
  correction: a CHECK constraint via migration — **deferred**.
- **Storage:** the prior "likely remote policy drift" is **superseded** — classified **test
  assumption mismatch** (§11–§12); no defect, no correction needed.
- No product behavior, schema, RLS, storage policy, or migration was changed.

## 18. Remaining Push and Storage Gaps

- Actual push **dispatch** (`send-push` edge, secret-gated) and **external delivery**
  (Expo push relay → APNs/FCM) — needs a QA push secret + a device/relay; not tested.
- **Native device receipt**, deep-link on tap, and permission prompts — native E2E.
- Object-level **upload-success** certification (now unblocked — plain insert works; a
  future test-helper tweak + assertion).
- Device-token hardening decisions (the two findings).

## 19. Recommended Next Phase

Options for approval:
- **Storage object-upload certification** (small): fix the Phase 1B `uploadObject` helper to
  use a plain insert and add authorized-upload + participant-read + admin-delete tests
  (no migration).
- **Schema-hardening batch** (needs approval + migration): coordinate-range CHECK (Phase 2E
  finding) + non-empty `push_token` CHECK + a global-token-uniqueness decision.
- **Actual push delivery** verification (blocked on a QA push secret + device/relay).
The connected-DB certification track for pilot-critical domains is now broad (116 tests);
remaining work is increasingly native/external.

## 20. Final Status

Connected certification **116/116** (device tokens added), existing storage spec 8/8,
release gate green, **0 residual**. Device-token DB/RLS authorization is certified; the
storage "drift" is resolved as a **test assumption mismatch** (no correction needed). Two
low-severity findings and a coordinate-range finding remain for a hardening decision. **No
external push was sent, no real device token was used, and no storage policy, bucket,
migration, schema, or runtime behavior was changed.** **Full Platform Certification is not
claimed.**
