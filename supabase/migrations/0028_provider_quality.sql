-- ============================================================
-- Slice 33 — Provider Quality.
-- Additive: provider_quality_actions (admin-recorded, record-only, append-only;
-- provider_visible gate) + provider_conduct_acceptances (owner-recorded).
-- No enforcement, no suspension, no existing object altered.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. provider_quality_actions
--    record-only / append-only; provider_visible=false rows are
--    NEVER visible to the provider.
-- ----------------------------------------------------------------
create table if not exists public.provider_quality_actions (
  id               uuid        primary key default gen_random_uuid(),
  provider_id      uuid        not null references public.profiles(id) on delete cascade,
  action_type      text        not null
    check (action_type in (
      'coaching_needed',
      'coaching_completed',
      'warning_given',
      'improvement_observed',
      'temporarily_paused_recommended',
      'no_action'
    )),
  note             text,
  provider_visible boolean     not null default false,
  created_by       uuid        not null references public.profiles(id),
  created_at       timestamptz not null default now()
);

create index if not exists provider_quality_actions_provider_idx
  on public.provider_quality_actions (provider_id, created_at desc);

alter table public.provider_quality_actions enable row level security;

-- Exactly 3 policies: admin select, admin insert, provider select (own + visible).
-- NO update/delete policy. NO customer/public policy.
-- Append-only: provider_visible=false rows are NEVER visible to the provider.
create policy "pqa_admin_select" on public.provider_quality_actions
  for select using (public.is_admin());

create policy "pqa_admin_insert" on public.provider_quality_actions
  for insert with check (public.is_admin());

create policy "pqa_provider_select" on public.provider_quality_actions
  for select using (provider_id = auth.uid() and provider_visible = true);

-- ----------------------------------------------------------------
-- 2. provider_conduct_acceptances
--    owner-recorded; unique(provider_id, version); append-only.
-- ----------------------------------------------------------------
create table if not exists public.provider_conduct_acceptances (
  id          uuid        primary key default gen_random_uuid(),
  provider_id uuid        not null references public.profiles(id) on delete cascade,
  version     text        not null,
  accepted_at timestamptz not null default now(),
  unique (provider_id, version)
);

create index if not exists provider_conduct_acceptances_provider_idx
  on public.provider_conduct_acceptances (provider_id);

alter table public.provider_conduct_acceptances enable row level security;

-- Exactly 3 policies: owner insert, owner select, admin select.
-- NO update/delete policy.
create policy "pca_owner_insert" on public.provider_conduct_acceptances
  for insert with check (provider_id = auth.uid());

create policy "pca_owner_select" on public.provider_conduct_acceptances
  for select using (provider_id = auth.uid());

create policy "pca_admin_select" on public.provider_conduct_acceptances
  for select using (public.is_admin());

-- ============================================================
-- RPCs — 2 SECURITY DEFINER functions
-- ============================================================

-- ----------------------------------------------------------------
-- RPC 1. record_provider_quality_action
-- RECORD-ONLY: no update to profiles/approval_status, no
-- dispatch/payout, no suspension side effect.
-- ----------------------------------------------------------------
create or replace function public.record_provider_quality_action(
  p_provider_id      uuid,
  p_action_type      text,
  p_note             text,
  p_provider_visible boolean
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;

  insert into public.provider_quality_actions
    (provider_id, action_type, note, provider_visible, created_by)
  values
    (p_provider_id, p_action_type, p_note, coalesce(p_provider_visible, false), auth.uid())
  returning id into v_id;

  return v_id;
end; $$;

-- ----------------------------------------------------------------
-- RPC 2. accept_provider_conduct
-- Idempotent: on conflict (provider_id, version) do nothing.
-- ----------------------------------------------------------------
create or replace function public.accept_provider_conduct(p_version text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.provider_conduct_acceptances (provider_id, version)
  values (auth.uid(), p_version)
  on conflict (provider_id, version) do nothing;
end; $$;
