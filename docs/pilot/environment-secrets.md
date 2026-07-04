# Environment Variables & Secrets — QuickServe Pilot

**Purpose:** Every env var and secret in the QuickServe stack — where it lives, who can see it,
and which ones must never be committed. Read alongside [backend-readiness.md](./backend-readiness.md)
and [edge-function-health.md](./edge-function-health.md).

> **Monitoring is OFF** unless `EXPO_PUBLIC_SENTRY_DSN` is set. `initMonitoring()` is a no-op in
> dev, Expo Go, and CI when the variable is absent or empty. Safe by default.

---

## 1. Client-side env vars (app bundle — `EXPO_PUBLIC_*`)

These values are **baked into the JS bundle** at build time. They are visible to anyone who
decompiles the bundle. Only non-sensitive public identifiers belong here.

| Variable | Where to set | Client-safe? | Purpose |
|---|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | EAS secret (production) / `.env.local` (dev) | Yes — Supabase URL is public | Supabase project URL used by the Supabase JS client |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | EAS secret (production) / `.env.local` (dev) | Yes — anon key is public; RLS protects data | Supabase anon/public API key for client-side queries |
| `EXPO_PUBLIC_SENTRY_DSN` | EAS secret (production) / `.env.local` (dev, optional) | Yes — DSN is a public project identifier | Crash reporting endpoint. **Monitoring is OFF when absent.** |

### Setting via EAS

```bash
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value https://your-project.supabase.co
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon-key>
eas secret:create --name EXPO_PUBLIC_SENTRY_DSN --value https://xxxxx@oyyy.ingest.sentry.io/zzz
```

### Local development (`.env.local` — gitignored)

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# EXPO_PUBLIC_SENTRY_DSN=  ← leave empty/absent; monitoring off in dev
```

---

## 2. Edge Function secrets (server-only — Supabase secrets vault)

These values run **inside Edge Functions only** and are never sent to the client. Set via
`supabase secrets set KEY=value`. They do not appear in `.env.example` with real values.

| Variable | Where to set | Client-safe? | Purpose |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected by Supabase runtime | **No — never expose** | Service-role DB access inside Edge Functions |
| `SUPABASE_URL` | Auto-injected by Supabase runtime | n/a (server only) | Project URL available inside Edge Functions |
| `SUPABASE_ANON_KEY` | Auto-injected by Supabase runtime | n/a (server only) | Anon key available inside Edge Functions |
| `PUSH_WEBHOOK_SECRET` | `supabase secrets set PUSH_WEBHOOK_SECRET=<value>` | **No** | Shared secret in `x-webhook-secret` header; `send-push` rejects requests that don't match |
| `GOOGLE_PLACES_API_KEY` | `supabase secrets set GOOGLE_PLACES_API_KEY=<value>` | **No — server-only** | Google Places API key used by `places-autocomplete`, `place-details`, and `tracking-map`; must be restricted to server usage in GCP Console |
| `DARAJA_CONSUMER_KEY` | `supabase secrets set DARAJA_CONSUMER_KEY=<value>` | **No** | Safaricom Daraja OAuth credential |
| `DARAJA_CONSUMER_SECRET` | `supabase secrets set DARAJA_CONSUMER_SECRET=<value>` | **No** | Safaricom Daraja OAuth credential |
| `DARAJA_SHORTCODE` | `supabase secrets set DARAJA_SHORTCODE=<value>` | **No** | Business shortcode (paybill/till) |
| `DARAJA_PASSKEY` | `supabase secrets set DARAJA_PASSKEY=<value>` | **No** | Lipa Na M-Pesa Online passkey |
| `DARAJA_BASE_URL` | `supabase secrets set DARAJA_BASE_URL=<url>` | No (server config) | Daraja base URL (sandbox or live) |
| `DARAJA_CALLBACK_URL` | `supabase secrets set DARAJA_CALLBACK_URL=<url>` | No (server config) | Must include `?token=<MPESA_CALLBACK_SECRET>` |
| `MPESA_CALLBACK_SECRET` | `supabase secrets set MPESA_CALLBACK_SECRET=<value>` | **No** | Shared secret appended as `?token=` to callback URL; gates unauthorized Daraja POSTs |
| `MPESA_MODE` | `supabase secrets set MPESA_MODE=<mock\|sandbox\|live>` | No (server config) | Controls Daraja mode; `mock` safe for testing |

### Set all Daraja secrets at once

```bash
supabase secrets set \
  MPESA_MODE=sandbox \
  DARAJA_BASE_URL=https://sandbox.safaricom.co.ke \
  DARAJA_CONSUMER_KEY=<key> \
  DARAJA_CONSUMER_SECRET=<secret> \
  DARAJA_SHORTCODE=<code> \
  DARAJA_PASSKEY=<passkey> \
  MPESA_CALLBACK_SECRET=$(openssl rand -hex 32) \
  DARAJA_CALLBACK_URL="https://<ref>.supabase.co/functions/v1/mpesa-callback?token=<MPESA_CALLBACK_SECRET>"
