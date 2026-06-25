# Slice 15 — Push Notifications (Bookings + Chat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatic server-side push for 8 booking/chat events via Expo Push Service, fired by `pg_net` triggers into a secret-gated `send-push` Edge Function; the app only registers its Expo token and deep-links on tap.

**Architecture:** `register-device` (JWT) upserts an Expo token into `device_tokens`. `pg_net` triggers on `bookings`/`payments`/`booking_messages` POST the changed row to the secret-gated `send-push`, which routes (pure TS), looks up recipient tokens (service role), POSTs to `exp.host`, and prunes dead tokens. Pure routing/message/receipt logic lives in `_shared/notifications.ts` (Jest-tested); Deno glue + triggers verified on a dev build.

**Tech Stack:** Expo RN + TS, expo-notifications/expo-device, Expo Router, Supabase (Postgres + RLS + pg_net + Edge Functions on Deno), Jest.

## Global Constraints

- **Client never sends push** — it only registers a token and handles taps. All sending is server-side.
- Expo Push Service only this slice: `push_token` = Expo token, `provider='expo'`, `native_push_token` nullable. No FCM HTTP v1, no Google service-account key, no eject. No credentials in app/git.
- `send-push` is secret-gated: `x-webhook-secret` constant-time vs `PUSH_WEBHOOK_SECRET`, else 401; service role used only inside the function. `register-device` is `verify_jwt=true`, writes only `user_id = auth.uid()`.
- RLS: a user CRUDs only their own tokens; **admin read-only** (no token writes). `private.push_config`/`pg_net` internals locked down (no anon/authenticated access).
- DB pattern mirrors `0010`–`0013` (`security definer set search_path = public`, `public.is_admin()`). Deno files excluded from app tsconfig (like Slice 13). Pure helpers stay Deno-free for Jest.
- Lib returns `{ ok, error? }` / typed values. Merge gate: `npm test` green, `npx tsc --noEmit` clean (after `expo export`), Android bundle exports.
- **Real delivery requires a dev/EAS build, not Expo Go** (documented).

---

## File Structure

**Create**
- `supabase/migrations/0014_device_tokens.sql` — table + RLS.
- `supabase/migrations/0015_push_triggers.sql` — `pg_net`, `private.push_config`, `private.notify_send_push`, per-table triggers.
- `supabase/functions/_shared/notifications.ts` (+ Jest test) — pure routing/messages/receipts.
- `supabase/functions/_shared/expo-push-client.ts` — Deno `fetch` to exp.host.
- `supabase/functions/register-device/index.ts`, `supabase/functions/send-push/index.ts`.
- `src/lib/push.ts` (+ test) — permission/token register + `routeForNotificationData`.
- `src/hooks/use-push-registration.ts` (+ deep-link listener) or inline in root layout.
- `docs/superpowers/verification/slice-15-push.md`, `docs/superpowers/verification/slice-15-push.sql`.

**Modify**
- `supabase/config.toml` — `[functions.register-device] verify_jwt=true`, `[functions.send-push] verify_jwt=false`.
- `tsconfig.json` — exclude the new Deno index/client files.
- `package.json` — add `expo-notifications`.
- `app.json` — `expo-notifications` plugin; confirm `extra.eas.projectId`.
- `src/app/_layout.tsx` (or the authenticated layout) — registration hook + deep-link listener.
- `.env.example` — `PUSH_WEBHOOK_SECRET` (name only).

---

## Task Order (dependency-ordered)

1. **T1** — Migration `0014` (device_tokens + RLS).
2. **T2** — `_shared/notifications.ts` pure helpers + Jest tests (Deno-free). Independent of T1.
3. **T3** — Edge Functions `register-device` + `send-push` + `_shared/expo-push-client.ts` + `config.toml` + tsconfig excludes + `.env.example`.
4. **T4** — Migration `0015` (pg_net, `push_config`, triggers).
5. **T5** — Client: `expo-notifications` dep + `app.json`; `src/lib/push.ts` (+ tests); registration hook + deep-link listener in root layout.
6. **T6** — Verification (`slice-15-push.md` + `.sql`, dev-build notes) + final gate.

T2 parallelizable with T1. T3 depends on T2. T4 depends on T1 (+ T3 deployed conceptually). T5 depends on T2 (route helper shares types).

