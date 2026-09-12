-- Provider payout ledger — schema only. Inert until 0042 adds the RPCs.
--
-- MONEY FLOW: customer -> KwikServe/platform -> provider. Customer collection and provider
-- payout are two separate financial events and must never be conflated. payments.status='paid'
-- means the CUSTOMER's obligation to KwikServe is settled; it says nothing about whether the
-- provider has been paid.
--
-- ENTITLEMENT IS ALREADY POST-SPLIT. provider_earnings.amount is copied from
-- payments.provider_share, and payments enforces provider_share + quickserve_share = amount.
-- The platform's commission is therefore ALREADY taken at quote time. Payout arithmetic starts
-- at provider_earnings.amount and must NEVER subtract quickserve_share, or commission would be
-- deducted twice.
--
-- WHAT A DEDUCTION IS NOT. Customer wallet credit is a customer-side settlement instrument
-- (previously held customer value). A customer promo discount is platform-funded. NEITHER
-- reduces provider entitlement, and neither may ever be recorded here. The closed category list
-- below makes that structural rather than a matter of convention: there is no commission,
-- platform_fee, promo_discount, wallet or customer_discount category, so a customer-side
-- reduction cannot be expressed as a provider deduction.
--
-- APPEND-ONLY. Both tables below are financial evidence. Neither gets an INSERT, UPDATE or
-- DELETE policy for any role — 0042's admin-only SECURITY DEFINER RPCs will be the sole write
-- path. Mistakes are corrected by compensating records, never by editing history.
--
-- Deductions carry POSITIVE amounts and are reversed in full by an append-only reversal row that
-- points at the original via reversal_of. A UNIQUE(reversal_of) makes "one deduction can be
-- reversed at most once" a database guarantee rather than application logic. To change a KES 500
-- deduction to KES 300: reverse the 500, then record a new 300. Both events stay visible.
--
-- A PAYOUT ROW RECORDS AN EXTERNAL DISBURSEMENT THAT ALREADY HAPPENED. It initiates no money
-- movement: there is no B2C, no bank API, nothing outbound. The admin pays the provider by
-- whatever means and then records the evidence here. Partial payouts are supported, so one
-- earning may accumulate several payout rows.
--
-- DERIVED, NEVER STORED. deductions_total, net_provider_payable, amount_disbursed and
-- outstanding_provider_liability are all computed from these immutable rows:
--     deductions_total = SUM(amount) FILTER (reversal_of IS NULL)
--                      - SUM(amount) FILTER (reversal_of IS NOT NULL)
--     net_provider_payable = provider_earnings.amount - deductions_total
--     amount_disbursed     = SUM(provider_payouts.amount)
--     outstanding          = net_provider_payable - amount_disbursed
-- No cached monetary column is added to provider_earnings, so there is no second source of truth
-- to drift.
--
-- WHAT 0042 WILL ENFORCE, AND WHY IT IS NOT HERE. These are cross-row or aggregate rules that a
-- CHECK constraint cannot express; they belong in the RPCs, under SELECT ... FOR UPDATE on the
-- authoritative provider_earnings row:
--   * a reversal targets an original deduction (reversal_of IS NULL on the target), on the same
--     earning, copying its amount and category;
--   * deductions_total never exceeds entitlement, and never falls below amount already disbursed;
--   * a payout never exceeds outstanding liability;
--   * payout eligibility requires bookings.status = 'completed';
--   * payout_status is recomputed as pending / partially_paid / paid.
--
-- SIDE EFFECT OF ON DELETE RESTRICT, recorded deliberately: provider_earnings.booking_id is
-- ON DELETE CASCADE from bookings (0010). Once a deduction or payout exists for an earning, the
-- RESTRICT below blocks that cascade, so the parent booking can no longer be deleted. That is
-- intended — financial evidence outranks row cleanup.
--
-- INERT: no data is inserted, no trigger is created, no function is created or dropped.
-- mark_payout_paid still exists and still only ever writes 'paid', which remains valid in the
-- widened payout_status domain. 0042 retires it.

-- ----------------------------------------------------------------
-- 1. provider_earning_deductions — append-only deductions and their full reversals
-- ----------------------------------------------------------------
create table if not exists public.provider_earning_deductions (
  id          uuid        primary key default gen_random_uuid(),
  earning_id  uuid        not null references public.provider_earnings(id) on delete restrict,
  -- Always positive. A reversal row carries the SAME positive amount as the deduction it
  -- reverses; direction is conveyed by reversal_of, never by a negative number.
  amount      numeric     not null check (amount > 0),
  -- Closed list. Deliberately excludes commission / platform_fee / promo_discount / wallet /
  -- customer_discount so customer-side or platform-side reductions cannot be booked against a
  -- provider. 'other_authorized' stays visibly identifiable in audit by its category value.
  category    text        not null
                            check (category in ('service_issue',
                                                'damage_or_loss',
                                                'cancellation_or_no_show',
                                                'other_authorized')),
  reason      text        not null check (btrim(reason) <> ''),
  -- NULL  => this row is a DEDUCTION.
  -- SET   => this row is a DEDUCTION REVERSAL of exactly that deduction.
  -- The label is derived, so it can never contradict the data. UNIQUE means one original can be
  -- reversed at most once, enforced by the database rather than by the RPC.
  reversal_of uuid        unique references public.provider_earning_deductions(id) on delete restrict,
  created_by  uuid        not null references public.profiles(id),
  created_at  timestamptz not null default now()
);
alter table public.provider_earning_deductions enable row level security;

