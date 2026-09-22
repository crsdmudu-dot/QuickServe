# Phase 4E — Push Notification Certification & Delivery Hardening

> **Scope:** QA only. **No** Production push was sent, **no** Production notification record was
> mutated, **no** Production push credential was configured, **no** store build was submitted, **no**
> OTA was enabled. Full Platform Certification is **NOT** claimed. Physical-device delivery is **NOT**
> certified from this exercise (see §9 — it is gated on a real device + EAS build + FCM credential).

## 1. Executive Summary

QuickServe's push-notification **backend and security layers were certified end-to-end against QA**:
device registration authorization + token storage, the webhook-secret gate on the delivery function,
a **real Expo Push Service send**, invalid-token pruning, recipient role isolation, per-user
preference gating, and bounded duplicate handling. The two push Edge Functions (`register-device`,
`send-push`) were **deployed to QA only** (they were previously absent on QA; Production already had
both). A high-entropy `PUSH_WEBHOOK_SECRET` was self-provisioned on QA. **No code fix was required** —
the implementation passed every automatable check. A regression guard test was added.

**What is certified (QA, automatable):** registration authz + RLS, webhook-secret authz (fail-closed,
constant-time), live Expo dispatch, `DeviceNotRegistered` stale-token pruning, `push_status`
transitions, role isolation, preference gate, dedup.

**What is NOT certified (requires a physical device + EAS build + FCM/APNs credential + a human):**
real on-device delivery, foreground/background/terminated presentation, notification-tap navigation,
iOS delivery, on-device permission-denied UX. These are **blocked at the device gate**, not by any
backend defect.

## 2. Architecture (verified from source — no changes made)

```
App (dev/prod build only; Expo Go on Android cannot receive push)
  └─ registerForPushNotifications()  src/lib/push.ts
       permission → Expo push token (projectId 587f8663…) → invoke register-device
  └─ setupNotificationResponseListener() → routeForNotificationData(data.route) → navigate(path)

register-device  (verify_jwt=true)         send-push  (verify_jwt=false)
  user_id = JWT user (server-derived)        x-webhook-secret == PUSH_WEBHOOK_SECRET (constant-time)
  anon client + caller Authorization         service-role client (AFTER the gate)
  → RLS-scoped upsert device_tokens          recipient derived from DB record (no client-chosen target)

DB event → notify_user()/notify_admins()  (0020, SECURITY DEFINER)
  → insert public.notifications (dedup_key partial-unique, ON CONFLICT DO NOTHING)
  → trg_push_notification AFTER INSERT → notify_send_push() (0015, SECURITY DEFINER)
      reads private.push_config(send_push_url, webhook_secret)   ← send_push_url IS NULL = kill switch
      → net.http_post → send-push
          isPushAllowed(prefs, category) → device_tokens for recipient → buildExpoMessages
          → exp.host/--/api/v2/push/send (Expo BASIC, no access token) → parsePushReceipts
          → prune DeviceNotRegistered tokens → update notifications.push_status/attempts
```

**Push provider:** Expo Push Service in **BASIC (unauthenticated) mode** — `sendExpoPush` posts to
`https://exp.host/--/api/v2/push/send` with no `Authorization` header. Therefore **no Expo access
token / FCM server key / APNs key is required inside the Edge Function**. Real Android/iOS *delivery*
still needs an FCM (Android) / APNs (iOS) credential configured at the **Expo project** level (not in
this repo).

**Credential inventory (backend):** the only push backend secret is `PUSH_WEBHOOK_SECRET`
(self-provisioned on QA). `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` are
auto-injected by Supabase. No external push credential gate was hit for the backend certification.

## 3. Starting State (QA vs Production)

| Function | QA before | QA after | Production (untouched) |
|---|---|---|---|
| `register-device` | **absent** | **v1** (verify_jwt=true) | v2 (verify_jwt=true) |
| `send-push` | **absent** | **v1** (verify_jwt=false) | v2 (verify_jwt=false) |

Schema (both QA and Production): migrations `0014` (device_tokens), `0015` (push triggers +
`private.push_config`), `0020` (unified notification system) all present. The Slice-15 direct-push
triggers were superseded by the `0020` unified fan-out (`trg_push_notification`) — the sole push
sender. `private.push_config` on QA was **left unpopulated** (kill switch) so DB events do not
auto-fire webhooks; the certification invoked `send-push` directly under controlled payloads.

## 4. QA Writes Performed (all reversible, QA only)

- Deployed `register-device` and `send-push` to QA (`wjvjuplooidctlxxozws`).
- Set `PUSH_WEBHOOK_SECRET` (48-byte base64url, generated locally, never printed) on QA.
- Created and then **deleted** transient QA test rows (`device_tokens`, `notifications`,
  `notification_preferences`) — verified 0 residual (§8).
- Production functions, secrets, and data were **not** touched.

## 5. Registration Certification (register-device, QA)

Caller = QA customer `df214443-5f46-4a6c-bd68-e6eaea77965b`.

| Check | Result |
|---|---|
| Valid JWT → register synthetic token | `200 {"ok":true}` |
| Stored row `user_id` | **equals caller uid** (server-derived from JWT), `provider=expo`, `platform=android` |
| No `Authorization` header | **401** `UNAUTHORIZED_NO_AUTH_HEADER` (gateway `verify_jwt=true`) |
| Garbage bearer token | **401** `UNAUTHORIZED_INVALID_JWT_FORMAT` |
| Invalid platform (`windows-phone`) | **400** `Invalid request.` |
| Cross-user REST insert (customer JWT, foreign `user_id`) | **403** RLS `42501`; row **not** persisted |
| Unauthorized tokens (`SHOULD-NOT-STORE*`) | **never persisted** (0 rows) |

