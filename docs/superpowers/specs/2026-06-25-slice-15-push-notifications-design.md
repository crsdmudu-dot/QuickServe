# Slice 15 — Push Notifications (Bookings + Chat) Design Spec

**Date:** 2026-06-25
**Status:** Approved design → implementation plan
**Builds on:** Slice 13 Edge-Function infra; the booking/quote/payment/chat events from Slices 5–14.

---

## 1. Goal

Deliver real push notifications for 8 booking/chat events via **Expo Push Service** (Expo relays to FCM/APNs). Sending is **server-side and automatic** — Postgres triggers (`pg_net`) call a secret-gated `send-push` Edge Function on the relevant table changes. The client only registers its Expo push token.

### Out of scope
Scheduled/marketing notifications, notification preferences, sound/channel customization, rich images, SMS, email, direct FCM HTTP v1, Google service-account keys, ejecting from Expo.

---

## 2. Architecture

- **Token registration:** the app requests permission, gets an **Expo push token** (`ExponentPushToken[…]`), and calls the **`register-device`** Edge Function (JWT) which upserts a `device_tokens` row for `auth.uid()`. One user → many devices.
- **Automatic send:** `pg_net` triggers on `bookings` (UPDATE), `payments` (UPDATE), `booking_messages` (INSERT) `POST` the changed row to the secret-gated **`send-push`** Edge Function. `send-push` derives recipient(s) + message (pure TS routing), looks up the recipient's active tokens (service role), and `POST`s to `https://exp.host/--/api/v2/push/send`. Invalid tokens (`DeviceNotRegistered`) are pruned.
- **Client never sends push** — it only registers a token and handles taps (deep-link).
- **Future-proofing:** `device_tokens` stores `provider='expo'` + `native_push_token` (nullable) so a later direct-FCM/APNs migration is possible without schema change.

---

## 3. Security Model

- No FCM/Google credentials in app or git (FCM creds live in EAS for Android relay; none needed in code this slice). Expo push needs no secret to send, but we gate the trigger→function call.
- `register-device` requires the user JWT (`verify_jwt = true`) and writes only `user_id = auth.uid()` (user-scoped client under RLS).
- `send-push` is **secret-gated** (`verify_jwt = false`): the `pg_net` triggers send an `x-webhook-secret` header compared (constant-time) against `PUSH_WEBHOOK_SECRET`; mismatches → 401. It uses the **service role** only inside the function to read recipient tokens / prune dead ones.
- RLS: a user manages only their own tokens; **admin is read-only**; no cross-user token access.
- The trigger URL + secret are read from an operator-populated `private.push_config` row — never committed.

---

## 4. Database

### 4.1 Migration `0014_device_tokens.sql`
`device_tokens`:
| column | type | notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| user_id | uuid | FK → profiles(id), `on delete cascade` |
| platform | text | check in (`ios`,`android`,`web`) |
| provider | text | not null default `'expo'` (check in (`expo`)) |
| push_token | text | not null (Expo token) |
| native_push_token | text | nullable (reserved for future FCM/APNs) |
| device_name | text | nullable |
| last_seen_at | timestamptz | not null default `now()` |
| created_at | timestamptz | not null default `now()` |

`unique (user_id, push_token)` (upsert key). `enable row level security`.
- **SELECT:** `user_id = auth.uid() or public.is_admin()`.
- **INSERT / UPDATE / DELETE:** `user_id = auth.uid()` (admin has no write path).

### 4.2 Migration `0015_push_triggers.sql`
- `create extension if not exists pg_net;`
- `private.push_config(id int primary key default 1, send_push_url text, webhook_secret text)` — single row inserted with NULLs; operator fills it (documented). Locked down (RLS or `revoke` from anon/authenticated).
- `private.notify_send_push(payload jsonb)` `security definer`: read the config row; if `send_push_url` is null → return (no-op); else `perform net.http_post(url := cfg.send_push_url, headers := jsonb_build_object('Content-Type','application/json','x-webhook-secret', cfg.webhook_secret), body := payload);`.
- Trigger functions (one per table) building `payload = jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'record', to_jsonb(new), 'old_record', to_jsonb(old))` and calling `private.notify_send_push(payload)`. Triggers:
  - `after update on public.bookings` — fire only when `new.status is distinct from old.status` OR `new.quote_status is distinct from old.quote_status`.
  - `after update on public.payments` — fire only when `new.status = 'paid' and old.status is distinct from 'paid'`.
  - `after insert on public.booking_messages`.

---

## 5. Edge Functions + `_shared` pure helpers

- **`_shared/notifications.ts`** (PURE, Jest-testable): routing + message building + receipt parsing.
  - `notificationsForBookingUpdate(record, old)` → `NotificationSpec[]` (status→assigned/accepted/on_the_way/in_progress/completed; quote_status→sent).
  - `notificationForPaymentPaid(record, old)` → `NotificationSpec | null`.
  - `notificationForChatMessage(record, booking)` → `NotificationSpec | null` (recipient = the participant who is **not** the sender; role-correct chat route).
  - `buildExpoMessages(pushTokens: string[], spec: NotificationSpec)` → Expo message objects (`{ to, title, body, data, sound:'default' }`).
  - `parsePushReceipts(responseJson, sentTokens)` → tokens to prune (`DeviceNotRegistered`/invalid).
  - `NotificationSpec = { recipientUserId; title; body; data: { type; route } }`.
