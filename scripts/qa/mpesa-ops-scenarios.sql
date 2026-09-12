-- scripts/qa/mpesa-ops-scenarios.sql — M-PESA operational test matrix, executed against QA ONLY,
-- entirely inside ONE transaction that is ROLLED BACK. Zero residue. Never run against Production.
--
-- Run (repo linked to QA):
--   npx supabase db query --linked -f scripts/qa/mpesa-ops-scenarios.sql
--
-- Every scenario records rows in a temp table `r(k, v)`; the final SELECT aggregates them. Any
-- value that is not the expected one is a regression in the 0036/0045/0046/0050/0053 contract.
-- Synthetic fixtures only: no real phone numbers, receipts or secrets.
begin;

create temp table r (k text, v text) on commit drop;
create temp table fx (k text primary key, booking_id uuid, payment_id uuid, attempt_id uuid) on commit drop;


-- Helpers live in pg_temp (plpgsql cannot declare nested functions). Dropped with the session.
create function pg_temp.mk(p_customer uuid, p_provider uuid, p_service text, p_amt numeric, out booking_id uuid, out payment_id uuid)
language plpgsql as $mk$
begin
  insert into public.bookings (customer_id, service_id, address, scheduled_for, status, assigned_provider_id,
                               quote_status, quoted_amount, provider_share, scheduling_type, recurrence)
  values (p_customer, p_service, 'QA synthetic', now(), 'completed', p_provider, 'accepted', p_amt, 0, 'datetime', 'one_time')
  returning id into booking_id;
  insert into public.payments (booking_id, customer_id, amount, provider_share, quickserve_share, status)
  values (booking_id, p_customer, p_amt, 0, p_amt, 'pending') returning id into payment_id;
end $mk$;
create function pg_temp.claims(p_sub uuid, p_role text) returns void language sql as $c$
  select set_config('request.jwt.claims', case when p_sub is null then json_build_object('role', p_role)::text
                                               else json_build_object('sub', p_sub, 'role', p_role)::text end, true)
$c$;
create function pg_temp.cb(p_checkout text, p_code int, p_desc text, p_amount text, p_receipt text) returns jsonb language sql as $f$
  select jsonb_build_object('Body', jsonb_build_object('stkCallback', jsonb_build_object(
    'MerchantRequestID', 'mr-'||p_checkout, 'CheckoutRequestID', p_checkout, 'ResultCode', p_code, 'ResultDesc', p_desc)
    || case when p_code = 0 then jsonb_build_object('CallbackMetadata', jsonb_build_object('Item', jsonb_build_array(
         jsonb_build_object('Name','Amount','Value', case when p_amount ~ '^[0-9.]+$' then to_jsonb(p_amount::numeric) else to_jsonb(p_amount) end),
         jsonb_build_object('Name','MpesaReceiptNumber','Value', p_receipt),
         jsonb_build_object('Name','TransactionDate','Value', 20260911203845),
         jsonb_build_object('Name','PhoneNumber','Value', 254700000000)))) else '{}'::jsonb end))
$f$;

do $$
declare
  v_admin    uuid;
  v_customer uuid;
  v_provider uuid;
  v_service  text;
  v_amt      numeric := 1500;
  v_b uuid; v_p uuid; v_a uuid; v_a2 uuid; v_tmp uuid;
  v_n int; v_n2 int; v_txt text; v_rec record;

