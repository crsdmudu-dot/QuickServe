-- =================================================================================================
-- 0066 — Blocking between customers and providers (store-compliance F5.2)
-- =================================================================================================
-- WHY. Apple App Review Guideline 1.2 requires "the ability to block abusive users from the service";
-- Google Play's user-generated content policy requires in-app blocking of users. On KwikServe the
-- people who can reach each other are a booking's customer and its provider, through booking chat.
--
-- WHAT. A block works in BOTH directions, whoever created it:
--   1. user_blocks: one row per (blocker, blocked). Only the blocker can see or remove their own
--      block; the blocked person can never read it. Rows are written only by block_user and
--      unblock_user (no client write privilege).
--   2. booking_chat_blocked(booking): true when the booking's customer and provider block each
--      other. It answers only the two participants and active admins, and says nothing about WHO
--      blocked whom. booking_messages_insert (re-created from 0065) refuses new messages while
--      a block exists, so no chat message, notification or push passes between the pair.
--      Cancelling the booking and contacting support are untouched.
--   3. A BEFORE INSERT OR UPDATE OF assigned_provider_id trigger on bookings refuses to pair a
--      customer with a provider when either blocks the other (dispatch, and any direct insert).
--      admin_blocked_provider_ids lets the admin assign screen warn before the admin tries.
--   4. When an account is deleted (profiles.deleted_at set), its blocks are removed in both
--      directions. The certified deletion routines (0059-0061) are not changed.
--
-- PRIVILEGES. user_blocks: RLS on; every privilege revoked from public, anon and authenticated;
-- SELECT granted back to authenticated behind "own blocks or active admin". Every function is
-- SECURITY DEFINER with a fixed search_path; EXECUTE is revoked from public and anon, and the two
-- trigger functions are granted to no client role at all.
--
-- Depends on 0065 (is_active_admin, and the booking_messages_insert policy it re-creates).

-- ── 1. The table ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.user_blocks (
  blocker_id uuid        not null references public.profiles(id) on delete cascade,
  blocked_id uuid        not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
-- The primary key serves lookups by blocker; this one serves "is anyone blocking me/them".
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id, blocker_id);

revoke all on table public.user_blocks from public, anon, authenticated;
grant select on table public.user_blocks to authenticated;
drop policy if exists "user_blocks_select_own" on public.user_blocks;
create policy "user_blocks_select_own" on public.user_blocks
  for select to authenticated
  using (blocker_id = auth.uid() or public.is_active_admin());

