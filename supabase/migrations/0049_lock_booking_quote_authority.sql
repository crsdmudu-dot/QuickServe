-- Lock booking quote authority. WRITE-AUTHORITY HARDENING ONLY — no row is altered.
--
-- CONTEXT. The provider/KwikServe split is negotiated per booking and is deliberately flexible:
-- there is no global commission percentage anywhere in this system. The admin sets the customer
-- total and the provider's monetary share; KwikServe takes the remainder. That model is correct
-- and is preserved here unchanged. What was missing is enforcement of WHO may write the terms.
--
-- INTENDED AUTHORITY MODEL.
--     set_quote      -> admin only, authors quoted_amount + provider_share
--     accept_quote   -> booking customer only, moves quote_status -> 'accepted'
--     decline_quote  -> booking customer only, moves quote_status -> 'declined'
--     direct UPDATE  -> may never alter quoted_amount, provider_share or quote_status
--
-- PROBLEM 1 (critical). `bookings_update_provider` pins a fixed column list written before the
-- quote columns existed, so quoted_amount, provider_share and quote_status were unpinned. An
-- assigned provider could combine a legitimate forward status advance with, in the same PATCH,
--     quoted_amount = X, provider_share = X, quote_status = 'accepted'
-- and trg_create_payment_on_accept would snapshot that provider-authored entitlement into
-- payments. Fifteen further operational/integrity columns (the customer's structured location,
-- the scheduling agreement, idempotency_key, created_at) were unpinned for the same reason.
--
-- PROBLEM 2. `bookings_update_admin` is column-unrestricted, so a direct admin PATCH bypasses the
-- quote RPCs entirely. Admin is trusted, but that defeats the authority model and any RPC guard.
--
-- PROBLEM 3. set_quote has no server-side lifecycle guard: it will silently overwrite an accepted
-- quote. The only guard today is client-side canEditQuote().
--
-- WHY RLS IS THE RIGHT MECHANISM HERE. public.bookings is owned by postgres with row level
-- security ENABLED but NOT FORCED, and set_quote/accept_quote/decline_quote are SECURITY DEFINER
-- functions owned by postgres. A definer function therefore runs as the table owner and is not
-- subject to these policies. Pinning the quote columns in the policies blocks direct PostgREST
-- writes for every ordinary role while leaving the RPCs fully functional. No trigger, no session
-- flag and no set_config bypass is needed.
--
-- WHY BOTH POLICIES PIN THE TRIO. PostgreSQL permissive policies combine with OR, so an UPDATE
-- succeeds if ANY applicable policy passes. An admin who is also the assigned provider satisfies
-- both branches; pinning in only one would leave the other as an escape.
--
-- WHY IS NOT DISTINCT FROM. Most pinned columns are nullable. Plain `=` yields NULL when either
-- side is NULL, and NULL is not TRUE, so a WITH CHECK built on `=` would REJECT legitimate status
-- advances on every booking that is not yet quoted. IS NOT DISTINCT FROM treats NULL = NULL as
-- true and blocks NULL->value, value->NULL and value A->value B alike. Columns that are NOT NULL
-- keep plain `=`, matching the existing 0038 convention.
--
-- SCOPE. Exactly three objects change: the two bookings UPDATE policies and set_quote. Nothing
-- touches accept_quote, decline_quote, create_payment_on_accept, the payment/earnings/payout
-- schema, grants, or any data. No table, no backfill, no cleanup.

-- ----------------------------------------------------------------
-- 1. Provider direct UPDATE: forward status advancement ONLY.
--    Every clause below is the live 0038 expression, verbatim, plus the new column pins. The
--    status graph is copied unchanged: this migration is strictly more restrictive than before
--    and widens nothing.
-- ----------------------------------------------------------------

