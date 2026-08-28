-- Forward reconciliation of the booking-idempotency schema (no history rewrite).
--
-- Why this migration exists.
-- Two files historically claimed migration version 0034:
--   * 0034_provider_terminal_states.sql   (2026-07-28) — later quarantined to migrations/archive/
--   * 0034_booking_idempotency_key.sql    (2026-08-12) — the executable 0034 today
-- The Supabase CLI keys migration history on the 4-digit version prefix, not the filename, and
-- supabase_migrations.schema_migrations holds a single 0034 row. Production recorded that row from
-- the EARLIER terminal-state migration, so the booking-idempotency schema never reached production
-- through migration history — and never can, because `db push` skips a version already recorded.
--
-- Verified read-only against production (pg_dump, schema-only) before authoring this file:
--   bookings.idempotency_key        ABSENT
--   bookings_idempotency_key_uidx   ABSENT
--   bookings_active_dedup           PRESENT
-- QA holds the intended state (column + partial unique index present, active-dedup dropped), so
-- every statement below is a no-op there apart from recording version 0039.
--
-- This migration reproduces ONLY the effective schema of 0034_booking_idempotency_key.sql. It adds
-- nothing, improves nothing, and touches no other object. Historical migrations are unmodified:
-- nothing renamed, renumbered, moved, edited or deleted, and `supabase migration repair` was
-- deliberately NOT used — remote migration history is left exactly as it is.
--
-- Semantics preserved verbatim from the source migration:
--   * idempotency_key is NULLABLE with no default. Pre-existing rows stay null and are unaffected;
--     no rewrite, no backfill.
--   * The unique index is PARTIAL (WHERE idempotency_key IS NOT NULL). The null exclusion is
--     deliberate: unlimited legacy and key-less rows must coexist, while any two submissions that
--     DO carry the same key collide. src/lib/bookings.ts sends idempotency_key on every insert and,
--     on 23505, recovers the existing booking by selecting on idempotency_key — so the index is the
--     race-safe guard that recovery path depends on.
--   * bookings_active_dedup is dropped. It uniquely constrains (customer_id, service_id,
--     scheduled_for) for non-terminal bookings, which over-blocks legitimate distinct jobs sharing a
--     service and a deterministic time but differing by address/unit. Leaving it in place would
--     reject bookings the current product intends to allow.
--
-- Depends on nothing in 0037/0038 and is depended on by neither; the three are independent and may
-- be applied in version order. Rollback: drop the index, drop the column, and re-create
-- bookings_active_dedup from 0033 if the coarse guard is genuinely wanted back.

alter table public.bookings
  add column if not exists idempotency_key uuid;

create unique index if not exists bookings_idempotency_key_uidx
  on public.bookings (idempotency_key)
  where idempotency_key is not null;

drop index if exists public.bookings_active_dedup;
