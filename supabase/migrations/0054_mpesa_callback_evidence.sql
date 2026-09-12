-- 0054 — durable evidence for authenticated M-PESA callbacks that match no attempt
--
-- Problem. mpesa-callback authenticates the shared callback token, parses the body, and calls
-- apply_mpesa_callback only when a CheckoutRequestID is present; apply_mpesa_callback returns
-- silently when no attempt carries that id. In every one of these cases the function still
-- answers HTTP 200 to Safaricom, so an authenticated callback that QuickServe could not use
-- (unknown id, missing id, malformed body — or a genuine callback that raced ahead of
-- mark_attempt_accepted persisting the id) left NO durable trace and was never redelivered.
--
-- Invariant restored: an authenticated callback is never acknowledged unless it was either
-- applied through the certified 0050 path or durably recorded here. Orphan evidence is for
-- INVESTIGATION ONLY: nothing in this file settles a payment, creates an earning, cancels a
-- sibling, or calls confirm_payment_attempt / apply_mpesa_callback for an orphan, however
-- success-like the payload is. apply_mpesa_callback (0050) is not redefined.
--
-- Privacy. The raw callback body is NOT stored. Normalised operational fields are kept, the
-- phone is masked to its last three digits, and the whole payload is fingerprinted (SHA-256 of
-- the canonical jsonb text, or of the raw bytes when the body was not JSON) for integrity and
-- deduplication. Object-key order therefore never changes the fingerprint; numeric text (1 vs
-- 1.0), array order and any value change do, and are treated as distinct evidence.
--
-- Dedup model. UNIQUE(payload_sha256): an identical redelivery increments seen_count and
-- refreshes last_seen_at (no new row, no new alert). A callback with the SAME CheckoutRequestID
-- but a materially different payload has a different fingerprint and becomes a NEW row, so
-- contradictory evidence is retained side by side and raises its own alert. CheckoutRequestID
-- is deliberately not unique here. The admin alert for new evidence runs in its own
-- sub-transaction: evidence is durable even if the alert fails (alert_sent=false is returned).
--
-- Race. If a callback arrives before the attempt's CheckoutRequestID is persisted, it is
-- recorded as unknown_checkout_request_id; admin_mpesa_callback_events() computes the exact
-- match dynamically (checkout id equality only — never phone or amount), so the relationship
-- becomes visible once the attempt acquires its id. Nothing settles automatically.
--
-- Forward-only. 0050–0053 untouched. No financial data mutation. NOT read-only: adds one table,
-- four functions, and the record path writes evidence rows and admin notifications at runtime.

-- ----------------------------------------------------------------
-- 1. Evidence table — service-role/definer write path only; no client policies at all.
-- ----------------------------------------------------------------
create table if not exists public.mpesa_callback_events (
  id                  uuid        primary key default gen_random_uuid(),
  classification      text        not null
                        check (classification in ('unknown_checkout_request_id','missing_checkout_request_id','malformed_authenticated_callback')),
  merchant_request_id text,
  checkout_request_id text,
  result_code         integer,
  result_desc         text,
  amount              numeric,          -- parsed fail-closed; null when absent or unparseable
  receipt             text,             -- MpesaReceiptNumber when present (evidence, not settlement)
  transaction_date    text,
  phone_masked        text,             -- '***' + last 3 digits only; the MSISDN is never stored
  payload_sha256      text        not null unique,
  seen_count          integer     not null default 1,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  matched_attempt_id  uuid        references public.payment_attempts(id),   -- exact id match at record time, if any
  reviewed_at         timestamptz,
  reviewed_by         uuid        references public.profiles(id),
  review_note         text
);
create index if not exists mpesa_callback_events_checkout_idx on public.mpesa_callback_events (checkout_request_id);
create index if not exists mpesa_callback_events_review_idx   on public.mpesa_callback_events (reviewed_at, last_seen_at);

alter table public.mpesa_callback_events enable row level security;
revoke all on public.mpesa_callback_events from public, anon, authenticated;