- **`_shared/expo-push-client.ts`** (Deno): `sendExpoPush(messages)` — `fetch` to `https://exp.host/--/api/v2/push/send`; returns parsed receipts.
- **`register-device/index.ts`** (`verify_jwt=true`): parse `{ push_token, platform, device_name?, native_push_token? }`; upsert via user-scoped client into `device_tokens` (`user_id = auth.uid()`, `provider='expo'`, `last_seen_at=now()`) on conflict `(user_id, push_token)` → update `last_seen_at`/`device_name`. Returns `{ ok }`.
- **`send-push/index.ts`** (`verify_jwt=false`): constant-time check `x-webhook-secret` vs `PUSH_WEBHOOK_SECRET` (else 401); parse the webhook body; build `NotificationSpec[]` (for `booking_messages` first fetch the booking via service role to resolve participants); for each spec, service-role `select push_token from device_tokens where user_id = recipient`; `buildExpoMessages` → `sendExpoPush`; `parsePushReceipts` → `delete` the dead tokens. Always 200.

---

## 6. Notification Routing & Deep-Links

| Event (trigger) | Recipient | Title / body | `data.type` | `data.route` |
|---|---|---|---|---|
| booking status → `provider_assigned` | assigned provider | "New job assigned" | `booking_assigned` | `/provider/job/[id]` |
| status → `accepted` | customer | "Booking accepted" | `booking_accepted` | `/booking/[id]` |
| status → `on_the_way` | customer | "Your provider is on the way" | `on_the_way` | `/booking/[id]` |
| status → `in_progress` | customer | "Work has started" | `in_progress` | `/booking/[id]` |
| status → `completed` | customer | "Job completed" | `completed` | `/booking/[id]` |
| quote_status → `sent` | customer | "You have a new quote" | `quote_sent` | `/booking/[id]` |
| payment → `paid` | customer (`payments.customer_id`) | "Payment confirmed" | `payment_confirmed` | `/booking/[id]` |
| chat message insert | the non-sender participant | "New message" + preview | `chat_message` | customer→`/booking/chat/[id]`, provider→`/provider/job/chat/[id]` |

The client resolves `data.route` to an `expo-router` path (pure `routeForNotificationData(data)` helper) and navigates on tap.

---

## 7. Client

- **Dependency:** add `expo-notifications` (and use existing `expo-device`); register the config plugin in `app.json`; ensure `extra.eas.projectId` exists (needed by `getExpoPushTokenAsync`).
- **`src/lib/push.ts`:**
  - `registerForPushNotifications()`: if not a physical device → null; request permission (deny → null); `getExpoPushTokenAsync({ projectId })`; call `register-device` via `supabase.functions.invoke`; return the token. Updates `last_seen_at` on subsequent calls (re-register on app foreground).
  - `routeForNotificationData(data)`: pure → the `expo-router` path (or null).
- **Registration trigger:** a hook/effect (e.g., in the authenticated root layout) calls `registerForPushNotifications()` when a `session` exists.
- **Deep-link handler:** `Notifications.addNotificationResponseReceivedListener` → `router.push(routeForNotificationData(response.notification.request.content.data))`.

---

## 8. Testing

- **Jest (pure):** `_shared/notifications.ts` (every event → correct recipient/title/type/route; chat recipient = non-sender + role route; `buildExpoMessages`; `parsePushReceipts` prunes `DeviceNotRegistered`). `src/lib/push.ts` `routeForNotificationData` (all 8 types); `registerForPushNotifications` with mocked `expo-notifications`/`expo-device` (no-device → null, permission denied → null, success → `register-device` invoked with token+platform).
- **No live Expo push in tests.** Edge-Function glue (`index.ts`, `expo-push-client.ts`) and `pg_net` triggers are verified manually on a dev build, documented in `docs/superpowers/verification/slice-15-push.md`.
- **RLS verification** (`docs/superpowers/verification/slice-15-push.sql`): user CRUD only own tokens; cannot read others'; admin read-only (no write); `send-push` secret gate; trigger fires only on the intended column transitions.
- Merge gate: `npm test` green, `npx tsc --noEmit` clean (after `expo export`), Android bundle exports. (App tsconfig excludes the new Deno files, like Slice 13.)

---

## 9. Build / EAS & Expo Go caveat (documented prominently)

- **Real delivery needs a dev/EAS build** with FCM credentials configured in EAS (Android) — **Expo Go cannot reliably receive remote push on Android**. Expo Go is fine for exercising screens/permission prompts but not production delivery.
- The verification doc covers: `eas credentials` / FCM setup, `expo-notifications` plugin, `projectId`, setting `private.push_config` (`send_push_url`, `webhook_secret`) + the `PUSH_WEBHOOK_SECRET` Edge secret, deploying `register-device` + `send-push`, and a dev-build end-to-end test of each event.

---

## 10. Deliverables

1. `supabase/migrations/0014_device_tokens.sql` (+ RLS) and `0015_push_triggers.sql` (pg_net, `push_config`, triggers).
2. `supabase/functions/_shared/notifications.ts` (+ Jest tests) and `_shared/expo-push-client.ts`.
3. `supabase/functions/register-device/index.ts`, `supabase/functions/send-push/index.ts`, `config.toml` updates.
4. `expo-notifications` dependency + `app.json` plugin/`projectId`; `src/lib/push.ts` (+ tests); registration hook + deep-link listener wired into the root layout.
5. `.env.example` push secret name; `docs/superpowers/verification/slice-15-push.md` + `slice-15-push.sql`.
