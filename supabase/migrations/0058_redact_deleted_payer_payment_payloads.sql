-- 0058_redact_deleted_payer_payment_payloads.sql — bounded release repair.
--
-- WHAT IS WRONG. Account deletion (0056) masks `payment_attempts.phone` to its last three digits
-- but leaves `payment_attempts.raw_response` untouched. That JSON holds the payer's FULL phone
-- number in two shapes, both verified against the writers at this head:
--
--   1. The M-PESA STK callback body stored by apply_mpesa_callback (0050) on the failure and
--      settle paths:  Body.stkCallback.CallbackMetadata.Item[] with {Name:'PhoneNumber', Value}.
--   2. The mock STK acceptance result stored by mark_attempt_accepted (0045) when MPESA_MODE is
--      mock — which is how QA and Production currently run:  a top-level "PhoneNumber" key
--      (supabase/functions/_shared/daraja.ts mockStkResult). The real Daraja acceptance response
--      carries no phone; the mock does.
--
-- The `discrepancy` array (0045/0050) was checked and stores structured fields only — amounts,
-- receipts, codes, request ids — never the phone. `mpesa_callback_events` (0054) stores a masked
-- phone and a payload hash, never the body. Neither needs repair.
--
-- WHAT THIS DOES. Three objects, no redefinition of any existing function:
--
--   A. public.mask_msisdn(text) and public.redact_mpesa_phone(jsonb): pure, idempotent, IMMUTABLE.
--      Both payload shapes are handled. Non-object JSON (null, scalar, array) is returned as-is.
--      Everything that is not a phone — receipt, amount, result codes, request ids, timestamps —
--      is preserved byte for byte. This is targeted identifier removal, not reduction of the
--      payload to structured evidence; that is retention work, not release repair.
--
--   B. A BEFORE INSERT OR UPDATE trigger on payment_attempts. If the payer's profile is
--      tombstoned (deleted_at set), the row's raw_response is redacted and its phone masked at
--      write time. This covers late, duplicate, contradictory and reconciliation writes, any
--      direct service-role write, and any writer added in future — without touching
--      apply_mpesa_callback, whose last owner must remain 0050 (mpesa-certified-outcomes guard).
--
--   C. An AFTER UPDATE OF deleted_at trigger on profiles. When a profile becomes tombstoned, the
--      payer's existing attempt rows are redacted INSIDE the same transaction as delete_account's
--      profile update — so the repair is atomic with the deletion, without redefining
--      delete_account (0056 remains its owner). Repeat deletion does not change deleted_at, so
--      this does not re-fire; the redaction is idempotent anyway.
--
-- WHY THIS IS RACE-SAFE (READ COMMITTED, the project default). Every writer that touches an
-- attempt row locks it (`for update`) after locking its payment. Trigger C's UPDATE takes the same
-- row locks inside the deletion transaction. So either:
--   * the writer holds the row first: it writes, commits, and C then rewrites the row redacted; or
--   * the deletion holds the row first: the writer blocks, and when it proceeds its statements —
--     including trigger B's profile read, which runs in a VOLATILE function and therefore sees
--     data committed after the outer statement began — observe the tombstone and redact.
-- A writer can never land an unredacted phone after the deletion has committed.
--
-- WHAT THIS DOES NOT DO.
--   * No backfill. As of this head no tombstoned profile exists on QA (certification baseline: 0)
--     and account deletion is not deployed to Production, so no historical row qualifies. The
--     read-only helper D returns any that would; running a backfill is a separately authorised,
--     dry-run-first operation and is not performed here.
--   * No change to amounts, receipts, settlement references, statuses, earnings or payouts.
--   * No change to 0056, 0050, 0045 or any other applied migration.
--
-- Forward-only. To reverse: drop the two triggers, then the two trigger functions, then D, then
-- redact_mpesa_phone and mask_msisdn. Redacted values are not recoverable, by design.

-- ── A. Pure redaction ───────────────────────────────────────────────────────────────────────