```

### Set push secret

```bash
supabase secrets set PUSH_WEBHOOK_SECRET=$(openssl rand -hex 32)
```

---

## 3. `.env.example` (committed template — no real values)

The committed `.env.example` contains only placeholder/empty values for every variable.
Real values go in `.env.local` (local dev, gitignored) or EAS/Supabase secrets (CI/production).

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
MPESA_MODE=mock
DARAJA_BASE_URL=
DARAJA_CONSUMER_KEY=
DARAJA_CONSUMER_SECRET=
DARAJA_SHORTCODE=
DARAJA_PASSKEY=
DARAJA_CALLBACK_URL=
MPESA_CALLBACK_SECRET=
PUSH_WEBHOOK_SECRET=
GOOGLE_PLACES_API_KEY=
EXPO_PUBLIC_SENTRY_DSN=       ← empty = monitoring OFF
```

---

## 4. NEVER-COMMIT list

The following values must **never** appear in any committed file, PR, or comment:

| Secret | Risk if leaked |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Full DB access, bypasses RLS — catastrophic |
| `DARAJA_CONSUMER_KEY` | Unauthorized M-Pesa charges |
| `DARAJA_CONSUMER_SECRET` | Unauthorized M-Pesa charges |
| `DARAJA_PASSKEY` | Unauthorized STK pushes |
| `MPESA_CALLBACK_SECRET` | Attacker can inject fake payment confirmations |
| `PUSH_WEBHOOK_SECRET` | Attacker can send arbitrary push notifications to all users |
| `GOOGLE_PLACES_API_KEY` | Unauthorized usage charges on Google billing account |
| `EXPO_PUBLIC_SENTRY_DSN` (real) | Attacker can flood Sentry with noise events; minor risk, prefer keeping server-only for production DSN |

**If any of the above are accidentally committed:**
1. Immediately rotate the secret (generate a new value).
2. Update the Supabase/EAS secret store with the new value.
3. Redeploy affected Edge Functions.
4. Force-push is NOT sufficient — the old value persists in git history. Treat the secret as compromised.

---

## 5. Secret rotation reference

See [backend-readiness.md](./backend-readiness.md) Section 11 for step-by-step rotation
procedures for `MPESA_CALLBACK_SECRET` and `PUSH_WEBHOOK_SECRET`.

---

## 6. Monitoring on/off summary

| Build type | `EXPO_PUBLIC_SENTRY_DSN` set? | Monitoring state |
|---|---|---|
| Local dev / Expo Go | No (absent in `.env.local`) | OFF — `initMonitoring()` no-ops |
| CI (`npm test`) | No | OFF — safe for test runner |
| EAS development build | Optional (dev DSN via `.env.local`) | ON only if explicitly set |
| EAS production build | Yes (set via `eas secret:create`) | ON — crashes sent to Sentry |

`reportError()` logs to `console.error` when monitoring is off — errors are never silently swallowed.
