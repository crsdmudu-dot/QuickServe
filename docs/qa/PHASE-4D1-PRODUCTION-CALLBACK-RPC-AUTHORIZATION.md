# Phase 4D.1 — Production Callback-RPC Authorization Fix

## 1. Executive Summary

Migration **0035** (`0035_lock_apply_mpesa_callback_grants.sql`) was applied to **Production only**,
closing the Phase 4D **P1**: `public.apply_mpesa_callback` was directly executable by anon/authenticated
via the default `PUBLIC` grant (migration 0012 revoked EXECUTE from anon/authenticated but not from
`PUBLIC`), allowing a direct PostgREST RPC to settle a payment and bypass the `mpesa-callback` token
gate. After 0035, anon is **denied** and `service_role` **retains** EXECUTE. No Production data was
mutated; no payment was created or settled; no Edge Function or secret changed; no live M-Pesa
activity. Full Platform Certification is NOT claimed.

> **Dependency:** the migration file `0035…` is not on `main` yet — it lives on branch
> `qa/phase-4d-mpesa-sandbox` / **PR #9** (QA-certified). This phase applied that exact certified file
> to Production (`db push` from the `qa/phase-4d` working tree) and records this document on a separate
> doc-only branch. This report does **not** duplicate the migration.

## 2. Proven Production Vulnerable State (pre-0035)

Safe, **zero-mutation** grant probe: an anonymous `POST /rest/v1/rpc/apply_mpesa_callback` with a
**nonexistent** `checkout_request_id` (so the function no-ops) returned **HTTP 204** — proving anon
(via `PUBLIC`) held EXECUTE. Production `payments` count was `0` before and after (no mutation). No real
payment was settled.

## 3. Migration 0035 Content

```sql
revoke execute on function public.apply_mpesa_callback(text, text, int, text, jsonb) from public;
revoke execute on function public.apply_mpesa_callback(text, text, int, text, jsonb) from anon;
revoke execute on function public.apply_mpesa_callback(text, text, int, text, jsonb) from authenticated;
grant  execute on function public.apply_mpesa_callback(text, text, int, text, jsonb) to service_role;
```
Reviewed: **revoke/grant only** — no data, table, policy, or unrelated function changes (no
DROP/ALTER/INSERT/UPDATE/DELETE/CREATE).

## 4. Backup Confirmation

User **explicitly confirmed** a recent, successful, recoverable Production backup with an acceptable
timestamp **before** the write. No PITR/add-ons enabled.

## 5. Production Apply Result

- Target verified = `lkigkltvstlxfdztffds` (Production) immediately before the write.
- Pre-check: remote history **0001–0034**, local **0001–0035**, pending = **exactly 1 (0035)**, no remote-only.
- `supabase db push --linked`: **Start 2026-08-08T09:55:56Z → End 09:56:06Z**, applied
  `0035_lock_apply_mpesa_callback_grants.sql`, **exit 0**. No reset/repair/force/manual SQL/history edits.
- Post: Production migration history **35/35 aligned, 0 pending**.

## 6. Grant State — Before → After (zero-mutation probes)

| Role | Before (pre-0035) | After (post-0035) |
|---|---|---|
| anon (direct REST RPC) | HTTP 204 (executed via PUBLIC) — **vulnerable** | **HTTP 401 — DENIED** |
| authenticated | (member of PUBLIC → executable) | **denied** — behavioral probe intentionally skipped to avoid creating a disposable Production user; established by the 0035 grant + DEV/QA connected proof (authenticated → 403) |
| service_role | executes | **HTTP 204 — retains EXECUTE** (no-op, nonexistent checkout) |

The exact signature `public.apply_mpesa_callback(text, text, int, text, jsonb)` is confirmed by the
successful `REVOKE`/`GRANT` (which target that signature).

## 7. service_role Preservation

`service_role` retains EXECUTE (post-0035 probe → 204), so the legitimate `mpesa-callback` Edge
Function (which uses the service-role client after its own token gate) continues to settle callbacks.
The DEV/QA connected certification (Phase 4D) proved the end-to-end legit path still works after 0035.

## 8. No Production Payment Mutation

- `payments` count **0 → 0**; `bookings` count **1 → 1** (unchanged across the whole operation).
- No payment created, none settled, no booking changed. All probes used nonexistent `checkout_request_id`
  values (guaranteed no-ops) and the anon post-probe was denied before any function body ran.

## 9. Production Schema / Preservation

- Schema now **35/35** aligned.
- Edge Functions unchanged: `mpesa-stk-push`, `mpesa-callback`, `register-device`, `send-push` (all **v2**).
- Secrets unchanged: **9**, no `DARAJA_*`, no `MPESA_CALLBACK_SECRET`.
- No Production function invoked for payment processing; no live STK/callback; no money.

## 10. Environment Isolation

DEV `gzkvna…`, QA `wjvju…`, Production `lkigk…` — all distinct and ACTIVE_HEALTHY; CLI unlinked after
the operation. No cross-environment config change.

## 11. Repository Validation

Migration-order 0001–0035 contiguous ✅; root TypeScript ✅; secret scan (tracked) — no key values ✅.
Full Jest (223/2955), Website Vitest (102), QA TypeScript, lint, Expo web+Android export are green on
PR #9 (`b23b5ed`, code unchanged) and re-run on this doc-only PR's CI.

## 12. Security Status

- **P1 — apply_mpesa_callback anon bypass: CLOSED on Production** (anon → 401; service_role retained).
- Now closed on **all three** environments (DEV, QA, Production).

## 13. Remaining Payment Blockers

- **Live M-Pesa NOT certified** — only sandbox (QA) was certified in Phase 4D.
- **No Production Daraja secrets** — Production still has no `DARAJA_*` / `MPESA_CALLBACK_SECRET`; live
  M-Pesa is not configured (by design; not part of this phase).
- **P2 — no STK timeout/reconciliation** — STK-accepted-but-no-callback leaves `payment_attempt`
  pending indefinitely; no timeout/reconciliation/admin recovery. Still OPEN.

## 14. Final Status

**Production callback-RPC authorization bypass (P1): CLOSED.** Production schema 35/35; data unchanged;
Edge Functions and secrets unchanged; no payment created/settled; no live M-Pesa; no real money.
Live M-Pesa remains NOT certified; P2 timeout/reconciliation remains OPEN. Full Platform Certification
is NOT claimed.
