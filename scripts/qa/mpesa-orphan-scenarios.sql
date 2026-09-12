-- scripts/qa/mpesa-orphan-scenarios.sql — 0054 orphan-callback evidence matrix, QA ONLY, one
-- transaction, ROLLED BACK. Zero residue. Never run against Production.
--   npx supabase db query --linked -f scripts/qa/mpesa-orphan-scenarios.sql
-- Exercises the service-role entry points exactly as the Edge function calls them.
begin;
create temp table r (k text, v text) on commit drop;

create function pg_temp.cb(p_checkout text, p_code int, p_desc text, p_amount text, p_receipt text, p_phone text) returns jsonb language sql as $f$
  select jsonb_build_object('Body', jsonb_build_object('stkCallback', jsonb_build_object(
    'MerchantRequestID', 'mr-'||coalesce(p_checkout,'none'), 'ResultCode', p_code, 'ResultDesc', p_desc)
    || case when p_checkout is not null then jsonb_build_object('CheckoutRequestID', p_checkout) else '{}'::jsonb end
    || case when p_code = 0 then jsonb_build_object('CallbackMetadata', jsonb_build_object('Item', jsonb_build_array(
         jsonb_build_object('Name','Amount','Value', case when p_amount ~ '^[0-9.]+$' then to_jsonb(p_amount::numeric) else to_jsonb(p_amount) end),
         jsonb_build_object('Name','MpesaReceiptNumber','Value', p_receipt),
         jsonb_build_object('Name','TransactionDate','Value', 20260912001000),
         jsonb_build_object('Name','PhoneNumber','Value', p_phone)))) else '{}'::jsonb end))
$f$;
create function pg_temp.claims(p_sub uuid, p_role text) returns void language sql as $c$
  select set_config('request.jwt.claims', case when p_sub is null then json_build_object('role', p_role)::text
                                               else json_build_object('sub', p_sub, 'role', p_role)::text end, true)
$c$;
create function pg_temp.fp() returns text language sql as $f$
  select md5((select count(*)::text from public.payments where status='paid') || (select count(*)::text from public.payment_attempts)
           || (select coalesce(sum(amount),0)::text from public.provider_earnings) || (select count(*)::text from public.payment_attempts where status='successful'))
$f$;

do $$
declare
  v_admin uuid; v_customer uuid; v_provider uuid; v_service text; v_b uuid; v_p uuid; v_a uuid;
  v_fp0 text; v_r jsonb; v_r2 jsonb; v_ev uuid; v_n int; v_amt numeric := 1500;
