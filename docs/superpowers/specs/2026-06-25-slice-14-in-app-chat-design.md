# Slice 14 — In-App Chat with Admin Oversight (Design Spec)

**Date:** 2026-06-25
**Status:** Approved design → implementation plan
**Philosophy:** Customers hire QuickServe, not freelancers. Chat is for job coordination + proof, scoped to a single booking, with phone/email hidden and admin oversight retained.

---

## 1. Goal

Let a customer and the **assigned in-app provider** exchange text messages inside a booking, with admin able to read every conversation for quality control / disputes. Text only.

### Out of scope
Push notifications, realtime subscriptions, image/file/voice messages, message edit/delete, typing indicators, admin replies, blocking/reporting, read receipts/unread badges (the `read_at` column is reserved but unused this slice).

---

## 2. Access & Lifecycle Model

- **Availability:** chat exists for a booking only once `assigned_provider_id` is set (an in-app provider assigned).
- **Sending:** allowed to the customer and the assigned provider while booking `status` is **not** `cancelled` and **not** `completed`.
- **Read-only after terminal:** once `completed` or `cancelled`, no new messages; full history stays visible (proof/disputes).
- **Admin:** reads all conversations; **cannot send** (no admin replies this slice).
- **Identity:** no phone/email anywhere. Customer sees the provider's professional **full name**; provider sees the customer's **first name only**; admin's read-only view labels each side **Customer** / **Provider**.

---

## 3. Database — migration `0013_booking_messages.sql`

Mirrors the `0008`/`0011` pattern (table → RLS → policies → security-definer helper).

### 3.1 `booking_messages`
| column | type | notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| booking_id | uuid | FK → bookings, `on delete cascade` |
| sender_id | uuid | FK → profiles(id) (= `auth.uid()` at insert) |
| message_text | text | `check (char_length(btrim(message_text)) between 1 and 2000)` |
| created_at | timestamptz | default `now()` |
| read_at | timestamptz | nullable, **reserved/unused** this slice |

Index on `(booking_id, created_at)` for ordered history reads.

### 3.2 RLS
A booking is "accessible" to the caller when they are its customer, its assigned provider, or admin.

- **SELECT:** `exists (select 1 from public.bookings b where b.id = booking_id and (b.customer_id = auth.uid() or b.assigned_provider_id = auth.uid() or public.is_admin()))`.
- **INSERT (with check):** `sender_id = auth.uid()` AND `exists (select 1 from public.bookings b where b.id = booking_id and b.assigned_provider_id is not null and b.status not in ('completed','cancelled') and (b.customer_id = auth.uid() or b.assigned_provider_id = auth.uid()))`.
  - This lets only the customer or assigned provider insert, only while a provider is assigned and the booking is active. **Admin has no insert path** (oversight is read-only).
- **No UPDATE / DELETE policies** — messages are immutable; `read_at` is never written this slice.

### 3.3 Helper — `get_chat_peer_name(p_booking_id uuid) returns text`
`security definer set search_path = public`. Returns the counterpart's display name without exposing the profile row / contact details:
- caller is the booking's customer → the assigned provider's `full_name`;
- caller is the assigned provider → the customer's first name (`split_part(full_name, ' ', 1)`);
- otherwise (incl. admin) → `null`.
Raises nothing; returns `null` when not a participant. (Mirrors the curated `get_booking_professional` approach.)

---

## 4. Client Library — `src/lib/messages.ts`

Async helpers matching existing libs (`{ ok, error? }` / typed rows).
```ts
export type BookingMessage = {
  id: string; booking_id: string; sender_id: string;
  message_text: string; created_at: string; read_at: string | null;
};

// Participant or admin (RLS scopes rows). Ascending by created_at (chat order).
getBookingMessages(bookingId: string): Promise<BookingMessage[]>;

// Customer or assigned provider; sender_id is the signed-in user. Trims text;
// rejects empty. RLS rejects after completed/cancelled or for non-participants.
sendBookingMessage(bookingId: string, text: string): Promise<{ ok: boolean; error?: string }>;

// Counterpart display name for the chat header (via get_chat_peer_name RPC).
getChatPeerName(bookingId: string): Promise<string | null>;

// Pure helper for the ADMIN read-only viewer: label a message's sender.
labelSender(senderId: string, booking: { customer_id: string; assigned_provider_id: string | null }):
  'Customer' | 'Provider' | 'Unknown';
```
`Booking` already exposes `customer_id`? It does not — add `customer_id` to the `Booking` type (it is selected via `*`) so the admin viewer can label senders. (Small additive type change in `bookings.ts`.)

