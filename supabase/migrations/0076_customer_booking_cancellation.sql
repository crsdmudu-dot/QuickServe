-- 0076_customer_booking_cancellation.sql - Update 74, the feature: customers cancel in the app.
--
-- FINAL NUMBER 0076. U74 precedes the v1 activation on every environment (PM stage 119; numbering N1:
-- H1 0073, H2 0074, H3 0075, the feature 0076). Two packages must never hold the same number, and the
-- Supabase CLI refuses a lower number once a higher one is recorded on an environment.
--
-- REQUIRES H1 (0073, the terminal-status guard) AND H2 (0074, the location lock).
-- Without H1 a provider's in-flight status change could turn a customer's cancellation back into
-- 'in_progress' (P1). Without H2 a location write in flight at the moment of cancellation could re-create
-- the tracking row this function deletes (P4). The owner chose Option B (2026-10-03 19:19), and PM stage
-- 107 requires H2 to be live no later than the feature, so the self-check below stops this file unless
-- both are in place. H1 and H2 themselves depend on nothing and stay independently releasable. U74-H3
-- (the location visibility, 0075) is independent of this file.
--
-- DECIDED POLICY. The owner's decisions of 2026-10-03 19:19 EAT
-- (kwikserve-updates/74e-cancellation-owner-decisions/00-OWNER-DECISIONS-2026-10-03-1919.md, items 1-8)
-- sit in ONE block at the top of customer_cancel_booking (marked "OWNER DECISIONS"), so a later decision
-- changes one place here; the app's mirror is src/constants/cancellation.ts, and the guard test
-- src/__tests__/customer-cancellation-migration-guard.test.ts keeps the two equal. The decisions are
-- binding; the customer-, provider- and operator-facing TEXTS in this file are still DRAFT (text approval
-- is separate).
--
-- WHAT THIS ADDS
--   1. public.booking_cancellations: one audit row per customer cancellation (who, when, the status it was
--      cancelled from, the optional reason code, the provider, payment and tracking situation). The
--      customer reads their own rows, active admins read all, no client writes, deleted or suspended
--      identities are refused (the 0056 restrictive pattern). No free text, so no personal data beyond
--      the ids and no deletion scrub; it is a booking record kept with the booking.
--   2. accept_quote refuses a cancelled booking (a quote still "sent" when a booking is cancelled could
--      otherwise be accepted and create a fresh pending payment). Same signature and message.
--   3. public.customer_cancel_booking(booking, reason, idempotency key): the only customer write path.
--      Manually dispatched bookings have the same eligibility as in-app ones (owner item 3): the admins
--      are told to phone the provider, and an admin sets 'in_progress' when a manual provider starts work
--      (an operational rule; see 74e MANUAL-DISPATCH-FINDING.md).
--      Under one transaction: lock the booking (FOR NO KEY UPDATE), check the caller owns it, decide
--      eligibility, lock the payment, refuse anything that involves money (Get help), write the provider
--      and admin notices with the status trigger's own dedup keys (so its generic copies become no-ops),
--      delete the tracking row, change the status only if it is still the one read under the lock, close
--      an unpaid payment, write the audit row. Repeats return 'already_cancelled' and write nothing.
--   4. trg_bookings_customer_cancel_notice: when anyone other than the customer cancels a booking, the
--      customer gets one in-app notice (owner item 6; before, an admin cancellation told them nothing).
--
-- LOCKS. Booking FOR NO KEY UPDATE, then payment FOR UPDATE: the order every other path that holds both
-- uses (0045). NO KEY UPDATE conflicts with the provider's and the admin's status updates and with H2's
-- FOR SHARE in the location write, but not with the KEY SHARE locks that foreign-key inserts take
-- (wallet ledger, promo redemptions, messages), so it adds no lock-order cycle. FOR UPDATE would give the
-- same exclusion and only make those foreign-key inserts wait as well.
--
-- NOT CHANGED: the Update 50 M-PESA functions and RPCs (a cancelled booking's payment is no longer pending,
-- so reserve_mpesa_attempt refuses it, and the app never offers Pay on a cancelled booking); the 0072
-- Terms objects; the admins' status powers (GAP-L3-4); decline_quote; set_quote; the activity trigger.
--
-- ROLLBACK (only if ever needed; keep the audit rows): revoke execute on customer_cancel_booking from
-- authenticated (the app then sends customers to Get help), or drop the function; re-create accept_quote
-- from 0010 (CREATE OR REPLACE); drop trigger trg_bookings_customer_cancel_notice on public.bookings. The
-- table and its rows are records and stay.

