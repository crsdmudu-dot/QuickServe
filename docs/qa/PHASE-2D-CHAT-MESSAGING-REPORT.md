# Phase 2D — Chat & Messaging Connected Coverage Report

> Connected certification of the **existing** chat/messaging domain against the
> dedicated, non-production QA project. No new feature, no product-behavior change, no
> migration. Results observed 2026-07-28. Env vars referenced by name only; no secrets.

## 1 Executive Summary

**14 new connected tests** were added for chat & messaging, raising the connected
certification suite **78 → 92**, all passing serially with deterministic cleanup
(**0 residual** messages/bookings). The tests drive the **real** `booking_messages` RLS +
constraints of the QA project — participant send/read, admin read-only, unrelated/anon
denial, sender-spoof denial, message-length integrity, the active-booking + assigned-
provider gates, ordering, no-dedup behavior, booking isolation, the absence of update/
delete, the message→notification async path, and the peer-name RPC. **No product defect
was found**; no migration or feature was added.

**This certifies connected database/RLS behavior only** — NOT realtime websocket delivery
(`booking_messages` is **not** in the realtime publication), push notifications, typing
indicators, read receipts (`read_at` is reserved/unused), or the UI chat flow. **Full
Platform Certification is not claimed.**

## 2 Starting Baseline

| Item | Value |
|---|---|
| Branch | `qa/phase-2d-chat-messaging` |
| Pre-work main | `a163fd693a91fff73340c5cd6714f9fc28af9ded` |
| Node / npm | v24.14.1 / 11.11.0 |
| Playwright / supabase-js | 1.61.1 / 2.108.2 |
| Connected certification (before) | 78 |
| Chat env vars | none (chat needs no dedicated env vars) |

## 3 Existing Chat Architecture

Verified from migration `0013` (+ `0020` notification trigger). **The booking is the
conversation** — there is no separate conversation or participant table.

- **`booking_messages`** — `id`, `booking_id` (FK bookings, **cascade**), `sender_id` (FK
  profiles), `message_text` with `CHECK char_length(btrim(message_text)) BETWEEN 1 AND 2000`,
  `created_at`, `read_at` (**reserved/unused this slice** — no read-receipt write path).
  Index on `(booking_id, created_at)` for ordered retrieval.
- **RLS select** (`booking_messages_select`): booking participants — customer / assigned
  provider / admin.
- **RLS insert** (`booking_messages_insert`): `sender_id = auth.uid()` AND the booking has an
  assigned provider AND `status NOT IN ('completed','cancelled')` AND the caller is the
  customer or the assigned provider. (Admin is a **reader only**, not an insert participant.)
- **No update or delete policy** — messages are **immutable** and **non-deletable** (removed
  only by booking cascade).
- **`get_chat_peer_name`** (RPC, SECURITY DEFINER) — returns the other party's name for a
  participant, `null` otherwise.
- **Async signaling:** `tg_notify_chat_message` (0020) creates a `chat_message` notification
  for the recipient on each message insert (NULL dedup_key — every message notifies).
- **Realtime:** `booking_messages` is **not** added to the `supabase_realtime` publication
  (only `provider_locations` is, in `0018`), and the app has **no** message channel
  subscription — chat updates are refetch-based, signalled by the notification path.

### Internal coverage matrix (implemented → covered)

| Operation | Authorized actor | Persisted | Constraint | New coverage |
|---|---|---|---|---|
| send message | customer / assigned provider (active booking) | booking_messages row | sender=self, 1–2000 chars, active + provider-assigned | ✅ + all negatives |
| read thread | customer / provider / admin | — | RLS participant scope | ✅ + unrelated/anon denial |
| ordering | any participant | — | created_at index | ✅ |
| update message | (none) | — | no policy | ✅ (proven absent) |
| delete message | (none) | — | no policy | ✅ (proven absent) |
| duplicate send | participant | two rows | no unique | ✅ (no false dedup) |
| notify peer | trigger | notification | — | ✅ (chat_message) |
| peer name | participant | — | RPC | ✅ (+ non-participant null) |

Cleanup: messages cascade on booking delete → teardown reuses `deleteBookingsByIds`.

## 4 Conversation Lifecycle

`booking created → provider assigned (thread becomes active) → customer/provider exchange
messages → each message notifies the peer → messaging closes when the booking reaches
completed/cancelled`. There is no explicit "create conversation" step (the booking is the
conversation) and no conversation row to duplicate. All exercised connected.

## 5 Connected Coverage Added

14 tests in `qa/playwright/certification/chat.spec.ts` (helper
`qa/playwright/support/connected/qa-chat.ts`): creation/persistence, participant + admin
read, admin-cannot-send + unrelated-denied, anon-denied, sender-spoof-denied, message
integrity (empty/whitespace/oversized/missing + 2000-char boundary), the completed-booking
and no-provider gates, ordering, no-dedup duplicates, booking isolation, immutability
(no update/delete), the message→notification path, and the peer-name RPC. Existing helpers
reused; no existing test modified.

## 6 Authorization and RLS

- **Send:** only the customer or the **assigned** provider of an **active** booking, as
  themselves. Admin **cannot** send; an unrelated provider cannot send; anonymous cannot send;
  a spoofed `sender_id` is rejected.