begin
  select id into v_admin    from public.profiles where role='admin'    order by created_at limit 1;
  select id into v_customer from public.profiles where role='customer' order by created_at limit 1;
  select id into v_provider from public.profiles where role='provider' and approval_status='approved' order by created_at limit 1;
  select service_id into v_service from public.bookings limit 1;

  -- ────────────────────────────────────────────────────────────────────────
  -- S1 normal success: reserve → accepted → callback 0 → paid, one earning; duplicate callback no-op
  select booking_id, payment_id into v_b, v_p from pg_temp.mk(v_customer, v_provider, v_service, v_amt);
  perform pg_temp.claims(v_customer, 'authenticated');
  select attempt_id into v_a from public.reserve_mpesa_attempt(v_p, '254700000001');
  perform pg_temp.claims(null, 'service_role');
  perform public.mark_attempt_accepted(v_a, 'mr-s1', 'ws_CO_s1', '{}'::jsonb);
  perform public.apply_mpesa_callback('ws_CO_s1', 'mr-s1', 0, 'The service request is processed successfully.', pg_temp.cb('ws_CO_s1', 0, 'ok', v_amt::text, 'QARCPT0001'));
  insert into r select 's1_attempt', status||'/col='||coalesce(collected_amount::text,'')||'/ref='||coalesce(settlement_reference,'') from public.payment_attempts where id=v_a;
  insert into r select 's1_payment', status||'/'||coalesce(payment_method,'') from public.payments where id=v_p;
  insert into r select 's1_earnings', count(*)::text from public.provider_earnings where booking_id=v_b;
  perform public.apply_mpesa_callback('ws_CO_s1', 'mr-s1', 0, 'dup', pg_temp.cb('ws_CO_s1', 0, 'ok', v_amt::text, 'QARCPT0001'));
  insert into r select 's1_dup_callback_earnings', count(*)::text from public.provider_earnings where booking_id=v_b;
  insert into r select 's1_dup_callback_discrepancies', coalesce(jsonb_array_length(discrepancy),0)::text from public.payment_attempts where id=v_a;
  -- S6 manual reconcile AFTER callback settlement must be rejected
  perform pg_temp.claims(v_admin, 'authenticated');
  begin perform public.reconcile_payment_attempt_no_collection(v_a, 'late manual', null, 'portal_lookup'); insert into r values ('s6_manual_after_settlement','ALLOWED');
  exception when others then insert into r values ('s6_manual_after_settlement', sqlerrm); end;
  begin perform public.confirm_payment_attempt(v_a, v_amt, 'late confirm', 'QARCPT0001'); insert into r values ('s6_confirm_after_settlement','ALLOWED');
  exception when others then insert into r values ('s6_confirm_after_settlement', sqlerrm); end;
  perform pg_temp.claims(v_admin, 'authenticated');
  insert into r select 's1_review_category', category||'/'||urgency||'/blocks='||blocks_retry||'/needs='||needs_operator from public.admin_mpesa_attempt_review() where attempt_id=v_a;

  -- ────────────────────────────────────────────────────────────────────────
  -- S2 explicit failures (certified 1038 and 1032): failed, payment pending, no earning, retry allowed
  select booking_id, payment_id into v_b, v_p from pg_temp.mk(v_customer, v_provider, v_service, v_amt);
  perform pg_temp.claims(v_customer, 'authenticated'); select attempt_id into v_a from public.reserve_mpesa_attempt(v_p, '254700000002');
  perform pg_temp.claims(null, 'service_role'); perform public.mark_attempt_accepted(v_a, 'mr-s2a', 'ws_CO_s2a', '{}'::jsonb);
  perform public.apply_mpesa_callback('ws_CO_s2a', 'mr-s2a', 1038, 'No response from user.', pg_temp.cb('ws_CO_s2a', 1038, 'No response from user.', null, null));
  insert into r select 's2_1038_attempt', status||'/'||result_code from public.payment_attempts where id=v_a;
  perform pg_temp.claims(v_customer, 'authenticated'); select attempt_id into v_a2 from public.reserve_mpesa_attempt(v_p, '254700000002');  -- retry allowed after failed
  perform pg_temp.claims(null, 'service_role'); perform public.mark_attempt_accepted(v_a2, 'mr-s2b', 'ws_CO_s2b', '{}'::jsonb);
  perform public.apply_mpesa_callback('ws_CO_s2b', 'mr-s2b', 1032, 'Request Cancelled by user.', pg_temp.cb('ws_CO_s2b', 1032, 'Request Cancelled by user.', null, null));
  insert into r select 's2_1032_attempt', status||'/'||result_code from public.payment_attempts where id=v_a2;
  insert into r select 's2_payment', status from public.payments where id=v_p;
  insert into r select 's2_earnings', count(*)::text from public.provider_earnings where booking_id=v_b;
  perform pg_temp.claims(v_admin, 'authenticated');
  insert into r select 's2_review_categories', string_agg(category||'/blocks='||blocks_retry, ',' order by created_at) from public.admin_mpesa_attempt_review() where payment_id=v_p;

  -- ────────────────────────────────────────────────────────────────────────
  -- S3 transport ambiguity → no callback → ages to timed_out; retry denied throughout; alerts dedup
  select booking_id, payment_id into v_b, v_p from pg_temp.mk(v_customer, v_provider, v_service, v_amt);
  perform pg_temp.claims(v_customer, 'authenticated'); select attempt_id into v_a from public.reserve_mpesa_attempt(v_p, '254700000003');
  begin select attempt_id into v_tmp from public.reserve_mpesa_attempt(v_p, '254700000003'); insert into r values ('s3_retry_while_initiated','ALLOWED');
  exception when others then insert into r values ('s3_retry_while_initiated', sqlerrm); end;
  perform pg_temp.claims(v_admin, 'authenticated');
  insert into r select 's3_review_fresh', category||'/'||urgency from public.admin_mpesa_attempt_review() where attempt_id=v_a;
  update public.payment_attempts set created_at = now() - interval '6 minutes' where id=v_a;   -- fixture aging only
  insert into r select 's3_review_past_window', category||'/'||urgency from public.admin_mpesa_attempt_review() where attempt_id=v_a;
  perform pg_temp.claims(null, 'service_role');
  insert into r select 's3_cron_aged', public.reconcile_stale_payment_attempts(interval '5 minutes')::text;
  insert into r select 's3_status_after_cron', status from public.payment_attempts where id=v_a;
  perform pg_temp.claims(v_admin, 'authenticated');
  insert into r select 's3_review_timed_out', category||'/'||urgency||'/blocks='||blocks_retry||'/needs='||needs_operator from public.admin_mpesa_attempt_review() where attempt_id=v_a;
  perform pg_temp.claims(v_customer, 'authenticated');
  begin select attempt_id into v_tmp from public.reserve_mpesa_attempt(v_p, '254700000003'); insert into r values ('s3_retry_while_timed_out','ALLOWED');
  exception when others then insert into r values ('s3_retry_while_timed_out', sqlerrm); end;
  -- alert sweep: first run emits, second run emits nothing new
  perform pg_temp.claims(null, 'service_role');
  select count(*) into v_n from public.notifications where type='admin_attempt_timed_out' and dedup_key like v_a::text||'%';
  perform public.mpesa_ops_alert_sweep();
  select count(*) into v_n2 from public.notifications where type='admin_attempt_timed_out' and dedup_key like v_a::text||'%';
  insert into r values ('s3_alert_first_sweep_new_rows', (v_n2 - v_n)::text);
  insert into r select 's3_alert_admins', count(*)::text from public.profiles where role='admin' and approval_status='approved';
  perform public.mpesa_ops_alert_sweep();
  select count(*) into v_n from public.notifications where type='admin_attempt_timed_out' and dedup_key like v_a::text||'%';
  insert into r values ('s3_alert_second_sweep_total_rows', v_n::text);
  update public.payment_attempts set created_at = now() - interval '61 minutes' where id=v_a;     -- fixture aging
  perform public.mpesa_ops_alert_sweep(); perform public.mpesa_ops_alert_sweep();
  insert into r select 's3_stale_alert_rows', count(*)::text from public.notifications where type='admin_attempt_stale' and dedup_key like v_a::text||'%';
  perform pg_temp.claims(v_admin, 'authenticated');
  insert into r select 's3_review_stale', category||'/'||urgency from public.admin_mpesa_attempt_review() where attempt_id=v_a;
  -- S4 manual no-collection on the timed_out attempt (admin + evidence) → cancelled, payment pending, retry allowed, repeat rejected
  perform public.reconcile_payment_attempt_no_collection(v_a, 'Portal checked: no transaction for this request', 'SAF-CASE-QA1', 'provider_reference');
  insert into r select 's4_attempt', status||'/resolved_by='||(resolved_by is not null)||'/ref='||coalesce(resolution_reference,'') from public.payment_attempts where id=v_a;
  insert into r select 's4_payment', status from public.payments where id=v_p;
  insert into r select 's4_review', category||'/needs='||needs_operator||'/blocks='||blocks_retry from public.admin_mpesa_attempt_review() where attempt_id=v_a;
  begin perform public.reconcile_payment_attempt_no_collection(v_a, 'again', null, 'portal_lookup'); insert into r values ('s4_repeat','ALLOWED');
  exception when others then insert into r values ('s4_repeat', sqlerrm); end;
  perform pg_temp.claims(v_customer, 'authenticated');
  begin select attempt_id into v_tmp from public.reserve_mpesa_attempt(v_p, '254700000003'); insert into r values ('s4_retry_after_no_collection','ALLOWED');
  exception when others then insert into r values ('s4_retry_after_no_collection', sqlerrm); end;

  -- ────────────────────────────────────────────────────────────────────────
  -- S5 manual confirmed collection on a timed_out attempt; duplicate confirm; callback after manual settlement
  select booking_id, payment_id into v_b, v_p from pg_temp.mk(v_customer, v_provider, v_service, v_amt);
  perform pg_temp.claims(v_customer, 'authenticated'); select attempt_id into v_a from public.reserve_mpesa_attempt(v_p, '254700000005');
  perform pg_temp.claims(null, 'service_role'); perform public.mark_attempt_accepted(v_a, 'mr-s5', 'ws_CO_s5', '{}'::jsonb);
  update public.payment_attempts set created_at = now() - interval '10 minutes' where id=v_a;
  perform public.reconcile_stale_payment_attempts(interval '5 minutes');
  perform pg_temp.claims(v_admin, 'authenticated');
  begin perform public.confirm_payment_attempt(v_a, v_amt + 1, 'wrong amount', 'QARCPT0005'); insert into r values ('s5_wrong_amount','ALLOWED');
  exception when others then insert into r values ('s5_wrong_amount', sqlerrm); end;
  begin perform public.confirm_payment_attempt(v_a, v_amt, '', 'QARCPT0005'); insert into r values ('s5_blank_note','ALLOWED');
  exception when others then insert into r values ('s5_blank_note', sqlerrm); end;
  begin perform public.confirm_payment_attempt(v_a, v_amt, 'portal receipt seen', null); insert into r values ('s5_missing_reference','ALLOWED');
  exception when others then insert into r values ('s5_missing_reference', sqlerrm); end;
  perform public.confirm_payment_attempt(v_a, v_amt, 'portal receipt seen', 'QARCPT0005');
  insert into r select 's5_attempt', status||'/ref='||settlement_reference||'/col='||collected_amount||'/resolved_by='||(resolved_by is not null) from public.payment_attempts where id=v_a;
  insert into r select 's5_payment', status||'/'||coalesce(payment_method,'') from public.payments where id=v_p;
  insert into r select 's5_earnings', count(*)::text from public.provider_earnings where booking_id=v_b;
  begin perform public.confirm_payment_attempt(v_a, v_amt, 'again', 'QARCPT0005'); insert into r values ('s5_duplicate_confirm','ALLOWED');
  exception when others then insert into r values ('s5_duplicate_confirm', sqlerrm); end;
  perform pg_temp.claims(null, 'service_role');
  perform public.apply_mpesa_callback('ws_CO_s5', 'mr-s5', 0, 'late success same receipt', pg_temp.cb('ws_CO_s5', 0, 'ok', v_amt::text, 'QARCPT0005'));
  perform public.apply_mpesa_callback('ws_CO_s5', 'mr-s5', 0, 'late success other receipt', pg_temp.cb('ws_CO_s5', 0, 'ok', v_amt::text, 'QARCPT0005X'));
  insert into r select 's5_after_late_callbacks', status||'/ref='||settlement_reference||'/disc='||coalesce((select string_agg(d->>'type', ',') from jsonb_array_elements(coalesce(discrepancy,'[]'::jsonb)) d),'') from public.payment_attempts where id=v_a;
  insert into r select 's5_earnings_after_late_callbacks', count(*)::text from public.provider_earnings where booking_id=v_b;
  insert into r select 's5_payment_after', status from public.payments where id=v_p;

  -- ────────────────────────────────────────────────────────────────────────
  -- S7 amount mismatch and S8 malformed amount: never settle, recorded, investigate + one discrepancy alert
  select booking_id, payment_id into v_b, v_p from pg_temp.mk(v_customer, v_provider, v_service, v_amt);
  perform pg_temp.claims(v_customer, 'authenticated'); select attempt_id into v_a from public.reserve_mpesa_attempt(v_p, '254700000007');
  perform pg_temp.claims(null, 'service_role'); perform public.mark_attempt_accepted(v_a, 'mr-s7', 'ws_CO_s7', '{}'::jsonb);
  perform public.apply_mpesa_callback('ws_CO_s7', 'mr-s7', 0, 'ok', pg_temp.cb('ws_CO_s7', 0, 'ok', (v_amt - 500)::text, 'QARCPT0007'));
  insert into r select 's7_mismatch', status||'/disc='||coalesce((select string_agg(d->>'type', ',') from jsonb_array_elements(coalesce(discrepancy,'[]'::jsonb)) d),'') from public.payment_attempts where id=v_a;
  insert into r select 's7_payment', status from public.payments where id=v_p;
  perform public.mpesa_ops_alert_sweep(); perform public.mpesa_ops_alert_sweep();
  insert into r select 's7_discrepancy_alert_rows', count(*)::text from public.notifications where type='admin_attempt_discrepancy' and dedup_key like v_a::text||'%';
  perform pg_temp.claims(v_admin, 'authenticated');
  insert into r select 's7_review', category||'/'||urgency||'/needs='||needs_operator||'/disc='||coalesce(latest_discrepancy_type,'') from public.admin_mpesa_attempt_review() where attempt_id=v_a;
  select booking_id, payment_id into v_b, v_p from pg_temp.mk(v_customer, v_provider, v_service, v_amt);
  perform pg_temp.claims(v_customer, 'authenticated'); select attempt_id into v_a from public.reserve_mpesa_attempt(v_p, '254700000008');
  perform pg_temp.claims(null, 'service_role'); perform public.mark_attempt_accepted(v_a, 'mr-s8', 'ws_CO_s8', '{}'::jsonb);
  perform public.apply_mpesa_callback('ws_CO_s8', 'mr-s8', 0, 'ok', pg_temp.cb('ws_CO_s8', 0, 'ok', '1,500.00', 'QARCPT0008'));
  insert into r select 's8_malformed', status||'/disc='||coalesce((select string_agg(d->>'type', ',') from jsonb_array_elements(coalesce(discrepancy,'[]'::jsonb)) d),'') from public.payment_attempts where id=v_a;
  insert into r select 's8_payment', status from public.payments where id=v_p;

  -- ────────────────────────────────────────────────────────────────────────
  -- S9 unknown identifiers: nothing changes anywhere
  select count(*) into v_n from public.payment_attempts; select count(*) into v_n2 from public.payments where status='paid';
  perform public.apply_mpesa_callback('ws_CO_unknown_qa', 'mr-unknown', 0, 'ok', pg_temp.cb('ws_CO_unknown_qa', 0, 'ok', '1', 'QARCPTUNK'));
  insert into r values ('s9_unknown_callback_unchanged', ((select count(*) from public.payment_attempts) = v_n and (select count(*) from public.payments where status='paid') = v_n2)::text);

  -- ────────────────────────────────────────────────────────────────────────
  -- S11 settled + conflicting late callback: money unchanged, discrepancy visible in default queue,
  --     one discrepancy alert per admin, review clears it, a NEW discrepancy re-opens it
  select booking_id, payment_id into v_b, v_p from pg_temp.mk(v_customer, v_provider, v_service, v_amt);
  perform pg_temp.claims(v_customer, 'authenticated'); select attempt_id into v_a from public.reserve_mpesa_attempt(v_p, '254700000011');
  perform pg_temp.claims(null, 'service_role'); perform public.mark_attempt_accepted(v_a, 'mr-s11', 'ws_CO_s11', '{}'::jsonb);
  perform public.apply_mpesa_callback('ws_CO_s11', 'mr-s11', 0, 'ok', pg_temp.cb('ws_CO_s11', 0, 'ok', v_amt::text, 'QARCPT0011'));
  perform public.apply_mpesa_callback('ws_CO_s11', 'mr-s11', 0, 'conflict', pg_temp.cb('ws_CO_s11', 0, 'ok', v_amt::text, 'QARCPT0011B'));
  insert into r select 's11_attempt', status||'/ref='||settlement_reference||'/col='||collected_amount from public.payment_attempts where id=v_a;
  insert into r select 's11_earnings', count(*)::text from public.provider_earnings where booking_id=v_b;
  perform pg_temp.claims(v_admin, 'authenticated');
  insert into r select 's11_review_before', category||'/needs='||needs_operator||'/unresolved='||discrepancy_unresolved||'/disc='||latest_discrepancy_type from public.admin_mpesa_attempt_review() where attempt_id=v_a;
  -- second admin fixture: promote a provider-less customer? use a fresh profile row via the provider profile (role change only inside this rolled-back txn)
  update public.profiles set role='admin', approval_status='approved' where id=v_provider;
  perform pg_temp.claims(null, 'service_role');
  perform public.mpesa_ops_alert_sweep(); perform public.mpesa_ops_alert_sweep();
  insert into r select 's11_discrepancy_alerts_per_admin', string_agg(cnt::text, ',' order by cnt) from (select user_id, count(*) cnt from public.notifications where type='admin_attempt_discrepancy' and dedup_key like v_a::text||'%' group by user_id) x;
  insert into r select 's11_discrepancy_alert_recipients', count(distinct user_id)::text from public.notifications where type='admin_attempt_discrepancy' and dedup_key like v_a::text||'%';
  update public.profiles set role='provider' where id=v_provider;   -- restore fixture role within the txn
  perform pg_temp.claims(v_customer, 'authenticated');
  begin perform public.review_attempt_discrepancy(v_a, 'customer trying'); insert into r values ('s11_customer_review_discrepancy','ALLOWED');
  exception when others then insert into r values ('s11_customer_review_discrepancy', sqlerrm); end;
  perform pg_temp.claims(v_admin, 'authenticated');
  begin perform public.review_attempt_discrepancy(v_a, '   '); insert into r values ('s11_blank_review_note','ALLOWED');
  exception when others then insert into r values ('s11_blank_review_note', sqlerrm); end;
  perform public.review_attempt_discrepancy(v_a, 'Portal confirms QARCPT0011 is the only debit; second callback was a duplicate notification');
  insert into r select 's11_review_after', category||'/needs='||needs_operator||'/unresolved='||discrepancy_unresolved||'/reviewed_at_set='||(discrepancy_reviewed_at is not null) from public.admin_mpesa_attempt_review() where attempt_id=v_a;
  insert into r select 's11_money_after_review', (select status||'/'||coalesce(payment_method,'') from public.payments where id=v_p)||'/attempt='||(select status||'/'||settlement_reference from public.payment_attempts where id=v_a);
  begin perform public.review_attempt_discrepancy(v_a, 'again'); insert into r values ('s11_review_repeat','ALLOWED');
  exception when others then insert into r values ('s11_review_repeat', sqlerrm); end;
  perform pg_temp.claims(null, 'service_role');
  perform public.apply_mpesa_callback('ws_CO_s11', 'mr-s11', 0, 'conflict2', pg_temp.cb('ws_CO_s11', 0, 'ok', v_amt::text, 'QARCPT0011C'));
  perform pg_temp.claims(v_admin, 'authenticated');
  insert into r select 's11_new_discrepancy_reopens', category||'/unresolved='||discrepancy_unresolved||'/count='||discrepancy_count from public.admin_mpesa_attempt_review() where attempt_id=v_a;
  -- a clean settled attempt (S1) stays non-actionable
  insert into r select 's11_clean_settled_not_actionable', count(*)::text from public.admin_mpesa_attempt_review() where category='settled' and needs_operator;

  -- ────────────────────────────────────────────────────────────────────────
  -- S12 direct RPC no-collection with insufficient evidence is rejected server-side
  select booking_id, payment_id into v_b, v_p from pg_temp.mk(v_customer, v_provider, v_service, v_amt);
  perform pg_temp.claims(v_customer, 'authenticated'); select attempt_id into v_a from public.reserve_mpesa_attempt(v_p, '254700000012');
  perform pg_temp.claims(null, 'service_role'); perform public.mark_attempt_accepted(v_a, 'mr-s12', 'ws_CO_s12', '{}'::jsonb);
  update public.payment_attempts set created_at = now() - interval '10 minutes' where id=v_a;
  perform public.reconcile_stale_payment_attempts(interval '5 minutes');
  perform pg_temp.claims(v_admin, 'authenticated');
  begin perform public.reconcile_payment_attempt_no_collection(v_a, 'checked', null, 'provider_reference'); insert into r values ('s12_note_only_provider_ref','ALLOWED');
  exception when others then insert into r values ('s12_note_only_provider_ref', sqlerrm); end;
  begin perform public.reconcile_payment_attempt_no_collection(v_a, 'checked', null, 'gut_feeling'); insert into r values ('s12_bad_source','ALLOWED');
  exception when others then insert into r values ('s12_bad_source', sqlerrm); end;
  begin perform public.reconcile_payment_attempt_no_collection(v_a, 'checked', null, null); insert into r values ('s12_null_source','ALLOWED');
  exception when others then insert into r values ('s12_null_source', sqlerrm); end;
  begin perform public.reconcile_payment_attempt_no_collection(v_a, 'checked', 'CASE-1'); insert into r values ('s12_old_3arg_signature','ALLOWED');
  exception when others then insert into r values ('s12_old_3arg_signature', sqlerrm); end;
  insert into r select 's12_still_blocking', status from public.payment_attempts where id=v_a;
  perform public.reconcile_payment_attempt_no_collection(v_a, 'Business portal checked 12 Sep: no transaction for this request', null, 'portal_lookup');
  insert into r select 's12_portal_lookup_recorded', status||'/source='||resolution_evidence_source||'/ref='||coalesce(resolution_reference,'null') from public.payment_attempts where id=v_a;

  -- ────────────────────────────────────────────────────────────────────────
  -- S13 no-collection resolution, then a DELAYED success callback for the original attempt
  select booking_id, payment_id into v_b, v_p from pg_temp.mk(v_customer, v_provider, v_service, v_amt);
  perform pg_temp.claims(v_customer, 'authenticated'); select attempt_id into v_a from public.reserve_mpesa_attempt(v_p, '254700000013');
  perform pg_temp.claims(null, 'service_role'); perform public.mark_attempt_accepted(v_a, 'mr-s13', 'ws_CO_s13', '{}'::jsonb);
  update public.payment_attempts set created_at = now() - interval '10 minutes' where id=v_a;
  perform public.reconcile_stale_payment_attempts(interval '5 minutes');
  perform pg_temp.claims(v_admin, 'authenticated');
  perform public.reconcile_payment_attempt_no_collection(v_a, 'Portal showed no transaction at the time', null, 'portal_lookup');
  perform pg_temp.claims(v_customer, 'authenticated');
  begin select attempt_id into v_tmp from public.reserve_mpesa_attempt(v_p, '254700000013'); insert into r values ('s13_retry_allowed_after_no_collection','ALLOWED');
  exception when others then insert into r values ('s13_retry_allowed_after_no_collection', sqlerrm); end;
  -- undo the probe reservation so the "no sibling" variant is tested first
  delete from public.payment_attempts where id=v_tmp;
  perform pg_temp.claims(null, 'service_role');
  perform public.apply_mpesa_callback('ws_CO_s13', 'mr-s13', 0, 'delayed success', pg_temp.cb('ws_CO_s13', 0, 'ok', v_amt::text, 'QARCPT0013'));
  insert into r select 's13_attempt_after_delayed_success', status||'/ref='||coalesce(settlement_reference,'null')||'/disc='||coalesce((select string_agg(d->>'type', ',') from jsonb_array_elements(coalesce(discrepancy,'[]'::jsonb)) d),'') from public.payment_attempts where id=v_a;
  insert into r select 's13_payment_after', status||'/'||coalesce(payment_method,'') from public.payments where id=v_p;
  insert into r select 's13_earnings', count(*)::text from public.provider_earnings where booking_id=v_b;
  perform pg_temp.claims(v_admin, 'authenticated');
  insert into r select 's13_review', category||'/needs='||needs_operator||'/disc='||coalesce(latest_discrepancy_type,'') from public.admin_mpesa_attempt_review() where attempt_id=v_a;
  insert into r select 's13_attempts_total_for_payment', count(*)::text from public.payment_attempts where payment_id=v_p;

  -- S14 harder variant: no-collection, then a NEW sibling attempt exists, then the delayed original success arrives
  select booking_id, payment_id into v_b, v_p from pg_temp.mk(v_customer, v_provider, v_service, v_amt);
  perform pg_temp.claims(v_customer, 'authenticated'); select attempt_id into v_a from public.reserve_mpesa_attempt(v_p, '254700000014');
  perform pg_temp.claims(null, 'service_role'); perform public.mark_attempt_accepted(v_a, 'mr-s14', 'ws_CO_s14', '{}'::jsonb);
  update public.payment_attempts set created_at = now() - interval '10 minutes' where id=v_a;
  perform public.reconcile_stale_payment_attempts(interval '5 minutes');
  perform pg_temp.claims(v_admin, 'authenticated');
  perform public.reconcile_payment_attempt_no_collection(v_a, 'Portal showed no transaction at the time', null, 'portal_lookup');
  perform pg_temp.claims(v_customer, 'authenticated'); select attempt_id into v_a2 from public.reserve_mpesa_attempt(v_p, '254700000014');
  perform pg_temp.claims(null, 'service_role'); perform public.mark_attempt_accepted(v_a2, 'mr-s14b', 'ws_CO_s14b', '{}'::jsonb);
  perform public.apply_mpesa_callback('ws_CO_s14', 'mr-s14', 0, 'delayed original success', pg_temp.cb('ws_CO_s14', 0, 'ok', v_amt::text, 'QARCPT0014'));
  insert into r select 's14_original_after_delayed_success', status||'/ref='||coalesce(settlement_reference,'null')||'/disc='||coalesce((select string_agg(d->>'type', ',') from jsonb_array_elements(coalesce(discrepancy,'[]'::jsonb)) d),'') from public.payment_attempts where id=v_a;
  insert into r select 's14_sibling', status from public.payment_attempts where id=v_a2;
  insert into r select 's14_payment', status from public.payments where id=v_p;
  insert into r select 's14_earnings', count(*)::text from public.provider_earnings where booking_id=v_b;
  perform pg_temp.claims(v_admin, 'authenticated');
  insert into r select 's14_review_original', category||'/needs='||needs_operator||'/disc='||coalesce(latest_discrepancy_type,'') from public.admin_mpesa_attempt_review() where attempt_id=v_a;
  perform pg_temp.claims(null, 'service_role');
  perform public.mpesa_ops_alert_sweep();
  insert into r select 's14_discrepancy_alert', count(*)::text from public.notifications where type='admin_attempt_discrepancy' and dedup_key like v_a::text||'%';

  -- ────────────────────────────────────────────────────────────────────────
  -- S15 multi-admin fan-out for a timed_out alert; resolved attempt gets no later stale alert
  select booking_id, payment_id into v_b, v_p from pg_temp.mk(v_customer, v_provider, v_service, v_amt);
  perform pg_temp.claims(v_customer, 'authenticated'); select attempt_id into v_a from public.reserve_mpesa_attempt(v_p, '254700000015');
  update public.payment_attempts set created_at = now() - interval '10 minutes' where id=v_a;
  perform pg_temp.claims(null, 'service_role'); perform public.reconcile_stale_payment_attempts(interval '5 minutes');
  update public.profiles set role='admin', approval_status='approved' where id=v_provider;   -- two admins for this block
  perform public.mpesa_ops_alert_sweep(); perform public.mpesa_ops_alert_sweep();
  insert into r select 's15_timed_out_alerts_per_admin', string_agg(cnt::text, ',' order by cnt) from (select user_id, count(*) cnt from public.notifications where type='admin_attempt_timed_out' and dedup_key like v_a::text||'%' group by user_id) x;
  insert into r select 's15_timed_out_recipients', count(distinct user_id)::text from public.notifications where type='admin_attempt_timed_out' and dedup_key like v_a::text||'%';
  update public.profiles set role='provider' where id=v_provider;
  perform pg_temp.claims(v_admin, 'authenticated');
  perform public.reconcile_payment_attempt_no_collection(v_a, 'Portal: no transaction', 'SAF-CASE-15', 'provider_reference');
  update public.payment_attempts set created_at = now() - interval '2 hours' where id=v_a;   -- would be stale if still blocking
  perform pg_temp.claims(null, 'service_role'); perform public.mpesa_ops_alert_sweep();
  insert into r select 's15_stale_alert_after_resolution', count(*)::text from public.notifications where type='admin_attempt_stale' and dedup_key like v_a::text||'%';

  -- ────────────────────────────────────────────────────────────────────────
  -- S10 authorization: customer/anon cannot review or reconcile; RLS keeps attempts private
  perform pg_temp.claims(v_customer, 'authenticated');
  begin perform * from public.admin_mpesa_attempt_review(); insert into r values ('s10_customer_review','ALLOWED');
  exception when others then insert into r values ('s10_customer_review', sqlerrm); end;
  begin perform public.confirm_payment_attempt(v_a, v_amt, 'x', 'Y'); insert into r values ('s10_customer_confirm','ALLOWED');
  exception when others then insert into r values ('s10_customer_confirm', sqlerrm); end;
  begin perform public.reconcile_payment_attempt_no_collection(v_a, 'x', null, 'portal_lookup'); insert into r values ('s10_customer_reconcile','ALLOWED');
  exception when others then insert into r values ('s10_customer_reconcile', sqlerrm); end;
  perform pg_temp.claims(null, 'anon');
  begin perform * from public.admin_mpesa_attempt_review(); insert into r values ('s10_anon_review','ALLOWED');
  exception when others then insert into r values ('s10_anon_review', sqlerrm); end;
end $$;

-- EXECUTE privileges are only meaningful under the real roles (postgres bypasses ACLs).
grant insert on r to anon;
set local role anon;
do $$ begin
  begin perform public.mpesa_ops_alert_sweep(); insert into r values ('s10_anon_sweep','ALLOWED');
  exception when others then insert into r values ('s10_anon_sweep', sqlerrm); end;
  begin perform * from public.admin_mpesa_attempt_review(); insert into r values ('s10_anon_role_review','ALLOWED');
  exception when others then insert into r values ('s10_anon_role_review', sqlerrm); end;
end $$;
reset role;

-- RLS isolation: as the `authenticated` role with a customer sub, only own attempts are visible.
grant insert on r to authenticated;   -- temp results table only; dropped at rollback
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role='customer' order by created_at offset 1 limit 1), 'role','authenticated')::text, true);
insert into r select 's10_rls_other_customer_sees_qa_attempts', count(*)::text from public.payment_attempts where phone like '25470000000%';
reset role;

select json_object_agg(k, v order by k) as results from r;
rollback;
