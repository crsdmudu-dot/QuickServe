# Phase 4D.2 — M-Pesa Timeout & Reconciliation Hardening

## 1. Executive Summary

Closes the Phase 4D **P2**: an M-Pesa STK `payment_attempt` could remain `pending` forever if
Daraja never delivered a callback. Migration **0036** adds a terminal **`timed_out`** attempt status,
a **service-role-only** `reconcile_stale_payment_attempts()` function that marks stale pending M-Pesa
attempts `timed_out` **without ever touching `payments`** (no false settlement), and a **pg_cron**
5-minute schedule. The parent payment stays `pending` (customer can retry), and a **late genuine
success callback still settles** (`timed_out` is deliberately not in `apply_mpesa_callback`'s
terminal-idempotency set; settlement stays guarded by `WHERE status='pending'` → at most one). Applied
and certified on **DEV + QA**. **Production untouched** (still 35/35, no 0036). No live M-Pesa; no real
money. Full Platform Certification is NOT claimed.

## 2. Starting Gap

`mpesa-stk-push` inserts a `pending` `payment_attempt`; settlement only happens when Daraja POSTs a
callback to `mpesa-callback` → `apply_mpesa_callback`. If no callback arrives (delivery/network
failure), nothing moved the attempt to a terminal state. There was **no** timeout, reconciliation,
cron, Daraja status-query, or admin recovery for it.

## 3. Current Behavior (proven)

- STK accepted → attempt `pending` → no callback → **stayed pending indefinitely** (no reconciliation existed anywhere; confirmed by source audit + no pg_cron/reconcile helpers).
- Customer retry: already possible — `mpesa-stk-push` gates on `payment.status='pending'` (not on attempt), so a retry creates a new attempt.
- Admin: `src/app/(admin-web)/payment-attempts` already lists attempts; stale ones simply showed `pending`.
- Parent payment stayed `pending`; booking unaffected.

## 4. Chosen Reconciliation Model

**Model A (local timeout) + automatic pg_cron scheduler + existing admin visibility.** Not model B
(Daraja transaction status-query) — unnecessary to prevent indefinite-pending and a larger
integration; not a new job subsystem. The reconcile is authoritative only to mark attempts stale; it
**never settles** — Daraja callback remains the sole settlement authority (`apply_mpesa_callback`,
locked to `service_role` by 0035, unchanged).

## 5. Timeout Policy

- **Window: 5 minutes**, measured from attempt `created_at`.
- Justification: Daraja's on-handset STK prompt times out ~60s; the result callback normally arrives
  within ~1–2 min. 5 min leaves comfortable margin so in-flight transactions are **never** timed out
  prematurely.
