# Slice 13 — M-Pesa Daraja Live Integration (Design Spec)

**Date:** 2026-06-24
**Status:** Approved design → implementation plan
**Builds on:** Slice 12 (payment_attempts, initiate→confirm flow, paid→earning trigger).
**Philosophy unchanged:** Customer initiates an attempt; payment stays `pending`; a **Daraja callback** (ResultCode 0) **or** admin confirmation marks it `paid`; the Slice 11 earnings trigger runs only on the paid transition.

---

## 1. Goal

Connect QuickServe payment attempts to real Safaricom **Daraja STK Push** through a backend-only layer. Daraja credentials live ONLY as Supabase secrets — never in the mobile app, never in git. A server-side `MPESA_MODE` switch keeps the app fully usable without credentials.

### Out of scope
Card live integration, refunds, taxes, automated provider payouts, production go-live cutover (sandbox is the target; live works once production secrets are set), realtime push of status to the client.

---

## 2. Architecture

Two **Supabase Edge Functions** (Deno) + a small DB extension + thin client rewiring.

- **`mpesa-stk-push`** (authenticated, `verify_jwt = true`) — the app invokes it with the user's JWT. It (a) verifies via a user-scoped Supabase client that the `payment` is the caller's, is `pending`, and its booking is `completed`; (b) per `MPESA_MODE` produces an STK result — `mock` synthesizes one, `sandbox`/`live` does Daraja OAuth + STK Push POST; (c) inserts the `payment_attempts` row (service-role) with `provider='mpesa'`, phone, `merchant_request_id`, `checkout_request_id`, `status='pending'`, `raw_response`; (d) returns `{ ok, checkoutRequestId, status }`. **It never sets the payment paid.**
- **`mpesa-callback`** (public, `verify_jwt = false`) — Daraja POSTs the STK result here. It validates a shared-secret URL token, parses the callback, and calls the DB function `apply_mpesa_callback(...)` (service-role). On `ResultCode = 0` the attempt → `successful` and the payment → `paid` (+ method), firing the earnings trigger; otherwise the attempt → `failed`. Always returns HTTP 200 with the Daraja-expected ack body.

`MPESA_MODE ∈ {mock, sandbox, live}` lives only on the server. The client calls the function identically in all modes.

---

## 3. Security Model

- **No Daraja credentials in the app or git.** All secrets are Supabase Edge Function secrets (`supabase secrets set …`), read via `Deno.env.get`. A `.env.example` documents the NAMES only.
- **Customer auth:** `mpesa-stk-push` requires the user JWT (`verify_jwt = true`) and re-checks payment ownership with a user-scoped client before any Daraja call.
- **Callback auth:** the callback URL embeds a high-entropy secret (`MPESA_CALLBACK_SECRET`, e.g. `/mpesa-callback?token=…` or a secret path segment); requests without the correct token are rejected. The handler also matches the `checkout_request_id` to an existing pending attempt; unknown ids are acked with no state change. (Safaricom IP allowlist noted as future hardening.)
- **Service role** key (`SUPABASE_SERVICE_ROLE_KEY`) is used only inside the Edge Functions to write attempts/payments; it is a secret, never shipped to the app.
- `apply_mpesa_callback` is `SECURITY DEFINER` with `EXECUTE` revoked from `anon`/`authenticated` (callable only by service role).
- Customers still cannot set a payment `paid` (Slice 12 guarantee intact); only the callback path or admin confirm does.

---

## 4. Database — migration `0012_mpesa_callback.sql`

Mirrors the `0010`/`0011` pattern.

### 4.1 Extend `payment_attempts` (ALTER, all nullable)
```sql
alter table public.payment_attempts
  add column if not exists merchant_request_id  text,
  add column if not exists checkout_request_id  text,
  add column if not exists result_code          int,
  add column if not exists result_desc          text,
  add column if not exists callback_received_at  timestamptz;
create index if not exists payment_attempts_checkout_request_id_idx
  on public.payment_attempts (checkout_request_id);
```