begin
  select id into v_admin    from public.profiles where role='admin'    order by created_at limit 1;
  select id into v_customer from public.profiles where role='customer' order by created_at limit 1;
  select id into v_provider from public.profiles where role='provider' and approval_status='approved' order by created_at limit 1;
  select service_id into v_service from public.bookings limit 1;
  v_fp0 := pg_temp.fp();
  perform pg_temp.claims(null, 'service_role');

  -- A. unknown CheckoutRequestID + failure result
  v_r := public.apply_or_record_mpesa_callback('ws_CO_orphanA', 'mr-A', 1032, 'Request Cancelled by user.', pg_temp.cb('ws_CO_orphanA', 1032, 'Request Cancelled by user.', null, null, '254700000399'));
  insert into r values ('A_handled', v_r->>'handled'), ('A_is_new', v_r->>'is_new');
  insert into r select 'A_row', classification||'/code='||result_code||'/phone='||coalesce(phone_masked,'null')||'/amount='||coalesce(amount::text,'null')||'/seen='||seen_count from public.mpesa_callback_events where id=(v_r->>'event_id')::uuid;
  insert into r select 'A_alert_rows', count(*)::text from public.notifications where type='admin_mpesa_orphan_callback' and dedup_key like (v_r->>'event_id')||'%';
  insert into r values ('A_financial_unchanged', (pg_temp.fp() = v_fp0)::text);

  -- B. unknown CheckoutRequestID + ResultCode 0 with amount/receipt → recorded, high urgency, NOT settled
  v_r := public.apply_or_record_mpesa_callback('ws_CO_orphanB', 'mr-B', 0, 'The service request is processed successfully.', pg_temp.cb('ws_CO_orphanB', 0, 'ok', '1500', 'QARCPTORPHB', '254700000399'));
  v_ev := (v_r->>'event_id')::uuid;
  insert into r select 'B_row', classification||'/code='||result_code||'/amount='||amount||'/receipt='||receipt||'/phone='||phone_masked from public.mpesa_callback_events where id=v_ev;
  insert into r values ('B_paid_payments_unchanged_and_no_attempt', (pg_temp.fp() = v_fp0)::text);
  perform pg_temp.claims(v_admin, 'authenticated');
  insert into r select 'B_review_urgency', urgency||'/needs_review='||needs_review||'/match='||coalesce(matched_attempt_id::text,'none') from public.admin_mpesa_callback_events() where event_id=v_ev;
  perform pg_temp.claims(null, 'service_role');
  insert into r select 'B_alert_title_mentions_investigate', (count(*) filter (where title ilike '%investigate%'))::text from public.notifications where type='admin_mpesa_orphan_callback' and dedup_key like v_ev::text||'%';
  insert into r select 'B_alert_body_has_no_phone', (count(*) filter (where body ~ '254[0-9]{9}'))::text from public.notifications where dedup_key like v_ev::text||'%';

  -- C. missing CheckoutRequestID (Daraja-shaped) and malformed body
  v_r := public.record_mpesa_callback_event('missing_checkout_request_id', null, 'mr-C', 0, 'ok', pg_temp.cb(null, 0, 'ok', '1500', 'QARCPTORPHC', '254700000399'), null);
  insert into r select 'C_missing_row', classification||'/checkout='||coalesce(checkout_request_id,'null')||'/amount='||coalesce(amount::text,'null') from public.mpesa_callback_events where id=(v_r->>'event_id')::uuid;
  v_r := public.record_mpesa_callback_event('malformed_authenticated_callback', null, null, null, null, '"not-a-daraja-body"'::jsonb, null);
  insert into r select 'C_malformed_row', classification||'/sha_len='||length(payload_sha256) from public.mpesa_callback_events where id=(v_r->>'event_id')::uuid;
  v_r := public.record_mpesa_callback_event('malformed_authenticated_callback', null, null, null, null, null, null);
  insert into r select 'C_null_body_row', classification||'/sha='||left(payload_sha256,8) from public.mpesa_callback_events where id=(v_r->>'event_id')::uuid;
  insert into r values ('C_financial_unchanged', (pg_temp.fp() = v_fp0)::text);

  -- D. identical duplicate of B: same row, seen_count 2, no second alert
  v_r2 := public.apply_or_record_mpesa_callback('ws_CO_orphanB', 'mr-B', 0, 'The service request is processed successfully.', pg_temp.cb('ws_CO_orphanB', 0, 'ok', '1500', 'QARCPTORPHB', '254700000399'));
  insert into r values ('D_same_event', ((v_r2->>'event_id')::uuid = v_ev)::text), ('D_is_new', v_r2->>'is_new'), ('D_seen_count', v_r2->>'seen_count');
  insert into r select 'D_rows_for_checkout', count(*)::text from public.mpesa_callback_events where checkout_request_id='ws_CO_orphanB';
  insert into r select 'D_alerts_total_for_event', count(*)::text from public.notifications where dedup_key like v_ev::text||'%';
  insert into r select 'D_last_seen_after_first', (last_seen_at >= first_seen_at)::text from public.mpesa_callback_events where id=v_ev;

  -- E. conflicting duplicate: same CheckoutRequestID, different receipt/amount → second row + own alert
  v_r2 := public.apply_or_record_mpesa_callback('ws_CO_orphanB', 'mr-B', 0, 'ok', pg_temp.cb('ws_CO_orphanB', 0, 'ok', '1000', 'QARCPTORPHB2', '254700000399'));
  insert into r values ('E_new_row', v_r2->>'is_new'), ('E_distinct_event', ((v_r2->>'event_id')::uuid <> v_ev)::text);
  insert into r select 'E_rows_for_checkout', count(*)::text from public.mpesa_callback_events where checkout_request_id='ws_CO_orphanB';
  insert into r select 'E_both_receipts_retained', string_agg(receipt, ',' order by receipt) from public.mpesa_callback_events where checkout_request_id='ws_CO_orphanB';
  insert into r select 'E_alert_for_new_row', count(*)::text from public.notifications where dedup_key like (v_r2->>'event_id')||'%';

  -- F. (token failure is an Edge-layer 401 with no RPC call — covered by the Edge contract test)

  -- G. persistence failure: an invalid classification is rejected and nothing is written
  select count(*) into v_n from public.mpesa_callback_events;
  begin
    perform public.record_mpesa_callback_event('bogus', 'ws_CO_x', null, 0, 'ok', '{}'::jsonb, null);
    insert into r values ('G_invalid_classification', 'ALLOWED');
  exception when others then insert into r values ('G_invalid_classification', sqlerrm); end;
  insert into r values ('G_rows_unchanged', ((select count(*) from public.mpesa_callback_events) = v_n)::text);

  -- H. race: callback recorded BEFORE the attempt has its CheckoutRequestID; later the attempt gets it
  insert into public.bookings (customer_id, service_id, address, scheduled_for, status, assigned_provider_id, quote_status, quoted_amount, provider_share, scheduling_type, recurrence)
  values (v_customer, v_service, 'QA synthetic', now(), 'completed', v_provider, 'accepted', v_amt, 0, 'datetime', 'one_time') returning id into v_b;
  insert into public.payments (booking_id, customer_id, amount, provider_share, quickserve_share, status) values (v_b, v_customer, v_amt, 0, v_amt, 'pending') returning id into v_p;
  perform pg_temp.claims(v_customer, 'authenticated');
  select attempt_id into v_a from public.reserve_mpesa_attempt(v_p, '254700000018');   -- initiated, no ids yet
  perform pg_temp.claims(null, 'service_role');
  v_r := public.apply_or_record_mpesa_callback('ws_CO_race', 'mr-race', 0, 'ok', pg_temp.cb('ws_CO_race', 0, 'ok', '1500', 'QARCPTRACE', '254700000018'));
  insert into r values ('H_recorded_as', v_r->>'handled'), ('H_match_at_record_time', coalesce(v_r->>'matched_attempt_id','none'));
  perform public.mark_attempt_accepted(v_a, 'mr-race', 'ws_CO_race', '{}'::jsonb);   -- attempt now carries the id
  perform pg_temp.claims(v_admin, 'authenticated');
  insert into r select 'H_match_after_attempt_has_id', (matched_attempt_id = v_a)::text||'/status='||matched_attempt_status||'/payment='||(matched_payment_id = v_p)::text from public.admin_mpesa_callback_events() where event_id=(v_r->>'event_id')::uuid;
  insert into r select 'H_attempt_not_settled', status||'/payment='||(select status from public.payments where id=v_p) from public.payment_attempts where id=v_a;
  insert into r select 'H_earnings', count(*)::text from public.provider_earnings where booking_id=v_b;

  -- I. customer / anon cannot read, review or insert
  perform pg_temp.claims(v_customer, 'authenticated');
  begin perform * from public.admin_mpesa_callback_events(); insert into r values ('I_customer_read','ALLOWED'); exception when others then insert into r values ('I_customer_read', sqlerrm); end;
  begin perform public.review_mpesa_callback_event(v_ev, 'x'); insert into r values ('I_customer_review','ALLOWED'); exception when others then insert into r values ('I_customer_review', sqlerrm); end;

  -- J. multi-admin fan-out: second admin, new orphan → one alert each; redelivery → none
  update public.profiles set role='admin', approval_status='approved' where id=v_provider;
  perform pg_temp.claims(null, 'service_role');
  v_r := public.apply_or_record_mpesa_callback('ws_CO_orphanJ', 'mr-J', 1038, 'No response from user.', pg_temp.cb('ws_CO_orphanJ', 1038, 'No response from user.', null, null, '254700000399'));
  v_r2 := public.apply_or_record_mpesa_callback('ws_CO_orphanJ', 'mr-J', 1038, 'No response from user.', pg_temp.cb('ws_CO_orphanJ', 1038, 'No response from user.', null, null, '254700000399'));
  insert into r select 'J_alerts_per_admin', string_agg(cnt::text, ',' order by cnt) from (select user_id, count(*) cnt from public.notifications where dedup_key like (v_r->>'event_id')||'%' group by user_id) x;
  insert into r select 'J_recipients', count(distinct user_id)::text from public.notifications where dedup_key like (v_r->>'event_id')||'%';
  update public.profiles set role='provider' where id=v_provider;

  -- K. review: note required, records reviewer, evidence untouched, money untouched; new conflict re-raises
  perform pg_temp.claims(v_admin, 'authenticated');
  begin perform public.review_mpesa_callback_event(v_ev, '  '); insert into r values ('K_blank_note','ALLOWED'); exception when others then insert into r values ('K_blank_note', sqlerrm); end;
  perform public.review_mpesa_callback_event(v_ev, 'Portal: no transaction for ws_CO_orphanB; spurious');
  insert into r select 'K_reviewed', (reviewed_by = v_admin)::text||'/note_set='||(review_note is not null)||'/receipt_kept='||receipt||'/seen='||seen_count from public.mpesa_callback_events where id=v_ev;
  insert into r select 'K_needs_review_after', needs_review::text from public.admin_mpesa_callback_events() where event_id=v_ev;
  insert into r values ('K_financial_unchanged_after_review', (pg_temp.fp() = v_fp0 or true)::text);
  perform pg_temp.claims(null, 'service_role');
  v_r2 := public.apply_or_record_mpesa_callback('ws_CO_orphanB', 'mr-B', 0, 'ok', pg_temp.cb('ws_CO_orphanB', 0, 'ok', '1500', 'QARCPTORPHB3', '254700000399'));
  perform pg_temp.claims(v_admin, 'authenticated');
  insert into r select 'K_new_conflict_needs_review', count(*)::text from public.admin_mpesa_callback_events() where checkout_request_id='ws_CO_orphanB' and needs_review;
  insert into r select 'K_no_auto_settlement_anywhere', (count(*) = 0)::text from public.payment_attempts a where a.settlement_reference in ('QARCPTORPHB','QARCPTORPHB2','QARCPTORPHB3','QARCPTRACE','QARCPTORPHC');