-- ── 1. Audit table ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.booking_cancellations (
  booking_id            uuid        primary key references public.bookings (id) on delete cascade,
  cancelled_by          uuid        not null references public.profiles (id),
  actor_role            text        not null check (actor_role = 'customer'),
  -- The statuses before work starts (structural; the eligible set is the OD-74-1/3/4 decision below).
  from_status           text        not null
                          check (from_status in ('pending', 'accepted', 'provider_assigned', 'on_the_way')),
  -- The allowed codes are the OD-74-9 decision in the function; here only their shape is checked.
  reason_code           text        check (reason_code ~ '^[a-z_]{1,40}$'),
  idempotency_key       uuid        not null,
  provider_id           uuid        references public.profiles (id),
  manual_provider       boolean     not null,
  quote_status          text        not null,
  payment_id            uuid        references public.payments (id) on delete set null,
  payment_status_before text        check (payment_status_before in ('pending', 'cancelled')),
  location_cleared      boolean     not null,
  cancelled_at          timestamptz not null default now()
);
alter table public.booking_cancellations enable row level security;
revoke all on table public.booking_cancellations from public, anon, authenticated;
grant select on table public.booking_cancellations to authenticated;

drop policy if exists booking_cancellations_select on public.booking_cancellations;
create policy booking_cancellations_select on public.booking_cancellations
  for select to authenticated
  using (cancelled_by = auth.uid() or public.is_active_admin());

drop policy if exists booking_cancellations_deny_deleted_identity on public.booking_cancellations;
create policy booking_cancellations_deny_deleted_identity on public.booking_cancellations
  as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

