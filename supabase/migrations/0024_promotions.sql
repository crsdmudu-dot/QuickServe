-- ============================================================
-- Slice 27 — Promotions schema + redeem_promo + promo-aware apply_wallet
-- ============================================================

-- ----------------------------------------------------------------
-- 1. promo_codes — admin-managed promotional codes
-- ----------------------------------------------------------------
create table if not exists public.promo_codes (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,                                   -- store UPPERCASE
  discount_type   text not null check (discount_type in ('percentage','fixed','wallet_credit')),
  discount_value  numeric not null check (discount_value > 0),            -- pct (1–100) or KES
  max_discount    numeric,                                                -- optional cap for percentage (KES)
  max_redemptions int,                                                    -- optional total cap
  per_user_limit  int not null default 1,
  starts_at       timestamptz,
  ends_at         timestamptz,
  is_active       boolean not null default true,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);
alter table public.promo_codes enable row level security;

-- ADMIN-ONLY (customers redeem by exact code via redeem_promo; they never enumerate codes):
create policy "promo_codes_select" on public.promo_codes for select using (public.is_admin());
create policy "promo_codes_insert" on public.promo_codes for insert with check (public.is_admin());
create policy "promo_codes_update" on public.promo_codes for update using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------
-- 2. promo_redemptions — immutable, append-only ledger
-- ----------------------------------------------------------------
create table if not exists public.promo_redemptions (
  id              uuid primary key default gen_random_uuid(),
  promo_code_id   uuid not null references public.promo_codes(id) on delete cascade,
  customer_id     uuid not null references public.profiles(id),
  booking_id      uuid references public.bookings(id) on delete set null,
  payment_id      uuid references public.payments(id) on delete set null,
  discount_type   text not null,                                          -- snapshot
  discount_amount numeric not null,                                       -- applied discount / credited (KES)
  created_at      timestamptz not null default now()
);
alter table public.promo_redemptions enable row level security;

-- SELECT own or admin. NO provider policy. NO update/delete/insert policy (append-only, RPC-only writes).
create policy "promo_redemptions_select" on public.promo_redemptions for select using (customer_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------
-- 3. payments additions — additive, backward-compatible
-- ----------------------------------------------------------------
alter table public.payments
  add column if not exists promo_discount numeric not null default 0 check (promo_discount >= 0),
  add column if not exists promo_code_id  uuid references public.promo_codes(id);

-- ----------------------------------------------------------------
-- 4. RPC: redeem_promo — customer redeems a promo code on a payment
--    Returns the discount amount applied (or wallet credit posted).
-- ----------------------------------------------------------------
create or replace function public.redeem_promo(
  p_payment_id uuid,
  p_code       text
)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid; v_amount numeric; v_applied numeric; v_promo numeric;
  v_promo_id uuid; v_status text; v_booking uuid;
  pc record; v_remaining numeric; v_disc numeric;
begin
  select customer_id, amount, wallet_applied, promo_discount, promo_code_id, status, booking_id
    into v_customer, v_amount, v_applied, v_promo, v_promo_id, v_status, v_booking
    from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
  if v_customer <> auth.uid() then raise exception 'Not your payment'; end if;
  if v_status <> 'pending' then raise exception 'Payment is not pending'; end if;
  if v_promo_id is not null then raise exception 'Promo already applied'; end if;

  select * into pc from public.promo_codes where code = upper(btrim(p_code));
  if not found or not pc.is_active
     or (pc.starts_at is not null and pc.starts_at > now())
     or (pc.ends_at   is not null and pc.ends_at   < now()) then
    raise exception 'Promo code is not valid';
  end if;
  if pc.max_redemptions is not null
     and (select count(*) from public.promo_redemptions where promo_code_id = pc.id) >= pc.max_redemptions then
    raise exception 'Promo fully redeemed';
  end if;
  if (select count(*) from public.promo_redemptions where promo_code_id = pc.id and customer_id = auth.uid()) >= pc.per_user_limit then
    raise exception 'Promo limit reached';
  end if;

  v_remaining := v_amount - v_applied - v_promo;   -- promo is 0 here (one-per-payment)

  if pc.discount_type = 'percentage' then
    v_disc := v_amount * pc.discount_value / 100.0;
    if pc.max_discount is not null then v_disc := least(v_disc, pc.max_discount); end if;
    v_disc := least(v_disc, v_remaining);
    update public.payments set promo_discount = v_disc, promo_code_id = pc.id where id = p_payment_id;
  elsif pc.discount_type = 'fixed' then
    v_disc := least(pc.discount_value, v_remaining);
    update public.payments set promo_discount = v_disc, promo_code_id = pc.id where id = p_payment_id;
  else  -- wallet_credit: post to wallet, do NOT discount the payment
    perform public._wallet_post(auth.uid(), 'promo_credit', pc.discount_value, 'Promo: '||pc.code, v_booking, null, null);
    v_disc := pc.discount_value;
    update public.payments set promo_code_id = pc.id where id = p_payment_id;
  end if;

  insert into public.promo_redemptions (promo_code_id, customer_id, booking_id, payment_id, discount_type, discount_amount)
    values (pc.id, auth.uid(), v_booking, p_payment_id, pc.discount_type, v_disc);

  -- Auto-settle (percentage/fixed only) when promo+wallet fully cover a completed booking
  if pc.discount_type in ('percentage','fixed')
     and (v_applied + v_disc) = v_amount
     and exists (select 1 from public.bookings b where b.id = v_booking and b.status = 'completed') then
    update public.payments set status = 'paid', paid_at = now() where id = p_payment_id;
  end if;

  return v_disc;
end; $$;

-- ----------------------------------------------------------------
-- 5. Recreate apply_wallet_to_payment — promo-aware
--    Additive: promo_discount default 0 → unchanged when no promo.
--    Two changes from Slice 26 body:
--      a) also select promo_discount into v_promo
--      b) due-check and auto-settle account for v_promo
-- ----------------------------------------------------------------
create or replace function public.apply_wallet_to_payment(
  p_payment_id uuid,
  p_amount     numeric
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid;
  v_amount   numeric;
  v_applied  numeric;
  v_promo    numeric;
  v_status   text;
  v_booking  uuid;
begin
  select customer_id, amount, wallet_applied, promo_discount, status, booking_id
    into v_customer, v_amount, v_applied, v_promo, v_status, v_booking
    from public.payments
    where id = p_payment_id;
  if not found then
    raise exception 'Payment not found';
  end if;
  if v_customer <> auth.uid() then
    raise exception 'Not your payment';
  end if;
  if v_status <> 'pending' then
    raise exception 'Payment is not pending';
  end if;
  if p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;
  if p_amount > (v_amount - v_applied - v_promo) then
    raise exception 'Exceeds amount due';
  end if;

  -- Deduct from wallet (raises 'Insufficient wallet balance' if over balance)
  perform public._wallet_post(
    v_customer, 'payment_applied', -p_amount,
    'Applied to booking', v_booking, p_payment_id, null
  );

  -- Record the application on the payment row
  update public.payments
    set wallet_applied = wallet_applied + p_amount
    where id = p_payment_id;

  -- Auto-settle ONLY when fully covered AND booking completed (mirrors pay_payment guard)
  if (v_applied + p_amount + v_promo) = v_amount
     and exists (select 1 from public.bookings b where b.id = v_booking and b.status = 'completed') then
    update public.payments
      set status  = 'paid',
          paid_at = now()
      where id = p_payment_id;
  end if;
end; $$;
