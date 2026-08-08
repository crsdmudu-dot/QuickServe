# Phase 4D — M-Pesa Sandbox Certification

## 1. Executive Summary

QuickServe's existing M-Pesa implementation was certified against the **Safaricom Daraja SANDBOX**
on **QA only**. STK Push initiation, genuine Daraja callback delivery, the success payment lifecycle,
duplicate-callback idempotency, failure handling, and authorization were exercised end-to-end. A **P1
authorization defect** was found and fixed: the `apply_mpesa_callback` RPC was callable by
anon/authenticated (bypassing the callback token gate and settling payments), because migration 0012
never revoked the default `PUBLIC` execute grant. A minimal forward migration (**0035**) locks the
RPC to `service_role`; it was applied to **DEV + QA** and re-verified. **Production was not touched and
remains vulnerable until 0035 is applied in a separate, explicitly-approved Production step.** No real
money moved; live M-Pesa is NOT certified. Full Platform Certification is NOT claimed.

## 2. Starting Baseline

- Branch `qa/phase-4d-mpesa-sandbox` from `origin/main` `8e355d8`.
- QA `wjvju…` (0 Edge Functions at start), Production `lkigk…` (4 Edge Functions v2), DEV `gzkvna…`.
- Supabase CLI 2.110.0. `.env`→DEV, `qa/.env`→QA, `.env.backup`→PROD (inactive).

## 3. QA Deployment

Deployed **only** `mpesa-stk-push` (verify_jwt=true) and `mpesa-callback` (verify_jwt=false) to QA,
with their compile-time `_shared/daraja.ts` + `_shared/daraja-client.ts`. No other functions deployed.
Both **v1 ACTIVE**. Production Edge Functions untouched.

## 4. Daraja Credential Diagnosis

Sandbox STK initially failed (`ResponseCode ≠ 0`). Direct-to-Daraja diagnosis: **OAuth PASS**; **STK
PASS** with the user's current simulator values. Digest comparison of the QA secrets vs the
proven-correct values showed **only `DARAJA_PASSKEY` was stale** (classification B). Corrected that one
QA secret (via `--env-file`, name-verified); the deployed function then initiated STK successfully.

## 5. OAuth Certification

Direct sandbox OAuth (`/oauth/v1/generate`) → HTTP 200, access token returned. **PASS.**

## 6. STK Certification

Deployed `mpesa-stk-push` via the authenticated customer path → `ok:true`, real sandbox
`CheckoutRequestID` (`ws_CO_…`), exactly **one** `payment_attempts` row (`pending`, `MerchantRequestID`
+ `CheckoutRequestID` stored), server-derived amount, no duplicates, no Production invocation. **PASS.**

## 7. Callback Delivery

**Genuine Daraja-delivered callback (classification A).** After a real sandbox STK, Daraja POSTed to
`https://wjvju….supabase.co/functions/v1/mpesa-callback` (@~15 s): the sandbox test MSISDN returned
`ResultCode 1037` ("DS timeout user cannot be reached"), `callback_received_at` was set, attempt →
`failed`, and the payment correctly stayed `pending`. The **success** lifecycle used a **controlled
SIMULATED callback** (labeled) because the sandbox test number does not auto-succeed.

## 8. Callback Authentication

- No token → **401**; wrong token → **401**; correct token + unknown checkout → **200 no-op**.
- Constant-time token comparison per implementation; rejects when the secret is unset. **PASS.**

## 9. Success Lifecycle

SIMULATED success callback (ResultCode 0) on a seeded pending attempt: payment `pending → paid`,
`paid_at` set, attempt → `successful`, exactly one attempt, amount server-authoritative, no unrelated
payment affected. **PASS** (before→after captured; no PII).

## 10. Idempotency