---

## 5. Components & UI

Reuse `Card`, `Text`, `Input`, `Button`, `EmptyState`, theme tokens.

- **`MessageBubble`** (`src/components/ui/message-bubble.tsx`) — props `{ text; timestamp; align: 'left'|'right'; label? }`. Right-aligned tinted bubble for own messages, left-aligned neutral for the other party; small caption timestamp (`toLocaleTimeString`); optional sender label (used by admin).
- **`ChatThread`** (`src/components/ui/chat-thread.tsx`) — the shared conversation UI. Props `{ bookingId; booking; mode: 'participant' | 'readonly' }`.
  - Loads `getBookingMessages` and (participant) `getChatPeerName` for the header.
  - Renders bubbles: participant mode aligns by `sender_id === current user` (right) vs other (left); readonly (admin) aligns all left and shows `labelSender(...)` labels.
  - `EmptyState` ("No messages yet") when empty.
  - Participant mode shows the **send box** (`Input` + Send `Button`) → `sendBookingMessage`, refreshing on success. The send box is **hidden/disabled** when `booking.status` is `completed`/`cancelled` (with a "This conversation is closed." caption). Readonly mode never shows a send box.

- **Customer chat screen** `src/app/booking/chat/[id].tsx` — loads the booking, renders `<ChatThread mode="participant">`. Entry: a **"Chat with provider"** button on `src/app/booking/[id].tsx`, shown only when `assigned_provider_id` is set.
- **Provider chat screen** `src/app/provider/job/chat/[id].tsx` — same `ChatThread`, participant mode. Entry: a **"Chat with customer"** button on `src/app/provider/job/[id].tsx`, shown when the job has the provider assigned.
- **Admin** — a read-only **"Conversation"** section on `src/app/admin/booking/[id].tsx` rendering `<ChatThread mode="readonly">` (labels Customer/Provider, no send box).

---

## 6. Testing

- **Lib tests** (`messages.test.ts`): `getBookingMessages` returns rows / `[]`; `sendBookingMessage` trims, rejects empty before any call, maps RLS error → friendly string; `getChatPeerName` via RPC; `labelSender` pure mapping (customer/provider/unknown).
- **Component tests:** `MessageBubble` (alignment, label, timestamp, text); `ChatThread` (renders bubbles, empty state, send calls `sendBookingMessage`, send box hidden when completed/cancelled, readonly hides send box and shows role labels).
- **Manual RLS verification** (`docs/superpowers/verification/slice-14-chat.sql`): non-participant cannot read/insert; customer & assigned provider can read+insert while active; insert blocked after `completed`/`cancelled`; admin can read, cannot insert; no update/delete possible; `get_chat_peer_name` returns provider name to customer, first name to provider, null otherwise.
- Merge gate: `npm test` green, `npx tsc --noEmit` clean (after `expo export` so route types regenerate), Android bundle exports.

---

## 7. Guardrails / Invariants

- Only the customer or assigned provider can send; only while a provider is assigned and booking is active. Admin is read-only.
- No phone/email exposed; counterpart names are curated via `get_chat_peer_name`.
- Messages immutable — no edit/delete/`read_at` writes this slice.
- Non-participants (other customers/providers) cannot read or send.
- History remains readable after completion/cancellation.

---

## 8. Deliverables

1. `supabase/migrations/0013_booking_messages.sql` (table, index, RLS, `get_chat_peer_name`).
2. `src/lib/messages.ts` (+ test); `customer_id` added to `Booking` type in `bookings.ts`.
3. `src/components/ui/message-bubble.tsx` + `src/components/ui/chat-thread.tsx` (+ tests).
4. Customer chat screen + entry button; provider chat screen + entry button.
5. Admin read-only Conversation section on the admin booking detail.
6. `docs/superpowers/verification/slice-14-chat.sql`.
