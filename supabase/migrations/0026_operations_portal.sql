-- ============================================================
-- Slice 31 — Operations Portal.
-- Admin-only (public.is_admin()). Append-only/immutable audit tables.
-- No enforcement wired (suspension is record-only).
-- Additive: no existing table/policy/data changed.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. support_cases
-- ----------------------------------------------------------------
create table if not exists public.support_cases (
  id                  uuid        primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Classification
  case_type           text        not null
    check (case_type in ('support','dispute'))
    default 'support',
  status              text        not null
    check (status in ('open','in_review','waiting_on_customer','waiting_on_provider','resolved','closed'))
    default 'open',
  priority            text        not null
    check (priority in ('low','medium','high','urgent'))
    default 'medium',

  -- Core fields
  subject             text        not null,
  description         text,

  -- Assignment
  assigned_to         uuid        references public.profiles(id),
  created_by          uuid        not null references public.profiles(id),

  -- Context (nullable)
  booking_id          uuid        references public.bookings(id),
  customer_id         uuid        references public.profiles(id),
  provider_id         uuid        references public.profiles(id),
  payment_id          uuid        references public.payments(id),
  review_id           uuid        references public.reviews(id),

  -- Dispute fields (nullable)
  dispute_kind        text
    check (dispute_kind in ('booking_dispute','payment_dispute','customer_complaint','provider_complaint')),
  resolution_outcome  text
    check (resolution_outcome in ('no_action','refund_recommended','wallet_credit_recommended','provider_warning','provider_suspension_recommended','customer_warning')),
  resolution_notes    text,
  resolved_at         timestamptz
);

alter table public.support_cases enable row level security;

create policy "support_cases_select" on public.support_cases
  for select using (public.is_admin());
create policy "support_cases_insert" on public.support_cases
  for insert with check (public.is_admin());
create policy "support_cases_update" on public.support_cases
  for update using (public.is_admin()) with check (public.is_admin());

-- Indexes on support_cases
create index if not exists support_cases_status_idx      on public.support_cases (status);
create index if not exists support_cases_priority_idx    on public.support_cases (priority);
create index if not exists support_cases_assigned_to_idx on public.support_cases (assigned_to);
create index if not exists support_cases_case_type_idx   on public.support_cases (case_type);
create index if not exists support_cases_booking_id_idx  on public.support_cases (booking_id);
create index if not exists support_cases_customer_id_idx on public.support_cases (customer_id);
create index if not exists support_cases_provider_id_idx on public.support_cases (provider_id);
create index if not exists support_cases_payment_id_idx  on public.support_cases (payment_id);
create index if not exists support_cases_review_id_idx   on public.support_cases (review_id);

-- ----------------------------------------------------------------
-- 2. support_case_notes — immutable: insert+select only, no update/delete
-- ----------------------------------------------------------------
create table if not exists public.support_case_notes (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  case_id     uuid        not null references public.support_cases(id),
  author_id   uuid        not null references public.profiles(id),
  body        text        not null,
  note_type   text        not null
    check (note_type in ('internal','resolution'))
    default 'internal'
);

alter table public.support_case_notes enable row level security;

-- immutable: insert+select only, no update/delete
create policy "support_case_notes_select" on public.support_case_notes
  for select using (public.is_admin());
create policy "support_case_notes_insert" on public.support_case_notes
  for insert with check (public.is_admin());

create index if not exists support_case_notes_case_id_idx on public.support_case_notes (case_id);

-- ----------------------------------------------------------------
-- 3. support_case_events — immutable: insert+select only, no update/delete
-- ----------------------------------------------------------------
create table if not exists public.support_case_events (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  case_id     uuid        not null references public.support_cases(id),
  actor_id    uuid        not null references public.profiles(id),
  event_type  text        not null,
  from_value  text,
  to_value    text
);

alter table public.support_case_events enable row level security;

-- immutable: insert+select only, no update/delete
create policy "support_case_events_select" on public.support_case_events
  for select using (public.is_admin());
create policy "support_case_events_insert" on public.support_case_events
  for insert with check (public.is_admin());

create index if not exists support_case_events_case_id_idx on public.support_case_events (case_id);

-- ----------------------------------------------------------------
-- 4. internal_notes — immutable: insert+select only, no update/delete
-- ----------------------------------------------------------------
create table if not exists public.internal_notes (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  subject_type text        not null
    check (subject_type in ('booking','customer','provider','payment')),
  subject_id   uuid        not null,
  author_id    uuid        not null references public.profiles(id),
  body         text        not null
);

alter table public.internal_notes enable row level security;

-- immutable: insert+select only, no update/delete
create policy "internal_notes_select" on public.internal_notes
  for select using (public.is_admin());
create policy "internal_notes_insert" on public.internal_notes
  for insert with check (public.is_admin());

create index if not exists internal_notes_subject_idx on public.internal_notes (subject_type, subject_id);

-- ----------------------------------------------------------------
-- 5. account_flags
-- append-only: never deleted; lift = active=false + lifted_by/at
-- record-only — no enforcement wired into login/booking/dispatch/payout
-- ----------------------------------------------------------------
create table if not exists public.account_flags (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  subject_id   uuid        not null references public.profiles(id),
  subject_role text        not null
    check (subject_role in ('customer','provider')),
  kind         text        not null
    check (kind in ('flag','suspension')),
  reason       text        not null,
  active       boolean     not null default true,
  created_by   uuid        not null references public.profiles(id),
  lifted_by    uuid        references public.profiles(id),
  lifted_at    timestamptz
);

alter table public.account_flags enable row level security;

-- append-only: never deleted; lift = active=false + lifted_by/at
-- record-only — no enforcement wired into login/booking/dispatch/payout
create policy "account_flags_select" on public.account_flags
  for select using (public.is_admin());
create policy "account_flags_insert" on public.account_flags
  for insert with check (public.is_admin());
create policy "account_flags_update" on public.account_flags
  for update using (public.is_admin()) with check (public.is_admin());

create index if not exists account_flags_subject_active_idx on public.account_flags (subject_id, active);
