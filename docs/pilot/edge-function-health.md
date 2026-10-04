# Edge Function Health — QuickServe Pilot

**Purpose:** Per-function deploy reference, secret requirements, JWT settings, kill-switch
behaviour, and smoke checks. Read alongside [backend-readiness.md](./backend-readiness.md)
(Section 5 for deploy commands, Section 6 for Daraja secrets, Section 7 for push secrets).

`verify_jwt` settings are authoritative in `supabase/config.toml` — do not change them without
updating this doc.

---

## Deploy all functions

```bash
supabase functions deploy \
  send-push \
  mpesa-stk-push \
  mpesa-callback \
  places-autocomplete \
  place-details \
  tracking-map \
  register-device
```

Or deploy individually (see per-function table below).

---

## Function reference

### 1. `send-push`

| Property | Value |
|---|---|
| Deploy | `supabase functions deploy send-push` |
| `verify_jwt` | `false` — called by `pg_net` DB webhook, not by a user |
| Authentication | `x-webhook-secret` header matched against `PUSH_WEBHOOK_SECRET` Supabase secret |
| Always-200 / kill switch | Returns `{ ok: true }` on any delivery failure (dead token, Expo error) to prevent pg_net retries. Set `private.push_config.send_push_url = null` to stop all push delivery instantly without redeploying — `notify_send_push()` exits early when URL is null. |

**Required secrets:**
```bash
supabase secrets set PUSH_WEBHOOK_SECRET=<min-32-char-random>
```
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are auto-injected.

**Smoke check:**
1. Sign in on a device → confirm a row in `public.device_tokens`.
2. Trigger a booking status change → verify push received on device (or check Supabase Edge
   Function logs for a 200 response from Expo).
3. Kill-switch test: set `send_push_url = null`, trigger another status change, confirm no
   log entry for `send-push` in Edge Function logs.

---

### 2. `mpesa-stk-push`

| Property | Value |
|---|---|
| Deploy | `supabase functions deploy mpesa-stk-push` |
| `verify_jwt` | `true` — customer must supply a valid Supabase JWT |
| Authentication | Supabase JWT in `Authorization: Bearer <token>` header |
| Kill switch | Set `MPESA_MODE=disabled` (no redeploy): the function answers 503 `payments_unavailable` before reading or writing anything, so no attempt is created. Unset or unknown values also mean `disabled`. `mock` (synthetic `checkoutRequestId`, no external call) is for QA/local only and is refused in code on Production, where it behaves as `disabled`. |

**Required secrets (sandbox/live modes):** every `DARAJA_*` value below must be set, `live` must use
`DARAJA_BASE_URL=https://api.safaricom.co.ke` and `sandbox` must not; otherwise the function answers
503 `payments_unavailable`. Optional for a Till: `DARAJA_TRANSACTION_TYPE=CustomerBuyGoodsOnline`
and `DARAJA_PARTY_B=<till>` (unset = Paybill, unchanged).
```bash
supabase secrets set \
  MPESA_MODE=<disabled|mock|sandbox|live> \
  DARAJA_BASE_URL=<url> \
  DARAJA_CONSUMER_KEY=<key> \
  DARAJA_CONSUMER_SECRET=<secret> \
  DARAJA_SHORTCODE=<code> \
  DARAJA_PASSKEY=<passkey> \
  DARAJA_CALLBACK_URL=https://<ref>.supabase.co/functions/v1/mpesa-callback?token=<secret> \
  MPESA_CALLBACK_SECRET=<min-32-char-random>
```

**Smoke check (mock mode, QA or local only — mock is refused on Production):**
```bash
curl -X POST https://<ref>.supabase.co/functions/v1/mpesa-stk-push \
  -H "Authorization: Bearer <customer-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"payment_id":"<uuid>","phone":"0712345678"}'
# Expect: { "ok": true, "checkoutRequestId": "...", "status": "pending" }
```

---

### 3. `mpesa-callback`

| Property | Value |
|---|---|
| Deploy | `supabase functions deploy mpesa-callback` |
| `verify_jwt` | `false` — Daraja cannot supply a Supabase JWT |
| Authentication | `?token=<MPESA_CALLBACK_SECRET>` query param (constant-time comparison) |
| Always-200 / kill switch | Returns HTTP 200 on idempotent replay (attempt already terminal — no DB change). Returns HTTP 401 for wrong/missing token. A success callback is first confirmed with an STK Push Query: a definite "not successful"/"unknown" answer returns 409 and nothing is applied (an unknown id is first recorded as orphan evidence with its admin alert); a `ResultCode` that is not a plain whole number is recorded as malformed evidence and never applied; an indeterminate answer (after 3 tries) returns 500 and the attempt follows the timeout path. To disable new payments: set `MPESA_MODE=disabled` on `mpesa-stk-push`; callbacks for requests already sent keep settling. |

