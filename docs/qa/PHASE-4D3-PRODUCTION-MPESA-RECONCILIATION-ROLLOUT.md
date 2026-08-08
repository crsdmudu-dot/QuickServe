# Phase 4D.3 — Production M-Pesa Timeout & Reconciliation Rollout

## 1. Executive Summary

Canonical migration **0036** was applied to **Production only**, closing the Phase 4D **P2** on
Production: an M-Pesa STK `payment_attempt` could remain `pending` forever with no reconciliation.
0036 adds the terminal `timed_out` attempt status, a **service-role-only**
`reconcile_stale_payment_attempts()` (marks stale pending M-Pesa attempts `timed_out`, **never
settles payments**), and a **pg_cron** 5-minute schedule. Production is now **36/36 aligned**; existing
data is unchanged; the 0035 callback-RPC lock is intact; Edge Functions/secrets are unchanged. This is
a schema/config rollout only — **Production M-Pesa remains NOT certified, no live Daraja credentials,
no real money, no STK/callback exercised.** Full Platform Certification is NOT claimed.

## 2. Starting Production State

Schema 35/35 (0035 applied, 0036 not applied); P1 callback-RPC bypass CLOSED; P2 OPEN; Edge Functions
4× v2; no `DARAJA_*`/`MPESA_CALLBACK_SECRET`. Before-counts: `profiles=2, bookings=1, payments=0,
payment_attempts=0, booking_activity=1, notifications=0`.

## 3. Backup Confirmation

User **explicitly confirmed** a recent, successful, recoverable Production backup with an acceptable
timestamp **before** the write. No PITR/add-ons enabled.

## 4. Migration 0036 Review

Line-by-line review confirmed only the certified changes: `timed_out` status support, the reconcile
function, service-role-only execution, stale-pending-M-Pesa-attempt update only, pg_cron enable +
5-minute schedule, supporting index/constraint. **No** `DROP TABLE`/`DROP COLUMN`/`TRUNCATE`/broad
`DELETE`, **no** payments settlement, **no** grant to PUBLIC/anon/authenticated, **no** RLS weakening,
**no** Edge Function change, **no** seed/customer data, **no** credential change. Matches the DEV/QA-
certified `0036` exactly.

## 5. Migration Execution

- Target verified = `lkigkltvstlxfdztffds` (Production) immediately before the write.
- Pre-check: remote `0001–0035`, local `0001–0036`, pending = **exactly 1 (0036)**, no remote-only.
- `supabase db push --linked`: **Start 2026-08-08T11:25:53Z → End 11:26:04Z**, applied
  `0036_mpesa_attempt_reconciliation.sql`, **exit 0**. No reset/repair/force/manual SQL.

## 6. Migration History After

Production migration history **36/36 aligned, 0 pending, 0 remote-only**, no gap (last = 0036).

## 7. Reconciliation Function Verification

`reconcile_stale_payment_attempts(interval)` exists (signature matches DEV/QA). Zero-effect probe
(service_role, `p_max_age='5 minutes'`, Production has 0 `payment_attempts`) → **HTTP 200, returned 0**
(exists, service_role executes, no rows changed). It updates only `payment_attempts` (stale pending
M-Pesa → `timed_out`) and **does not modify `public.payments`** (verified in review §4; payments count
unchanged in §11). `p_max_age` default `'5 minutes'` matches the certified version.

## 8. Authorization

- `reconcile_stale_payment_attempts`: **anon → 401 (denied)**; `service_role → 200 (allowed)`.
  Authenticated behavioral probe intentionally skipped (would require creating a disposable Production
  user); denial established by the 0036 grant (`revoke … from public/anon/authenticated`) + DEV/QA
  connected parity (authenticated → 403). No public bypass; no amount-tampering surface.

## 9. 0035 Preservation

`apply_mpesa_callback(text,text,int,text,jsonb)` remains locked: **anon direct RPC → 401 (denied)**
(zero-effect probe, nonexistent checkout, no settlement). PUBLIC/anon/authenticated have no EXECUTE;
service_role retains it. 0035 protections intact.

## 10. pg_cron Verification

Migration applied cleanly (`create extension if not exists pg_cron` + `cron.schedule` both succeeded,
else the push would have errored). Scheduled job (from the canonical migration): **name
`mpesa-reconcile-stale-attempts`**, **schedule `*/5 * * * *`**, command `select
public.reconcile_stale_payment_attempts(interval '5 minutes')` — calls **only** the reconcile function
(no settlement command), single schedule (no duplicate). Direct `cron.job` introspection requires SQL
access not exposed via CLI/PostgREST; scheduling is verified by the clean migration apply.

## 11. Production Data Preservation

Aggregate counts **before → after**, all unchanged:

| Table | Before | After |
|---|---|---|
| profiles | 2 | 2 |
| bookings | 1 | 1 |
| payments | 0 | 0 |
| payment_attempts | 0 | 0 |
| booking_activity | 1 | 1 |
| notifications | 0 | 0 |

No records deleted or created; no payment marked paid; no attempt mutated; no booking changed.
Production has **zero payment_attempts** (recorded).

## 12. Edge Function / Secret Preservation

Edge Functions unchanged: `mpesa-stk-push`, `mpesa-callback`, `register-device`, `send-push` (all
**v2**). Secrets unchanged: **9**, no `DARAJA_*`, no `MPESA_CALLBACK_SECRET`, no new live M-Pesa
secret. No Production function invoked.

## 13. Environment Isolation

DEV `gzkvna…`, QA `wjvju…`, Production `lkigk…` distinct. Local `.env` → DEV, `qa/.env` → QA,
`.env.backup` → Production (inactive). No Production DB password remains active; CLI unlinked; no
QA/DEV credential copied to Production.

## 14. Validation

Migration-order 0001–0036 contiguous ✅; root TypeScript ✅; secret scan (tracked) — no key values ✅.
Full Root Jest (223/2958), Website Vitest (102), QA TypeScript, lint, Expo web+Android export are green
on PR #11 (`20d0e03`, the certified 0036 branch) and re-run on this doc-only PR's CI.

## 15. Production Payment Readiness Impact

Reliability of the M-Pesa payment path improved: stale attempts now reach a terminal state
automatically on Production, matching DEV/QA. Production is **not** yet payment-taking-ready — see §16.

## 16. Remaining Live-M-Pesa Blockers

- **Production M-Pesa NOT certified.**
- **No live Daraja credentials** on Production (no `DARAJA_*` / `MPESA_CALLBACK_SECRET`).
- **Live money NOT performed**; no STK/callback exercised on Production.

## 17. Final Status

- **0036 applied to Production.** Schema **36/36**.
- **Production P1 callback-RPC bypass: CLOSED.**
- **Production P2 timeout/reconciliation: CLOSED.**
- **Production M-Pesa: NOT CERTIFIED.** Live Daraja credentials NOT configured. Live money NOT
  performed. Full Platform Certification is NOT claimed.

> **Dependency note:** `0035`/`0036` are not yet on `main` (PRs #9/#11 unmerged). The Production
> rollout used the exact certified migration files from those branches; no divergent duplicate
> migrations were created. This Phase 4D.3 PR is **doc-only**.