- A late callback **after** timeout can still settle (see §10). Customer can retry after timeout.
- Duplicate attempts are inherently prevented from double-settling by the callback's `WHERE
  status='pending'` guard (see §10–§11).
- `reconcile_stale_payment_attempts(p_max_age interval default '5 minutes')` is configurable, enabling
  deterministic QA tests without long waits.

## 6. State Model

- New terminal **`timed_out`** on `payment_attempts.status` (constraint extended in 0036). **Required**
  — reusing `failed`/`cancelled` would place stale attempts in `apply_mpesa_callback`'s terminal guard
  and wrongly block a late genuine settlement. Proven no existing equivalent works.
- `payments.status` is **unchanged** by reconciliation — it stays `pending`, so the customer can retry.
- `AttemptStatus` TS type + `AttemptStatusBadge` updated to include `timed_out` (label "Timed out").

## 7. Database / Function Changes (migration 0036)

- `payment_attempts_status_check` extended with `'timed_out'`.
- Index `payment_attempts_status_created_at_idx (status, created_at)` for the stale scan.
- `reconcile_stale_payment_attempts(interval)` `SECURITY DEFINER`: sets `status='timed_out'` where
  `provider='mpesa' AND status IN ('initiated','pending') AND callback_received_at IS NULL AND
  created_at < now() - p_max_age`; returns the row count. **No `UPDATE public.payments`.**
- EXECUTE revoked from `public, anon, authenticated`; granted only to `service_role` (same posture as
  0035). Historical 0012/0035 untouched; no RLS weakened.

## 8. Scheduler / Execution Mechanism

**pg_cron** (Supabase-native, free): `create extension if not exists pg_cron` + `cron.schedule
('mpesa-reconcile-stale-attempts', '*/5 * * * *', 'select reconcile_stale_payment_attempts(...)')`.
Applied cleanly on DEV and QA (no permission error). No external queue/Redis/third-party scheduler/paid
service was added.

## 9. Customer Retry

Certified: after an attempt is timed out, the payment stays `pending`, so a new attempt can be created
(one payment, multiple attempts), old attempt remains auditable, amount stays server-derived. No
duplicate payment row; only one settlement can win.

## 10. Late Callback Race

Certified (DEV + QA): attempt aged to `timed_out`, then a late **success** callback for that same
`checkout_request_id` → `apply_mpesa_callback` proceeds (`timed_out` not in its terminal guard) → sets
the attempt `successful` and settles the payment **only** via `UPDATE payments … WHERE
status='pending'`. Rule: **first valid successful settlement wins; later successes no-op** (guard
matches 0 rows). Replay of the same success callback left the payment `paid` once (idempotent).

## 11. Concurrent Attempts

Certified: with a `timed_out` attempt + a fresh `pending` retry on the same payment, a success callback
for one settles the payment once and **cancels the sibling pending attempt** (`WHERE status IN
('initiated','pending')`). Net: one logical payment, one `paid` transition, no double earning, consistent state.

## 12. Failure Paths

Certified: recent (< window) attempts are **not** timed out; genuine failure/duplicate/malformed
callbacks behave as in Phase 4D (payment stays `pending`, attempt `failed`, no crash). Reconcile never
settles, so it cannot produce a false `paid`.

## 13. Admin / Operator Recovery

No new admin UI was needed: the existing `payment-attempts` admin screen now surfaces `timed_out`
(badge added). Automatic recovery is the pg_cron job; a service-role operator/edge can also call
`reconcile_stale_payment_attempts()` on demand. No admin "mark paid" was added (settlement stays
Daraja-authoritative). Scope kept minimal.

## 14. Authorization

Certified (DEV + QA): `reconcile_stale_payment_attempts` — anon **401**, authenticated **403**,
`service_role` **200**. `apply_mpesa_callback` remains locked (anon **401**). Reconcile takes no
amount (no tampering surface); customer/provider cannot reconcile; anonymous cannot trigger it;
service-role-only DB mutation intact. No bypass.

## 15. Logging / Observability

Reconciliation is auditable through DB state: the `payment_attempts` row transitions to `timed_out`
(status + existing timestamps), the RPC returns the affected count, and pg_cron records run history.
No secrets/PII are logged.

## 16. QA Certification

Connected on QA (persistent QA customer), deterministic via `created_at` backdating + configurable
`p_max_age`, marker `QA-P4D2-RECON-<ts>`:

| Check | Result |
|---|---|
| Stale attempt → `timed_out`, payment stays `pending` | ✅ |
| Recent attempt not timed out | ✅ |
| Retry allowed (one payment, new attempt) | ✅ |
| Late success callback still settles | ✅ |
| Concurrent sibling cancelled (one settlement) | ✅ |
| Duplicate callback idempotent | ✅ |
| Reconcile authz (anon 401 / auth 403 / service_role 200) | ✅ |
| `apply_mpesa_callback` still locked | ✅ |

Same suite passed on DEV (disposable user).

## 17. Cleanup

All `QA-P4D2-*` fixtures deleted; residual bookings/payments/attempts = **0** on QA and DEV; disposable
DEV user deleted; temp credential files = 0. QA sandbox secrets + Edge Functions preserved.

## 18. Validation

Root Jest **223 / 2958**, Website Vitest **7 / 102**, root & QA TypeScript ✅, lint unchanged (59
pre-existing errors, no new), Expo web + Android export ✅, migration-order **0001–0036 contiguous** ✅,
secret scan clean ✅. New offline test `src/__tests__/mpesa-reconciliation.test.ts` (7/7) fails on the
pre-fix baseline (0036 absent) and passes after; connected spec `qa/web-journeys/
mpesa-reconciliation-authz.spec.ts` added.

## 19. Production Preservation

Production read-only: schema **35/35**, **no 0036 applied**, Edge Functions unchanged (4× v2), no
Production payment invoked/mutated. **Production untouched this phase.**

## 20. Findings

- **P2 (timeout/reconciliation): CLOSED on DEV + QA.** Attempts can no longer remain indefinitely
  pending; safe timeout + automatic reconciliation + retry + late-callback safety are certified.
- No new P0/P1 introduced (authorization preserved; no false settlement path).

## 21. Production Rollout Requirement

`0036` is **NOT** applied to Production in this phase. **Production still lacks the timeout/
reconciliation until 0036 is applied there in a separate, explicitly-approved production
migration-alignment step.** (Also depends on PR #9's `0035`, brought into this branch as a dependency
— see below.)

> **Dependency note:** `0035` is not yet on `main` (it lives on PR #9). To keep the migration sequence
> coherent for `0036`, the exact certified `0035` file is included on this branch. It is identical to
> PR #9's copy; merging both is a no-op for that file.

## 22. Final Status

**P2 CLOSED on DEV + QA.** Smallest safe model: local 5-minute timeout + service-role reconcile
(no settlement) + pg_cron, with late-callback and concurrent-attempt safety proven. Production
untouched (35/35, no 0036) — production rollout pending explicit approval. Live M-Pesa remains NOT
certified; no real money. Full Platform Certification is NOT claimed.
