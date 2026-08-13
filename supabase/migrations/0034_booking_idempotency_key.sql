-- Phase 4E.2 — precise booking submission idempotency (replaces the coarse active-dedup index).
--
-- 0033 added a partial unique index on (customer_id, service_id, scheduled_for) to stop
-- double-tap / retry duplicates. That over-blocks LEGITIMATE distinct jobs that share a
-- service + a deterministic scheduled time but differ by address/unit (e.g. two "Tomorrow
-- morning" plumbing jobs at Yaya Towers Floor 7 / 7B vs Floor 8 / 8A). Reproduced in QA:
-- the second insert failed with HTTP 409 / SQLSTATE 23505 on bookings_active_dedup.
--
-- Fix: identify a submission by a CLIENT-GENERATED idempotency key, not by service/time/
-- address similarity. One logical submission carries one key and reuses it across retries;
-- a genuinely new booking (including "Book another anyway") carries a NEW key.
--
--   * Add nullable bookings.idempotency_key uuid — backward-compatible; pre-existing rows
--     stay null and are unaffected.
--   * Unique index on idempotency_key (WHERE NOT NULL) — the authoritative, race-safe guard.
--     A duplicate submission (same key) raises 23505; the client resolves it by RECOVERING
--     the already-created booking (idempotent retry), never creating a second row.
--   * Drop the coarse bookings_active_dedup so distinct same-time / different-address jobs
--     are allowed again.
--
-- Smallest safe change: one nullable column + one partial unique index; drop the old index.
-- No RLS change (recovery SELECT uses the existing owner-scoped select policy). No rewrite.

alter table public.bookings
  add column if not exists idempotency_key uuid;

create unique index if not exists bookings_idempotency_key_uidx
  on public.bookings (idempotency_key)
  where idempotency_key is not null;

drop index if exists public.bookings_active_dedup;
