# QA compatibility probe — Storage ownership, magic-link claims, missing-path removal

**Date:** 2026-09-23 · **Target:** the certified QA project (the API host in `qa/.env` and the CLI's
linked `project-ref` both equal the recorded QA reference; the Production reference is refused by
the script) · **Result: PASS, restoration delta zero** · **Authorised scope:** disposable QA
identities, synthetic objects and test sessions only.

Component versions recorded by the CLI link at the time: GoTrue v2.197.0, Storage v1.77.5,
PostgREST v14.5.

This record exists so the facts the Phase B design depends on do not live only in a session
scratchpad. The probe script itself was a one-off session artefact and is not part of the
repository; the run sheet in `PHASE-B1-DELETION-WORK-RUN-SHEET.md` re-verifies each fact through
the certification suites when Phase B1 is deployed to QA.

## What was created and removed

One disposable customer identity (`qa-probe-<nonce>@example.com`, random password held in memory),
one synthetic text object under `booking-photos/qa-probe-<nonce>/<uuid>.txt`, two sessions
(password, magic link). No email was sent by any step. No fixed account, booking, payment or policy
was touched. No schema or policy change was made; `storage.objects` was read through the CLI's
`supabase db query --linked` path with SELECT statements only (the storage schema is **not** exposed
through PostgREST: `PGRST106`, exposed schemas are `public, graphql_public`).

## Baseline and restoration

| Measure | Before | After |
|---|---|---|
| Independent baseline (22 measures incl. financial fingerprint, tombstones, audit rows, marked identities) | captured | **delta {}** |
| `booking-photos` objects | 0 | 0 |
| Storage residue named `qa-probe-%` | 0 | 0 |
| Auth identities containing `qa-probe` | 0 | 0 |
| Disposable identity after cleanup | — | `GET /auth/v1/admin/users/{id}` → 404; profile rows 0 |

Cleanup order: global logout of both sessions (the second logout returned 403 because the first
was global, expected), dependent rows by exact id (notifications, flags, favourites, audit,
throttle, wallet, profile), then the auth identity.

## Observations

### 1. Storage ownership

- Upload as the user's own JWT to an arbitrary path in the bucket: **200** (confirms the open
  insert policy from 0006; 0059 tightens it).
- `storage.objects` row for that path: `owner` present and equal to the user id; `owner_id`
  present and equal to the user id; `id` and `version` present.
- `GET /storage/v1/object/info/authenticated/{bucket}/{path}` (service role): 200, returns
  `id, name, bucket_id, version, etag, size, content_type, metadata, created_at, last_modified,
  is_versioned, is_delete_marker, archived_at, cache_control` — **no owner fields**. Ownership
  must be read from `storage.objects` (0059 does this inside service-only routines).

### 2. Magic-link authentication claims

- `POST /auth/v1/admin/generate_link` `{type:'magiclink'}`: 200, `verification_type: magiclink`;
  the response includes `hashed_token`, `action_link` and `email_otp` (never printed or stored).
  No email is sent by this call.
- `POST /auth/v1/verify` `{type:'magiclink', token_hash}`: 200, session issued.
- Decoded access token (claims inspected locally, token discarded): claim keys
  `aal, amr, app_metadata, aud, email, exp, iat, is_anonymous, iss, phone, role, session_id, sub,
  user_metadata`; **`amr: [{method: "otp", timestamp: <number>}]`**; `aal1`;
  `role: authenticated`; lifetime 3600 s; `session_id` present.
- Password session for comparison: identical claim keys; `amr: [{method: "password", …}]`.
- **Replay** of the same `token_hash`: **403 `otp_expired`, no session**.

### 3. Storage removal semantics

| Call (service role unless stated) | Status | Body |
|---|---|---|
| Remove a collision-resistant path verified absent (`storage.objects` count 0) | 200 | `[]` |
| Remove the real object **as the user** (delete policy is admin-only) | 200 | `[]`, and the object was still present afterwards |
| Remove the real object | 200 | `[1 item]` with keys `id, name, bucket_id, owner, owner_id, version, metadata, …`; `storage.objects` count 0 afterwards |
| Remove the same path again | 200 | `[]` |

Consequence: the remove response is identical for "missing", "not permitted" and "already
removed". Only the `storage.objects` read before and after distinguishes them. 0059's
`record_destroy_result` and `finish_intent` decide from those reads.

## Not exercised, and why

- The real magic-link **send** path (`signInWithOtp` with `shouldCreateUser: false`) requires a
  mailbox the owner controls. Recorded as a dependency for the website route (not part of B1).
- Whether Auth's `deleteUser` succeeds while the identity still owns `storage.objects` rows. The
  0059 design does not assume it (dependency-class failures are retried after cleanup); the run
  sheet verifies it.
- The Production project was not contacted.