-- ----------------------------------------------------------------
-- 2. record_mpesa_callback_event — the ONLY insert path (service_role / Edge).
--    Extracts evidence from the raw callback inside the database so the raw body is never
--    written anywhere; returns what the Edge function needs to decide its response.
-- ----------------------------------------------------------------
create or replace function public.record_mpesa_callback_event(
  p_classification      text,
  p_checkout_request_id text,
  p_merchant_request_id text,
  p_result_code         integer,
  p_result_desc         text,
  p_raw                 jsonb,
  p_raw_sha256          text      -- only for a body that is not valid JSON: SHA-256 hex of its raw bytes, computed by the Edge function
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_meta       jsonb;
  v_amount_raw text;
  v_amount     numeric;
  v_receipt    text;
  v_txdate     text;
  v_phone_raw  text;
  v_phone_mask text;
  v_sha        text;
  v_id         uuid;
  v_is_new     boolean := false;
  v_alert_sent boolean := false;
  v_seen       integer;
  v_match      uuid;
begin
  if p_classification not in ('unknown_checkout_request_id','missing_checkout_request_id','malformed_authenticated_callback') then
    raise exception 'Invalid callback classification';
  end if;
  if p_raw_sha256 is not null and p_raw_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid raw-body fingerprint';
  end if;
  if p_raw_sha256 is not null and (p_raw is not null or p_classification <> 'malformed_authenticated_callback') then
    raise exception 'Raw-body fingerprint is only accepted for an unparseable malformed callback';
  end if;

  -- Fingerprint for dedup/integrity: the canonical jsonb text for any body that parsed as JSON
  -- (so object-key order is irrelevant; null body → fixed marker), or the Edge-computed hash of
  -- the raw bytes for a body that was not JSON at all (the bytes themselves are never stored).
  v_sha := coalesce(p_raw_sha256, encode(sha256(convert_to(coalesce(p_raw::text, 'null'), 'UTF8')), 'hex'));

  -- Evidence extraction mirrors 0050: text first, cast fail-closed.
  v_meta := case when jsonb_typeof(p_raw) = 'object' then p_raw #> '{Body,stkCallback,CallbackMetadata,Item}' else null end;
  if jsonb_typeof(v_meta) = 'array' then
    select i->>'Value' into v_amount_raw from jsonb_array_elements(v_meta) i where i->>'Name' = 'Amount' limit 1;
    select i->>'Value' into v_receipt    from jsonb_array_elements(v_meta) i where i->>'Name' = 'MpesaReceiptNumber' limit 1;
    select i->>'Value' into v_txdate     from jsonb_array_elements(v_meta) i where i->>'Name' = 'TransactionDate' limit 1;
    select i->>'Value' into v_phone_raw  from jsonb_array_elements(v_meta) i where i->>'Name' = 'PhoneNumber' limit 1;
  end if;
  begin
    v_amount := v_amount_raw::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range then
    v_amount := null;
  end;
  v_phone_mask := case when v_phone_raw is null or length(regexp_replace(v_phone_raw, '\D', '', 'g')) < 3 then null
                       else '***' || right(regexp_replace(v_phone_raw, '\D', '', 'g'), 3) end;

  -- Exact-id match at record time (may be null; the read model re-evaluates it later).
  if p_checkout_request_id is not null then
    select id into v_match from public.payment_attempts where checkout_request_id = p_checkout_request_id order by created_at desc limit 1;
  end if;

  insert into public.mpesa_callback_events
    (classification, merchant_request_id, checkout_request_id, result_code, result_desc,
     amount, receipt, transaction_date, phone_masked, payload_sha256, matched_attempt_id)
  values
    (p_classification, p_merchant_request_id, p_checkout_request_id, p_result_code, p_result_desc,
     v_amount, v_receipt, v_txdate, v_phone_mask, v_sha, v_match)
  on conflict (payload_sha256) do update
    set seen_count   = public.mpesa_callback_events.seen_count + 1,
        last_seen_at = now()
  returning id, seen_count, (xmax = 0) into v_id, v_seen, v_is_new;

  -- Alert admins for NEW evidence only. The alert runs in its own sub-transaction: the evidence
  -- row above is already durable, and an alert failure (e.g. the push fan-out trigger's HTTP
  -- call) must not roll it back and must not turn a retained callback into a 500 → redelivery
  -- loop. The admin queue lists the row whether or not the alert went out.
  if v_is_new then
    begin
      perform public.notify_admins(
        null,
        case when p_result_code = 0 then 'Unmatched M-PESA success callback — investigate'
             else 'Unmatched M-PESA callback recorded' end,
        'Authenticated callback #' || left(v_id::text, 8) || ' (' || p_classification || ') matched no attempt. ' ||
          case when p_result_code = 0 and (v_amount is not null or v_receipt is not null)
               then 'It carries collection evidence — money may have moved. Do not retry; match by exact CheckoutRequestID and check the Safaricom portal.'
               else 'Review the evidence; do not retry or match by phone/amount.' end,
        'admin_mpesa_orphan_callback',
        '/payment-attempts',
        v_id::text || ':admin_mpesa_orphan_callback');
      v_alert_sent := true;
    exception when others then
      -- Evidence stays; only the alert is lost. Log the class of failure, never the payload.
      raise warning 'mpesa_callback_events %: admin alert failed (SQLSTATE %)', v_id, sqlstate;
    end;
  end if;

  return jsonb_build_object('event_id', v_id, 'is_new', v_is_new, 'seen_count', v_seen,
                            'matched_attempt_id', v_match, 'classification', p_classification,
                            'alert_sent', v_alert_sent);
end; $fn$;

revoke execute on function public.record_mpesa_callback_event(text, text, text, integer, text, jsonb, text) from public, anon, authenticated;
grant  execute on function public.record_mpesa_callback_event(text, text, text, integer, text, jsonb, text) to service_role;

-- ----------------------------------------------------------------
-- 3. apply_or_record_mpesa_callback — single entry point for callbacks that carry an id.
--    Known id → the certified 0050 path, unchanged. Unknown id → durable evidence.
-- ----------------------------------------------------------------
create or replace function public.apply_or_record_mpesa_callback(
  p_checkout_request_id text,
  p_merchant_request_id text,
  p_result_code         integer,
  p_result_desc         text,
  p_raw                 jsonb
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_exists boolean;
begin
  if p_checkout_request_id is null then
    return public.record_mpesa_callback_event('missing_checkout_request_id', null, p_merchant_request_id, p_result_code, p_result_desc, p_raw, null);
  end if;
  select exists(select 1 from public.payment_attempts where checkout_request_id = p_checkout_request_id) into v_exists;
  if v_exists then
    perform public.apply_mpesa_callback(p_checkout_request_id, p_merchant_request_id, p_result_code, p_result_desc, p_raw);
    return jsonb_build_object('handled', 'applied');
  end if;
  return public.record_mpesa_callback_event('unknown_checkout_request_id', p_checkout_request_id, p_merchant_request_id, p_result_code, p_result_desc, p_raw, null)
         || jsonb_build_object('handled', 'recorded');
end; $fn$;

revoke execute on function public.apply_or_record_mpesa_callback(text, text, integer, text, jsonb) from public, anon, authenticated;
grant  execute on function public.apply_or_record_mpesa_callback(text, text, integer, text, jsonb) to service_role;

-- ----------------------------------------------------------------
-- 4. Admin read model — exact match by CheckoutRequestID only; never by phone or amount.
-- ----------------------------------------------------------------
create or replace function public.admin_mpesa_callback_events()
returns table(
  event_id               uuid,
  classification         text,
  first_seen_at          timestamptz,
  last_seen_at           timestamptz,
  age_seconds            integer,
  seen_count             integer,
  merchant_request_id    text,
  checkout_request_id    text,
  result_code            integer,
  result_desc            text,
  amount                 numeric,
  receipt                text,
  transaction_date       text,
  phone_masked           text,
  matched_attempt_id     uuid,
  matched_attempt_status text,
  matched_payment_id     uuid,
  urgency                text,
  needs_review           boolean,
  reviewed_at            timestamptz,
  reviewed_by_present    boolean,
  review_note            text
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  return query
    select e.id, e.classification, e.first_seen_at, e.last_seen_at,
           extract(epoch from (now() - e.first_seen_at))::integer,
           e.seen_count, e.merchant_request_id, e.checkout_request_id, e.result_code, e.result_desc,
           e.amount, e.receipt, e.transaction_date, e.phone_masked,
           a.id, a.status, a.payment_id,
           case when e.result_code = 0 and (e.amount is not null or e.receipt is not null) then 'high' else 'normal' end,
           e.reviewed_at is null,
           e.reviewed_at, e.reviewed_by is not null, e.review_note
      from public.mpesa_callback_events e
      left join lateral (
        select a.id, a.status, a.payment_id
          from public.payment_attempts a
         where e.checkout_request_id is not null
           and a.checkout_request_id = e.checkout_request_id
         order by a.created_at desc limit 1
      ) a on true
     order by (e.reviewed_at is null) desc,
              case when e.result_code = 0 and (e.amount is not null or e.receipt is not null) then 0 else 1 end,
              e.first_seen_at asc;
end; $$;

revoke execute on function public.admin_mpesa_callback_events() from public, anon;
grant  execute on function public.admin_mpesa_callback_events() to authenticated;

-- ----------------------------------------------------------------
-- 5. Operator review — records who/when/why; evidence is never deleted or altered.
-- ----------------------------------------------------------------
create or replace function public.review_mpesa_callback_event(
  p_event_id    uuid,
  p_review_note text
) returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  if p_review_note is null or btrim(p_review_note) = '' then
    raise exception 'Review note required';
  end if;
  update public.mpesa_callback_events
     set reviewed_at = now(),
         reviewed_by = auth.uid(),
         review_note = btrim(p_review_note)
   where id = p_event_id;
  if not found then
    raise exception 'Callback event not found';
  end if;
end; $fn$;

revoke execute on function public.review_mpesa_callback_event(uuid, text) from public, anon;
grant  execute on function public.review_mpesa_callback_event(uuid, text) to authenticated;