-- ----------------------------------------------------------------
-- 2. provider_payouts — append-only record of an external disbursement already made
-- ----------------------------------------------------------------
create table if not exists public.provider_payouts (
  id              uuid        primary key default gen_random_uuid(),
  earning_id      uuid        not null references public.provider_earnings(id) on delete restrict,
  -- Denormalised from provider_earnings so the provider SELECT policy needs no join.
  -- 0042 populates it from the locked earning row, so it cannot diverge.
  provider_id     uuid        not null references public.profiles(id),
  amount          numeric     not null check (amount > 0),
  method          text        not null
                                check (method in ('mpesa_manual','bank_transfer','cash','other')),
  reference       text,
  note            text,
  -- Protects the RECORDING operation only: a retried admin submission cannot create a second
  -- payout row. It cannot prove whether the external transfer itself occurred — that is what
  -- reference/note and paid_at are for, reconciled against the bank or M-Pesa statement.
  idempotency_key uuid        not null unique,
  -- When the money actually moved, entered by the admin. Distinct from created_at, which is when
  -- the evidence was recorded in KwikServe.
  paid_at         timestamptz not null,
  recorded_by     uuid        not null references public.profiles(id),
  created_at      timestamptz not null default now(),
  -- Every disbursement must carry written external evidence. Electronic methods always produce a
  -- transaction reference; cash and 'other' may not, so they must name the mechanism in a note
  -- instead. btrim rejects whitespace-only evidence.
  constraint provider_payouts_evidence_check check (
    (method in ('mpesa_manual','bank_transfer') and reference is not null and btrim(reference) <> '')
    or
    (method in ('cash','other')                and note      is not null and btrim(note)      <> '')
  )
);
alter table public.provider_payouts enable row level security;

-- reference is NOT unique, globally or per method: bank references and cash receipt numbers
-- legitimately repeat, and a uniqueness failure would block a genuine payout. Duplicate
-- protection is idempotency_key, the only value the system itself controls.

-- ----------------------------------------------------------------
-- 3. Widen provider_earnings.payout_status for partial payouts
--    drop-then-add (the 0036 convention) is idempotent and deterministic: re-running cannot
--    leave an earlier constraint of a different definition in place.
--    Column, NOT NULL and DEFAULT 'pending' are untouched; existing values stay valid.
-- ----------------------------------------------------------------
alter table public.provider_earnings
  drop constraint if exists provider_earnings_payout_status_check;
alter table public.provider_earnings
  add constraint provider_earnings_payout_status_check
  check (payout_status in ('pending','partially_paid','paid'));

-- ----------------------------------------------------------------
-- 4. RLS — SELECT only. Provider sees own, admin sees all, customer sees nothing.
--    No INSERT/UPDATE/DELETE policy exists for any role, so the tables are unwritable through
--    PostgREST; 0042's admin-only SECURITY DEFINER RPCs become the sole write path.
-- ----------------------------------------------------------------

-- Provider ownership resolves through earning_id -> provider_earnings.provider_id. The provider
-- can already read their own provider_earnings rows (provider_earnings_select, 0010), so this
-- EXISTS succeeds for them without needing a SECURITY DEFINER helper.
drop policy if exists "provider_earning_deductions_select" on public.provider_earning_deductions;
create policy "provider_earning_deductions_select" on public.provider_earning_deductions
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.provider_earnings e
       where e.id = provider_earning_deductions.earning_id
         and e.provider_id = auth.uid()
    )
  );

drop policy if exists "provider_payouts_select" on public.provider_payouts;
create policy "provider_payouts_select" on public.provider_payouts
  for select using (provider_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------
-- 5. Indexes — only those justified by a known RLS or aggregation path.
--    UNIQUE(reversal_of) and UNIQUE(idempotency_key) already provide their own indexes, so no
--    duplicate is created for either. No index on provider_payouts(reference): nothing queries
--    by reference today, and an unused index on an append-only financial table is pure cost.
-- ----------------------------------------------------------------
create index if not exists provider_earning_deductions_earning_id_idx
  on public.provider_earning_deductions (earning_id);

create index if not exists provider_payouts_earning_id_idx
  on public.provider_payouts (earning_id);

create index if not exists provider_payouts_provider_id_idx
  on public.provider_payouts (provider_id);