- **Read:** customer, assigned provider, and admin can read the thread; an unrelated provider
  and anonymous read **nothing** (RLS participant scope). Booking isolation holds (below).

## 7 Message Integrity

- **Length:** empty (`''`), whitespace-only (`'   '`), and oversized (`2001` chars) are
  rejected by the `char_length(btrim(...)) BETWEEN 1 AND 2000` check; a **2000-char** message is
  accepted (boundary). A missing `message_text` is rejected.
- **Author:** `sender_id` must equal the caller (`auth.uid()`); spoofing is denied.
- **Persistence:** valid messages persist with the correct `sender_id`, `booking_id`, and
  `created_at`.

## 8 Ordering and Isolation

- **Ordering:** three messages are returned in `created_at` ascending order matching send order
  (backed by the `(booking_id, created_at)` index).
- **Isolation:** a message sent on booking A is **not** present in booking B's thread; an
  unrelated provider sees none of a booking's messages; cross-booking posting is impossible
  (insert RLS requires participation in the target booking).

## 9 Duplicate Handling

`booking_messages` has **no unique constraint** on content — sending the same text twice stores
**two distinct rows** (verified), which is the implemented behavior (no idempotency/dedup on
chat messages). Ordering remains consistent by `created_at`.

## 10 Realtime-related Coverage

Chat has **no realtime websocket path**: `booking_messages` is not in the `supabase_realtime`
publication and the app does not subscribe to a message channel. The DB behavior that supports
asynchronous chat updates — the **`tg_notify_chat_message` → notification** path — is verified
(a message creates a `chat_message` notification for the peer). No websocket timing test was
attempted (none would be deterministic). Realtime websocket delivery, typing indicators, and
read receipts remain **out of scope / not implemented**.

## 11 Cleanup and Residual Data

Every created booking is tracked and deleted in `afterAll`; `booking_messages` (and the
message notifications) cascade on booking delete. Verified after the full certification run:
**0 residual QA-CERT bookings, 0 `booking_messages` project-wide**.

## 12 Files Changed

| File | Type |
|---|---|
| `qa/playwright/certification/chat.spec.ts` | new — 14 connected tests |
| `qa/playwright/support/connected/qa-chat.ts` | new — chat message helpers |
| `docs/qa/PHASE-2D-CHAT-MESSAGING-REPORT.md` | new — this report |

No `src/`, `supabase/`, migrations, existing tests, QA scripts, configuration, or deployment
files changed. No new dependency.

## 13 Validation Matrix

| Command | Status | Exit | Result |
|---|---|---|---|
| Chat spec alone (serial) | **Pass** | 0 | 14/14 (~46 s) |
| Full connected certification (serial) | **Pass** | 0 | **92/92** (78 + 14), ~2.6 m; 0 residual |
| Root Jest | **Pass** | 0 | 220/220, 2943/2943 |
| Website Vitest | **Pass** | 0 | 7 files, 102 tests |
| TypeScript (root) | **Pass** | 0 | 0 errors |
| TypeScript (qa) | **Pass** | 0 | 0 errors |
| Lint | **Deterministic; unchanged** | 1 | 489 pre-existing (qa/ ignored; no new findings) |
| Health | **Pass** | 0 | 19/19 |
| `qa:release` | **Pass** | 0 | 490s: jest 2943 → tsc 0 → web+android exports → serial cert **92/92** → non-cert browsers 130 passed / 56 skipped / 0 failed; 2 deterministic teardowns |
| Deterministic cleanup / residual | **Clean** | — | 0 bookings, 0 messages |

## 14 Defects or Limitations

**No product defect found.** Limitations (by design, not defects):

- **No update/delete** of messages (no RLS policy) — verified and recorded as implemented
  behavior, not a gap to "fix".
- **No read receipts** — `read_at` exists but is reserved/unused; no write path to test.
- **No realtime** websocket path for chat — verified absent (§10).
- **No content dedup** — identical messages are distinct rows by design.

## 15 Remaining Chat Gaps

- Realtime websocket delivery, typing indicators, read receipts (not implemented).
- Chat **push** delivery (the `send-push` edge / Expo relay — not exercised).
- UI chat flow (customer + provider screens, scroll/pagination UX).
- Message search / history pagination beyond ordered retrieval.

## 16 Pilot-readiness Impact

The chat/messaging domain gains **connected DB/RLS certification** for a limited internal
pilot: participant authorization, message integrity, booking gates, isolation, and the
async-notification path are proven. Realtime/push/UI chat surfaces remain **uncertified** and
are required for external pilot / public launch. No realtime or push claim is made.

## 17 Recommended Phase 2E Scope

Per the Phase 2A sequence, **Phase 2E — Provider-location authorization (connected)**:
assigned-provider location write authorization, participant read, one-row-per-booking (PK
upsert), and cross-booking isolation on `provider_locations`; realtime propagation, native
foreground/background, and maps explicitly excluded.

## 18 Final Status

Connected certification **92/92** (chat & messaging added), release gate green, **0 residual**.
Connected DB/RLS chat behavior is certified; **realtime, push, read receipts, typing, and UI
chat flows are not**. No migration or feature was introduced, and **Full Platform Certification
is not claimed**.