-- ── 2. Block and unblock ──────────────────────────────────────────────────────────────────────
-- Only someone the caller can actually meet can be blocked: the other side of a shared booking,
-- or an approved provider. Anything else gets the same generic not_found.
create or replace function public.block_user(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = v_uid or not exists (
    select 1
      from public.profiles p
     where p.id = p_user_id
       and p.deleted_at is null
       and ((p.role = 'provider' and p.approval_status = 'approved')
            or exists (select 1 from public.bookings b
                        where (b.customer_id = v_uid and b.assigned_provider_id = p.id)
                           or (b.assigned_provider_id = v_uid and b.customer_id = p.id)))
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_uid, p_user_id)
  on conflict (blocker_id, blocked_id) do nothing;
end;
$$;
revoke execute on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.user_blocks
   where blocker_id = auth.uid()
     and blocked_id = p_user_id;
end;
$$;
revoke execute on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated;

-- The caller's own block list, with a display name: a provider's full name, a customer's first name
-- (as get_chat_peer_name does), "Deleted user" once tombstoned.
create or replace function public.get_my_blocked_users()
returns table (user_id uuid, display_name text, role text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ub.blocked_id,
         case when p.role = 'provider' then p.full_name
              else split_part(coalesce(p.full_name, ''), ' ', 1)
         end,
         p.role,
         ub.created_at
    from public.user_blocks ub
    join public.profiles p on p.id = ub.blocked_id
   where ub.blocker_id = auth.uid()
   order by ub.created_at desc;
$$;
revoke execute on function public.get_my_blocked_users() from public, anon;
grant execute on function public.get_my_blocked_users() to authenticated;

-- ── 3. Chat ───────────────────────────────────────────────────────────────────────────────────
-- TRUE when the booking's customer and assigned provider block each other, in either direction.
-- Answers only the two participants and active admins; FALSE for everyone else. Participants learn
-- only that chat is unavailable, never who blocked whom.
create or replace function public.booking_chat_blocked(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.bookings b
      join public.user_blocks ub
        on (ub.blocker_id = b.customer_id and ub.blocked_id = b.assigned_provider_id)
        or (ub.blocker_id = b.assigned_provider_id and ub.blocked_id = b.customer_id)
     where b.id = p_booking_id
       and (auth.uid() = b.customer_id
            or auth.uid() = b.assigned_provider_id
            or public.is_active_admin())
  );
$$;
revoke execute on function public.booking_chat_blocked(uuid) from public, anon;
grant execute on function public.booking_chat_blocked(uuid) to authenticated;

-- As 0065, plus: no new message while the pair block each other. The helper is SECURITY DEFINER
-- because the blocked person cannot read the block row under RLS.
drop policy if exists "booking_messages_insert" on public.booking_messages;
create policy "booking_messages_insert" on public.booking_messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and hidden_at is null
    and hidden_by is null
    and exists (select 1 from public.bookings b
                where b.id = booking_messages.booking_id
                  and b.assigned_provider_id is not null
                  and b.status not in ('completed','cancelled')
                  and (b.customer_id = auth.uid()
                       or b.assigned_provider_id = auth.uid()))
    and not public.booking_chat_blocked(booking_messages.booking_id)
  );

-- ── 4. Dispatch ───────────────────────────────────────────────────────────────────────────────
-- Refuses to put a customer and a provider on the same booking while either blocks the other.
-- Runs for every writer (admin dispatch, customer insert, service role); it checks only the pair.
create or replace function public.tg_bookings_block_pairing()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.assigned_provider_id is not null
     and (tg_op = 'INSERT' or new.assigned_provider_id is distinct from old.assigned_provider_id)
     and exists (
       select 1 from public.user_blocks ub
        where (ub.blocker_id = new.customer_id and ub.blocked_id = new.assigned_provider_id)
           or (ub.blocker_id = new.assigned_provider_id and ub.blocked_id = new.customer_id)
     ) then
    raise exception 'blocked_pair' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_bookings_block_pairing() from public, anon, authenticated;

drop trigger if exists trg_bookings_block_pairing on public.bookings;
create trigger trg_bookings_block_pairing
  before insert or update of assigned_provider_id on public.bookings
  for each row execute function public.tg_bookings_block_pairing();

-- For the admin assign screen: providers this customer blocks, or who block this customer.
create or replace function public.admin_blocked_provider_ids(p_customer_id uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_active_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  return query
    select ub.blocked_id from public.user_blocks ub where ub.blocker_id = p_customer_id
    union
    select ub.blocker_id from public.user_blocks ub where ub.blocked_id = p_customer_id;
end;
$$;
revoke execute on function public.admin_blocked_provider_ids(uuid) from public, anon;
grant execute on function public.admin_blocked_provider_ids(uuid) to authenticated;

-- ── 5. Account deletion ───────────────────────────────────────────────────────────────────────
-- When a profile is tombstoned, its blocks go in both directions. A separate trigger, so the
-- certified deletion routines (0059-0061) stay unchanged.
create or replace function public.tg_profiles_remove_blocks_on_tombstone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.user_blocks
     where blocker_id = new.id
        or blocked_id = new.id;
  end if;
  return null;
end;
$$;
revoke execute on function public.tg_profiles_remove_blocks_on_tombstone() from public, anon, authenticated;

drop trigger if exists trg_profiles_remove_blocks_on_tombstone on public.profiles;
create trigger trg_profiles_remove_blocks_on_tombstone
  after update of deleted_at on public.profiles
  for each row execute function public.tg_profiles_remove_blocks_on_tombstone();
