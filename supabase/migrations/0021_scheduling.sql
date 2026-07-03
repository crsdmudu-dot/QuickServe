-- Slice 24 scheduling — additive, backward-compatible; `scheduled_for` stays canonical; recurrence stored NOT executed (future-ready).
alter table public.bookings
  add column if not exists scheduling_type text not null default 'datetime'
    check (scheduling_type in ('asap','today','tomorrow','date','datetime')),
  add column if not exists time_window text
    check (time_window in ('morning','afternoon','evening','specific','flexible')),
  add column if not exists window_start timestamptz,
  add column if not exists window_end   timestamptz,
  add column if not exists recurrence   text not null default 'one_time'
    check (recurrence in ('one_time','weekly','biweekly','monthly','custom'));

create index if not exists bookings_scheduled_for_idx on public.bookings (scheduled_for);