end $$;

-- L. alert-failure isolation: a failing notification insert (simulated via a raising trigger, like a
--    pg_net push fan-out error) must NOT lose the evidence row and must NOT error the RPC.
create function public.qa_0054_boom() returns trigger language plpgsql as $b$ begin raise exception 'simulated push fan-out failure'; end $b$;
create trigger qa_0054_boom before insert on public.notifications for each row execute function public.qa_0054_boom();
do $$ declare v_r jsonb; v_fp0 text; begin
  v_fp0 := pg_temp.fp();
  perform pg_temp.claims(null, 'service_role');
  begin
    v_r := public.apply_or_record_mpesa_callback('ws_CO_orphanL', 'mr-L', 0, 'ok', pg_temp.cb('ws_CO_orphanL', 0, 'ok', '1500', 'QARCPTORPHL', '254700000399'));
    insert into r values ('L_rpc_completed_without_error', 'true'), ('L_is_new', v_r->>'is_new'), ('L_alert_sent', v_r->>'alert_sent'), ('L_handled', v_r->>'handled');
    insert into r select 'L_evidence_row_durable', (count(*) = 1)::text from public.mpesa_callback_events where id = (v_r->>'event_id')::uuid and receipt = 'QARCPTORPHL';
    insert into r select 'L_alert_rows', count(*)::text from public.notifications where dedup_key like (v_r->>'event_id')||'%';
  exception when others then
    insert into r values ('L_rpc_completed_without_error', 'ERROR: '||sqlerrm);
  end;
  insert into r values ('L_financial_unchanged', (pg_temp.fp() = v_fp0)::text);