Replaying the same success callback: payment stays `paid`, still **one** attempt, no second
settlement, no duplicated earning (structurally guaranteed by the RPC's `UPDATE payments … WHERE
status='pending'` guard). **PASS.**

## 11. Failure Paths

- **Genuine** Daraja `1037` (timeout) → attempt `failed`, payment `pending`.
- Simulated `1032` (cancelled by user) → attempt `failed`, payment `pending`.
- Malformed callback (correct token, no `stkCallback`) → HTTP 200, no crash, no state change.
- Unknown `CheckoutRequestID` → no-op. Callback correlates strictly by `CheckoutRequestID`, so it
  cannot mutate an unrelated payment. **PASS.**

## 12. Timeout / Reconciliation

**Finding P2:** STK accepted but no callback ⇒ the `payment_attempt` stays `pending` **indefinitely**.
There is **no timeout job, no reconciliation, and no admin/manual recovery path**. Not implemented in
this phase (would be a subsystem). Needed before scale; pilots can reconcile manually.

## 13. Authorization

- Anonymous `mpesa-stk-push` → **401**.
- Non-owner paying another customer's payment → **"Payment is not payable"** (RLS), owner payment
  untouched, no attempt created.
- Client-supplied `amount` (99999) ignored → attempt amount = server value (10).
- **P1 (found + fixed):** `apply_mpesa_callback` was callable by anon/authenticated (see §18). After
  0035: anon RPC → **401**, authenticated RPC → **403**, **no** payment settled via the REST RPC path;
  the legitimate `mpesa-callback` (service-role) path still settles. **PASS post-0035.**

## 14. Logging / Secret Hygiene

The CLI exposes no Edge-Function log command, so runtime logs were not fetchable. By **code
inspection**: neither `mpesa-stk-push` nor `mpesa-callback` logs secrets — no consumer key/secret,
passkey, OAuth token, STK password, callback secret, service-role key, DB password, or full auth token
is written; errors are generic. Reported transaction identifiers are shortened/redacted. **PASS (by
code audit; runtime-log inspection unavailable via CLI).**

## 15. Cleanup

All disposable fixtures removed by marker (`QA-P4D-*`): residual bookings/payments/attempts = **0**. A
disposable attacker auth user was created and deleted. Persistent QA accounts, service catalogue,
Edge Function deployments, and the (corrected) QA Daraja secrets were preserved.

## 16. Regression Validation

| Gate | Result |
|---|---|
| New grant regression test (`src/__tests__/mpesa-callback-grants.test.ts`) | ✅ 4/4 |
| Root Jest (full) | ✅ 223 suites / 2955 tests |
| Website Vitest | ✅ 7 / 102 |
| Root TypeScript / QA TypeScript | ✅ / ✅ |
| Lint | 59 pre-existing errors (no new); non-gating |
| Expo web export / Android export | ✅ / ✅ |
| Migration-order (0001–0035 contiguous) | ✅ |
| Secret scan (tracked) | ✅ only variable-name references; no values |
| Connected QA authz spec (`qa/web-journeys/mpesa-callback-authz.spec.ts`) | added (connected; not PR CI) |

## 17. Production Preservation

- Edge Functions unchanged: `mpesa-stk-push`, `mpesa-callback`, `register-device`, `send-push` (all **v2**).
- Secrets unchanged: **9**, no `DARAJA_*`, no `MPESA_CALLBACK_SECRET`.
- Schema remains **34/34** (Phase 4C); **0035 NOT applied** to Production. No Production link/push/invocation/mutation.

## 18. Findings

- **P1 — `apply_mpesa_callback` RPC callable by anon/authenticated (FIXED on DEV+QA).**
  *Evidence:* an anon `POST /rest/v1/rpc/apply_mpesa_callback {p_result_code:0}` moved a QA payment
  `pending → paid`. *Root cause:* 0012 revoked EXECUTE from anon/authenticated but not from `PUBLIC`.
  *Fix:* migration **0035** revokes from `public, anon, authenticated` and grants only to `service_role`.
  *Required before live payment:* YES. *Production status:* **still vulnerable until 0035 applied there.**
- **P2 — No STK timeout/reconciliation** (attempts pending indefinitely on missing callback). *Fix
  before scale;* manual reconciliation acceptable for a small pilot.
- **P3 — No Edge-Function runtime log access via CLI** for automated secret-hygiene inspection (code
  audit used instead).

## 19. Payment-Taking Pilot Readiness

On **QA sandbox**, the full initiate→callback→settle→idempotency→failure→authorization flow is
certified **after the 0035 fix**. **Not** pilot-ready for real money until: (a) 0035 applied to
Production; (b) live Daraja credentials + go-live approval; (c) a timeout/reconciliation story (P2).

## 20. Remaining Live-M-Pesa Requirements

- Apply **0035 to Production** (separate approved migration-alignment step).
- Configure **Production** Daraja **live** credentials + `MPESA_CALLBACK_SECRET` + callback URL (not done).
- Go-live (production shortcode, Safaricom approval), reconciliation/timeout, real end-to-end test with a real device/amount under controlled conditions.

## 21. Final Status

**QA SANDBOX: certified** (STK, genuine callback delivery, success lifecycle [simulated success],
idempotency, failure, authorization) **after the P1 fix (migration 0035 on DEV+QA).**
**Production M-Pesa: NOT certified. Production remains vulnerable to the grant bug until 0035 is
applied there (not done in this phase). Live money: NOT performed.** Full Platform Certification is NOT
claimed.

### Certification ledger
| Item | Result |
|---|---|
| QA payment DB-state | PASS |
| QA `mpesa-stk-push` deployment | PASS |
| Daraja OAuth | PASS |
| Daraja sandbox STK initiation | PASS |
| Genuine Daraja callback delivery | PASS (real 1037 failure callback) |
| Controlled simulated callback | PASS (success path) |
| Successful payment lifecycle | PASS |
| Duplicate-callback idempotency | PASS |
| Failure callback handling | PASS |
| Authorization | PASS (post-0035) |
| Logging / secret hygiene | PASS (code audit; runtime logs unavailable via CLI) |
| Cleanup | PASS (0 residual) |
| Production M-Pesa | NOT CERTIFIED |
| Production migration 0035 | NOT APPLIED |
| Live money movement | NOT PERFORMED |
