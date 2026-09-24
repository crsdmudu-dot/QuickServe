# Production notify-helper emergency containment: record (2026-09-24)

**Status: APPLIED.** One write was sent to Production, and the runner observed state **CONTAINED**.

**This is the first manual Production SQL for KwikServe.** It is an explicit, owner-authorised exception to the recorded practice of changing Production only through migrations.

- **Project:** Production Supabase `lkigkltvstlxfdztffds`. QA was not contacted.
- **When:** the write was sent **once**, at `2026-09-24T21:31:33Z` (2026-09-25 00:31:33 EAT), with runner request_id `5ce7185d-98bb-453f-84ed-c9b7313110a6`.
- **Who:** the owner (crsdmudu-dot) authorised it in writing and was present. Claude Code operated the prepared runner.
- **Where the evidence is:** off-repo, under `supabase-prod-inspect/evidence/` (see "Evidence" below). This document summarises it; no raw CLI output is reproduced here.

## Why
On 2026-09-24, read-only checks showed that on Production three internal helpers were executable by `PUBLIC`, `anon` and `authenticated`:
- `public.notify_user(uuid, uuid, text, text, text, text, text, text)`
- `public.notify_admins(uuid, text, text, text, text, text)`
- `public.notify_send_push(jsonb)`

Anyone holding the public anon key could have written notifications or triggered pushes through `/rest/v1/rpc/`. Migration `0062_restrict_internal_notification_helpers.sql` (PR #28) fixes this, and QA has certified it. It cannot reach Production before the six-file account-deletion rollout, because 0056–0061 must be applied first.

So the owner authorised a narrow out-of-band containment: exactly the nine `REVOKE EXECUTE` statements of 0062, sent once.

## What was sent
- **The nine statements** of `0062_restrict_internal_notification_helpers.sql` at PR #28 commit `6b5d716bbc4315317648ac798232040b8e8de525`. They revoke `EXECUTE` from `public`, `anon` and `authenticated` on each of the three functions.
  - Nine-statement SHA-256: `3135e7d52423669817808747713bbd8fae31acec920323aa02b4811b85f378fc`.
  - Source migration SHA-256: `eef765a871e1f832113a7993dd641b50033c5b67691c5bf93afe8ead18c09493`.
- **How they were sent:** wrapped in one `DO` block (`emergency-revoke.sql`) with guards before and after the nine statements. Any failed guard aborts the block and leaves nothing changed. The guards require:
  - the Production identity and fingerprint, and migration head `0054`;
  - the exact original privilege state;
  - that no dependency blocks the change;
  - afterwards, that the contained state is exact and every in-database caller can still execute the helpers as their owner.
- **Runtime files (rev 7), verified against the authorisation before use:**

| File | SHA-256 |
|---|---|
| `emergency-revoke.sql` | `ad378db334687f619067414af080e638dd0a7464f6e14f3527b67964549f63ef` |
| `state-check.sql` | `21fc06f0fcc0309aec0cce070957d86dd631ec142e809d612e15f8b08f764c86` |
| `outstanding-check.sql` | `1968fa56b04b03e44361891e8fc9b7447496b14b534cf328505b909c58454746` |
| `recovery-regrant.sql` (staged, **not used**) | `d813d1045dc359c88c1d22cedc715c75d89f3ad118476a1a3376b065b699fcb6` |
| `lib-target.sh` | `d6cca85b17fbe4ef8697bf8452f089264fc51c0e989cef920d1c0d1df94707ec` |
| `run-containment.sh` | `258bf7f377f2734fe1b52cef5f2624e51d0ed4bc4fab61028d53c8c567ea7513` |

## Pre-write checks (all passed before the write)
| Step (UTC, 2026-09-24) | Result |
|---|---|
| Offline | clean environment (no targeting overrides); CLI 2.110.0 with its binary hash pinned; Production workdir linked to `lkigkltvstlxfdztffds`; runtime files hash-verified with 0 CR bytes; no existing lock |
| 21:27:13 state | target verified before sending; the request log named only the Production ref; state **ORIGINAL**, `production_target = true` |
| 21:27:44 gate capture | read-only capture of the helper ACLs, per-role access, callers, triggers and cron (hash recorded in the evidence) |
| 21:29:36 read-only rehearsal | the write text inside `BEGIN TRANSACTION READ ONLY` stopped with SQLSTATE `25006` at the first REVOKE, after every guard had passed |
| 21:30:09 backups | newest daily physical backup COMPLETED at 2026-09-24 05:58Z (15.5 h old); PITR off |
| 21:30:38 dry run | PREFLIGHT OK; no write sent |

## Result
- **21:31:33Z, one send.** The runner created its request-bound lock first, then sent the write once. The CLI exited 0 and the request log named only `lkigkltvstlxfdztffds`.
- **Observed afterwards:** state **CONTAINED**, `production_target = true`.
- **Runner outcome: APPLIED (exit 0).** It recorded the outcome durably, then removed its own lock, as designed for this outcome.
- **No retry, recovery or re-grant** was sent.

## What changed
Comparing the gate capture with the post capture (21:33Z), only the three helper ACLs and the per-role access to them changed. Nothing else in the capture changed:
- callers and function owners;
- trigger states and cron jobs;
- the pg_net function and queue;
- the push-configuration flags.

| Helper | ACL before | ACL after |
|---|---|---|
| `notify_user(...)` | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | `{postgres=X/postgres,service_role=X/postgres}` |
| `notify_admins(...)` | same as above | `{postgres=X/postgres,service_role=X/postgres}` |
| `notify_send_push(jsonb)` | same as above | `{postgres=X/postgres,service_role=X/postgres}` |

**Roles that lost `EXECUTE` on all three helpers (14):**
- the intended targets: `anon` and `authenticated`;
- **12 platform roles whose access came only through `PUBLIC`**, which is the intended effect of revoking from `PUBLIC`:
  - `authenticator`, `cli_login_postgres`, `dashboard_user`, `pgbouncer`;
  - `supabase_auth_admin`, `supabase_etl_admin`, `supabase_functions_admin`, `supabase_privileged_role`;
  - `supabase_read_only_user`, `supabase_realtime_admin`, `supabase_replication_admin`, `supabase_storage_admin`.

**Kept `EXECUTE`:**
- `postgres` and `service_role`.
- All 13 in-database callers are `SECURITY DEFINER` functions owned by `postgres`, and their owner can still execute all three helpers. They are:
  - `mpesa_ops_alert_sweep`, `record_mpesa_callback_event`;
  - `tg_notify_*` (7);
  - `tg_push_*` (4).
- All 9 caller triggers remain enabled.
- Both cron jobs run as `postgres`.

## Migration history: an intentional gap
- **Production history was re-checked read-only at 2026-09-24T21:55Z:** 54 rows, exactly `0001`–`0054`, head **`0054`**.
- **Production is ahead of its migration history for exactly these three ACLs.** It stays that way until `0062` is applied through the normal six-file push, in this order:
  - `0056_account_deletion.sql`
  - `0058_redact_deleted_payer_payment_payloads.sql`
  - `0059_deletion_work.sql`
  - `0060_delete_account_durable_work.sql`
  - `0061_cleanup_state_reflects_unresolved_intents.sql`
  - `0062_restrict_internal_notification_helpers.sql`

  `0055` and `0057` are intentionally absent.
- **What 0062 will do then:** revoking privileges that are already absent is a silent no-op. `0062` will record its history row without reopening access or changing these ACLs.
- **This record and the PR #28 comment do not close the gap.** Only that push does.
- **Until then, every Production preflight must expect CONTAINED.** `state-check.sql` must report CONTAINED with `production_target = true`. Any `notify_*` ACL difference against QA means the containment has regressed: STOP.

## Limits of this evidence
- **Notification behaviour was not exercised on Production.** No behavioural validation and no anon RPC probe were run; both were outside the authorisation. The evidence that legitimate notifications still work is:
  - the block's in-transaction postconditions;
  - the capture: every known caller runs as `postgres`, which kept `EXECUTE`, and the triggers and cron are unchanged;
  - QA's certification of the same nine statements (74/74 notification certifications).
- **"anon can no longer call"** is shown by the ACL and by `has_function_privilege`, not by a live RPC call.
- **The 12 platform roles.** No known component calls these helpers directly under those roles, but this was not tested.

## Side effects (disclosed)
- Every Supabase CLI `db query` first makes `POST /v1/projects/lkigkltvstlxfdztffds/cli/login-role`. That creates or refreshes the platform's temporary `cli_login_postgres` login role. It is a platform credential rotation, not a data or schema change.
- **Calls in this record:**
  - 9 `db query` calls during the containment run (preflight, the write, and the post-checks);
  - 2 more at 21:55Z for this record (the history check and the state check);
  - 1 Management API read for `backups list`.
- **No leftovers.** No CLI debug capture was left behind, and credential scans of the evidence folders found nothing.

## Evidence (off-repo)
- **`supabase-prod-inspect/evidence/2026-09-24-2125Z-prod-notify-helper-revoke-plan/`** holds:
  - the staged runtime files and `AUTHORISED-SHA256.txt`;
  - the preflight and post-check outputs;
  - the runner's own evidence folder (execution log, write evidence, outcome);
  - `SHA256SUMS.txt`: `6ae92144f0802eac699c5018510054b5dc0cf6f3047a7b67f4e0876a1ea7d319`.
- **`supabase-prod-inspect/evidence/2026-09-24-2125Z-prod-notify-helper-revoke-apply/`** holds copies of the execute evidence and the gate and post captures, plus:
  - `CERTIFICATION.md` (quotes the authorisation word for word): `1f43390e7650b6fe4e79da9233d981917260c4f3bf3428edd3eb787f5fbbf571`;
  - `SHA256SUMS.txt`: `2e6d40fd67ce5d5c33c7ce68ee4177a2bd04772653013abd117a625dcc0bd9e8`.
- **`supabase-prod-inspect/evidence/2026-09-24-2150Z-record-and-rollout-prep/readonly/`** holds the 21:55Z history and state checks.

## Not done by this record
Each of the following needs its own decision:
- recovery or re-grant;
- behavioural validation and the anon RPC probe;
- the PR #28 merge;
- the six-file migration push;
- Edge Function deployment, secrets and worker scheduling.