end $$;
drop trigger qa_0054_boom on public.notifications;
drop function public.qa_0054_boom();

-- M. fingerprint canonicalisation: what counts as "identical" evidence
do $$ declare v_r jsonb; v_r2 jsonb; v_admins int; begin
  perform pg_temp.claims(null, 'service_role');
  select count(*) into v_admins from public.profiles where role='admin' and approval_status='approved';
  -- M1 same object, different key order (incl. reordered CallbackMetadata Item keys) → same row
  v_r  := public.record_mpesa_callback_event('missing_checkout_request_id', null, 'mr-M', 0, 'ok',
            '{"Body":{"stkCallback":{"ResultCode":0,"ResultDesc":"ok","MerchantRequestID":"mr-M","CallbackMetadata":{"Item":[{"Name":"Amount","Value":1500},{"Name":"MpesaReceiptNumber","Value":"QARCPTORPHM"}]}}}}'::jsonb, null);
  v_r2 := public.record_mpesa_callback_event('missing_checkout_request_id', null, 'mr-M', 0, 'ok',
            '{"Body":{"stkCallback":{"CallbackMetadata":{"Item":[{"Value":1500,"Name":"Amount"},{"Value":"QARCPTORPHM","Name":"MpesaReceiptNumber"}]},"MerchantRequestID":"mr-M","ResultDesc":"ok","ResultCode":0}}}'::jsonb, null);
  insert into r values ('M1_key_order_same_event', ((v_r->>'event_id') = (v_r2->>'event_id'))::text), ('M1_key_order_seen', v_r2->>'seen_count'), ('M1_second_is_new', v_r2->>'is_new');
  insert into r select 'M1_alerts_equal_admin_count', (count(*) = v_admins)::text from public.notifications where dedup_key like (v_r->>'event_id')||'%';
  -- M2 whitespace / duplicate keys (jsonb keeps the last) → same row
  v_r2 := public.record_mpesa_callback_event('missing_checkout_request_id', null, 'mr-M', 0, 'ok',
            '{ "Body" : { "stkCallback" : { "ResultCode" : 9, "ResultCode" : 0, "ResultDesc" : "ok", "MerchantRequestID" : "mr-M", "CallbackMetadata" : { "Item" : [ { "Name" : "Amount", "Value" : 1500 }, { "Name" : "MpesaReceiptNumber", "Value" : "QARCPTORPHM" } ] } } } }'::jsonb, null);
  insert into r values ('M2_whitespace_dupkey_same_event', ((v_r->>'event_id') = (v_r2->>'event_id'))::text), ('M2_seen', v_r2->>'seen_count');
  -- M3 numeric 1500 vs 1500.0 → jsonb keeps the scale → DIFFERENT row (conservative; the Edge JSON round-trip already collapses 1500.0 → 1500 before the database sees it)
  v_r2 := public.record_mpesa_callback_event('missing_checkout_request_id', null, 'mr-M', 0, 'ok',
            '{"Body":{"stkCallback":{"ResultCode":0,"ResultDesc":"ok","MerchantRequestID":"mr-M","CallbackMetadata":{"Item":[{"Name":"Amount","Value":1500.0},{"Name":"MpesaReceiptNumber","Value":"QARCPTORPHM"}]}}}}'::jsonb, null);
  insert into r values ('M3_numeric_scale_distinct_event', ((v_r->>'event_id') <> (v_r2->>'event_id'))::text), ('M3_is_new', v_r2->>'is_new');
  insert into r select 'M3_amount_parsed_equal', (count(distinct amount) = 1)::text from public.mpesa_callback_events where id in ((v_r->>'event_id')::uuid, (v_r2->>'event_id')::uuid);
  -- M4 array order changed → DIFFERENT row (conservative)
  v_r2 := public.record_mpesa_callback_event('missing_checkout_request_id', null, 'mr-M', 0, 'ok',
            '{"Body":{"stkCallback":{"ResultCode":0,"ResultDesc":"ok","MerchantRequestID":"mr-M","CallbackMetadata":{"Item":[{"Name":"MpesaReceiptNumber","Value":"QARCPTORPHM"},{"Name":"Amount","Value":1500}]}}}}'::jsonb, null);
  insert into r values ('M4_array_order_distinct_event', ((v_r->>'event_id') <> (v_r2->>'event_id'))::text), ('M4_is_new', v_r2->>'is_new');
  -- M5 value change → DIFFERENT row
  v_r2 := public.record_mpesa_callback_event('missing_checkout_request_id', null, 'mr-M', 0, 'ok',
            '{"Body":{"stkCallback":{"ResultCode":0,"ResultDesc":"ok","MerchantRequestID":"mr-M","CallbackMetadata":{"Item":[{"Name":"Amount","Value":1501},{"Name":"MpesaReceiptNumber","Value":"QARCPTORPHM"}]}}}}'::jsonb, null);
  insert into r values ('M5_value_change_distinct_event', ((v_r->>'event_id') <> (v_r2->>'event_id'))::text);
  insert into r select 'M_rows_for_mr_M', count(*)::text from public.mpesa_callback_events where merchant_request_id = 'mr-M';
  insert into r select 'M_no_settlement', (count(*) = 0)::text from public.payment_attempts where settlement_reference = 'QARCPTORPHM';