drop policy if exists "bookings_update_provider" on public.bookings;
create policy "bookings_update_provider" on public.bookings
  for update
  using (assigned_provider_id = auth.uid())
  with check (
    assigned_provider_id = auth.uid()

    -- Identity / ownership / service / assignment / admin — preserved from 0038.
    and customer_id   = (select b.customer_id   from public.bookings b where b.id = bookings.id)
    and service_id    = (select b.service_id    from public.bookings b where b.id = bookings.id)
    and address       = (select b.address       from public.bookings b where b.id = bookings.id)
    and scheduled_for = (select b.scheduled_for from public.bookings b where b.id = bookings.id)
    and notes is not distinct from (select b.notes from public.bookings b where b.id = bookings.id)
    and assigned_provider_id = (select b.assigned_provider_id from public.bookings b where b.id = bookings.id)
    and assigned_provider_name  is not distinct from (select b.assigned_provider_name  from public.bookings b where b.id = bookings.id)
    and assigned_provider_phone is not distinct from (select b.assigned_provider_phone from public.bookings b where b.id = bookings.id)
    and admin_notes     is not distinct from (select b.admin_notes     from public.bookings b where b.id = bookings.id)
    and service_details is not distinct from (select b.service_details from public.bookings b where b.id = bookings.id)

    -- NEW — quote authority. A provider may never author or accept their own terms.
    and quoted_amount  is not distinct from (select b.quoted_amount  from public.bookings b where b.id = bookings.id)
    and provider_share is not distinct from (select b.provider_share from public.bookings b where b.id = bookings.id)
    and quote_status   is not distinct from (select b.quote_status   from public.bookings b where b.id = bookings.id)

    -- NEW — the customer's structured location snapshot.
    and latitude      is not distinct from (select b.latitude      from public.bookings b where b.id = bookings.id)
    and longitude     is not distinct from (select b.longitude     from public.bookings b where b.id = bookings.id)
    and address_label is not distinct from (select b.address_label from public.bookings b where b.id = bookings.id)
    and building_name is not distinct from (select b.building_name from public.bookings b where b.id = bookings.id)
    and floor         is not distinct from (select b.floor         from public.bookings b where b.id = bookings.id)
    and door_number   is not distinct from (select b.door_number   from public.bookings b where b.id = bookings.id)
    and landmark      is not distinct from (select b.landmark      from public.bookings b where b.id = bookings.id)
    and access_notes  is not distinct from (select b.access_notes  from public.bookings b where b.id = bookings.id)

    -- NEW — the customer's scheduling agreement.
    and scheduling_type is not distinct from (select b.scheduling_type from public.bookings b where b.id = bookings.id)
    and time_window     is not distinct from (select b.time_window     from public.bookings b where b.id = bookings.id)
    and window_start    is not distinct from (select b.window_start    from public.bookings b where b.id = bookings.id)
    and window_end      is not distinct from (select b.window_end      from public.bookings b where b.id = bookings.id)
    and recurrence      is not distinct from (select b.recurrence      from public.bookings b where b.id = bookings.id)

    -- NEW — integrity / audit fields.
    and idempotency_key is not distinct from (select b.idempotency_key from public.bookings b where b.id = bookings.id)
    and created_at      is not distinct from (select b.created_at      from public.bookings b where b.id = bookings.id)

    -- Status graph, preserved verbatim from 0038: forward-only, and the pre-update status must be
    -- provider-progressable so 'cancelled' and 'completed' remain terminal for providers.
    and status in ('on_the_way','in_progress','completed')
    and (select b.status from public.bookings b where b.id = bookings.id)
          in ('provider_assigned','on_the_way','in_progress')
    and (case status
            when 'on_the_way' then 1 when 'in_progress' then 2 when 'completed' then 3 else 0 end)
        >
        (case (select b.status from public.bookings b where b.id = bookings.id)
            when 'provider_assigned' then 0 when 'on_the_way' then 1
            when 'in_progress' then 2 when 'completed' then 3 else -1 end)
  );

-- ----------------------------------------------------------------
-- 2. Admin direct UPDATE: every legitimate admin power is retained — provider assignment, status
--    management, admin notes, address and scheduling corrections. Only the quote trio becomes
--    RPC-exclusive, so quote authoring and acceptance cannot bypass set_quote / accept_quote.
-- ----------------------------------------------------------------

drop policy if exists "bookings_update_admin" on public.bookings;
create policy "bookings_update_admin" on public.bookings
  for update
  using (public.is_admin())
  with check (
    public.is_admin()
    and quoted_amount  is not distinct from (select b.quoted_amount  from public.bookings b where b.id = bookings.id)
    and provider_share is not distinct from (select b.provider_share from public.bookings b where b.id = bookings.id)
    and quote_status   is not distinct from (select b.quote_status   from public.bookings b where b.id = bookings.id)
  );

-- ----------------------------------------------------------------
-- 3. set_quote — unchanged authority, validation and business model, plus a server-side
--    lifecycle guard.
--
--    CREATE OR REPLACE, never DROP/CREATE: replacing in place preserves the existing function
--    ACLs (anon / authenticated / service_role), which a drop would silently discard.
--
--    ROW LOCK FIRST. The booking is locked with SELECT ... FOR UPDATE before the state and
--    payment checks, so those checks are atomic against accept_quote, decline_quote, a concurrent
--    set_quote, and the payment trigger. A second transaction waits on the lock and then re-reads
--    committed state rather than acting on a stale read.
--
--    PAYMENT-EXISTENCE IS A SEPARATE BOUNDARY. quote_status alone is not sufficient: an accepted
--    booking can be re-quoted back to 'sent', after which a status-only check would pass while an
--    entitlement already exists. A payment row is the financial snapshot boundary, so once one
--    exists the terms are frozen. The payment itself is never touched.
--
--    BUSINESS MODEL PRESERVED. No percentage is imposed. p_amount = 0 remains valid, because
--    settle_zero_due_on_completion exists precisely for zero-due payments. The NULL checks are new:
--    the previous validation was NULL-permissive (NULL < 0 is NULL, not TRUE), so NULL terms could
--    be written. Exception messages are deliberately identical and non-sensitive.
-- ----------------------------------------------------------------

create or replace function public.set_quote(
  p_booking_id     uuid,
  p_amount         numeric,
  p_provider_share numeric
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking public.bookings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Permission denied';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'Amount must be >= 0';
  end if;
  if p_provider_share is null or p_provider_share < 0 or p_provider_share > p_amount then
    raise exception 'provider_share must be between 0 and amount';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.quote_status not in ('pending','sent') then
    raise exception 'Quote can no longer be changed';
  end if;

  if exists (select 1 from public.payments where booking_id = p_booking_id) then
    raise exception 'Quote can no longer be changed';
  end if;

  update public.bookings
     set quoted_amount  = p_amount,
         provider_share = p_provider_share,
         quote_status   = 'sent'
   where id = p_booking_id;
end; $$;
