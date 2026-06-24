-- ============================================================
-- Slice 12 — Payment Attempts schema
-- ============================================================

-- ----------------------------------------------------------------
-- 1. ALTER payments — add payment_method column
-- ----------------------------------------------------------------
alter table public.payments
  add column if not exists payment_method text
    check (payment_method in ('mpesa','card','cash'));   -- nullable until confirmed

-- ----------------------------------------------------------------
-- 2. payment_attempts table
-- ----------------------------------------------------------------
create table if not exists public.payment_attempts (
  id                  uuid        primary key default gen_random_uuid(),
  payment_id          uuid        not null references public.payments(id) on delete cascade,
  provider            text        not null check (provider in ('mpesa','card','cash')),
  phone               text,
  amount              numeric     not null,
  status              text        not null default 'pending'
                                    check (status in ('initiated','pending','successful','failed','cancelled')),
  external_reference  text,
  raw_response        jsonb,
  created_at          timestamptz not null default now()
);
-- No unique on payment_id — retries allowed.
alter table public.payment_attempts enable row level security;

-- ----------------------------------------------------------------
-- 3. RLS — select only (no write policies; writes go through SECURITY DEFINER fns)
-- ----------------------------------------------------------------
create policy "payment_attempts_select" on public.payment_attempts
  for select using (
    public.is_admin()
    or exists (select 1 from public.payments p
               where p.id = payment_id and p.customer_id = auth.uid())
  );

-- ----------------------------------------------------------------
-- 4a. Function: initiate_payment_attempt (customer-facing)
-- ----------------------------------------------------------------
create or replace function public.initiate_payment_attempt(
  p_payment_id         uuid,
  p_provider           text,
  p_phone              text,
  p_external_reference text,
  p_raw_response       jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_payment  public.payments%rowtype;
  v_booking  public.bookings%rowtype;
  v_attempt_id uuid;
begin
  -- Load payment
  select * into v_payment
    from public.payments
    where id = p_payment_id;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_payment.customer_id <> auth.uid() then
    raise exception 'Permission denied: payment does not belong to you';
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'Payment is not in pending status';
  end if;

  if p_provider not in ('mpesa','card','cash') then
    raise exception 'Invalid provider: must be mpesa, card, or cash';
  end if;

  -- Load booking
  select * into v_booking
    from public.bookings
    where id = v_payment.booking_id;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.status <> 'completed' then
    raise exception 'Booking is not completed';
  end if;

  -- Insert attempt (do NOT modify the payment)
  insert into public.payment_attempts (
    payment_id,
    provider,
    phone,
    amount,
    status,
    external_reference,
    raw_response
  ) values (
    p_payment_id,
    p_provider,
    p_phone,
    v_payment.amount,
    'pending',
    p_external_reference,
    p_raw_response
  )
  returning id into v_attempt_id;

  return v_attempt_id;
end; $$;

-- ----------------------------------------------------------------
-- 4b. Function: confirm_payment_attempt (admin only)
-- ----------------------------------------------------------------
create or replace function public.confirm_payment_attempt(p_attempt_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_attempt  public.payment_attempts%rowtype;
  v_payment  public.payments%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Permission denied';
  end if;

  -- Load attempt
  select * into v_attempt
    from public.payment_attempts
    where id = p_attempt_id;

  if not found then
    raise exception 'Payment attempt not found';
  end if;

  if v_attempt.status not in ('initiated','pending') then
    raise exception 'Payment attempt is not in a confirmable status (must be initiated or pending)';
  end if;

  -- Mark attempt as successful
  update public.payment_attempts
    set status = 'successful'
    where id = p_attempt_id;

  -- Load the associated payment
  select * into v_payment
    from public.payments
    where id = v_attempt.payment_id;

  -- If payment is still pending, confirm it (fires trg_create_earning_on_paid)
  if v_payment.status = 'pending' then
    update public.payments
      set status         = 'paid',
          paid_at        = now(),
          payment_method = v_attempt.provider
      where id = v_attempt.payment_id;
  end if;

  -- Cancel all other open attempts on the same payment
  update public.payment_attempts
    set status = 'cancelled'
    where payment_id = v_attempt.payment_id
      and id <> p_attempt_id
      and status in ('initiated','pending');
end; $$;

-- ----------------------------------------------------------------
-- 4c. Function: cancel_payment_attempt (admin only)
-- ----------------------------------------------------------------
create or replace function public.cancel_payment_attempt(p_attempt_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Permission denied';
  end if;

  update public.payment_attempts
    set status = 'cancelled'
    where id = p_attempt_id;
end; $$;

-- ----------------------------------------------------------------
-- 5. Retire Slice 11 self-pay function
-- ----------------------------------------------------------------
drop function if exists public.pay_payment(uuid);
