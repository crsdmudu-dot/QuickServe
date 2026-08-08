-- Phase 4D P1 fix — lock public.apply_mpesa_callback to service_role only.
--
-- Migration 0012 ran `revoke execute ... from anon, authenticated`, but the default
-- PUBLIC execute grant on the function was never revoked. anon and authenticated are
-- members of PUBLIC, so they retained EXECUTE and could call apply_mpesa_callback
-- directly via PostgREST (/rest/v1/rpc/apply_mpesa_callback) — bypassing the
-- mpesa-callback Edge Function's shared-secret token gate and settling a payment
-- (pending -> paid) without a genuine Daraja callback and without paying.
--
-- Proof (QA, sandbox): a POST to /rest/v1/rpc/apply_mpesa_callback with only the
-- public anon key and p_result_code=0 moved a pending payment to paid (paid_at set).
--
-- Fix: revoke EXECUTE from PUBLIC (and re-assert anon/authenticated), then grant
-- EXECUTE only to service_role. The mpesa-callback Edge Function authenticates the
-- caller with its own token gate and then invokes this RPC using the SERVICE-ROLE
-- client, so legitimate callbacks continue to work; anon/authenticated direct callers
-- are denied.
--
-- Historical migration 0012 is left unchanged (this is a forward-only fix).

revoke execute on function public.apply_mpesa_callback(text, text, int, text, jsonb) from public;
revoke execute on function public.apply_mpesa_callback(text, text, int, text, jsonb) from anon;
revoke execute on function public.apply_mpesa_callback(text, text, int, text, jsonb) from authenticated;
grant  execute on function public.apply_mpesa_callback(text, text, int, text, jsonb) to service_role;