**Conclusion:** a user can register only their own device; `user_id` cannot be forged (it is taken
from the verified JWT, never from the body) and RLS blocks any foreign-`user_id` write. Registration
is idempotent (`onConflict user_id,push_token`).

## 6. Delivery Certification (send-push, QA)

Recipient = the customer's registered synthetic token; a real `notifications` row drove each send.

| Check | Result |
|---|---|
| No `x-webhook-secret` | **401 Unauthorized** |
| Wrong secret | **401 Unauthorized** (length-checked constant-time compare) |
| Correct secret → real Expo send | **200 `{ok:true}`**; `push_status=sent`, `push_attempts=1` |
| Stale-token prune | synthetic token → Expo `DeviceNotRegistered` → **`device_tokens` row deleted** |
| Direct Expo receipt (fake token, documented) | `{status:"error", details:{error:"DeviceNotRegistered"}}` — exactly the key `parsePushReceipts` prunes on |
| **Payload privacy** | Expo body = `{to,title,body,data:{type,route},sound}` — no phone, amount, price, or user id |
| **Role isolation** | notification for **admin** (no device token) → `push_status=no_token`; customer's token **not** used |
| **Preference gate** | `push_enabled=false` → `push_status=skipped` (no send) |
| **Bounded dedup** | duplicate `dedup_key` insert → **409 conflict** (partial-unique index) → single notification |

**`push_status='sent'` semantics (noted, not a defect):** `sent` means *dispatched to and accepted by
Expo*, not delivery-confirmed. The pipeline prunes tokens on the **immediate** `DeviceNotRegistered`
ticket but does not perform Expo's **deferred receipt-check**
(`getPushNotificationReceiptsAsync`) for other delivery errors (e.g. `MessageRateExceeded`). This is
acceptable for the current scale; it is recorded as a future hardening item (§10), not a blocker.

## 7. Payload Privacy & Logging Hygiene

- **On-wire payload** carries only generic copy + `{type, route}` (verified in §6 and by unit test).
  The one content-bearing case (chat) truncates the message body to ≤80 chars in both the DB trigger
  (`tg_notify_chat_message`, 0020) and the pure helper (`notificationForChatMessage`).
- **No secrets/tokens are logged.** `send-push` logs only `console.error('[send-push] Unexpected
  error:', err)`; it never prints the webhook secret or push tokens. `register-device` logs nothing.
  This certification never printed the `PUSH_WEBHOOK_SECRET` value or any full JWT/token.

## 8. QA Cleanup & Isolation

Post-test verification: `device_tokens` matching `*QA4E*` = **0**; `notifications` on the test routes =
**0**. Local scratch probe scripts and the temporary secret file (outside the repo) were deleted.
`private.push_config` on QA remains unpopulated (kill switch on). DEV/QA/Production project refs remain
distinct; no Production credential was loaded.

## 9. Device Gate — NOT Performed (requires a physical device + build + human)

The following **cannot** be certified from a backend/QA exercise and were **not** performed:

- **Real on-device delivery.** Requires an **EAS dev/production build** (Expo Go on Android SDK 53
  cannot receive push — `src/lib/push.ts` deliberately bails out in Expo Go) **and** an **FCM
  credential** (Android) / **APNs key** (iOS) configured on the Expo project (`587f8663…`).
- **Foreground / background / terminated** presentation behavior.
- **Notification-tap → deep-link navigation** on a device (code path
  `setupNotificationResponseListener → routeForNotificationData → navigate` is verified by source and
  by existing unit tests, but not exercised on hardware here).
- **iOS delivery** and **on-device permission-denied UX**.

To certify these, a human must run an EAS build on a physical phone with push credentials configured,
then confirm receipt + tap-routing for each role — the same manual pattern used for live M-Pesa.

## 10. Findings

- **P-none (blocker):** none. No code fix was required.
- **Observation O1 (future hardening):** add Expo deferred receipt-checking so non-`DeviceNotRegistered`
  delivery failures are surfaced/retried, and `push_status='sent'` can be upgraded to a
  delivery-confirmed state. Not required at current scale.
- **Observation O2:** `send-push`'s `bookings`/`payments`/`booking_messages` branches are dormant —
  the `0020` unified pipeline routes all push through the `notifications` table. They are harmless
  fallbacks; no action needed.

## 11. Regression Guard (test-only change)

Added `src/__tests__/push-notification-cert.test.ts` (15 assertions) locking in the certified
invariants: JWT-derived `user_id` + no `body.user_id`, caller-scoped anon client (no service-role in
`register-device`), constant-time fail-closed webhook gate + service-role only after the gate,
`verify_jwt` config posture, owner-only `device_tokens` RLS, `dedup_key` partial-unique index, and the
Expo payload key-allowlist (privacy). Existing `notifications.test.ts` (46 assertions on the pure
helpers) continues to pass.

## 12. Production Preservation

- Production functions **unchanged**: `register-device` v2, `send-push` v2 (and `mpesa-stk-push` v2,
  `mpesa-callback` v2).
- **No** Production push sent; **no** Production notification/device_tokens/preferences row mutated;
  **no** Production push credential configured.

## 13. Final Status

- **QA push backend + security layers: CERTIFIED** (registration authz/RLS, webhook-secret authz,
  live Expo dispatch, stale-token pruning, role isolation, preference gate, dedup, payload privacy,
  logging hygiene).
- **Physical-device delivery / tap-navigation / iOS: NOT CERTIFIED** — gated on a real device + EAS
  build + FCM/APNs credential + a human (§9).
- **No runtime fix required.** Test-only + doc change. Production untouched. Full Platform
  Certification is **NOT** claimed.
