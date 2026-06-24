# Slice 13 — M-Pesa Daraja Live: Operator & Verification Guide

## Required Supabase Secrets

Set these via `supabase secrets set KEY=VALUE …` before deploying to sandbox or live.
**NEVER commit real values to source control.**

| Secret | Description |
|---|---|
| `MPESA_MODE` | `mock` (default), `sandbox`, or `live`. Controls which code path runs server-side. |
| `DARAJA_BASE_URL` | Daraja base URL. Sandbox: `https://sandbox.safaricom.co.ke`. Live: `https://api.safaricom.co.ke`. |
| `DARAJA_CONSUMER_KEY` | Consumer Key from the Safaricom developer portal. |
| `DARAJA_CONSUMER_SECRET` | Consumer Secret from the Safaricom developer portal. |
| `DARAJA_SHORTCODE` | Business Short Code (paybill or till number). |
| `DARAJA_PASSKEY` | Lipa Na M-Pesa Online passkey. |
| `DARAJA_CALLBACK_URL` | Public HTTPS URL that Daraja POSTs the STK result to. **Must** include `?token=<MPESA_CALLBACK_SECRET>` so the callback is authenticated. Example: `https://<project-ref>.supabase.co/functions/v1/mpesa-callback?token=<MPESA_CALLBACK_SECRET>` |
| `MPESA_CALLBACK_SECRET` | High-entropy shared secret appended to the callback URL. Used by `mpesa-callback` to reject unauthorized POSTs. |

> **Auto-provided by the Edge runtime — do NOT set manually:**
> `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
> They are injected automatically into every Edge Function.

---

## Deploy Commands

### 1. Set secrets (replace placeholders with real values)

```bash
supabase secrets set \
  MPESA_MODE=sandbox \
  DARAJA_BASE_URL=https://sandbox.safaricom.co.ke \
  DARAJA_CONSUMER_KEY=<your-consumer-key> \
  DARAJA_CONSUMER_SECRET=<your-consumer-secret> \
  DARAJA_SHORTCODE=<your-shortcode> \
  DARAJA_PASSKEY=<your-passkey> \
  DARAJA_CALLBACK_URL=https://<project-ref>.supabase.co/functions/v1/mpesa-callback?token=<mpesa-callback-secret> \
  MPESA_CALLBACK_SECRET=<mpesa-callback-secret>
