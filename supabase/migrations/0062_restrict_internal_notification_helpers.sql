-- Least-privilege fix — restrict the internal notification helpers to in-database callers.
--
-- Numbering: drafted as 0055 and later earmarked as 0057; it is 0062 because QA had already
-- applied 0056, 0058, 0059, 0060 and 0061 when this was prepared. A lower number would be an
-- out-of-order migration that the standard push refuses. 0055 and 0057 stay permanently unused.
--
-- public.notify_user, public.notify_admins and public.notify_send_push are INTERNAL
-- helpers. They exist to be called by trigger functions and by other SECURITY DEFINER
-- routines; no client has ever been intended to call them directly.
--
-- They were created without an explicit privilege decision, so they still carry
-- PostgreSQL's default `GRANT EXECUTE TO PUBLIC`. anon and authenticated are members of
-- PUBLIC, and the functions live in the API-exposed `public` schema, so both roles could
-- reach them through PostgREST (/rest/v1/rpc/<name>). All three are SECURITY DEFINER and
-- therefore run with the owner's privileges, bypassing RLS, and none of them performs an
-- authorization check of its own — they are helpers, and their callers do the checking.
--
-- The effect of the missing revoke is that the notification channel itself is writable by
-- an untrusted caller: notification rows can be addressed to any user_id with
-- caller-chosen title/body/route, and the push path can be driven with a caller-supplied
-- payload. That is an integrity and user-trust problem, not a data-disclosure one.
-- (This is the same class of defect fixed for apply_mpesa_callback in 0035: a revoke from
-- anon/authenticated alone is insufficient while the PUBLIC default grant remains.)
--
-- Fix: revoke EXECUTE from PUBLIC, anon and authenticated on each exact signature.
--
-- Why this does not break any legitimate path: a SECURITY DEFINER function executes as its
-- OWNER, so when a trigger function or another definer routine calls these helpers the
-- privilege check is made against that owner, not against the end user. Every function whose
-- current definition calls a helper is in-database and is itself SECURITY DEFINER:
--
--   notify_user      <- notify_admins, tg_notify_booking_created, tg_notify_booking_update,
--                       tg_notify_payment_paid, tg_notify_chat_message, tg_notify_review
--   notify_admins    <- tg_notify_booking_created, tg_notify_booking_update,
--                       tg_notify_payment_failed, tg_notify_provider_pending,
--                       mpesa_ops_alert_sweep, record_mpesa_callback_event
--   notify_send_push <- tg_push_bookings, tg_push_payments, tg_push_booking_messages,
--                       tg_push_notification
--
-- (The guard test keeps this list exact and asserts each caller is SECURITY DEFINER.)
--
-- service_role is neither granted nor revoked here, and it RETAINS EXECUTE: on Supabase it
-- already holds an explicit grant on these functions from the platform's default privileges
-- (observed in the QA ACL on 2026-09-24). That grant is deliberately left in place — service_role
-- is a trusted, server-side-only role — and this migration adds no grant of its own. No
-- service-role caller invokes these helpers DIRECTLY today: the Edge Functions call
-- record_mpesa_callback_event / apply_or_record_mpesa_callback as service_role, and those
-- routines reach notify_admins internally as owner, which the revoke does not affect.
--
-- Signatures are written out in full because PostgreSQL resolves function privileges by
-- signature. A mistyped argument list does not pass silently: if no function has that
-- signature, the REVOKE fails with "function ... does not exist" and the migration aborts. The
-- quieter risk is a list that matches a DIFFERENT existing overload of the same name: the
-- revoke then succeeds on that overload and leaves the intended function exposed. The three
-- signatures below match the live catalogue exactly (read via regprocedure on QA, 2026-09-24),
-- and each helper currently has a single overload; the guard test rejects new overloads.
--
-- Forward-only: migrations 0015 and 0020 are left unchanged. To roll this back, add a new
-- migration restoring only the grants explicitly removed here — never a blanket grant.

revoke execute on function public.notify_user(uuid, uuid, text, text, text, text, text, text) from public;
revoke execute on function public.notify_user(uuid, uuid, text, text, text, text, text, text) from anon;
revoke execute on function public.notify_user(uuid, uuid, text, text, text, text, text, text) from authenticated;

revoke execute on function public.notify_admins(uuid, text, text, text, text, text) from public;
revoke execute on function public.notify_admins(uuid, text, text, text, text, text) from anon;
revoke execute on function public.notify_admins(uuid, text, text, text, text, text) from authenticated;

revoke execute on function public.notify_send_push(jsonb) from public;
revoke execute on function public.notify_send_push(jsonb) from anon;
revoke execute on function public.notify_send_push(jsonb) from authenticated;
