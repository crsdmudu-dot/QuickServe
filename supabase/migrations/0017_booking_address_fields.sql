-- Slice 20 — structured address fields on bookings (all nullable; backward-compatible).
-- Existing `address text not null` is unchanged; consumers fall back to it when these are null.
alter table public.bookings
  add column if not exists address_label  text,
  add column if not exists latitude       double precision,
  add column if not exists longitude      double precision,
  add column if not exists building_name  text,
  add column if not exists floor          text,
  add column if not exists door_number    text,
  add column if not exists landmark       text,
  add column if not exists access_notes   text;