```

### 2. Deploy both functions

```bash
supabase functions deploy mpesa-stk-push mpesa-callback
```

### JWT verification (config.toml)

`verify_jwt` is configured **per-function** in `supabase/config.toml`:

| Function | `verify_jwt` | Reason |
|---|---|---|
| `mpesa-stk-push` | `true` | Caller must supply a valid Supabase user JWT — confirms the customer is authenticated. |
| `mpesa-callback` | `false` | Daraja cannot supply a Supabase JWT; authentication is handled via the `?token=` secret instead. |

---

## MPESA_MODE Explained

| Value | Behaviour |
|---|---|
| `mock` | No Daraja secrets required. The function returns a synthetic `checkoutRequestId` immediately. The app is fully usable for development and UI testing. |
| `sandbox` | Hits the real Daraja sandbox (`sandbox.safaricom.co.ke`). Requires all Daraja secrets. Use Safaricom's test MSISDNs. |
| `live` | Hits the production Daraja API (`api.safaricom.co.ke`). Requires all Daraja secrets. Real money is moved. |

The mode is **server-side only**. The React Native client is completely mode-agnostic — it calls `mpesa-stk-push` and polls the result regardless of mode.

---

## Daraja Sandbox Checklist

Run these 7 checks against the sandbox or a local Supabase dev environment before going live.

1. **Mock-mode attempt created pending**
   Set `MPESA_MODE=mock`, call `mpesa-stk-push` with a valid `payment_id` and phone. Expect `{ ok: true, checkoutRequestId, status: 'pending' }` and a new `payment_attempts` row with `status = 'pending'`.

2. **Sandbox STK prompt on test MSISDN**
   Set `MPESA_MODE=sandbox`, use Safaricom's sandbox test MSISDN. Call `mpesa-stk-push`. Expect a real STK PIN prompt on the test device and `{ ok: true, checkoutRequestId }`.

3. **Successful callback — full happy path**
   After completing the PIN prompt (or simulating a callback with `ResultCode = 0` and the correct token), verify all of the following atomically:
   - The `payment_attempts` row status is `successful`.
   - The parent `payments` row has `status = 'paid'`, `payment_method = 'mpesa'`, and a non-null `paid_at`.
   - Exactly **one** `provider_earnings` row exists for the booking (created by the `trg_create_earning_on_paid` trigger on `public.payments`).
   - Any sibling `payment_attempts` rows for the same `payment_id` that were `initiated` or `pending` are now `cancelled`.

4. **Non-zero ResultCode — failure path**
   POST a callback with `ResultCode = 1032` (user cancelled) and the correct token. Verify:
   - The `payment_attempts` row status is `failed`.
   - The parent `payments` row remains `pending` (untouched).

5. **Wrong or missing token — unauthorized**
   POST a callback with a wrong/absent `?token=`. Expect HTTP `401 Unauthorized` and no database change.

6. **Replayed callback (same `CheckoutRequestID`) — idempotent**
   POST the same successful callback a second time. Expect HTTP `200` acknowledgment and **no database change** (the `apply_mpesa_callback` function returns early because the attempt is already in a terminal state).

7. **Unknown `CheckoutRequestID` — no-op**
   POST a callback with a `CheckoutRequestID` that does not exist in `payment_attempts`. Expect HTTP `200` acknowledgment and no database change.

---

## Callback Security Guidance

### Token comparison

The `mpesa-callback` function compares the URL token against `MPESA_CALLBACK_SECRET` using `safeEqual` — a constant-time comparison that avoids timing side-channels. It also explicitly rejects an empty/unset `MPESA_CALLBACK_SECRET`, so a missing configuration never silently authorizes a request.

### Secret hygiene

- Use a long (at least 32 characters), randomly generated secret. Example generation:
  ```bash
  openssl rand -hex 32
  ```
- **ROTATE `MPESA_CALLBACK_SECRET` periodically.** After rotation: update the secret in Supabase (`supabase secrets set MPESA_CALLBACK_SECRET=<new>`), re-register the new `CallBackURL` (containing the new token) with Safaricom, and redeploy the function.

### Defence-in-depth: IP allowlist

Because the token is URL-borne and can appear in proxy/CDN access logs, restrict inbound traffic to known Safaricom callback IP ranges as an additional layer. Configure this at your network/proxy/Supabase edge level. Contact Safaricom support or check their developer portal for the current list of egress IP ranges.

### Idempotency as a safety net

`apply_mpesa_callback` is idempotent: it only acts on an **existing** `payment_attempts` row that is still in a **non-terminal** state (`pending` / `initiated`). Even if an attacker replays a leaked token, they cannot fabricate a payment for a booking that was never legitimately initiated, and they cannot re-trigger earnings on an already-paid payment.

---

## DB / RLS Notes

- **`apply_mpesa_callback` is service-role only.** The migration explicitly revokes `EXECUTE` on the function from `anon` and `authenticated` roles. Only the `mpesa-callback` Edge Function (running with the `SUPABASE_SERVICE_ROLE_KEY`) can invoke it.
- **Customers cannot set `payments.status = 'paid'` directly.** RLS policies on `public.payments` do not allow customer-initiated updates to `status`. The only path to `paid` is through `apply_mpesa_callback`.
- **Provider earnings are created exclusively by the trigger.** `provider_earnings` rows are inserted by the `trg_create_earning_on_paid` trigger that fires on `public.payments` when `status` transitions to `paid`. There is no other write path; this is enforced at the DB layer (Slice 11).
