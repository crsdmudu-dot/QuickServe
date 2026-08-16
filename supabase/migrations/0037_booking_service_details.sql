-- Service Details V1.1 — structured service information on bookings.
--
-- Problem: a booking currently records only `service_id` (a service slug) plus free-text
-- `notes`. Information that is fundamental to defining the job — what kind of clean, which
-- appliance, how many bedrooms, the requested grocery items — has nowhere structured to live,
-- so it is either lost or buried in optional notes. Notes cannot be dispatched on, matched on,
-- or analysed.
--
-- Fix: ONE nullable jsonb column holding an immutable SNAPSHOT of the customer's structured
-- answers, taken at submission time. The snapshot carries both machine keys (for future
-- pricing / dispatch / analytics) and human-readable labels (so a booking stays readable after
-- the service configuration changes). See src/lib/service-details.ts for the shape.
--
-- Deliberately additive and reversible:
--   * NULLABLE, no default, no backfill — every pre-existing booking stays valid and renders
--     exactly as it does today (service_details is simply null).
--   * No RLS change — inherits the existing owner-scoped booking policies unchanged.
--   * No index. A GIN index is premature; add one only when a real query needs it.
--   * No dedup change. 0034 already dropped bookings_active_dedup and replaced database-level
--     duplicate prevention with bookings_idempotency_key_uidx, which is variant-agnostic and
--     needs no adjustment for structured service details.
--   * No pricing, fulfilment, sourcing, or inventory schema — later phases. Future fulfilment
--     data must be written to SEPARATE structures keyed by booking_id, never by mutating this
--     snapshot: the customer's original request is immutable evidence.
--
-- Rollback: alter table public.bookings drop column service_details;

alter table public.bookings
  add column if not exists service_details jsonb;

comment on column public.bookings.service_details is
  'Immutable snapshot of the structured Service Details answered at booking time '
  '(machine keys + human-readable labels + schema/form versions). Null for bookings '
  'created before Service Details V1. Never re-resolved from current configuration.';
