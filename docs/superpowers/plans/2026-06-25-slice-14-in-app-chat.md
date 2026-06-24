# Slice 14 — In-App Chat with Admin Oversight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-booking text chat between the customer and assigned provider with admin read-only oversight, no phone/email exposure.

**Architecture:** A `booking_messages` table with RLS scoping every row to the booking's customer, assigned provider, or admin; inserts allowed only to the two participants while a provider is assigned and the booking is active. A `get_chat_peer_name` security-definer RPC curates counterpart names. A shared `ChatThread` component (participant vs admin read-only) drives customer/provider chat screens and the admin viewer.

**Tech Stack:** Expo RN + TS, Expo Router, Supabase (Postgres + RLS), Jest + RNTL.

## Global Constraints

- DB pattern mirrors `0008`/`0011`: table → `enable row level security` → policies → `security definer set search_path = public` helper; existing `public.is_admin()` guard.
- Only the customer or assigned provider may send, only while `assigned_provider_id` is set and booking `status not in ('completed','cancelled')`. **Admin is read-only (no insert path).** No UPDATE/DELETE. `read_at` reserved/unused.
- No phone/email anywhere; counterpart names via `get_chat_peer_name` (customer→provider `full_name`; provider→customer first name; else null). Admin viewer labels Customer/Provider.
- `message_text` trimmed, non-empty, ≤ 2000 chars (DB check `char_length(btrim(message_text)) between 1 and 2000`).
- Lib mutations return `{ ok, error? }` with friendly strings; queries typed rows / `[]`. Reuse `Card`/`Text`/`Input`/`Button`/`EmptyState`/theme tokens.
- Merge gate: `npm test` green, `npx tsc --noEmit` clean (run after `expo export` so route types regenerate), Android bundle exports.

---

## File Structure

**Create**
- `supabase/migrations/0013_booking_messages.sql` — table, index, RLS, `get_chat_peer_name`.
- `src/lib/messages.ts` (+ test) — message helpers + `labelSender`.
- `src/components/ui/message-bubble.tsx` (+ test).
- `src/components/ui/chat-thread.tsx` (+ test).
- `src/app/booking/chat/[id].tsx` — customer chat screen.
- `src/app/provider/job/chat/[id].tsx` — provider chat screen.
- `docs/superpowers/verification/slice-14-chat.sql` — manual RLS/RPC verification.

**Modify**
- `src/lib/bookings.ts` — add `customer_id` to the `Booking` type.
- `src/app/booking/[id].tsx` — "Chat with provider" entry button.
- `src/app/provider/job/[id].tsx` — "Chat with customer" entry button.
- `src/app/admin/booking/[id].tsx` — read-only Conversation section.

---

## Task Order (dependency-ordered)

1. **T1** — Migration `0013` (table, index, RLS, `get_chat_peer_name`).
2. **T2** — `messages.ts` lib + `labelSender` + tests; add `customer_id` to `Booking`.
3. **T3** — `MessageBubble` component + test.
4. **T4** — `ChatThread` component (participant + readonly) + test.
5. **T5** — Customer + provider chat screens + entry buttons.
6. **T6** — Admin read-only Conversation section.
7. **T7** — Verification (RLS/RPC script + Expo Go) + final gate.

T3 independent of T1/T2. T4 depends on T2+T3. T5/T6 depend on T4.

---

### Task 1: DB migration `0013_booking_messages.sql`

**Files:** Create `supabase/migrations/0013_booking_messages.sql`

