-- ============================================================
-- Slice 26 — Wallet schema + immutable ledger + RPCs
-- ============================================================

-- ----------------------------------------------------------------
-- 1. wallets — one per customer; balance enforced >= 0
-- ----------------------------------------------------------------
create table if not exists public.wallets (
  id          uuid        primary key default gen_random_uuid(),
  customer_id uuid        not null unique references public.profiles(id) on delete cascade,
  balance     numeric     not null default 0 check (balance >= 0),
  currency    text        not null default 'KES',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.wallets enable row level security;

-- SELECT: own or admin. NO provider policy. NO insert/update/delete policy (RPC-only writes).
create policy "wallets_select" on public.wallets
  for select using (customer_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------
-- 2. wallet_transactions — immutable, append-only ledger
-- ----------------------------------------------------------------
create table if not exists public.wallet_transactions (
  id            uuid        primary key default gen_random_uuid(),
  wallet_id     uuid        not null references public.wallets(id) on delete cascade,
  customer_id   uuid        not null references public.profiles(id),
  type          text        not null check (type in
                              ('admin_credit','admin_debit','refund_credit','promo_credit',
                               'referral_credit','gift_credit','payment_applied','adjustment')),
  amount        numeric     not null,               -- signed: credits +, debits/payment_applied −
  balance_after numeric     not null,               -- audit snapshot
  booking_id    uuid        references public.bookings(id) on delete set null,
  payment_id    uuid        references public.payments(id) on delete set null,
  note          text,
  created_by    uuid        references public.profiles(id),  -- admin actor; null for customer/system
  created_at    timestamptz not null default now()
);
alter table public.wallet_transactions enable row level security;

-- SELECT: own or admin. NO provider policy. NO update/delete/insert policy (append-only, RPC-only writes).
create policy "wallet_txn_select" on public.wallet_transactions
  for select using (customer_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------
-- 3. payments.wallet_applied — additive, backward-compatible
-- ----------------------------------------------------------------
alter table public.payments
  add column if not exists wallet_applied numeric not null default 0 check (wallet_applied >= 0);

-- ----------------------------------------------------------------
-- 4a. RPC: _ensure_wallet — lazy-create wallet for a customer
-- ----------------------------------------------------------------
create or replace function public._ensure_wallet(p_customer_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.wallets (customer_id)
    values (p_customer_id)
    on conflict (customer_id) do nothing;
  select id into v_id from public.wallets where customer_id = p_customer_id;
  return v_id;
end; $$;

-- ----------------------------------------------------------------
-- 4b. RPC: _wallet_post — atomic ledger post with no-overdraw guard
-- ----------------------------------------------------------------
create or replace function public._wallet_post(
  p_customer_id uuid,
  p_type        text,
  p_amount      numeric,
  p_note        text,
  p_booking_id  uuid,
  p_payment_id  uuid,
  p_created_by  uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_wallet_id uuid;
  v_bal       numeric;
  v_new       numeric;
begin
  v_wallet_id := public._ensure_wallet(p_customer_id);
  select balance into v_bal from public.wallets where customer_id = p_customer_id for update;  -- row lock
  v_new := v_bal + p_amount;
  if v_new < 0 then
    raise exception 'Insufficient wallet balance';
  end if;
  update public.wallets
    set balance    = v_new,
        updated_at = now()
    where customer_id = p_customer_id;
  insert into public.wallet_transactions
    (wallet_id, customer_id, type, amount, balance_after, booking_id, payment_id, note, created_by)
    values
    (v_wallet_id, p_customer_id, p_type, p_amount, v_new, p_booking_id, p_payment_id, p_note, p_created_by);
end; $$;

-- ----------------------------------------------------------------
-- 4c. RPC: admin_wallet_adjust — admin-only manual credit/debit
-- ----------------------------------------------------------------
create or replace function public.admin_wallet_adjust(
  p_customer_id uuid,
  p_type        text,
  p_amount      numeric,
  p_note        text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'Note required';
  end if;
  if p_type not in ('admin_credit','admin_debit','refund_credit','promo_credit','referral_credit','gift_credit','adjustment') then
    raise exception 'Invalid adjustment type';
  end if;
  perform public._wallet_post(p_customer_id, p_type, p_amount, p_note, null, null, auth.uid());
end; $$;

-- ----------------------------------------------------------------
-- 4d. RPC: apply_wallet_to_payment — customer applies wallet credit
--     Auto-settles to 'paid' only when fully covered AND booking completed
--     (mirrors the pay_payment guard in 0010_payments.sql)
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
  v_status   text;
  v_booking  uuid;
begin
  select customer_id, amount, wallet_applied, status, booking_id
    into v_customer, v_amount, v_applied, v_status, v_booking
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
  if p_amount > (v_amount - v_applied) then
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
  if (v_applied + p_amount) = v_amount
     and exists (select 1 from public.bookings b where b.id = v_booking and b.status = 'completed') then
    update public.payments
      set status  = 'paid',
          paid_at = now()
      where id = p_payment_id;
  end if;
end; $$;