### 4.2 `apply_mpesa_callback(...)` (SECURITY DEFINER, service-role only)
```
apply_mpesa_callback(p_checkout_request_id text, p_merchant_request_id text,
                     p_result_code int, p_result_desc text, p_raw jsonb) returns void
```
- Find the attempt by `checkout_request_id`; if none, return (no-op).
- If the attempt is already terminal (`successful`/`failed`/`cancelled`), record nothing further and return (idempotent).
- Record `merchant_request_id` (if null), `result_code`, `result_desc`, `callback_received_at=now()`, `raw_response=p_raw`.
- If `p_result_code = 0`: set attempt `status='successful'`; if its payment is `pending`, set `status='paid'`, `paid_at=now()`, `payment_method='mpesa'` (fires `trg_create_earning_on_paid`); cancel sibling open attempts. Else: set attempt `status='failed'` (payment untouched).
- `revoke execute … from anon, authenticated;`

Admin `confirm_payment_attempt` / `cancel_payment_attempt` (Slice 12) remain the manual fallback, unchanged.

---

## 5. Edge Functions

Layout under `supabase/functions/`:
- **`_shared/daraja.ts`** — PURE helpers, no Deno APIs (Jest-testable): `darajaTimestamp(date)`, `buildStkPassword(shortcode, passkey, ts)`, `buildStkPushPayload(params)`, `parseStkCallback(body)` (→ `{ merchantRequestId, checkoutRequestId, resultCode, resultDesc }`), `mockStkResult(params)`, `isMsisdn(phone)`.
- **`_shared/daraja-client.ts`** — Deno-only: `getOAuthToken()` (Basic-auth, in-memory cache), `stkPush(token, payload)` (fetch). Not Jest-tested.
- **`mpesa-stk-push/index.ts`** — Deno.serve glue: auth + ownership check, mode switch (mock vs `_shared/daraja-client`), service-role insert of the attempt.
- **`mpesa-callback/index.ts`** — Deno.serve glue: token check, `parseStkCallback`, `apply_mpesa_callback` RPC via service role, 200 ack.

---

## 6. Client Changes

- **`src/lib/attempts.ts` `initiateMpesaPayment`** — keep the up-front phone validation/normalization; REPLACE the `initiate_payment_attempt` RPC + `initiateStkPushMock` call with `supabase.functions.invoke('mpesa-stk-push', { body: { payment_id, phone: normalized } })`. Map a non-2xx / `{ ok:false }` response to a friendly error.
- **`src/lib/mpesa.ts`** — REMOVE `initiateStkPushMock` (the mock now lives server-side in the Edge Function); KEEP `normalizeKenyanPhone`/`isValidKenyanPhone`. Update `mpesa.test.ts` accordingly.
- **`PaymentAttempt` type** — add `merchant_request_id`, `checkout_request_id`, `result_code`, `result_desc`, `callback_received_at` (all nullable).
- **Admin attempts screen** (`src/app/admin/payment-attempts.tsx`) — show the Daraja refs when present: `checkout_request_id`, `result_code · result_desc`, and callback time. Manual Confirm/Cancel unchanged.
- **Customer booking detail** — behavior unchanged (Pay with M-Pesa → pending → status). Status reflects the callback on next screen load/refresh; no realtime this slice.
- The `initiate_payment_attempt` RPC (Slice 12) is left in place for future cash/card use; the M-Pesa path no longer calls it.

---

## 7. Config & Secrets