---

### Task 1: Migration `0014_device_tokens.sql`

**Files:** Create `supabase/migrations/0014_device_tokens.sql`

**Build (mirror `0011`):**
- `device_tokens`: `id uuid pk default gen_random_uuid()`, `user_id uuid not null references public.profiles(id) on delete cascade`, `platform text not null check (platform in ('ios','android','web'))`, `provider text not null default 'expo' check (provider in ('expo'))`, `push_token text not null`, `native_push_token text`, `device_name text`, `last_seen_at timestamptz not null default now()`, `created_at timestamptz not null default now()`, `unique (user_id, push_token)`. `enable row level security`.
- **SELECT:** `user_id = auth.uid() or public.is_admin()`.
- **INSERT/UPDATE/DELETE:** each `using`/`with check` `user_id = auth.uid()` (no admin write path).

**Checks:** migration applies cleanly; `\d device_tokens` shows columns/constraints/RLS; `npm test` green, `tsc` clean; commit `feat: slice15 device_tokens schema (0014)`.

---

### Task 2: `_shared/notifications.ts` pure helpers

**Files:** Create `supabase/functions/_shared/notifications.ts`, test at `src/__tests__/notifications.test.ts` (jest-expo discovers it; import the relative path — same approach as `daraja.test.ts`).

**Produces (pure, no Deno APIs):**
- `type NotificationSpec = { recipientUserId: string; title: string; body: string; data: { type: string; route: string } }`.
- `notificationsForBookingUpdate(record, old): NotificationSpec[]` — fire per §6 of the spec when `status` or `quote_status` changed: `provider_assigned`→provider `/provider/job/[id]`; `accepted`/`on_the_way`/`in_progress`/`completed`→customer `/booking/[id]`; `quote_status='sent'`→customer `/booking/[id]`. Routes embed the booking id (`record.id`).
- `notificationForPaymentPaid(record, old): NotificationSpec | null` — when `record.status='paid'` & `old.status<>'paid'` → customer (`record.customer_id`) "Payment confirmed" `/booking/[id]` (`record.booking_id`).
- `notificationForChatMessage(record, booking): NotificationSpec | null` — recipient = participant ≠ `record.sender_id`; role-correct route (`booking.customer_id`→`/booking/chat/[id]`, else `/provider/job/chat/[id]`); body = a short preview of `record.message_text` (≤80 chars).
- `buildExpoMessages(pushTokens: string[], spec): Array<{ to; title; body; data; sound: 'default' }>`.
- `parsePushReceipts(responseJson, sentTokens): string[]` — tokens to prune where receipt status `error` and `details.error === 'DeviceNotRegistered'` (and obviously-invalid tokens).

**Tests:** each booking transition → correct recipient/title/type/route; no-op when neither column changed; payment paid recipient/route; chat recipient = non-sender both directions + correct route + truncated body; `buildExpoMessages` shape; `parsePushReceipts` prunes `DeviceNotRegistered`, keeps `ok`.

**Steps:** TDD → `tsc` → commit `feat: slice15 notification routing helpers`.

---

### Task 3: Edge Functions

**Files:** Create `supabase/functions/_shared/expo-push-client.ts`, `supabase/functions/register-device/index.ts`, `supabase/functions/send-push/index.ts`; Modify `supabase/config.toml`, `tsconfig.json`, `.env.example`

