-- Phase 4D.2 — M-Pesa STK attempt timeout / reconciliation.
--
-- Gap: mpesa-stk-push records a 'pending' payment_attempt; if Daraja never delivers a
-- callback (network / delivery failure), the attempt stayed 'pending' forever — no
-- timeout, no reconciliation, no terminal state.
--
-- Smallest safe fix:
--  * add a terminal 'timed_out' status for stale attempts;
--  * a SERVICE-ROLE-ONLY reconcile function that marks stale pending M-Pesa attempts
--    (no callback received, older than the timeout window) as 'timed_out'. It NEVER
--    mutates public.payments, so it cannot falsely settle. The parent payment stays
--    'pending', so the customer can retry (mpesa-stk-push creates a new attempt) and a
--    late genuine SUCCESS callback can still settle it: 'timed_out' is deliberately NOT
--    in apply_mpesa_callback's terminal-idempotency set, and the payment update there is
--    guarded by `where status = 'pending'` (at most one settlement, no double pay);
--  * a pg_cron job runs the reconcile every 5 minutes (Supabase-native scheduler).
--
-- Timeout window: 5 minutes. Daraja's STK prompt times out on the handset after ~60s and
-- the result callback normally arrives within ~1-2 min; 5 min leaves comfortable margin so
-- in-flight transactions are never timed out prematurely. The reconcile accepts a
-- configurable p_max_age so QA can exercise it deterministically.
--
-- Does NOT modify historical migrations 0012 / 0035; does not weaken RLS; does not grant
-- any payment-mutating RPC to PUBLIC/anon/authenticated.

-- 1. Extend the payment_attempts status domain with a terminal 'timed_out' (forward-only).
alter table public.payment_attempts
  drop constraint if exists payment_attempts_status_check;
alter table public.payment_attempts
  add constraint payment_attempts_status_check
  check (status in ('initiated','pending','successful','failed','cancelled','timed_out'));

-- 2. Index to scan stale pending attempts efficiently.
create index if not exists payment_attempts_status_created_at_idx
  on public.payment_attempts (status, created_at);

-- 3. Reconcile function — marks stale pending M-Pesa attempts 'timed_out'. Returns the
--    number affected. NEVER touches public.payments (no settlement path here).
create or replace function public.reconcile_stale_payment_attempts(
  p_max_age interval default interval '5 minutes'
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  update public.payment_attempts
    set status = 'timed_out'
    where provider = 'mpesa'
      and status in ('initiated','pending')
      and callback_received_at is null
      and created_at < now() - p_max_age;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

-- Lock execution to service_role only (same posture as 0035; never PUBLIC/anon/authenticated).
revoke execute on function public.reconcile_stale_payment_attempts(interval) from public;
revoke execute on function public.reconcile_stale_payment_attempts(interval) from anon;
revoke execute on function public.reconcile_stale_payment_attempts(interval) from authenticated;
grant  execute on function public.reconcile_stale_payment_attempts(interval) to service_role;

-- 4. Automatic reconciliation every 5 minutes via pg_cron (Supabase-native; free).
create extension if not exists pg_cron;
select cron.schedule(
  'mpesa-reconcile-stale-attempts',
  '*/5 * * * *',
  $cron$ select public.reconcile_stale_payment_attempts(interval '5 minutes') $cron$
);