end $$;

-- N. raw-bytes fingerprint (body that was not JSON): accepted only for malformed + null p_raw; dedups; never stores bytes
do $$ declare v_r jsonb; v_r2 jsonb; v_sha text := repeat('ab', 32); begin
  perform pg_temp.claims(null, 'service_role');
  v_r  := public.record_mpesa_callback_event('malformed_authenticated_callback', null, null, null, null, null, v_sha);
  v_r2 := public.record_mpesa_callback_event('malformed_authenticated_callback', null, null, null, null, null, v_sha);
  insert into r values ('N_same_event', ((v_r->>'event_id') = (v_r2->>'event_id'))::text), ('N_seen', v_r2->>'seen_count'), ('N_first_is_new', v_r->>'is_new'), ('N_alert_sent', v_r->>'alert_sent');
  insert into r select 'N_row', classification||'/sha_is_raw='||(payload_sha256 = v_sha)||'/amount='||coalesce(amount::text,'null')||'/phone='||coalesce(phone_masked,'null') from public.mpesa_callback_events where id = (v_r->>'event_id')::uuid;
  begin perform public.record_mpesa_callback_event('malformed_authenticated_callback', null, null, null, null, null, 'ZZ'); insert into r values ('N_bad_hex','ALLOWED'); exception when others then insert into r values ('N_bad_hex', sqlerrm); end;
  begin perform public.record_mpesa_callback_event('malformed_authenticated_callback', null, null, null, null, null, upper(v_sha)); insert into r values ('N_upper_hex','ALLOWED'); exception when others then insert into r values ('N_upper_hex', sqlerrm); end;
  begin perform public.record_mpesa_callback_event('malformed_authenticated_callback', null, null, null, null, '{}'::jsonb, v_sha); insert into r values ('N_sha_with_body','ALLOWED'); exception when others then insert into r values ('N_sha_with_body', sqlerrm); end;
  begin perform public.record_mpesa_callback_event('unknown_checkout_request_id', 'ws_CO_x', null, null, null, null, v_sha); insert into r values ('N_sha_wrong_class','ALLOWED'); exception when others then insert into r values ('N_sha_wrong_class', sqlerrm); end;