**Build:**
- `expo-push-client.ts` (Deno): `sendExpoPush(messages)` → `fetch('https://exp.host/--/api/v2/push/send', { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body: JSON.stringify(messages) })` → return parsed `{ data: receipts[] }`.
- `register-device/index.ts` (`Deno.serve`, JWT): user-scoped client (anon key + Authorization); parse `{ push_token, platform, device_name?, native_push_token? }`; validate `platform in ('ios','android','web')` and non-empty `push_token`; upsert `device_tokens` (`user_id=auth.uid()`, `provider='expo'`, `last_seen_at=now()`) on conflict `(user_id, push_token)` → update; return `{ ok:true }` / `{ ok:false, error }`.
- `send-push/index.ts` (`Deno.serve`, public): constant-time `x-webhook-secret` vs `Deno.env.get('PUSH_WEBHOOK_SECRET')` (reuse a `safeEqual` like the mpesa-callback), 401 on mismatch/empty; parse `{ table, op, record, old_record }`; build `NotificationSpec[]` (for `booking_messages`: service-role fetch the booking to resolve participants, then `notificationForChatMessage`); for each spec: service-role `select push_token from device_tokens where user_id = spec.recipientUserId`; `buildExpoMessages` → `sendExpoPush` → `parsePushReceipts` → service-role `delete` dead tokens. Always 200.
- `config.toml`: add the two function blocks (`register-device verify_jwt=true`, `send-push verify_jwt=false`).
- `tsconfig.json`: add `supabase/functions/register-device/index.ts`, `supabase/functions/send-push/index.ts`, `supabase/functions/_shared/expo-push-client.ts` to `exclude` (keep `_shared/notifications.ts` checked).
- `.env.example`: add `PUSH_WEBHOOK_SECRET=` (placeholder; comment that the value is set via `supabase secrets set` and mirrored into `private.push_config.webhook_secret`).

**Checks:** `npx tsc --noEmit` clean (Deno files excluded), `npm test` green; commit `feat: slice15 push edge functions + config`.

---

### Task 4: Migration `0015_push_triggers.sql`

**Files:** Create `supabase/migrations/0015_push_triggers.sql`