- **`supabase/config.toml`** — declare both functions; `[functions.mpesa-stk-push] verify_jwt = true`, `[functions.mpesa-callback] verify_jwt = false`.
- **Required Edge Function secrets** (names only; documented in `.env.example` / a README note, values never committed): `MPESA_MODE`, `DARAJA_BASE_URL`, `DARAJA_CONSUMER_KEY`, `DARAJA_CONSUMER_SECRET`, `DARAJA_SHORTCODE`, `DARAJA_PASSKEY`, `DARAJA_CALLBACK_URL`, `MPESA_CALLBACK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- In `mock` mode none of the Daraja secrets are required — the app stays usable with zero credentials.

---

## 8. Data Flow (success, sandbox)

1. Customer taps Pay with M-Pesa → app validates phone → `functions.invoke('mpesa-stk-push', { payment_id, phone })`.
2. Function verifies ownership → OAuth token → STK Push → inserts attempt (`pending`, checkout/merchant ids). Returns `{ ok, checkoutRequestId }`.
3. Customer sees `pending`; Safaricom prompts the phone for the PIN.
4. Daraja POSTs the result to `mpesa-callback?token=…`.
5. Callback validates token → `apply_mpesa_callback` → on ResultCode 0: attempt `successful`, payment `paid` (+method), earnings row created; siblings cancelled.
6. App shows `paid`/`successful` on next load. Admin confirm remains a manual fallback if a callback never arrives.

---

## 9. Testing

- **Jest unit tests for `_shared/daraja.ts`**: timestamp format `YYYYMMDDHHmmss`; `buildStkPassword` base64 = `base64(shortcode+passkey+ts)`; `buildStkPushPayload` shape (amount integer, PhoneNumber, CallBackURL, etc.); `parseStkCallback` for success (ResultCode 0 + metadata), failure (non-zero), and malformed bodies; `mockStkResult` returns a pending result with a `MOCK-`/`ws_CO_`-style checkout id. (The test imports the shared module directly; ensure Jest can resolve `supabase/functions/_shared/` — add to `roots`/`testMatch` if needed.)
- **`attempts.test.ts`**: `initiateMpesaPayment` rejects an invalid phone with NO `functions.invoke` call; on valid phone asserts `supabase.functions.invoke` called with `'mpesa-stk-push'` and body `{ payment_id, phone: '254…' }`; maps function error → friendly string. (`supabase.functions.invoke` is mocked.)
- **`mpesa.test.ts`**: drop `initiateStkPushMock` cases; keep phone-helper cases.
- **No live Daraja calls in any test.** Edge Function glue (`index.ts`, `daraja-client.ts`) is verified manually against sandbox, documented in `docs/superpowers/verification/slice-13-daraja.md`.
- Merge gate: `npm test` green, `npx tsc --noEmit` clean, Android bundle exports.

---

## 10. Guardrails / Invariants

- Zero Daraja credentials in app code, test code, or git; all via Supabase secrets.
- Tests never hit the Daraja network.
- `mock` mode keeps the app fully functional without any Daraja secret.
- Customer cannot set a payment `paid`; only the callback path (`apply_mpesa_callback`) or admin confirm does.
- Earnings still created solely by the Slice 11 paid-transition trigger.
- `apply_mpesa_callback` is idempotent and service-role-only; the callback endpoint is secret-gated and always returns 200.
- `mpesa-stk-push` re-verifies payment ownership server-side before any Daraja call.

---

## 11. Deliverables

1. `supabase/migrations/0012_mpesa_callback.sql` (columns + index + `apply_mpesa_callback` + exec grants).
2. `supabase/functions/_shared/daraja.ts` (+ Jest tests) and `_shared/daraja-client.ts`.
3. `supabase/functions/mpesa-stk-push/index.ts`, `supabase/functions/mpesa-callback/index.ts`.
4. `supabase/config.toml` (verify_jwt per function).
5. `src/lib/attempts.ts` rewired to `functions.invoke`; `src/lib/mpesa.ts` trimmed; `PaymentAttempt` new fields; tests updated.
6. `src/app/admin/payment-attempts.tsx` shows Daraja refs.
7. `.env.example` secret-name documentation; `docs/superpowers/verification/slice-13-daraja.md` (sandbox manual verification + secret-setup commands).
