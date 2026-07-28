# Phase 1B — Connected Coverage Expansion Report

> Scope: expand **connected** automated testing into four priority production
> workflows — authentication lifecycle, onboarding, storage/uploads, and notification
> infrastructure — using the stable Phase 1A pipeline. Only already-existing
> functionality is tested; no features were implemented and no product behavior was
> changed. All results were observed on 2026-07-28 against the dedicated,
> non-production QA project. No secrets, keys, or account identifiers appear here.

## 1. Executive Summary

**27 new connected tests** were added across four new spec files, raising the connected
certification suite from **21 → 48 tests**, all passing serially with deterministic
cleanup (0 residual rows/users verified). The tests drive the **real** Supabase Auth,
PostgREST, Storage, and DB triggers of the dedicated QA project — never mocked, never
production.

- **Authentication lifecycle:** 7 tests — login, wrong-password rejection, refresh,
  logout/revocation, invalid-session rejection, role/tenant enforcement, unauthorized-write denial.
- **Onboarding:** 6 tests — account creation, provider-pending, **admin-downgrade guard**,
  duplicate prevention, invalid-email and weak-password validation.
- **Storage & uploads:** 8 tests — booking-scoped photo authorization (customer/provider/admin),
  invalid photo_type check-constraint, admin-only verified guard, anonymous object-upload denial,
  missing-object handling.
- **Notifications:** 6 tests — creation on booking insert, delivery to the assigned provider,
  per-user RLS authorization, duplicate suppression, is_read/immutability guard, failure handling.

This is connected coverage expansion only — **not Full Platform Certification**, which remains
not achieved.

## 2. Coverage Added

| Area | New tests | Spec file |
|---|---|---|
| Authentication lifecycle | 7 | `qa/playwright/certification/auth-lifecycle.spec.ts` |
| Onboarding | 6 | `qa/playwright/certification/onboarding.spec.ts` |
| Storage & uploads | 8 | `qa/playwright/certification/storage-uploads.spec.ts` |
| Notification infrastructure | 6 | `qa/playwright/certification/notifications.spec.ts` |
| **Total** | **27** | (connected certification: 21 → **48**) |

New reusable helpers: `qa/playwright/support/connected/qa-auth.ts` (auth-lifecycle + onboarding
primitives, ephemeral-user create/delete/sweep) and `qa-storage.ts` (bucket object + booking_photos
metadata primitives). Existing helpers (`qa-client`, `qa-bookings`, `qa-accounts`) were reused
unchanged; no existing test was modified or weakened.

## 3. Authentication Coverage

`auth-lifecycle.spec.ts` (persistent QA accounts; creates no rows):

- **login** — password grant returns an access **and** refresh token.
- **login negative** — a wrong password does not authenticate (no token issued).
- **refresh** — a refresh token exchanges for a new access token.
- **logout / expired session** — after `logout`, the session's refresh token is revoked
  (refresh rejected); a bogus bearer token → PostgREST `401`.
- **role/tenant enforcement** — a customer reads exactly their own profile (RLS `profiles_select_own`).
- **unauthorized** — an anonymous caller cannot create a booking (`401/403`).

## 4. Onboarding Coverage

`onboarding.spec.ts` (ephemeral users created via the admin API, which fires the same
`on_auth_user_created → handle_new_user` trigger without the public-signup email rate limit;
deleted per-test + prefix sweep):