**Build:**
- `create extension if not exists pg_net;`
- `create schema if not exists private;` then `create table if not exists private.push_config (id int primary key default 1 check (id = 1), send_push_url text, webhook_secret text);` insert one NULL row; `revoke all on private.push_config from anon, authenticated;` (RLS not needed — it's in `private` and not exposed; ensure no API access).
- `private.notify_send_push(payload jsonb) returns void security definer set search_path = public, private`: select the config row; if `send_push_url is null` → return; else `perform net.http_post(url := cfg.send_push_url, headers := jsonb_build_object('Content-Type','application/json','x-webhook-secret', cfg.webhook_secret), body := payload);`.
- Trigger fns (each builds `jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'record', to_jsonb(new), 'old_record', to_jsonb(old))` and `perform private.notify_send_push(...)`; return new):
  - `trg_push_bookings` — `after update on public.bookings`, `when (new.status is distinct from old.status or new.quote_status is distinct from old.quote_status)`.
  - `trg_push_payments` — `after update on public.payments`, `when (new.status = 'paid' and old.status is distinct from 'paid')`.
  - `trg_push_booking_messages` — `after insert on public.booking_messages`.
  Use `drop trigger if exists …; create trigger …`.

**Checks:** migration applies cleanly (pg_net available in Supabase); `npm test` green, `tsc` clean (no app change); commit `feat: slice15 push triggers via pg_net (0015)`.

> Behavioral trigger/secret verification in T6 (needs deployed function + config row).

---

### Task 5: Client registration + deep-link

**Files:** Modify `package.json`, `app.json`, `src/app/_layout.tsx`; Create `src/lib/push.ts` (+ `src/lib/push.test.ts`)

**Build:**
- Add `expo-notifications` to `package.json` (matching SDK 56 version via `npx expo install expo-notifications`); add its plugin to `app.json`; confirm `extra.eas.projectId` (add a placeholder note if absent — needed by `getExpoPushTokenAsync`).
- `src/lib/push.ts`:
  - `routeForNotificationData(data: { type?: string; route?: string }): string | null` — pure; returns `data.route` when it is a non-empty string, else null. (Tested for all 8 types.)
  - `registerForPushNotifications(): Promise<string | null>` — `if (!Device.isDevice) return null`; `getPermissionsAsync`→`requestPermissionsAsync` (denied → null); `getExpoPushTokenAsync({ projectId })`; `supabase.functions.invoke('register-device', { body: { push_token, platform: Platform.OS, device_name: Device.deviceName ?? null } })`; return the token (null on any failure).
- Root layout: an effect that, when `session` exists, calls `registerForPushNotifications()`; and `Notifications.addNotificationResponseReceivedListener(r => { const path = routeForNotificationData(r.notification.request.content.data); if (path) router.push(path); })` with cleanup.

**Tests (`push.test.ts`):** mock `expo-notifications`, `expo-device`, `@/lib/supabase`. `routeForNotificationData` all 8 types + null/missing. `registerForPushNotifications`: non-device → null (no invoke); permission denied → null (no invoke); granted → `register-device` invoked with `{ push_token, platform, device_name }` and returns the token.

**Checks:** `npx expo export` (regen route types) → `npx tsc --noEmit` clean → `npm test` green; commit `feat: slice15 client push registration + deep-link`.

---

### Task 6: Verification & final gate

**Files:** Create `docs/superpowers/verification/slice-15-push.md`, `docs/superpowers/verification/slice-15-push.sql`

**Required secrets / config** (documented; never committed):
- Edge secret: `PUSH_WEBHOOK_SECRET` (`supabase secrets set PUSH_WEBHOOK_SECRET=…`).
- `private.push_config`: `update private.push_config set send_push_url='https://<proj>.functions.supabase.co/send-push', webhook_secret='<same as PUSH_WEBHOOK_SECRET>' where id=1;`.
- Deploy: `supabase functions deploy register-device send-push`.
- EAS/FCM: configure Android FCM credentials in EAS (`eas credentials`); ensure `extra.eas.projectId`.

**RLS / secret verification (`slice-15-push.sql`):**
- [ ] User can insert/update/delete only their own `device_tokens`; cannot select another user's.
- [ ] Admin can select all; admin INSERT/UPDATE/DELETE rejected (no write policy).
- [ ] `private.push_config` not selectable by anon/authenticated.
- [ ] Triggers fire only on the intended transitions (status/quote_status change; payment→paid; message insert).
- [ ] `send-push` rejects a missing/wrong `x-webhook-secret` (401).

**Dev/EAS build verification (`slice-15-push.md`, manual — NOT Expo Go):**
- [ ] Build a dev client (`eas build --profile development`) with FCM configured; install on a physical Android device.
- [ ] Launch → permission prompt → `device_tokens` row created (Expo token).
- [ ] Trigger each event and confirm a push arrives + tapping deep-links to the right screen: booking assigned→provider job; accepted/on_the_way/in_progress/completed→booking; quote sent→booking; payment confirmed→booking; chat message→correct chat.
- [ ] Uninstall the app, resend → `send-push` prunes the `DeviceNotRegistered` token.
- [ ] **Note prominently:** Expo Go cannot reliably receive remote push on Android; use the dev build.

**Final gate:**
- [ ] `npx expo export` → `npx tsc --noEmit` clean → `npm test` green → Android bundle exports.
- [ ] Commit `test: slice15 verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-15-push`. Abandon = `git checkout main` + delete branch.
- **Single task regression:** `git revert <task-commit>` — tasks are independently committed.
- **Kill switch (no code revert):** `update private.push_config set send_push_url = null;` — `notify_send_push` immediately no-ops, stopping all pushes without touching the app or functions.
- **Remove functions:** `supabase functions delete register-device send-push`.
- **Schema rollback:** forward-only; if needed `0016_rollback_push.sql`: `drop trigger`s + `drop function private.notify_send_push`, the three trigger fns, `drop table private.push_config`, `drop table public.device_tokens cascade`. (Leave `pg_net` extension — harmless.) Do not edit `0014`/`0015` after they are applied to a shared env.
- **Secrets:** rotate `PUSH_WEBHOOK_SECRET` (Edge secret + `push_config`) if leaked; none are in git.

---

## Self-Review

- **Spec coverage:** device_tokens+RLS (T1), pure routing/messages/receipts (T2), register-device+send-push+expo-push-client+config+excludes+secret (T3), pg_net triggers+push_config (T4), expo-notifications+push.ts+registration+deep-link (T5), RLS/secret + dev-build verification + Expo Go note + rollback (T6 + sections). Expo Push Service, server-only sending, admin read-only, future native_push_token — all covered.
- **Placeholder scan:** none; verification items concrete.
- **Type consistency:** `NotificationSpec` (T2) consumed by send-push (T3); helper names (`notificationsForBookingUpdate`/`notificationForPaymentPaid`/`notificationForChatMessage`/`buildExpoMessages`/`parsePushReceipts`) consistent T2↔T3; `routeForNotificationData` T5; `private.notify_send_push` + webhook payload shape consistent T4↔T3↔T6; `PUSH_WEBHOOK_SECRET` consistent T3↔T4↔T6.