**Smoke check:**
```bash
# Wrong token → 401
curl -X POST "https://<ref>.supabase.co/functions/v1/mpesa-callback?token=WRONG" \
  -H "Content-Type: application/json" \
  -d '{}'
# Correct token + ResultCode=0 → payment marked paid
```
Full callback verification: see [backend-readiness.md](./backend-readiness.md) Section 6.

---

### 4. `places-autocomplete`

| Property | Value |
|---|---|
| Deploy | `supabase functions deploy places-autocomplete` |
| `verify_jwt` | `true` — signed-in user only |
| Authentication | Supabase JWT |
| Always-200 / kill switch | Returns `{ predictions: [] }` when `GOOGLE_PLACES_API_KEY` is not set — address autocomplete gracefully degrades to manual entry. |

**Required secrets:**
```bash
supabase secrets set GOOGLE_PLACES_API_KEY=<server-only-key>
```
Key must be restricted to **server usage only** in Google Cloud Console — never exposed in the app bundle.

**Smoke check:**
```bash
curl -X POST https://<ref>.supabase.co/functions/v1/places-autocomplete \
  -H "Authorization: Bearer <user-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"input":"Westlands","sessionToken":"test"}'
# Expect: { "predictions": [...] }
```

---

### 5. `place-details`

| Property | Value |
|---|---|
| Deploy | `supabase functions deploy place-details` |
| `verify_jwt` | `true` — signed-in user only |
| Authentication | Supabase JWT |
| Always-200 / kill switch | Returns `{ result: null }` when key absent or Google returns an error — address fields remain editable manually. |

**Required secrets:** same `GOOGLE_PLACES_API_KEY` as `places-autocomplete`.

**Smoke check:**
```bash
curl -X POST https://<ref>.supabase.co/functions/v1/place-details \
  -H "Authorization: Bearer <user-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"placeId":"<google-place-id>","sessionToken":"test"}'
# Expect: { "result": { "geometry": { "location": {...} }, ... } }
```

---

### 6. `tracking-map`

| Property | Value |
|---|---|
| Deploy | `supabase functions deploy tracking-map` |
| `verify_jwt` | `true` — signed-in user only |
| Authentication | Supabase JWT |
| Always-200 / kill switch | Returns a fallback static-map URL or `{ url: null }` when `GOOGLE_PLACES_API_KEY` is unset — the tracking screen shows a placeholder. |

**Required secrets:** same `GOOGLE_PLACES_API_KEY` as `places-autocomplete`.

**Smoke check:**
```bash
curl -X POST https://<ref>.supabase.co/functions/v1/tracking-map \
  -H "Authorization: Bearer <user-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"lat":-1.286389,"lng":36.817223}'
# Expect: { "url": "https://maps.googleapis.com/maps/api/staticmap?..." }
```
Full tracking setup: see [tracking-setup.md](./tracking-setup.md).

---

### 7. `register-device`

| Property | Value |
|---|---|
| Deploy | `supabase functions deploy register-device` |
| `verify_jwt` | `true` — authenticated user only |
| Authentication | Supabase JWT |
| Always-200 / kill switch | Returns `{ ok: true }` even on upsert conflict (idempotent). No kill switch needed — disabling push delivery is via `send_push_url = null` (see `send-push` above). |

**Required secrets:** none beyond auto-injected Supabase credentials.

**Smoke check:**
```bash
curl -X POST https://<ref>.supabase.co/functions/v1/register-device \
  -H "Authorization: Bearer <user-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"push_token":"ExponentPushToken[...]","platform":"android"}'
# Expect: { "ok": true }
# Then: select * from public.device_tokens where user_id = '<uid>';
```

---

## Summary table

| Function | `verify_jwt` | Auth mechanism | Kill switch |
|---|---|---|---|
| `send-push` | false | `x-webhook-secret` header | `send_push_url = null` in `private.push_config` |
| `mpesa-stk-push` | true | Supabase JWT | `MPESA_MODE=disabled` (no redeploy; never `mock` on Production) |
| `mpesa-callback` | false | `?token=<secret>` param + STK Push Query for success | Stop new STK pushes with `MPESA_MODE=disabled` |
| `places-autocomplete` | true | Supabase JWT | Returns empty predictions if key absent |
| `place-details` | true | Supabase JWT | Returns null result if key absent |
| `tracking-map` | true | Supabase JWT | Returns null URL if key absent |
| `register-device` | true | Supabase JWT | n/a — delivery kill switch is `send_push_url` |