- **account creation** — a new customer gets a `customer` / `approved` profile (verified via the
  new user's own RLS-scoped profile read after sign-in).
- **provider onboarding** — a provider signup yields `provider` / `pending`.
- **admin-downgrade guard (security)** — an `admin`-role signup is **downgraded to `customer`**;
  admin is never self-assignable.
- **duplicate prevention** — re-registering an existing email → `422 email_exists`.
- **validation failures** — invalid email format → `400 validation_failed`; too-short password →
  `422 weak_password` (public `/auth/v1/signup`, the endpoint the app uses).

## 5. Storage Coverage

`storage-uploads.spec.ts` (a booking owned by the QA customer, provider1 assigned; booking deleted
in afterAll, cascading photo metadata):

- **authorized upload** — a customer attaches an `issue` photo to their own booking (`booking_photos` insert `201`).
- **authorization negatives** — a customer cannot attach a provider-only type (`before`); an
  **unassigned** provider cannot attach a photo; both denied by `booking_photos_insert` RLS.
- **assigned-provider upload** — the assigned provider attaches a `before` photo (`201`).
- **invalid file** — an unknown `photo_type` (`selfie`) is rejected by the check constraint (`400`,
  via admin so RLS passes and the constraint is the rejecter).
- **verified guard** — a non-admin cannot create an already-verified photo (denied).
- **object-level** — an anonymous caller cannot upload to the private bucket; a missing object
  download returns an error (`400/404`).

**Limitation (environment/drift):** direct *authenticated* object uploads to the `booking-photos`
bucket are denied by the QA project's **deployed** `storage.objects` policy — stricter than
migration `0006` (a local↔remote drift, related to F3). Object-level upload **success** is therefore
not asserted against this QA environment; the `booking_photos` metadata table is the authorization
boundary the app enforces and is fully covered. This is an environment limitation, **not a product
defect**.

## 6. Notification Coverage

`notifications.spec.ts` (one booking; deleted in afterAll, cascading its notifications):

- **creation** — inserting a booking notifies the customer (`booking_received`, title "Booking received").
- **delivery** — assigning a provider notifies **that** provider (`booking_assigned`) and separately
  the customer (`provider_assigned`).
- **authorization (RLS)** — a different (unassigned) provider and an anonymous caller read none of
  the booking's notifications (`user_id = auth.uid()`).
- **duplicate suppression** — a no-op status re-update emits no additional notification (the
  `tg_notify_booking_update` WHEN guard; complements the `dedup_key` unique index).
- **is_read / immutability** — a user may flip `is_read` on their own notification but cannot rewrite
  a pinned field (`title`) — `notifications_update` WITH CHECK.
- **failure handling** — a rejected status update (invalid status) creates no notification
  (transaction rollback; count unchanged).

## 7. Validation Results

| Command | Status | Exit | Result |
|---|---|---|---|
| Root Jest (`npm test`) | **Pass** | 0 | 220/220 suites, 2943/2943 tests |
| Website (`vitest`) | **Pass** | 0 | 7 files, 102 tests |
| TypeScript (root `tsc --noEmit`) | **Pass** | 0 | 0 errors |
| TypeScript (qa `tsc --noEmit`) | **Pass** | 0 | 0 errors |
| Lint (`npm run lint`) | **Deterministic; unchanged** | 1 | 489 pre-existing findings (qa/ ignored; no new findings, no side effects) |
| Health (`qa:health`) | **Pass** | 0 | 19/19 |
| Connected certification (serial) | **Pass** | 0 | **48/48** (21 + 27 new); deterministic teardown |
| Residual check | **Clean** | — | 0 ephemeral users, 0 QA-CERT bookings after run |
| `qa:release` | **Pass** | 0 | 386s: jest 2943 → tsc 0 → web+android exports → serial cert **48/48** → non-cert browsers 130 passed / 56 skipped / 0 failed; 2 deterministic teardowns |

New tests run **serially** within the certification stage (`--workers=1`), preserving the Phase 1A
release-gate orchestration; the release gate remains green.

## 8. Remaining Gaps

Tested only what exists; the following remain **uncovered** (candidates for later phases, not
started here):

- **Direct storage object upload success** — blocked by the QA project's deployed `storage.objects`
  policy drift (§5); needs the deployed policy reconciled with migrations `0006`/`0016` (F3-adjacent).
- **Public-signup happy path E2E** — the QA project rate-limits signup confirmation emails; onboarding
  account-creation is exercised via the admin API instead. End-to-end email-confirmation flow and
  password reset remain uncovered.
- **Push delivery** — `push_status` fan-out (`tg_push_notification` / `send-push` Edge Function) is
  not asserted end-to-end (no device tokens / no Expo push relay in QA).
- **Payments settlement, chat, tracking, reviews** connected flows — out of Phase 1B scope.
- **Native mobile journeys, performance, accessibility, load** — later phases.

## 9. Recommended Phase 2 Scope

For approval (not started):

- Reconcile the QA project's storage policies with the repository migrations, then certify object-level
  upload/download success and booking-scoped object reads.
- Payments settlement (M-Pesa sandbox) and the payment→notification path (`tg_notify_payment_paid`,
  `tg_notify_payment_failed`).
- Chat and review notification paths (`tg_notify_chat_message`, `tg_notify_review`) end-to-end.
- Push-delivery verification against a QA device-token + Expo relay, once available.
- Continue toward the documented Full Platform Certification standard (`docs/engineering/qa/README.md`
  §11) — still **not achieved**.
