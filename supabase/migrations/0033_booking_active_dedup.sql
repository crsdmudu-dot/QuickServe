-- Slice 44 RC1 — B2 (P0) fix: server-side duplicate-booking protection.
--
-- Before: `createBooking` was a plain INSERT with no idempotency, so an identical
-- payload (same customer, service, scheduled_for) submitted twice — sequentially,
-- concurrently, on retry, or on a double-tap — created two distinct bookings.
--
-- Fix: a PARTIAL UNIQUE INDEX. A customer may hold at most ONE *active* booking for
-- the same service at the same scheduled time. Terminal bookings (cancelled /
-- completed) are excluded, so a customer can legitimately re-book the same slot
-- after a prior one ends. A duplicate INSERT now raises unique_violation (23505),
-- which PostgREST returns as HTTP 409 and the app surfaces as a booking error.
--
-- Smallest production-safe change: index only, no table/column/trigger changes.
create unique index if not exists bookings_active_dedup
  on public.bookings (customer_id, service_id, scheduled_for)
  where status not in ('cancelled', 'completed');
