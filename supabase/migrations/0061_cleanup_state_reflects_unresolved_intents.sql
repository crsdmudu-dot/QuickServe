-- ============================================================================================
-- 0061 — Account-level cleanup state reflects unresolved intents after a partial hold release
-- ============================================================================================
--
-- Review finding (2026-09-24, on 0059 as applied to QA). Sequence: an account is
-- complete_with_retained with two held intents under two holds; one hold is released, so its
-- intent is re-planned (release_hold writes no account row, by the lock order); in the next
-- worker pass the intents stage runs first and that intent becomes needs_operator (for example
-- a permission failure); then list_cleanup_candidates ran and selected settled accounts only
-- when OPEN work existed or NO held intent remained. Neither held: the account stayed
-- complete_with_retained and closed, with an intent nobody would ever surface and a stale
-- retained reference. A successful partial release had the same reference-staleness: nothing
-- re-finalised the account while another intent stayed held.
--
-- Fix (smallest, lock order preserved, no account-row write inside any hold routine):
--   * list_cleanup_candidates also selects a settled account when any intent is needs_operator,
--     or when its recorded retained_exception_ref no longer equals the references of the holds
--     that still hold intents;
--   * try_complete_cleanup checks needs_operator intents before the uncovered-object test so the
--     account records the accurate reason ('intent_needs_operator').
-- 0059 and 0060 are applied to QA and are not modified; this file is the latest owner of the two
-- routines below.

