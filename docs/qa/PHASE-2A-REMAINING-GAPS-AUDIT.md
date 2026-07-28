# Phase 2A — Remaining Coverage Gap Audit

> Planning / repository-evidence phase only. No tests, runtime code, database
> objects, migrations, QA scripts, configuration, deployment files, or remote state
> were changed. Every claim is verified against the repository at main `47aea81`.
> Environment variables are referenced by name only; no secrets appear here.

## 1. Executive Summary

After Phase 1B the connected certification suite is **48/48** and the release gate is
green. The largest **verified** remaining gaps are connected coverage for **payments
DB-state integrity, reviews/ratings, chat, and provider-location authorization** — all
of which have **implemented** product functionality, deterministic cleanup paths, and
**no external dependency**, so they are ready to test next. External/native surfaces
(real M-Pesa settlement, push delivery to devices, native Android/iOS journeys) and
tooling-dependent surfaces (accessibility, performance/load) remain **blocked** on
credentials, devices, or new tooling. The Phase 1B storage finding is classified
**likely remote policy drift**.

Highest-priority ready gaps: **Payments DB-state (P1)**, **Reviews & Ratings (P1)**,
**Chat messaging (P1)**, **Provider-location authorization (P1)**. This audit
recommends **Payments connected DB-state integrity (mock mode)** as the immediate next
implementation phase. **Full Platform Certification is not claimed.**

## 2. Verified Current Baseline

| Metric | Value | Source (verified this phase) |
|---|---|---|
| Connected certification | **48** (21 + 27 Phase 1B) | `qa/playwright/certification/*.spec.ts` |
| Health / framework | **19** | `qa/playwright/tests/*.spec.ts` |
| Admin mock-mode E2E | **43** | `qa/playwright/admin/*.spec.ts` |
| Root Jest | **220 suites / ~2,943 tests** (mocked) | `find src test -name *.test.*`; prior reports |
| Website Vitest | **7 files / 102 tests** | `apps/website/__tests__/` |
| Release gate `qa:release` | **Green (exit 0)** | Phase 1B report (386s; cert 48/48 serial) |
| Deterministic cleanup | **Verified** (0 residual) | Phase 1B residual check |
| Edge Functions | **7** | `supabase/functions/` |
| Migrations | **0001–0034** | `supabase/migrations/` |

**Known environment blockers (carried forward):** remote migration alignment (no
Supabase access token / QA DB password — F3); QA signup email-send rate limit
(Phase 1B); QA `storage.objects` authenticated-insert denial (Phase 1B / §6); native
build not initialised (`app.json` `extra.eas.projectId` empty, `associatedDomains` =
`REPLACE_ME`); lint backlog (489 findings, deterministic — F2).

## 3. Evidence Reviewed

- `docs/qa/PHASE-0-BASELINE-REPORT.md`, `PHASE-1A-INFRASTRUCTURE-REPORT.md`,
  `PHASE-1B-CONNECTED-COVERAGE-REPORT.md`.
- `docs/engineering/qa/README.md`, `docs/engineering/releases/README.md` (and the Full
  Platform Testing Audit summarized therein).
- Playwright suites (`certification/`, `tests/`, `admin/`), root Jest (`src/**`,
  `test/**`), website Vitest (`apps/website/__tests__/`).
- `qa/package.json`, root `package.json` scripts; migrations `0006`–`0034`; edge
  functions; `src/lib/*` per area.
- Read-only QA probes (this phase): storage bucket metadata + service-role write.

## 4. Payments