**Build (mirror `0008`):**
- `booking_messages`: `id uuid pk default gen_random_uuid()`, `booking_id uuid not null references public.bookings(id) on delete cascade`, `sender_id uuid not null references public.profiles(id)`, `message_text text not null check (char_length(btrim(message_text)) between 1 and 2000)`, `created_at timestamptz not null default now()`, `read_at timestamptz`. `enable row level security`.
- `create index if not exists booking_messages_booking_created_idx on public.booking_messages (booking_id, created_at);`
- **SELECT policy** `booking_messages_select`: `exists (select 1 from public.bookings b where b.id = booking_id and (b.customer_id = auth.uid() or b.assigned_provider_id = auth.uid() or public.is_admin()))`.
- **INSERT policy** `booking_messages_insert`: with check `sender_id = auth.uid() and exists (select 1 from public.bookings b where b.id = booking_id and b.assigned_provider_id is not null and b.status not in ('completed','cancelled') and (b.customer_id = auth.uid() or b.assigned_provider_id = auth.uid()))`. (No admin insert.)
- No UPDATE/DELETE policies.
- `get_chat_peer_name(p_booking_id uuid) returns text` `security definer set search_path = public`: load the booking; if `auth.uid() = customer_id` → return assigned provider's `full_name`; elsif `auth.uid() = assigned_provider_id` → return `split_part(customer's full_name, ' ', 1)`; else return null.

**Checks:**
- [ ] Migration applies cleanly; `\d booking_messages` shows columns/constraints/RLS + index; `get_chat_peer_name` exists.
- [ ] `npm test` green, `npx tsc --noEmit` clean (no app code yet).
- [ ] Commit `feat: slice14 booking_messages schema (0013)`.

> Behavioral RLS/RPC verification in T7.

---

### Task 2: `messages.ts` lib + Booking.customer_id

**Files:** Create `src/lib/messages.ts`, `src/lib/messages.test.ts`; Modify `src/lib/bookings.ts`

**Build:**
- `bookings.ts`: add `customer_id: string;` to the `Booking` type (already selected via `*`).
- `messages.ts`:
```ts
export type BookingMessage = { id; booking_id; sender_id; message_text; created_at; read_at: string | null };
getBookingMessages(bookingId): Promise<BookingMessage[]>          // select '*' where booking_id eq, order created_at ASC; [] on error
sendBookingMessage(bookingId, text): Promise<{ ok; error? }>     // trim; if empty → {ok:false,error:'Enter a message.'} (no call); insert { booking_id, sender_id: auth user id, message_text: trimmed }; RLS error → 'Could not send message. Please try again.'
getChatPeerName(bookingId): Promise<string | null>               // rpc 'get_chat_peer_name' { p_booking_id }; null on error
labelSender(senderId, booking: { customer_id; assigned_provider_id: string|null }): 'Customer'|'Provider'|'Unknown'  // pure
```

**Tests:** `getBookingMessages` rows/`[]`; `sendBookingMessage` empty-text → no supabase call, trims before insert, success, RLS error → friendly; `getChatPeerName` RPC name/args + null on error; `labelSender` all three branches.

**Steps:** TDD → `tsc` → commit `feat: slice14 messages lib`.

---

### Task 3: `MessageBubble`

**Files:** Create `src/components/ui/message-bubble.tsx` (+ test)

**Build:** props `{ text: string; timestamp: string; align: 'left'|'right'; label?: string }`. Right→tinted bg + `alignSelf:'flex-end'`; left→neutral card bg + `alignSelf:'flex-start'`. Optional `label` (caption above text); `text` body; timestamp caption via `new Date(timestamp).toLocaleTimeString()`.

**Tests:** renders text + label; right vs left alignment style differs; timestamp rendered.

**Steps:** TDD → `tsc` → commit `feat: slice14 message bubble`.

---

### Task 4: `ChatThread`

**Files:** Create `src/components/ui/chat-thread.tsx` (+ test)

**Consumes:** `getBookingMessages`, `sendBookingMessage`, `getChatPeerName`, `labelSender`, `type BookingMessage` (T2); `MessageBubble` (T3); `useAuth` for the current user id.

**Build:** props `{ bookingId: string; booking: { customer_id; assigned_provider_id: string|null; status }; mode: 'participant' | 'readonly' }`.
- On mount: `getBookingMessages(bookingId)` → list; participant mode also `getChatPeerName(bookingId)` → header name.
- Render header (participant: peer name; readonly: "Conversation"). Map messages to `MessageBubble`:
  - participant: `align = m.sender_id === currentUserId ? 'right' : 'left'`, no label.
  - readonly: `align='left'`, `label = labelSender(m.sender_id, booking)`.
- `EmptyState` ("No messages yet", icon "💬") when empty.
- Participant + active (`status` not in `completed`/`cancelled`): `Input` + Send `Button` → `sendBookingMessage`, on success clear input + reload messages; show inline error.
- Participant + terminal: caption "This conversation is closed." (no send box).
- Readonly: never a send box.

**Tests:** renders bubbles from mocked `getBookingMessages`; empty state; send calls `sendBookingMessage` + reloads; send box absent when status `completed`; readonly mode shows `labelSender` labels and no send box.

**Steps:** TDD → `tsc` → commit `feat: slice14 chat thread`.

---

### Task 5: Customer + provider chat screens + entry buttons

**Files:** Create `src/app/booking/chat/[id].tsx`, `src/app/provider/job/chat/[id].tsx`; Modify `src/app/booking/[id].tsx`, `src/app/provider/job/[id].tsx`

**Build:**
- Customer chat screen: `useLocalSearchParams` id → `getBookingById` → `<ChatThread bookingId booking mode="participant" />` in a SafeAreaView. Loading guard.
- Provider chat screen: same.
- Customer booking detail: add `<Button label="Chat with provider" onPress={() => router.push(\`/booking/chat/${id}\`)} />`, shown only when `booking.assigned_provider_id` is set.
- Provider job detail: add `<Button label="Chat with customer" onPress={() => router.push(\`/provider/job/chat/${id}\`)} />` (the job is the provider's assigned booking).

**Checks:** keep existing `booking-detail.test.tsx`/`provider-job-detail.test.tsx` green (mock `@/lib/messages`); `npm test`, `tsc`; commit `feat: slice14 customer + provider chat screens`.

---

### Task 6: Admin read-only Conversation section

**Files:** Modify `src/app/admin/booking/[id].tsx`

**Build:** add a `<Text variant="heading">Conversation</Text>` + `<ChatThread bookingId={id} booking={booking} mode="readonly" />` section (booking already loaded; ensure it carries `customer_id`/`assigned_provider_id`/`status`).

**Checks:** keep `admin-booking-detail.test.tsx` green (mock `@/lib/messages`); `npm test`, `tsc`; commit `feat: slice14 admin conversation viewer`.

---

### Task 7: Verification & final gate

**Files:** Create `docs/superpowers/verification/slice-14-chat.sql`

**RLS / RPC verification** (script + run against Supabase, document):
- [ ] Customer & assigned provider can SELECT + INSERT while booking active (provider assigned).
- [ ] INSERT blocked when `assigned_provider_id` is null, or `status in ('completed','cancelled')`.
- [ ] A different customer / unassigned provider cannot SELECT or INSERT.
- [ ] Admin can SELECT all; admin INSERT is rejected (no insert policy).
- [ ] No UPDATE/DELETE possible by anyone (no policies).
- [ ] `message_text` empty/blank or >2000 chars rejected by the check constraint.
- [ ] `get_chat_peer_name`: customer caller → provider full name; provider caller → customer first name; non-participant → null.

**Expo Go verification** (manual):
- [ ] `npx expo start --tunnel`; assign a provider; customer opens "Chat with provider", sends a message; provider opens "Chat with customer", sees it, replies; customer sees reply.
- [ ] Complete the booking → both send boxes show "This conversation is closed."; history still visible.
- [ ] Admin booking detail shows the conversation labeled Customer/Provider, no send box.
- [ ] No phone/email shown anywhere in chat.

**Final gate:**
- [ ] `npx expo export` → `npx tsc --noEmit` clean → `npm test` green → Android bundle exports.
- [ ] Commit `test: slice14 verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-14-chat` (created at execution). Abandon = `git checkout main` + delete branch; `main` untouched.
- **Single task regression:** `git revert <task-commit>` — tasks are independently committed; reverting a UI task leaves the lib/migration intact.
- **Schema rollback:** forward-only; if needed add `0014_rollback_booking_messages.sql`: `drop function if exists public.get_chat_peer_name(uuid); drop table if exists public.booking_messages cascade;`. Do not edit `0013` after it is applied to a shared environment.
- **Data note:** chat messages are user content — export `booking_messages` before any destructive rollback in a shared env; safe to drop in dev.

---

## Self-Review

- **Spec coverage:** table+index+RLS+RPC (T1), lib + `labelSender` + `Booking.customer_id` (T2), `MessageBubble` (T3), `ChatThread` participant/readonly (T4), customer+provider screens+entries (T5), admin read-only section (T6), RLS/RPC + Expo Go + rollback (T7 + sections). Identity curation, send-window gating, immutability, admin read-only — all covered.
- **Placeholder scan:** none; verification items concrete.
- **Type consistency:** `BookingMessage` (T2) consumed by `ChatThread` (T4); `labelSender` signature consistent T2↔T4↔T6; `get_chat_peer_name` RPC name consistent T1↔T2↔T7; `ChatThread` props (`bookingId`, `booking`, `mode`) consistent T4↔T5↔T6.
