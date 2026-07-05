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

-- ============================================================
-- RPCs — 9 admin-only SECURITY DEFINER functions
-- All guarded by public.is_admin().
-- Case-mutating RPCs write support_case_events + bump updated_at
-- in the same transaction.
-- ============================================================

-- ----------------------------------------------------------------
-- RPC 1. create_support_case
-- ----------------------------------------------------------------
create or replace function public.create_support_case(
  p_case_type    text,
  p_priority     text,
  p_subject      text,
  p_description  text,
  p_booking_id   uuid,
  p_customer_id  uuid,
  p_provider_id  uuid,
  p_payment_id   uuid,
  p_review_id    uuid,
  p_dispute_kind text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;

  insert into public.support_cases (
    case_type, status, priority, subject, description,
    created_by, booking_id, customer_id, provider_id,
    payment_id, review_id, dispute_kind
  )
  values (
    coalesce(p_case_type, 'support'), 'open', coalesce(p_priority, 'medium'),
    p_subject, p_description, auth.uid(),
    p_booking_id, p_customer_id, p_provider_id,
    p_payment_id, p_review_id, p_dispute_kind
  )
  returning id into v_id;

  insert into public.support_case_events (case_id, actor_id, event_type)
  values (v_id, auth.uid(), 'created');

  return v_id;
end; $$;

-- ----------------------------------------------------------------
-- RPC 2. update_support_case_status
-- ----------------------------------------------------------------
create or replace function public.update_support_case_status(
  p_case_id uuid,
  p_status  text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old text;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;

  select status into v_old from public.support_cases where id = p_case_id;

  update public.support_cases
  set
    status     = p_status,
    updated_at = now(),
    resolved_at = case
                    when p_status = 'resolved' then now()
                    when p_status = 'closed'   then resolved_at
                    else null
                  end
  where id = p_case_id;

  insert into public.support_case_events (case_id, actor_id, event_type, from_value, to_value)
  values (p_case_id, auth.uid(), 'status_changed', v_old, p_status);
end; $$;

-- ----------------------------------------------------------------
-- RPC 3. update_support_case_priority
-- ----------------------------------------------------------------
create or replace function public.update_support_case_priority(
  p_case_id  uuid,
  p_priority text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old text;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;

  select priority into v_old from public.support_cases where id = p_case_id;

  update public.support_cases
  set priority   = p_priority,
      updated_at = now()
  where id = p_case_id;

  insert into public.support_case_events (case_id, actor_id, event_type, from_value, to_value)
  values (p_case_id, auth.uid(), 'priority_changed', v_old, p_priority);
end; $$;

-- ----------------------------------------------------------------
-- RPC 4. assign_support_case
-- ----------------------------------------------------------------
create or replace function public.assign_support_case(
  p_case_id  uuid,
  p_assignee uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old uuid;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;

  if p_assignee is not null then
    if not exists (
      select 1 from public.profiles where id = p_assignee and role = 'admin'
    ) then
      raise exception 'assignee must be an admin';
    end if;
  end if;

  select assigned_to into v_old from public.support_cases where id = p_case_id;

  update public.support_cases
  set assigned_to = p_assignee,
      updated_at  = now()
  where id = p_case_id;

  if p_assignee is not null then
    insert into public.support_case_events (case_id, actor_id, event_type, to_value)
    values (p_case_id, auth.uid(), 'assigned', p_assignee::text);
  else
    insert into public.support_case_events (case_id, actor_id, event_type, from_value)
    values (p_case_id, auth.uid(), 'unassigned', v_old::text);
  end if;
end; $$;

-- ----------------------------------------------------------------
-- RPC 5. set_dispute_outcome
-- Records the recommended outcome only — NO refund/wallet action.
-- ----------------------------------------------------------------
create or replace function public.set_dispute_outcome(
  p_case_id          uuid,
  p_outcome          text,
  p_resolution_notes text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;

  update public.support_cases
  set resolution_outcome = p_outcome,
      resolution_notes   = coalesce(p_resolution_notes, resolution_notes),
      updated_at         = now()
  where id = p_case_id;

  insert into public.support_case_events (case_id, actor_id, event_type, to_value)
  values (p_case_id, auth.uid(), 'outcome_set', p_outcome);
end; $$;

-- ----------------------------------------------------------------
-- RPC 6. add_support_case_note
-- ----------------------------------------------------------------
create or replace function public.add_support_case_note(
  p_case_id   uuid,
  p_body      text,
  p_note_type text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;

  insert into public.support_case_notes (case_id, author_id, body, note_type)
  values (p_case_id, auth.uid(), p_body, coalesce(p_note_type, 'internal'))
  returning id into v_id;

  update public.support_cases
  set updated_at = now()
  where id = p_case_id;

  insert into public.support_case_events (case_id, actor_id, event_type)
  values (p_case_id, auth.uid(), 'note_added');

  return v_id;
end; $$;

-- ----------------------------------------------------------------
-- RPC 7. add_internal_note
-- Not tied to a support_case — no case event written.
-- ----------------------------------------------------------------
create or replace function public.add_internal_note(
  p_subject_type text,
  p_subject_id   uuid,
  p_body         text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;

  insert into public.internal_notes (subject_type, subject_id, author_id, body)
  values (p_subject_type, p_subject_id, auth.uid(), p_body)
  returning id into v_id;

  return v_id;
end; $$;

-- ----------------------------------------------------------------
-- RPC 8. flag_account
-- RECORD-ONLY: does NOT update profiles, approval_status, dispatch, or login.
-- ----------------------------------------------------------------
create or replace function public.flag_account(
  p_subject_id   uuid,
  p_subject_role text,
  p_kind         text,
  p_reason       text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;

  insert into public.account_flags (subject_id, subject_role, kind, reason, active, created_by)
  values (p_subject_id, p_subject_role, p_kind, p_reason, true, auth.uid())
  returning id into v_id;

  return v_id;
end; $$;

-- ----------------------------------------------------------------
-- RPC 9. lift_account_flag
-- ----------------------------------------------------------------
create or replace function public.lift_account_flag(
  p_flag_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;

  update public.account_flags
  set active    = false,
      lifted_by = auth.uid(),
      lifted_at = now()
  where id = p_flag_id;
end; $$;