**Product status: Implemented.** `payments` (one per booking — `booking_id UNIQUE`;
status `pending/paid/refunded/cancelled`; RLS `customer_id = auth.uid() or is_admin()`),
`provider_earnings` (one per booking; `payout_status`), `payment_attempts` (retries
allowed — no unique on `payment_id`; status `initiated/pending/successful/failed/
cancelled`). Triggers: `trg_create_payment_on_accept`, `trg_create_earning_on_paid`.
Edge: `mpesa-stk-push` (JWT), `mpesa-callback` (secret-gated, **idempotent** — "already
in terminal state, do nothing"). `MPESA_MODE` mock/sandbox/live. **Refunds/reversals are
record-only** (`src/lib/operations.ts`: "does NOT trigger any refund/wallet/enforcement"),
`refunded` status + `mark_payout_paid` admin RPC exist; there is **no automated money
reversal**.

- **Coverage:** unit (mocked) for `payments/mpesa/attempts/receipts`. **Connected:
  Uncovered** (0 cert specs mention payment).
- **Test level:** connected integration (DB-state, mock mode) + manual for real settlement.
- **Ready connected (deterministic, no real money):** payment row creation on quote
  accept; earning creation on paid; one-payment-per-booking; RLS authorization
  (customer cannot see others' payments); `payment_attempts` states; callback idempotency
  (if `MPESA_CALLBACK_SECRET` available in QA).
- **Blocked:** real M-Pesa **settlement** (needs Daraja sandbox creds + `MPESA_MODE=sandbox`).
- **Dependencies:** QA accounts + booking spine (present); callback secret (name only).
- **Destructive risk:** Low (mock mode; cascade cleanup on booking delete). **Cleanup:**
  delete the booking → cascades payments/attempts/earnings.
- **Priority: P1** (financial DB-state integrity) — **not blanket P0**: pilot can run in
  mock mode and real settlement is external.

## 5. Push Notifications

**Product status: Implemented (DB + fan-out).** `device_tokens` (owner RLS insert/select/
update/delete; **`unique(user_id, push_token)`** = dedup). `register-device` edge (JWT).
`tg_push_notification` fan-out on `notifications` insert → `notify_send_push` → `send-push`
edge (secret-gated webhook). `push_status` lifecycle column on notifications.

- **Coverage:** unit (mocked) `push.ts`; notification **creation** already covered
  (Phase 1B). **Connected device-token: Uncovered.**
- **Ready connected:** device-token registration (own RLS), token ownership (cannot
  register for another user), duplicate-token suppression (unique index), `push_status`
  default.
- **Blocked:** **actual external delivery** (Expo push relay → physical device) — no
  device tokens, no Expo relay in QA; this is DB notification creation ≠ delivery.
- **Destructive risk:** Low. **Cleanup:** delete created device_tokens (owner delete RLS).
- **Priority: P2** (registration RLS is lower-risk; creation already covered; delivery blocked).

## 6. Storage and Environment Drift

**Product status: Implemented.** Bucket `booking-photos` (private) + `booking_photos`
metadata RLS (customer→`issue`, assigned-provider→`before/after/completion`, admin any;
select booking-scoped; delete/update admin-only). Migration `0016` tightened object
**reads** to booking participants.

**Phase 1B finding re-investigated (read-only, this phase):**

- Migration `0006` defines a **permissive** object INSERT policy:
  `for insert to authenticated with check (bucket_id = 'booking-photos')`.
- Observed on the QA project: an **authenticated** user's object insert → **403** ("new
  row violates row-level security policy"); an anonymous insert → denied; a
  **service-role** insert → **200**; bucket metadata → exists, `public=false`.

The bucket exists exactly as the migration describes and is writable (service role),
but authenticated inserts are denied despite a migration that permits them.

- **Classification: LIKELY REMOTE POLICY DRIFT.** The deployed `storage.objects` INSERT
  policy for `authenticated` differs from (or was never applied per) migration `0006`.
  Not "confirmed" — the deployed policy text is not readable via existing tooling
  (`storage` schema is not PostgREST-exposed; `pg_policies` needs a DB connection).
  Not a "test assumption mismatch" — `src/lib/photos.ts` itself relies on authenticated
  uploads. Not a repository migration mismatch — `0006`/`0016` are internally consistent.
- **Action required to verify/correct later:** obtain `SUPABASE_ACCESS_TOKEN` (or the QA
  DB connection string — the F3 prerequisite), then `supabase db diff --linked --schema
  storage` **or** `select * from pg_policies where schemaname='storage' and
  tablename='objects'` and compare to `0006`/`0016`; if drifted, reconcile by applying the
  storage policies to the QA project via migration (`supabase db push`). **Not performed
  in this phase.**
- **Coverage today:** metadata authorization **Covered** (Phase 1B); object-level upload
  **Partially covered** (anon-denied + missing-file); object upload **success**
  **Blocked** by the drift.
- **Priority: P1** (blocks certifying real object upload/download; also a
  security/correctness question about the deployed bucket policy) — **Blocked** on remote access.

## 7. Chat and Messaging

**Product status: Implemented.** `booking_messages` (booking_id, sender_id, message_text
1–2000 chars; RLS select/insert booking-scoped participants). `tg_notify_chat_message`
creates a notification per message (NULL dedup → every message notifies). `0031`
communication center builds on it.

- **Coverage:** unit (mocked) `messages.ts`. **Connected: Uncovered.**
- **Ready connected (deterministic):** participant message send; participant read; a
  non-participant (other provider) cannot read/send; cross-booking isolation; message
  length constraint; the message→notification path.
- **Blocked/deferred:** **realtime** delivery (Supabase Realtime subscription) — not
  easily asserted at the REST layer; ordering/typing → manual.
- **Destructive risk:** Low. **Cleanup:** delete booking → cascades messages + notifications.
- **Priority: P1** (in-booking communication authorization + isolation are security-relevant).

## 8. Tracking and Location

**Product status: Implemented.** `provider_locations` (booking_id PK → one per booking,
provider_id, RLS select booking-scoped; **realtime publication**). `tracking-map` edge
(JWT). Client: `use-provider-location-sharing` (foreground `watchPositionAsync`).

- **Coverage:** unit (mocked) `tracking.ts`, `tracking-status.ts`, location-sharing hook.
  **Connected: Uncovered.**
- **Ready connected (deterministic):** location write authorization (only the assigned
  provider writes their booking's row); customer/admin read; a non-assigned provider
  cannot write/read; cross-booking isolation; one-row-per-booking (PK upsert).
- **Blocked:** realtime propagation, foreground/background native behavior, and the map
  (Google Places/Maps external) — native/external.
- **Destructive risk:** Low. **Cleanup:** delete booking → cascades the location row.
- **Priority: P1** for write-authorization (privacy/security of live location); P2 for
  realtime/maps.

## 9. Reviews and Ratings

**Product status: Implemented.** `reviews` (one per booking — `booking_id UNIQUE`; rating
1–5; RLS `reviews_insert_own` requires `customer_id = auth.uid()` **AND the booking is the
caller's AND `status = 'completed'`**; select; **update admin-only**). `0022` adds
dimension ratings (quality/punctuality/communication/professionalism/value), a 9-tag
allowlist, and `review_private_feedback`. `trg_recompute_provider_rating` aggregates.

- **Coverage:** unit (mocked) `reviews.ts`. **Connected: Uncovered.**
- **Ready connected (deterministic, no external deps):** eligibility (only the customer of
  a **completed** booking); one-review-per-booking (unique); role enforcement (provider/
  other cannot insert; only admin updates); rating bounds; tag allowlist; provider-rating
  aggregation recompute; private-feedback ownership.
- **Destructive risk:** Low. **Cleanup:** delete booking → cascades review + private feedback.
- **Priority: P1** (highest readiness/determinism; security role-enforcement + business
  aggregation).

## 10. Remaining Authentication Gaps

**Product status: Implemented; lifecycle mostly Covered (Phase 1B).**

- **Covered (1B):** login, wrong-password, refresh, logout/revocation, invalid session,
  role/tenant enforcement, unauthorized write; onboarding role assignment + admin-downgrade
  + duplicate + validation failures.
- **Uncovered / Blocked:** **public-signup happy path** and **email confirmation** (QA
  project **email-send rate limit** — Phase 1B); **password reset** flow (email-dependent).
  These depend on the QA project's auth email settings.
- **Test level:** connected (blocked by email rate limit) or manual/device.
- **Priority: P2** (email-dependent; core lifecycle already covered). **Blocked** on QA
  email configuration.

## 11. Native Mobile Testing

**Product status: Implemented app; build not initialised.** `app.json` `extra.eas.projectId`
**empty**; `ios.associatedDomains` = `applinks:REPLACE_ME.quickserve.app`; managed workflow
(no `android/`, `ios/` dirs); `qa/maestro/` is a placeholder (no flows).

- **Coverage:** config validation only (Phase 0). **Native E2E: Uncovered / Not implemented.**
- **Test level:** native E2E + manual/device.
- **Blocked prerequisites:** `eas init` (real projectId), real `associatedDomains`, EAS
  build credentials (FCM/APNs), physical devices, and a native harness (Maestro/Detox).
- **Priority: P1 for a mobile pilot** (real-device journeys, deep links, permissions,
  push) — **Blocked** until EAS + devices are available.

## 12. Offline and Network Reliability

**Product status: Partially implemented.** `OfflineBanner` (netinfo), `src/lib/net.ts`
(`isTransient`, `withRetry` — **idempotent reads only, never mutations**). **No offline
queue / no data sync** (not implemented).

- **Coverage:** unit (mocked) `net.ts`, offline-banner. **Connected offline: Uncovered.**
- **Missing:** queued mutations / sync do not exist to test.
- **Test level:** unit/component (present) + manual (network-condition).
- **Priority: P3** (limited surface; core is read-retry + a banner).

## 13. Accessibility

**Product status: Not instrumented.** **No a11y tooling** (`axe`/`jest-axe`/lighthouse
absent from all `package.json`).

- **Coverage:** Uncovered. **Automation feasibility:** requires new tooling
  (`@axe-core/playwright` for web; RN a11y props for native) — a tooling decision.
- **Priority: P3** (needs a tooling-adoption decision; out of current scope).

## 14. Performance and Reliability

**Product status: Not instrumented.** **No perf/load tooling** (k6/artillery/autocannon/
lighthouse absent). One connected concurrency behavior is already asserted
(last-write-wins assignment, integrity suite).

- **Coverage:** Uncovered (startup/latency/large-list/memory/load). **Prerequisite:**
  load tooling + a QA target sized for load (not the shared cert project).
- **Priority: P3** (post-pilot; needs tooling + environment).

## 15. Risk and Priority Matrix

Scores: Impact (user/security/financial), Coverage-gap, Readiness (env/determinism),
Effort. Priority is evidence-based (not blanket-P0).

| Area | Implemented | Connected coverage | Readiness | Blockers | Priority |
|---|---|---|---|---|---|
| Payments DB-state (mock) | Yes | Uncovered | High (deterministic) | Real settlement blocked | **P1** |
| Reviews & Ratings | Yes | Uncovered | **Highest** | None | **P1** |
| Chat messaging (REST) | Yes | Uncovered | High | Realtime deferred | **P1** |
| Provider-location auth | Yes | Uncovered | High | Realtime/native/maps deferred | **P1** |
| Storage drift resolution | Yes | Partial | Blocked | Remote access (F3) | **P1 (blocked)** |
| Push device-token RLS | Yes | Uncovered | High | External delivery blocked | **P2** |
| Auth signup/email/reset | Yes | Uncovered | Blocked | QA email rate limit | **P2 (blocked)** |
| Native mobile E2E | App yes / build no | Uncovered | Blocked | EAS + devices + harness | **P1 (blocked)** |
| Offline/network | Partial | Uncovered | Low value | Sync not implemented | **P3** |
| Accessibility | Not instrumented | Uncovered | Needs tooling | Tooling decision | **P3** |
| Performance/load | Not instrumented | Uncovered | Needs tooling+env | Tooling + target | **P3** |

## 16. Recommended Phase Sequence

Narrow phases (≤2 closely related systems each; independently implementable/mergeable):

- **Phase 2B — Payments DB-state integrity (connected, mock mode).** Payment/earning
  creation on lifecycle, one-per-booking, RLS authorization, attempt states, callback
  idempotency (if secret available). *Excludes real settlement.* Risk: **Medium**.
- **Phase 2C — Reviews & Ratings (connected).** Eligibility, one-per-booking, role
  enforcement, bounds/tags, aggregation, private-feedback ownership. Risk: **Low**.
- **Phase 2D — Chat messaging (connected).** Participant send/read, non-participant
  denial, cross-booking isolation, message→notification. *Excludes realtime.* Risk: **Low**.
- **Phase 2E — Provider-location authorization (connected).** Assigned-provider write,
  participant read, cross-booking isolation, one-per-booking. *Excludes realtime/maps/
  native.* Risk: **Low**.
- **Phase 2F — Push device-token registration (connected) + storage-drift resolution
  (investigation/decision).** Token RLS/ownership/dedup; and — once F3 remote access
  exists — reconcile the `storage.objects` policy. Risk: **Medium** (drift decision).
- **Deferred/blocked (own future phases, not sequenced here):** real M-Pesa sandbox
  settlement (creds); push external delivery (devices/relay); auth signup email flow
  (rate limit); **native E2E** (EAS + devices + harness); accessibility (tooling);
  performance/load (tooling + target). Per instruction, these are **not** combined.

## 17. Pilot-Readiness Gates

Evidence-based; a gate is "met" only where existing evidence supports it.

**Required before a LIMITED INTERNAL pilot**

| Gate | Status | Evidence |
|---|---|---|
| Backend safety (RLS/tenant isolation) | **Met** | cert 48/48; auth/onboarding/notification/storage-metadata RLS |
| Auth & authorization | **Met** | Phase 1B auth lifecycle + role enforcement |
| Booking lifecycle | **Met** | golden-path + progression + dispatch + integrity |
| Notifications (in-app creation) | **Met** | Phase 1B notifications |
| Storage (metadata boundary) | **Partially met** | metadata RLS covered; object upload blocked (§6) |
| Release process | **Met** | `qa:release` green (48/48 serial) |
| Payments safety (DB-state) | **Not yet** | no connected coverage (Phase 2B) |
| Monitoring / operational response | **Partially met** | Sentry no-op unless DSN; ops runbooks documented |

**Required before an EXTERNAL pilot** (adds): payments DB-state + real M-Pesa **sandbox**
settlement proven; reviews + chat + location authorization certified; **Android build**
initialised (`eas init`) and installed on a real device; push delivery verified on a
device; storage drift resolved. **Status: Not met.**

**Required before PUBLIC launch** (adds): iOS build + App Store review; native E2E green;
performance/load baselines; accessibility; monitoring alerting proven; the documented
Full Platform Certification standard (`docs/engineering/qa/README.md` §11). **Status: Not
met.**

No gate is claimed beyond the evidence, and **Full Platform Certification is not claimed.**

## 18. Immediate Next Phase Recommendation

**Phase 2B — Payments connected DB-state integrity (mock mode).** Rationale (evidence-based):
payments carry the highest **financial** impact, the functionality is **Implemented**, and
the DB-state behavior (payment/earning creation on lifecycle, one-per-booking, RLS
authorization, attempt states, callback idempotency) is **fully connected-testable and
deterministic without real money** (mock mode; cascade cleanup). It has **no external
blocker** for the DB-state scope. Real M-Pesa settlement is explicitly **out of scope**
(blocked on sandbox creds). If a lower-risk start is preferred, **Phase 2C (Reviews)** is
the highest-readiness alternative.

## 19. Blockers and Required Decisions

- **Decision:** approve Phase 2B (Payments DB-state) vs starting with Reviews (2C).
- **Decision:** whether to obtain a QA `SUPABASE_ACCESS_TOKEN` / DB connection to (a) close
  remote migration alignment (F3) and (b) confirm/resolve the storage-policy drift (§6).
- **Decision:** whether to run any payment test that invokes `mpesa-callback` (needs
  `MPESA_CALLBACK_SECRET` in QA) — otherwise callback idempotency is asserted only where
  the secret is available.
- **Blocked (need external enablement):** real M-Pesa sandbox (Daraja creds); push device
  delivery (devices + Expo relay); auth signup email flow (QA email rate limit); native
  E2E (`eas init` + credentials + devices + harness); accessibility + performance tooling.
- **Carried:** lint backlog (F2, non-blocking); QA-only serial certification requirement
  (preserve `--workers=1`).

## 20. Final Status

Verified baseline: **cert 48/48, health 19, website 102, root Jest 2,943, release gate
green**. The four highest-value **ready** gaps (payments DB-state, reviews, chat,
location authorization) are connected-testable and deterministic; external/native/
tooling surfaces remain blocked. Storage finding = **likely remote policy drift**
(resolution needs remote access). Recommended immediate next phase: **Phase 2B —
Payments DB-state integrity (mock mode)**. This is an audit only — no tests, code,
migrations, configuration, or remote state were changed, and **Full Platform
Certification is not claimed**.
