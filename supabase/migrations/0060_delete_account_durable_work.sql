-- ============================================================================================
-- 0060 — delete_account v2: inventory cleanup intents atomically with the tombstone
-- ============================================================================================
--
-- Re-creates the three 0056 routines the Edge Function calls. The business rules of 0056 are
-- unchanged (blockers, throttle, what is deleted, what is anonymised). What changes:
--
--   * delete_account inventories every object the person uploaded INSIDE the same transaction
--     that writes the tombstone (0059 `_deletion_inventory`), and initialises the independent
--     state columns: access revoked, auth not started, cleanup pending. Cleanup is 'pending'
--     even when the inventory is empty: completion waits for a settling window (5 minutes) and a
--     second sweep; it then stays PROVISIONAL until the upload boundary (db_completed_at + 24 h)
--     has passed and a final sweep finds nothing (0059 header, "uploads in flight"), so an upload
--     that was already in flight at the tombstone is caught whenever it lands.
--   * complete_account_deletion and record_auth_deletion_failure maintain auth_state so the
--     worker's account-level recovery (0059 claim_auth_work) sees the truth.
--
-- This file is the latest owner of delete_account, complete_account_deletion and
-- record_auth_deletion_failure. A guard test pins that; a later migration that redefines them
-- must update the guard deliberately.

create or replace function public.delete_account(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  p public.profiles%rowtype;
  v_blockers jsonb;
  v_deletion_id uuid;
  v_intents integer;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Admin/support identities are removed by operations, never by self-service.
  if p.role = 'admin' then
    raise exception 'admin accounts cannot be self-deleted' using errcode = '42501';
  end if;

  -- Idempotent re-entry: the scrub already happened; report where we are, with the work state.
  if p.deletion_status in ('deleted', 'pending_auth_delete') then
    select d.id into v_deletion_id
      from public.account_deletions d
     where d.user_id = p_user and d.status <> 'blocked'
     order by d.requested_at desc limit 1;
    return jsonb_build_object(
      'status', p.deletion_status, 'idempotent', true, 'deletion_id', v_deletion_id,
      'cleanup_state', (select d.cleanup_state from public.account_deletions d where d.id = v_deletion_id),
      'auth_state',    (select d.auth_state    from public.account_deletions d where d.id = v_deletion_id));
  end if;

  v_blockers := public.account_deletion_blockers(p_user);
  if jsonb_array_length(v_blockers) > 0 then
    insert into public.account_deletions (user_id, role, status, blockers)
      values (p_user, p.role, 'blocked', v_blockers);
    return jsonb_build_object('status', 'blocked', 'blockers', v_blockers);
  end if;

  insert into public.account_deletions (user_id, role, status)
    values (p_user, p.role, 'pending_auth_delete')
    returning id into v_deletion_id;

  -- DELETE: disposable personal data with no financial or dispute basis.
  delete from public.device_tokens            where user_id = p_user;
  delete from public.notification_preferences where user_id = p_user;
  delete from public.notifications            where user_id = p_user;
  delete from public.customer_addresses       where customer_id = p_user;
  delete from public.favorite_providers       where customer_id = p_user or provider_id = p_user;
  delete from public.favorite_services        where customer_id = p_user;
  delete from public.provider_locations       where provider_id = p_user;
  delete from public.provider_conduct_acceptances where provider_id = p_user;

  -- ANONYMIZE: the tombstone. (Aggregates are unchanged in this increment; their treatment is an
  -- open owner decision recorded in the Phase B pack, not adopted here.)
  update public.profiles set
    full_name         = 'Deleted user',
    phone             = null,
    bio               = null,
    skills            = '{}'::text[],
    years_experience  = null,
    profile_photo_url = null,
    is_verified       = false,
    deleted_at        = now(),
    deletion_status   = 'pending_auth_delete'
  where id = p_user;

  -- ANONYMIZE: denormalised personal fields on retained financial rows.
  update public.bookings set
    address        = '[deleted]',
    notes          = null,
    latitude       = null,
    longitude      = null,
    landmark       = null,
    building_name  = null,
    door_number    = null,
    floor          = null,
    access_notes   = null,
    address_label  = null,
    service_details = null
  where customer_id = p_user;

  update public.bookings set
    assigned_provider_name  = 'Deleted provider',
    assigned_provider_phone = null
  where assigned_provider_id = p_user;

  update public.booking_messages set message_text = '[deleted]' where sender_id = p_user;
  update public.reviews set comment = null where customer_id = p_user;

  update public.payment_attempts pa set phone = '***' || right(pa.phone, 3)
  from public.payments pm join public.bookings b on b.id = pm.booking_id
  where pa.payment_id = pm.id and b.customer_id = p_user
    and pa.phone is not null and pa.phone not like '***%';

  -- DURABLE WORK: inventory the person's uploads in this same transaction. From here the
  -- restrictive policies (0056) and the tightened storage policy (0059) deny this identity any
  -- further write, so the inventory plus the worker's later sweep is complete.
  v_intents := public._deletion_inventory(v_deletion_id, p_user);

  update public.account_deletions set
      db_completed_at     = now(),
      access_state        = 'revoked',
      auth_state          = 'not_started',
      cleanup_state       = 'pending',
      cleanup_eligible_at = now() + interval '5 minutes',
      cleanup_boundary_at = now() + interval '24 hours'
    where id = v_deletion_id;

  return jsonb_build_object(
    'status', 'pending_auth_delete', 'deletion_id', v_deletion_id,
    'cleanup_state', 'pending', 'auth_state', 'not_started', 'intents', v_intents);
end;
$$;
revoke execute on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;

-- After auth.admin.deleteUser succeeded (or reported the identity already gone).
create or replace function public.complete_account_deletion(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_cleanup text;
begin
  update public.profiles set deletion_status = 'deleted'
    where id = p_user and deletion_status = 'pending_auth_delete';
  update public.account_deletions set
      status = 'deleted',
      auth_state = 'deleted',
      auth_deleted_at = coalesce(auth_deleted_at, now()),
      auth_attempts = auth_attempts + 1,
      auth_lease_id = null, auth_leased_until = null, auth_next_attempt_at = null,
      closed_at = case when cleanup_state in ('complete', 'complete_with_retained')
                       then coalesce(closed_at, now()) end
    where user_id = p_user and status = 'pending_auth_delete';
  select d.cleanup_state into v_cleanup
    from public.account_deletions d
   where d.user_id = p_user and d.status = 'deleted'
   order by d.requested_at desc limit 1;
  return jsonb_build_object('status', 'deleted', 'auth_state', 'deleted',
                            'cleanup_state', coalesce(v_cleanup, 'complete'));
end;
$$;
revoke execute on function public.complete_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.complete_account_deletion(uuid) to service_role;

-- A failed auth deletion: visible in the audit trail AND claimable by the worker after backoff.
create or replace function public.record_auth_deletion_failure(p_user uuid)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update public.account_deletions set
      auth_attempts = auth_attempts + 1,
      auth_state = case when auth_attempts + 1 >= 10 then 'needs_operator' else 'pending_retry' end,
      auth_last_error_class = case when auth_attempts + 1 >= 10 then 'attempt_ceiling' else 'transient' end,
      auth_next_attempt_at = now() + public._deletion_backoff(auth_attempts + 1)
    where user_id = p_user and status = 'pending_auth_delete';
$$;
revoke execute on function public.record_auth_deletion_failure(uuid) from public, anon, authenticated;
grant execute on function public.record_auth_deletion_failure(uuid) to service_role;