create or replace function public.mask_msisdn(p text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select case
    when p like '***%' then p                                        -- already masked: idempotent
    else '***' || right(regexp_replace(p, '\D', '', 'g'), 3)
  end;
$$;

comment on function public.mask_msisdn(text) is
  'Reduces a phone number to *** plus its last three digits. Idempotent. Used by the deleted-payer redaction.';

create or replace function public.redact_mpesa_phone(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v         jsonb := p;
  k         text;
  items     jsonb;
  it        jsonb;
  out_items jsonb := '[]'::jsonb;
begin
  -- Only objects can carry a phone in either supported shape. Null, scalars and arrays pass
  -- through unchanged, so a malformed or absent payload never errors and never changes.
  if v is null or jsonb_typeof(v) <> 'object' then
    return v;
  end if;

  -- Shape 2: top-level phone keys (mock STK acceptance, defensive aliases).
  foreach k in array array['PhoneNumber', 'phoneNumber', 'phone', 'Phone', 'msisdn', 'MSISDN'] loop
    if v ? k and jsonb_typeof(v -> k) in ('string', 'number') then
      v := jsonb_set(v, array[k], to_jsonb(public.mask_msisdn(v ->> k)));
    end if;
  end loop;

  -- Shape 1: Daraja STK callback metadata items.
  items := v #> '{Body,stkCallback,CallbackMetadata,Item}';
  if items is not null and jsonb_typeof(items) = 'array' then
    for it in select value from jsonb_array_elements(items) loop
      if jsonb_typeof(it) = 'object'
         and it ->> 'Name' = 'PhoneNumber'
         and it ? 'Value'
         and jsonb_typeof(it -> 'Value') in ('string', 'number') then
        it := jsonb_set(it, '{Value}', to_jsonb(public.mask_msisdn(it ->> 'Value')));
      end if;
      out_items := out_items || jsonb_build_array(it);
    end loop;
    v := jsonb_set(v, '{Body,stkCallback,CallbackMetadata,Item}', out_items);
  end if;

  return v;
end;
$$;

comment on function public.redact_mpesa_phone(jsonb) is
  'Masks the phone number inside an M-PESA payload in both supported shapes (Daraja callback metadata; top-level PhoneNumber). Pure and idempotent; every other field is preserved.';

revoke execute on function public.mask_msisdn(text)        from public, anon, authenticated;
revoke execute on function public.redact_mpesa_phone(jsonb) from public, anon, authenticated;
grant  execute on function public.mask_msisdn(text)        to service_role;
grant  execute on function public.redact_mpesa_phone(jsonb) to service_role;

-- ── B. Write-time guard on payment_attempts ─────────────────────────────────────────────────

create or replace function public.tg_payment_attempts_redact_for_deleted_payer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted boolean;
begin
  -- Fresh read: this function is VOLATILE, so under READ COMMITTED it observes a tombstone
  -- committed after the outer statement started (see the race note in the header).
  select (p.deleted_at is not null)
    into v_deleted
    from public.payments pm
    join public.profiles p on p.id = pm.customer_id
   where pm.id = new.payment_id;

  if coalesce(v_deleted, false) then
    new.raw_response := public.redact_mpesa_phone(new.raw_response);
    if new.phone is not null and new.phone not like '***%' then
      new.phone := public.mask_msisdn(new.phone);
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_payment_attempts_redact_for_deleted_payer() from public, anon, authenticated;

drop trigger if exists trg_payment_attempts_redact_for_deleted_payer on public.payment_attempts;
create trigger trg_payment_attempts_redact_for_deleted_payer
  before insert or update on public.payment_attempts
  for each row
  execute function public.tg_payment_attempts_redact_for_deleted_payer();

-- ── C. Deletion-time scrub via the profile tombstone ────────────────────────────────────────

create or replace function public.tg_profiles_redact_payer_attempts_on_tombstone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.deleted_at is not null and old.deleted_at is distinct from new.deleted_at then
    update public.payment_attempts pa
       set raw_response = public.redact_mpesa_phone(pa.raw_response),
           phone        = case when pa.phone is not null and pa.phone not like '***%'
                               then public.mask_msisdn(pa.phone) else pa.phone end
      from public.payments pm
     where pa.payment_id = pm.id
       and pm.customer_id = new.id
       and (pa.raw_response is not null
            or (pa.phone is not null and pa.phone not like '***%'));
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_profiles_redact_payer_attempts_on_tombstone() from public, anon, authenticated;

drop trigger if exists trg_profiles_redact_payer_attempts_on_tombstone on public.profiles;
create trigger trg_profiles_redact_payer_attempts_on_tombstone
  after update of deleted_at on public.profiles
  for each row
  execute function public.tg_profiles_redact_payer_attempts_on_tombstone();

-- ── D. Read-only inventory of rows a backfill WOULD touch (dry-run aid; performs no write) ──

create or replace function public.deleted_payer_attempts_needing_redaction()
returns table (
  attempt_id            uuid,
  payment_id            uuid,
  top_level_phone       boolean,
  callback_item_phone   boolean,
  phone_column_unmasked boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select pa.id, pa.payment_id, pa.phone, pa.raw_response
      from public.payment_attempts pa
      join public.payments pm on pm.id = pa.payment_id
      join public.profiles p  on p.id  = pm.customer_id
     where p.deleted_at is not null
  ),
  flagged as (
    select c.id,
           c.payment_id,
           (jsonb_typeof(c.raw_response) = 'object'
             and c.raw_response ? 'PhoneNumber'
             and left(c.raw_response ->> 'PhoneNumber', 3) <> '***') as top_level_phone,
           (jsonb_typeof(c.raw_response #> '{Body,stkCallback,CallbackMetadata,Item}') = 'array'
             and exists (
               select 1
                 from jsonb_array_elements(c.raw_response #> '{Body,stkCallback,CallbackMetadata,Item}') i
                where jsonb_typeof(i) = 'object'
                  and i ->> 'Name' = 'PhoneNumber'
                  and left(i ->> 'Value', 3) <> '***')) as callback_item_phone,
           (c.phone is not null and c.phone not like '***%') as phone_column_unmasked
      from candidates c
  )
  select id, payment_id, top_level_phone, callback_item_phone, phone_column_unmasked
    from flagged
   where top_level_phone or callback_item_phone or phone_column_unmasked;
$$;

comment on function public.deleted_payer_attempts_needing_redaction() is
  'Dry-run inventory: attempt rows belonging to tombstoned payers that still carry an unmasked phone. Read-only. Expected empty on QA and Production at 0058.';

revoke execute on function public.deleted_payer_attempts_needing_redaction() from public, anon, authenticated;
grant  execute on function public.deleted_payer_attempts_needing_redaction() to service_role;
