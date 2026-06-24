-- ============================================================
-- Slice 11 — Payments & Earnings schema
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Add quote columns to bookings
-- ----------------------------------------------------------------
alter table public.bookings
  add column if not exists quoted_amount numeric,
  add column if not exists provider_share numeric,
  add column if not exists quote_status text not null default 'pending'
    check (quote_status in ('pending','sent','accepted','declined'));

-- ----------------------------------------------------------------
-- 2. payments table
-- ----------------------------------------------------------------
create table if not exists public.payments (
  id                uuid        primary key default gen_random_uuid(),
  booking_id        uuid        not null unique references public.bookings(id) on delete cascade,
  customer_id       uuid        not null references public.profiles(id),
  amount            numeric     not null,
  currency          text        not null default 'KES',
  status            text        not null default 'pending'
                                  check (status in ('pending','paid','refunded','cancelled')),
  provider_share    numeric     not null,
  quickserve_share  numeric     not null,
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  constraint payments_shares_check
    check (provider_share >= 0 and quickserve_share >= 0
           and provider_share + quickserve_share = amount)
);
alter table public.payments enable row level security;

-- ----------------------------------------------------------------
-- 3. provider_earnings table
-- ----------------------------------------------------------------
create table if not exists public.provider_earnings (
  id             uuid        primary key default gen_random_uuid(),
  provider_id    uuid        not null references public.profiles(id),
  booking_id     uuid        not null unique references public.bookings(id) on delete cascade,
  amount         numeric     not null,
  payout_status  text        not null default 'pending'
                               check (payout_status in ('pending','paid')),
  created_at     timestamptz not null default now()
);
alter table public.provider_earnings enable row level security;

-- ----------------------------------------------------------------
-- 4. RLS policies
-- ----------------------------------------------------------------

-- payments: customer sees their own rows; admin sees all
create policy "payments_select" on public.payments
  for select using (customer_id = auth.uid() or public.is_admin());

-- provider_earnings: provider sees their own rows; admin sees all
create policy "provider_earnings_select" on public.provider_earnings
  for select using (provider_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------
-- 5a. Function: set_quote (admin only)
-- ----------------------------------------------------------------
create or replace function public.set_quote(
  p_booking_id     uuid,
  p_amount         numeric,
  p_provider_share numeric
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Permission denied';
  end if;
  if p_amount < 0 then
    raise exception 'Amount must be >= 0';
  end if;
  if p_provider_share < 0 or p_provider_share > p_amount then
    raise exception 'provider_share must be between 0 and amount';
  end if;
  update public.bookings
    set quoted_amount   = p_amount,
        provider_share  = p_provider_share,
        quote_status    = 'sent'
    where id = p_booking_id;
end; $$;

-- ----------------------------------------------------------------
-- 5b. Trigger: create payment row when quote is accepted
-- ----------------------------------------------------------------
create or replace function public.create_payment_on_accept()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.quote_status = 'accepted' and (old.quote_status is distinct from 'accepted') then
    insert into public.payments (
      booking_id,
      customer_id,
      amount,
      provider_share,
      quickserve_share
    ) values (
      new.id,
      new.customer_id,
      new.quoted_amount,
      new.provider_share,
      new.quoted_amount - new.provider_share
    )
    on conflict (booking_id) do nothing;
  end if;
  return new;
end; $$;

drop trigger if exists trg_create_payment_on_accept on public.bookings;
create trigger trg_create_payment_on_accept
  after update on public.bookings
  for each row execute function public.create_payment_on_accept();

-- ----------------------------------------------------------------
-- 5c. Function: pay_payment (customer pays their own pending payment)
-- ----------------------------------------------------------------
create or replace function public.pay_payment(p_payment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
begin
  select * into v_payment from public.payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found';
  end if;
  select * into v_booking from public.bookings where id = v_payment.booking_id;
  if v_payment.customer_id <> auth.uid() then
    raise exception 'Permission denied';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Payment is not in pending status';
  end if;
  if v_booking.status <> 'completed' then
    raise exception 'Booking is not completed';
  end if;
  update public.payments
    set status  = 'paid',
        paid_at = now()
    where id = p_payment_id;
end; $$;

-- ----------------------------------------------------------------
-- 5d. Trigger: create provider earning row when payment is paid
-- ----------------------------------------------------------------
create or replace function public.create_earning_on_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_provider_id uuid;
begin
  if new.status = 'paid' and (old.status is distinct from 'paid') then
    select assigned_provider_id into v_provider_id
      from public.bookings
      where id = new.booking_id;
    if v_provider_id is not null then
      insert into public.provider_earnings (
        provider_id,
        booking_id,
        amount
      ) values (
        v_provider_id,
        new.booking_id,
        new.provider_share
      )
      on conflict (booking_id) do nothing;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_create_earning_on_paid on public.payments;
create trigger trg_create_earning_on_paid
  after update on public.payments
  for each row execute function public.create_earning_on_paid();

-- ----------------------------------------------------------------
-- 5e. Function: override_payment_status (admin only)
-- ----------------------------------------------------------------
create or replace function public.override_payment_status(
  p_payment_id uuid,
  p_status     text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Permission denied';
  end if;
  if p_status not in ('pending','paid','refunded','cancelled') then
    raise exception 'Invalid status value';
  end if;
  update public.payments
    set status  = p_status,
        paid_at = case when p_status = 'paid' then now() else null end
    where id = p_payment_id;
end; $$;

-- ----------------------------------------------------------------
-- 5f. Function: mark_payout_paid (admin only)
-- ----------------------------------------------------------------
create or replace function public.mark_payout_paid(p_earning_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Permission denied';
  end if;
  update public.provider_earnings
    set payout_status = 'paid'
    where id = p_earning_id;
end; $$;