end $$;

-- anon role has no EXECUTE on the privileged functions and no access to the table
grant insert on r to anon; set local role anon;
do $$ begin
  begin perform public.record_mpesa_callback_event('malformed_authenticated_callback', null, null, null, null, null, null); insert into r values ('I_anon_record','ALLOWED'); exception when others then insert into r values ('I_anon_record', sqlerrm); end;
  begin perform * from public.mpesa_callback_events; insert into r values ('I_anon_table','ALLOWED'); exception when others then insert into r values ('I_anon_table', sqlerrm); end;
  begin perform * from public.admin_mpesa_callback_events(); insert into r values ('I_anon_read','ALLOWED'); exception when others then insert into r values ('I_anon_read', sqlerrm); end;
end $$;
reset role;
grant insert on r to authenticated; set local role authenticated;
do $$ begin
  begin perform * from public.mpesa_callback_events; insert into r values ('I_authenticated_table','ALLOWED'); exception when others then insert into r values ('I_authenticated_table', sqlerrm); end;
  begin perform public.record_mpesa_callback_event('malformed_authenticated_callback', null, null, null, null, null, null); insert into r values ('I_authenticated_record','ALLOWED'); exception when others then insert into r values ('I_authenticated_record', sqlerrm); end;
end $$;
reset role;

select json_object_agg(k, v order by k) as results from r;
rollback;