create or replace function public.list_cleanup_candidates(p_limit integer default 25)
returns table (deletion_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select x.id from (
    -- pending accounts past the settling window
    select d.id, d.cleanup_eligible_at as due
      from public.account_deletions d
     where d.status <> 'blocked'
       and d.db_completed_at is not null
       and d.cleanup_state in ('not_started', 'pending')
       and d.cleanup_eligible_at is not null and d.cleanup_eligible_at <= now()
    union all
    -- provisional accounts: always once the boundary has passed (until a final sweep finalises
    -- them, however late the worker runs), and at most hourly before it
    select d.id, coalesce(d.last_sweep_at, d.cleanup_settled_at)
      from public.account_deletions d
     where d.status <> 'blocked'
       and d.cleanup_state = 'provisional'
       and (d.cleanup_boundary_at is null or d.cleanup_boundary_at <= now()
            or d.last_sweep_at is null or d.last_sweep_at < now() - interval '1 hour')
    union all
    -- settled accounts touched by a hold release: reopened, escalated or re-finalised here,
    -- lazily, so release_hold never has to lock an account_deletions row (lock order, header).
    -- Selected whenever the account-level state can disagree with its intents:
    --   * open work exists (planned / destroying / object_removed / object_absent);
    --   * an intent is needs_operator while the account is not (0061: a released intent that
    --     failed in the same worker pass was previously invisible here);
    --   * the recorded retained reference no longer equals the references of the holds that
    --     still hold intents (0061: a successful partial release was previously never refreshed).
    select d.id, d.cleanup_settled_at
      from public.account_deletions d
     where d.status <> 'blocked'
       and d.cleanup_state in ('provisional', 'complete_with_retained')
       and (exists (select 1 from public.deletion_photo_intents i
                     where i.account_deletion_id = d.id
                       and i.state in ('planned', 'destroying', 'object_removed', 'object_absent',
                                       'needs_operator'))
            or d.retained_exception_ref is distinct from
               (select string_agg(distinct h.reference, '; ' order by h.reference)
                  from public.deletion_photo_intents i
                  join public.legal_holds h on h.id = i.hold_id
                 where i.account_deletion_id = d.id and i.state = 'held'))
  ) x
  order by x.due, x.id
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;
revoke execute on function public.list_cleanup_candidates(integer) from public, anon, authenticated;
grant execute on function public.list_cleanup_candidates(integer) to service_role;

create or replace function public.try_complete_cleanup(p_deletion uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  d public.account_deletions%rowtype;
  v_new integer;
  v_refs text;
  v_state text;
begin
  select * into d from public.account_deletions where id = p_deletion;
  if not found then return jsonb_build_object('complete', false, 'reason', 'missing'); end if;
  perform public._deletion_lock(d.user_id, null);
  select * into d from public.account_deletions where id = p_deletion for update;

  -- 'complete' is terminal: the boundary passed and a final sweep found nothing.
  -- 'needs_operator' waits for a person. 'complete_with_retained' and 'provisional' can be
  -- reopened when a hold release re-plans intents (open work below).
  if d.cleanup_state = 'complete' then
    return jsonb_build_object('complete', true, 'cleanup_state', d.cleanup_state);
  end if;
  if d.cleanup_state = 'needs_operator' then
    return jsonb_build_object('complete', false, 'cleanup_state', d.cleanup_state);
  end if;
  if d.cleanup_state in ('not_started', 'pending')
     and (d.cleanup_eligible_at is null or d.cleanup_eligible_at > now()) then
    return jsonb_build_object('complete', false, 'reason', 'settling', 'cleanup_state', d.cleanup_state);
  end if;
  if exists (select 1 from public.deletion_photo_intents i
              where i.account_deletion_id = p_deletion
                and i.state in ('planned', 'destroying', 'object_removed', 'object_absent')) then
    if d.cleanup_state in ('provisional', 'complete_with_retained') then
      update public.account_deletions
         set cleanup_state = 'pending', cleanup_settled_at = null, final_sweep_at = null, closed_at = null
       where id = p_deletion;
      return jsonb_build_object('complete', false, 'reason', 'reopened', 'cleanup_state', 'pending');
    end if;
    return jsonb_build_object('complete', false, 'reason', 'work_pending', 'cleanup_state', d.cleanup_state);
  end if;
  -- 'complete_with_retained' with no open work falls through: the sweep, the checks and the
  -- boundary re-run, and the retained references are recomputed (a release may have emptied them).

  -- SWEEP (every path through here sweeps and then runs the uncovered-object check, so an object
  -- that reappears at an already-inventoried path — where ON CONFLICT inserts nothing — is still
  -- caught by the check below, never bypassed).
  v_new := public._deletion_inventory(p_deletion, d.user_id);
  update public.account_deletions set last_sweep_at = now() where id = p_deletion;
  if v_new > 0 then
    update public.account_deletions
       set cleanup_state = 'pending', cleanup_settled_at = null, final_sweep_at = null, closed_at = null
     where id = p_deletion;
    return jsonb_build_object('complete', false,
                              'reason', case when d.cleanup_state = 'provisional' then 'reopened' else 'new_intents' end,
                              'new_intents', v_new, 'cleanup_state', 'pending');
  end if;

  -- An intent that needs a person makes the ACCOUNT need a person (0061: checked before the
  -- uncovered-object test so the recorded reason is the intent's, not "uninventoried").
  if exists (select 1 from public.deletion_photo_intents i
              where i.account_deletion_id = p_deletion and i.state = 'needs_operator') then
    -- An account that needs a person is not closed, whatever an earlier finalisation recorded.
    update public.account_deletions
       set cleanup_state = 'needs_operator', cleanup_settled_at = now(), closed_at = null where id = p_deletion;
    return jsonb_build_object('complete', false, 'reason', 'intent_needs_operator',
                              'cleanup_state', 'needs_operator');
  end if;

  -- Anything the person still owns that is not covered by a held intent cannot be inventoried
  -- (the path was already used by a verified intent): operator.
  if exists (
       select 1 from storage.objects so
        where so.bucket_id = 'booking-photos' and so.owner_id = d.user_id::text
          and not exists (select 1 from public.deletion_photo_intents i
                           where i.account_deletion_id = p_deletion
                             and i.object_path = so.name and i.state = 'held'))
     or exists (
       select 1 from public.booking_photos bp
        where bp.uploaded_by = d.user_id
          and not exists (select 1 from public.deletion_photo_intents i
                           where i.account_deletion_id = p_deletion
                             and i.object_path = bp.photo_url and i.state = 'held')) then
    update public.account_deletions
       set cleanup_state = 'needs_operator', cleanup_settled_at = now(), closed_at = null where id = p_deletion;
    return jsonb_build_object('complete', false, 'reason', 'uninventoried_owned_data',
                              'cleanup_state', 'needs_operator');
  end if;

  select string_agg(distinct h.reference, '; ' order by h.reference) into v_refs
    from public.deletion_photo_intents i
    join public.legal_holds h on h.id = i.hold_id
   where i.account_deletion_id = p_deletion and i.state = 'held';

  -- Before the upload boundary: provisional. Everything known is done; late objects can still land.
  if d.cleanup_boundary_at is null or d.cleanup_boundary_at > now() then
    update public.account_deletions
       set cleanup_state = 'provisional', cleanup_settled_at = coalesce(cleanup_settled_at, now()),
           retained_exception_ref = v_refs
     where id = p_deletion;
    return jsonb_build_object('complete', false, 'reason', 'awaiting_boundary',
                              'cleanup_state', 'provisional', 'boundary_at', d.cleanup_boundary_at,
                              'retained_exception_ref', v_refs);
  end if;

  -- At or after the boundary, with this sweep clean: final.
  v_state := case when v_refs is not null then 'complete_with_retained' else 'complete' end;
  update public.account_deletions
     set cleanup_state = v_state, cleanup_settled_at = coalesce(cleanup_settled_at, now()),
         final_sweep_at = now(), retained_exception_ref = v_refs,
         closed_at = case when auth_state = 'deleted' then coalesce(closed_at, now()) end
   where id = p_deletion;
  return jsonb_build_object('complete', true, 'cleanup_state', v_state,
                            'retained_exception_ref', v_refs, 'final_sweep_at', now());
end;
$$;
revoke execute on function public.try_complete_cleanup(uuid) from public, anon, authenticated;
grant execute on function public.try_complete_cleanup(uuid) to service_role;
