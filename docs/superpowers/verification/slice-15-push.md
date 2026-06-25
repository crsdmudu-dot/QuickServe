# Slice 15 — Push Notifications: Operator & Verification Guide

## Required Supabase Secrets

Only one secret must be set manually; the rest are auto-provided by the Supabase runtime.

```bash
# Set the shared webhook secret (high-entropy random string, ≥32 chars recommended).
supabase secrets set PUSH_WEBHOOK_SECRET=<your-high-entropy-secret>
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are **auto-provided**
to every Edge Function by the Supabase runtime — do NOT set them manually.

---

## Configure `private.push_config`

After running migration `0015_push_triggers.sql`, populate the config row:

```sql
-- Enable push delivery:
update private.push_config
set
  send_push_url  = 'https://<your-project-ref>.functions.supabase.co/send-push',
  webhook_secret = '<same value as PUSH_WEBHOOK_SECRET>'
where id = 1;
```

**Kill switch:** set `send_push_url = null` to stop all push delivery immediately — the
`notify_send_push` helper no-ops when `send_push_url IS NULL`.

```sql
-- Disable all push delivery (kill switch):
update private.push_config set send_push_url = null where id = 1;
```

---

## Deploy Edge Functions

```bash
supabase functions deploy register-device send-push
```

JWT verification is controlled by `supabase/config.toml`:

| Function          | `verify_jwt` | Reason                                                             |
|-------------------|--------------|--------------------------------------------------------------------|
| `register-device` | `true`       | Called by authenticated users; JWT gate enforced by Supabase.      |
| `send-push`       | `false`      | Called by the database webhook (no user JWT); guarded by `x-webhook-secret`. |

---

## Expo / EAS Setup

1. **Set a real `projectId`** in `app.json`:
   ```json
   {
     "expo": {
       "extra": {
         "eas": {
           "projectId": "<your-eas-project-id>"
         }
       }
     }
   }
   ```
   Without a real `projectId`, `getExpoPushTokenAsync` may return a dev-only token
   that does not deliver on physical devices.

2. **Configure Android FCM credentials** via EAS:
   ```bash
   eas credentials
   # Select Android → Production → FCM API Key (or FCM V1 service account JSON)
   ```
   Expo Push Service relays notifications to FCM (Android) and APNs (iOS) using your
   registered credentials.

---

## IMPORTANT: Dev Build Requirement and Expo Go Limitation

> **Real push notification delivery on Android requires a development or EAS build.**
> Expo Go cannot reliably receive remote push notifications on Android.

`registerForPushNotifications` in `src/lib/push.ts` handles this gracefully:
- On Expo Go for Android, `getExpoPushTokenAsync` throws → the catch block returns `null`.
- The app continues working without push; no crash occurs.

**To test real push delivery, build a dev client:**

```bash
eas build --profile development --platform android
# Install the resulting APK on your physical Android device.
```

---

## Dev-Build Verification Checklist

Work through these steps on a physical device running a dev/EAS build:

### Registration
- [ ] Open the app and sign in.
- [ ] Confirm the OS permission prompt appears (first launch).
- [ ] In Supabase dashboard, verify a row is inserted in `public.device_tokens` for your user.

### 8 Push Events — fire each and confirm the notification arrives + deep-link is correct

| Event | How to trigger | Expected notification | Deep-link target |
|---|---|---|---|
| `booking_assigned` | Admin assigns provider to a booking | "New job assigned" | `/provider/job/<id>` |
| `booking_accepted` | Provider accepts a booking | "Booking accepted" | `/booking/<id>` |
| `on_the_way` | Provider sets status to on_the_way | "Your provider is on the way" | `/booking/<id>` |
| `in_progress` | Provider sets status to in_progress | "Work has started" | `/booking/<id>` |
| `completed` | Provider sets status to completed | "Job completed" | `/booking/<id>` |
| `quote_sent` | Provider submits a quote | "You have a new quote" | `/booking/<id>` |
| `payment_confirmed` | Payment marked paid | "Payment confirmed" | `/booking/<id>` |
| `chat_message` | Either party sends a chat message | "New message" + truncated body | `/booking/chat/<id>` (customer) or `/provider/job/chat/<id>` (provider) |

- [ ] Tap each notification and confirm it navigates to the correct screen.

### DeviceNotRegistered Pruning
- [ ] Uninstall the app from the device (invalidates the push token).
- [ ] Trigger any push event for that user.
- [ ] Confirm the stale token row is deleted from `public.device_tokens`.

---

## Architecture: Client Never Sends Push

`src/lib/push.ts` calls **only** `register-device` (token registration).
It **never** calls `send-push` or `exp.host`.

Push delivery path:
```
DB trigger (Postgres) → pg_net HTTP POST → send-push (Edge Function) → exp.host/--/api/v2/push/send → FCM/APNs → device
```

The client has no role in this path after registration.

---

## Rollback

### 1. Kill switch (safest — instant, no migration)
```sql
update private.push_config set send_push_url = null where id = 1;
```

### 2. Delete Edge Functions
```bash
supabase functions delete register-device send-push
```

### 3. Drop migration (full removal)
Create a `0016_drop_push.sql` migration:
```sql
drop trigger if exists trg_push_booking_messages on public.booking_messages;
drop trigger if exists trg_push_payments on public.payments;
drop trigger if exists trg_push_bookings on public.bookings;
drop function if exists public.tg_push_booking_messages();
drop function if exists public.tg_push_payments();
drop function if exists public.tg_push_bookings();
drop function if exists public.notify_send_push(jsonb);
drop table if exists private.push_config;
drop schema if exists private cascade;
drop table if exists public.device_tokens;
drop extension if exists pg_net;
```

### 4. Rotate secret (if leaked)
```bash
supabase secrets set PUSH_WEBHOOK_SECRET=<new-secret>
# Also update private.push_config.webhook_secret to match:
```
```sql
update private.push_config set webhook_secret = '<new-secret>' where id = 1;
```