-- ── 2. A cancelled booking's quote cannot be accepted ───────────────────────────────────────────
-- 0010's function, verbatim, except "and status <> 'cancelled'".
create or replace function public.accept_quote(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update public.bookings
    set quote_status = 'accepted'
    where id = p_booking_id
      and customer_id = auth.uid()
      and quote_status = 'sent'
      and status <> 'cancelled';
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Quote cannot be accepted (not found, not yours, or not awaiting your response)';
  end if;
end; $$;

-- ── 3. The customer cancellation function ───────────────────────────────────────────────────────
create or replace function public.customer_cancel_booking(
  p_booking_id      uuid,
  p_reason_code     text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- ══ OWNER DECISIONS (2026-10-03 19:19 EAT; 74e/00-OWNER-DECISIONS-2026-10-03-1919.md) ══════════
  -- OD-74-1, OD-74-3, OD-74-4 DECIDED (owner item 1; item 5: actual work-start status decides): a
  -- customer may cancel before work starts: awaiting assignment, assigned, travelling and arrived
  -- (arrival is not recorded and is not work started). Work started = 'in_progress'.
  c_cancellable_statuses constant text[] := array['pending', 'accepted', 'provider_assigned', 'on_the_way'];
  -- OD-74-2 DECIDED (owner item 3): manually dispatched bookings have the same eligibility; no exception
  -- after assignment. The admins are told to phone the provider (c_admin_manual_note below).
  -- OD-74-9 DECIDED (owner item 5): the reason is optional; admins see it, providers never do.
  c_reason_codes constant text[] := array['plans_changed', 'booked_by_mistake', 'found_another_option',
                                          'provider_late', 'other'];
  -- OD-74-6 DECIDED (owner item 4): a payment, an attempt, wallet credit or a promotion on the booking
  --          means support-assisted handling under the approved refund process (R1b). No money moves in
  --          this function.
  -- OD-74-5 DECIDED (owner item 1): no customer cancellation fee (this function never charges).
  -- OD-74-7 UNDECIDED (owner item 8): provider compensation for wasted travel; nothing here promises it.
  -- OD-74-8 DECIDED (owner item 5): no Terms check in this function (the app exempts these screens).
  -- OD-74-10 DECIDED: Option B, in-app cancellation at launch (not a code value).
  -- OD-74-11 not decided by the owner: Get help uses the app's existing support email (not here).
  -- OD-74-12 DECIDED through owner item 6: when anyone other than the customer cancels, the customer
  --          gets an in-app notice (trigger trg_bookings_customer_cancel_notice, section 4 below).
  -- OD-74-13 DECIDED (owner item 5): no time limit.
  -- DRAFT texts (text approval is separate; 74e WORDING-OPTION-B-rev3.md):
  c_provider_title constant text := 'Booking cancelled';
  c_provider_body  constant text := 'The customer cancelled this booking. You do not need to go.';
  c_admin_title    constant text := 'Booking cancelled by the customer';
  c_admin_manual_note constant text :=
    ' The provider was arranged by phone and gets no app notice: phone them now to tell them.';
  -- ═════════════════════════════════════════════════════════════════════════════════════════════
  v_uid     uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_payment public.payments%rowtype;
  v_prior   public.booking_cancellations%rowtype;
  v_manual  boolean;
  v_rows    integer;
  v_cleared boolean;
  v_state   text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.is_active_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_booking_id is null or p_idempotency_key is null
     or (p_reason_code is not null and not (p_reason_code = any (c_reason_codes))) then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  -- Lock the booking (see LOCKS in the header). Not the caller's, or missing: the same answer.
  select * into v_booking from public.bookings where id = p_booking_id for no key update;
  if not found or v_booking.customer_id is distinct from v_uid then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- Already cancelled (this request repeated, another tap or device, or KwikServe): nothing changes.
  if v_booking.status = 'cancelled' then
    select * into v_prior from public.booking_cancellations where booking_id = p_booking_id;
    return jsonb_build_object(
      'ok', true,
      'outcome', 'already_cancelled',
      'cancelled_by', case when v_prior.cancelled_by = v_uid then 'you' else 'kwikserve' end,
      'same_request', coalesce(v_prior.idempotency_key = p_idempotency_key, false),
      'cancelled_at', v_prior.cancelled_at);
  end if;

  -- Eligibility by status.
  if v_booking.status = 'in_progress' then
    return jsonb_build_object('ok', false, 'code', 'work_started');
  end if;
  if v_booking.status = 'completed' then
    return jsonb_build_object('ok', false, 'code', 'completed');
  end if;
  if not (v_booking.status = any (c_cancellable_statuses)) then
    return jsonb_build_object('ok', false, 'code', 'needs_support');
  end if;

  -- A provider recorded only by name (manual dispatch): same eligibility (owner item 3). The app cannot
  -- tell them, so the admins' notice says to phone them; work start is known only when an admin sets
  -- 'in_progress' (the operational rule in 74e MANUAL-DISPATCH-FINDING.md).
  v_manual := v_booking.assigned_provider_id is null
              and coalesce(btrim(v_booking.assigned_provider_name), '') <> '';

  -- Payment, locked after the booking.
  select * into v_payment from public.payments where booking_id = p_booking_id for update;
  if found then
    if v_payment.status in ('paid', 'refunded') then
      return jsonb_build_object('ok', false, 'code', 'payment_recorded');
    end if;
    if v_payment.status = 'pending' then
      if exists (select 1 from public.payment_attempts a
                  where a.payment_id = v_payment.id
                    and a.status in ('initiated', 'pending', 'timed_out', 'successful')) then
        return jsonb_build_object('ok', false, 'code', 'payment_in_progress');
      end if;
      if v_payment.wallet_applied > 0 or v_payment.promo_discount > 0 or v_payment.promo_code_id is not null then
        return jsonb_build_object('ok', false, 'code', 'needs_support');
      end if;
    end if;
  end if;

  v_state := case v_booking.status
               when 'pending' then 'that was waiting for confirmation'
               when 'accepted' then 'that was accepted, with no provider yet'
               when 'provider_assigned' then 'that was assigned to a provider'
               when 'on_the_way' then 'while the provider was on the way'
             end;

  -- Notices first, with the status trigger's dedup keys (0020), so its generic copies are no-ops
  -- (notify_user inserts ON CONFLICT (dedup_key) DO NOTHING). A null provider is skipped by notify_user.
  perform public.notify_user(
    v_booking.assigned_provider_id,
    p_booking_id,
    c_provider_title,
    c_provider_body,
    'booking_cancelled',
    'booking',
    '/provider/job/' || p_booking_id::text,
    v_booking.assigned_provider_id::text || ':' || p_booking_id::text || ':booking_cancelled');
  perform public.notify_admins(
    p_booking_id,
    c_admin_title,
    'A customer cancelled a booking ' || v_state || '.' || case when v_manual then c_admin_manual_note else '' end,
    'admin_customer_cancelled',
    '/admin/booking/' || p_booking_id::text,
    p_booking_id::text || ':admin_cancelled_after_assign');

  -- Stop tracking first (the booking row is locked, so with H2 no location write can slip in between;
  -- doing it before the status change keeps location_cleared true whether or not U74-H3's trigger runs).
  delete from public.provider_locations where booking_id = p_booking_id;
  v_cleared := found;

  -- The transition, only from the status read under the lock.
  update public.bookings
     set status = 'cancelled'
   where id = p_booking_id
     and status = v_booking.status;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'cancel_state_changed' using errcode = 'P0001';
  end if;

  -- An unpaid payment can no longer become payable (no attempt exists: checked above).
  if v_payment.id is not null and v_payment.status = 'pending' then
    update public.payments set status = 'cancelled', paid_at = null
     where id = v_payment.id and status = 'pending';
  end if;

  insert into public.booking_cancellations (
    booking_id, cancelled_by, actor_role, from_status, reason_code, idempotency_key, provider_id,
    manual_provider, quote_status, payment_id, payment_status_before, location_cleared)
  values (
    p_booking_id, v_uid, 'customer', v_booking.status, p_reason_code, p_idempotency_key,
    v_booking.assigned_provider_id, v_manual, v_booking.quote_status, v_payment.id, v_payment.status,
    v_cleared);

  return jsonb_build_object(
    'ok', true,
    'outcome', 'cancelled',
    'from_status', v_booking.status,
    'cancelled_at', now(),
    'payment', case when v_payment.id is null then 'none'
                    when v_payment.status = 'pending' then 'cancelled'
                    else v_payment.status end,
    'provider_notified', v_booking.assigned_provider_id is not null,
    'manual_provider', v_manual);
end;
$$;
revoke all on function public.customer_cancel_booking(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.customer_cancel_booking(uuid, text, uuid) to authenticated;

-- ── 4. The customer is told when anyone else cancels (owner item 6; OD-74-12) ─────────────────────
-- An admin (or a service path) cancelling a booking sends the provider and the admins a notice (0020), but
-- the customer got nothing (GAP-L3-5). This adds one in-app notice to the customer, once per booking (the
-- dedup key), whenever the booking becomes 'cancelled' by anyone other than the customer. The customer's
-- own cancellation is confirmed on screen, so it adds nothing then. DRAFT text.
create or replace function public.tg_bookings_customer_cancel_notice()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not distinct from new.customer_id then
    return null;
  end if;
  perform public.notify_user(
    new.customer_id,
    new.id,
    'Booking cancelled',
    'KwikServe has cancelled this booking. Open it to see the details, or email support@kwikserve.co.ke if you have a question.',
    'booking_cancelled',
    'booking',
    '/booking/' || new.id::text,
    new.customer_id::text || ':' || new.id::text || ':booking_cancelled_by_kwikserve');
  return null;
end;
$$;
revoke execute on function public.tg_bookings_customer_cancel_notice() from public, anon, authenticated;

drop trigger if exists trg_bookings_customer_cancel_notice on public.bookings;
create trigger trg_bookings_customer_cancel_notice
  after update of status on public.bookings
  for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function public.tg_bookings_customer_cancel_notice();

-- ── 5. Self-check: stop (and undo everything above) if the result is not exactly as intended ────
do $$
declare
  rpc constant regprocedure := 'public.customer_cancel_booking(uuid, text, uuid)'::regprocedure;
begin
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.bookings'::regclass and tgname = 'trg_bookings_terminal_guard' and not tgisinternal
                    and tgfoid = to_regprocedure('public.tg_bookings_terminal_guard()') and tgenabled = 'O') then
    raise exception '0076 self-check: H1 (the terminal guard, 0073) is not applied';
  end if;
  if position('for share' in coalesce(pg_get_functiondef(to_regprocedure(
       'public.upsert_provider_location(uuid, double precision, double precision, double precision, double precision)')), '')) = 0 then
    raise exception '0076 self-check: H2 (the location lock, 0074) is not applied';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.bookings'::regclass and tgname = 'trg_bookings_customer_cancel_notice'
                    and not tgisinternal and tgenabled = 'O') then
    raise exception '0076 self-check: the customer notice trigger is missing';
  end if;
  if has_function_privilege('authenticated', 'public.tg_bookings_customer_cancel_notice()'::regprocedure, 'EXECUTE')
     or has_function_privilege('anon', 'public.tg_bookings_customer_cancel_notice()'::regprocedure, 'EXECUTE') then
    raise exception '0076 self-check: the customer notice function is executable by a client role';
  end if;
  if has_function_privilege('anon', rpc, 'EXECUTE') then
    raise exception '0076 self-check: customer_cancel_booking is executable by anon';
  end if;
  if not has_function_privilege('authenticated', rpc, 'EXECUTE') then
    raise exception '0076 self-check: customer_cancel_booking is not executable by authenticated';
  end if;
  if has_table_privilege('authenticated', 'public.booking_cancellations', 'INSERT')
     or has_table_privilege('authenticated', 'public.booking_cancellations', 'UPDATE')
     or has_table_privilege('authenticated', 'public.booking_cancellations', 'DELETE')
     or has_table_privilege('anon', 'public.booking_cancellations', 'SELECT') then
    raise exception '0076 self-check: a client role can write or anon can read booking_cancellations';
  end if;
  if not has_function_privilege('authenticated', 'public.accept_quote(uuid)'::regprocedure, 'EXECUTE') then
    raise exception '0076 self-check: accept_quote lost its authenticated grant';
  end if;
end $$;
