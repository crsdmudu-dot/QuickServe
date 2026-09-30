-- Function EXECUTE privileges - M7 (future functions) and lead-PM finding O2 (existing SECURITY DEFINER functions).
--
--   Part A (M7, HIGH)   a NEW function is no longer callable by the public API roles until a migration says so.
--   Part B (O2, MEDIUM) the 49 existing SECURITY DEFINER functions that still carried the automatic grant to
--                       PUBLIC stop being callable by signed-out users (anon). Signed-in users keep every one.
--
-- Numbering: 0064 follows 0063 (H1). Both come after the 0056-0062 set that is still waiting for its Production
-- rollout. 0055 and 0057 stay permanently unused. 0065 onwards belongs to the next stream (F5).
--
-- BACKGROUND: WHO MAY RUN A FUNCTION
-- When a function is created it immediately receives a starting set of privileges, from two sources:
--   * PostgreSQL itself lets PUBLIC execute every new function. PUBLIC means "every role", which includes the
--     two roles the app's API requests run as: anon (signed out) and authenticated (signed in).
--   * The Supabase platform adds its own default for functions that the postgres role creates in schema public:
--     EXECUTE for anon, authenticated and service_role.
-- The postgres role is the one that runs our migrations. So every function a migration created in schema
-- public could be called by anyone through the API (POST /rest/v1/rpc/<name>) from the moment it existed. For a
-- SECURITY DEFINER function, which runs with its owner's rights and skips row-level security, that is a real hole
-- whenever the migration forgets to revoke. This defect class already needed three separate repairs: 0035
-- (apply_mpesa_callback), 0043 (five financial functions) and 0062 (the internal notification helpers).
--
-- ==========================================================================================================
-- PART A (M7) - FUNCTIONS CREATED FROM NOW ON
-- ==========================================================================================================
--   1. Functions the postgres role creates from now on, in ANY schema: PUBLIC no longer gets EXECUTE.
--   2. Functions the postgres role creates from now on in schema public: anon and authenticated no longer get
--      EXECUTE either.
-- Result: a function created by a later migration can be executed only by its owner (postgres) and by
-- service_role (the trusted server-side role, which keeps the platform default, exactly as 0062 left it) until
-- the migration grants more on purpose.
--
-- WHY STATEMENT 1 HAS NO "IN SCHEMA": a per-schema default can only ADD to PostgreSQL's built-in defaults; it can
-- never take one away. PUBLIC's EXECUTE is a built-in default, so revoking it "in schema public" silently does
-- nothing and must be done for the role as a whole. (Proven on a local copy of the database before this file was
-- written: with only the per-schema form, a new function still carried EXECUTE for PUBLIC.)
--
-- NOT CHANGED BY PART A
--   * Existing functions: default privileges apply only when an object is created. (Part B below changes the
--     privileges of a named list of existing functions on purpose; nothing else existing is touched.)
--   * Tables, views and sequences: their platform defaults are how the API reaches them; row-level security is
--     what protects them.
--   * service_role keeps its platform default on new functions.
--   * The supabase_admin role's own platform defaults: only supabase_admin itself (or a superuser) may change
--     them, and migrations run as postgres, which is neither, so trying would make this migration fail. That role
--     belongs to the Supabase platform and does not run our migrations.
--   * Schema storage: the platform gives anon and authenticated the same per-schema default there, but our
--     migrations create no functions in storage. (PUBLIC is covered there too, by statement 1.)
--
-- WHAT THIS MEANS FOR FUTURE MIGRATIONS
--   * A new function that the app must call needs an explicit "grant execute on function ... to authenticated"
--     (and to anon only if signed-out users must call it).
--   * A new helper used inside a row-level security policy needs an explicit grant to the roles that run the
--     policy, or the policy fails with "permission denied for function".
--   * A new trigger function needs nothing: PostgreSQL checks EXECUTE once, when the trigger is created, for the
--     role creating it - not for whoever later fires the trigger.
--   * Project rule (unchanged): still write "revoke all on function ... from public, anon, authenticated" and then
--     the explicit grants. The CI audit src/__tests__/function-execute-privilege-audit.test.ts requires that
--     explicit decision for every SECURITY DEFINER function and does not count on this part.
--   * DROP FUNCTION followed by CREATE FUNCTION makes a NEW function: it starts from these defaults and loses any
--     grant made below. Re-create with CREATE OR REPLACE (same argument types) to keep privileges, or repeat the
--     grants.
--
-- ROLLBACK of Part A (only if ever needed): a new migration that adds back, for role postgres, EXECUTE on
-- functions for PUBLIC (no schema) and for anon and authenticated (schema public). Functions created while this
-- was in force keep the privileges they were created with.

-- A1. PUBLIC: no automatic EXECUTE on functions the postgres role creates from now on (all schemas).
alter default privileges for role postgres revoke execute on functions from public;

-- A2. anon and authenticated: no automatic EXECUTE on functions the postgres role creates from now on in public.
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;

-- A3. Self-check. Create a throwaway function exactly as a future migration would, confirm that neither PUBLIC nor
--     anon nor authenticated can execute it, then drop it. If this database's platform defaults ever differ from
--     what A1 and A2 expect, the migration stops here and changes nothing.
create function public.m7_default_privileges_probe() returns integer language sql as 'select 1';

do $$
declare
  probe constant regprocedure := 'public.m7_default_privileges_probe()'::regprocedure;
begin
  -- grantee 0 in an ACL entry means PUBLIC; a NULL ACL means PostgreSQL's built-in default, which includes PUBLIC.
  if exists (
    select 1
    from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = probe and a.privilege_type = 'EXECUTE' and a.grantee = 0
  ) then
    raise exception '0064 self-check: a newly created function is still executable by PUBLIC';
  end if;
  if has_function_privilege('anon', probe, 'EXECUTE') or has_function_privilege('authenticated', probe, 'EXECUTE') then
    raise exception '0064 self-check: a newly created function is still executable by anon or authenticated';
  end if;
end $$;

drop function public.m7_default_privileges_probe();

-- ==========================================================================================================
-- PART B (O2) - EXISTING SECURITY DEFINER FUNCTIONS THAT STILL HAD THE AUTOMATIC PUBLIC GRANT
-- ==========================================================================================================
--
-- THE PROBLEM
-- These 49 functions were created without any REVOKE, so they still carry PostgreSQL's automatic EXECUTE for
-- PUBLIC (and Supabase's for anon). Anyone holding only the public anon key - no account at all - can call them
-- through /rest/v1/rpc/<name>. Each one checks its caller today (admin-only, or acting only for auth.uid()), so
-- signed-out calls fail or return nothing; but that leaves one missed or mistaken check between the open
-- internet and a function that bypasses row-level security.
--
-- THE FIX
-- For each function: revoke EXECUTE from PUBLIC and anon, and grant it to authenticated explicitly.
--   * Signed-in users (customers, providers, admins) keep exactly what they have: authenticated already holds an
--     explicit grant from the platform default, and the grant below keeps that true even in a database where it
--     had only come through PUBLIC.
--   * service_role keeps its existing platform grant; it is neither granted nor revoked here (as in 0062). The
--     self-check at the end stops the migration if service_role or authenticated would lose access.
--   * Function bodies are not changed. Signatures are written out in full: a mistyped one makes the statement fail
--     ("function ... does not exist") and aborts the migration.
--
-- CALLERS CHECKED: every one of these is called from the signed-in app or the admin web only. The app sends every
-- signed-out user to the welcome screen, and none of the signed-out screens (welcome, sign-in, register, forgot
-- password, role select, auth links) calls an RPC. The Edge Functions call RPCs as service_role, which keeps
-- access.
--
-- DELIBERATELY LEFT CALLABLE BY anon (not in this list): public.is_admin(), public.is_active_user() and
-- public.deletion_path_frozen(text, text). They are used inside row-level security policies, and a policy runs
-- its functions as the querying role - including anon for signed-out reads - so anon must keep EXECUTE. Each one
-- answers only a yes/no question about the caller or a storage path.
--
-- ROLLBACK of Part B (only if ever needed): a new migration that grants EXECUTE on the listed functions back to
-- anon (and, if truly required, to PUBLIC).

-- B1. Admin-only functions. Each one raises an error unless public.is_admin() is true for the caller.
revoke execute on function public.add_internal_note(text, uuid, text) from public, anon;
grant execute on function public.add_internal_note(text, uuid, text) to authenticated;
revoke execute on function public.add_support_case_note(uuid, text, text) from public, anon;
grant execute on function public.add_support_case_note(uuid, text, text) to authenticated;
revoke execute on function public.admin_create_category(text, text, text, text) from public, anon;
grant execute on function public.admin_create_category(text, text, text, text) to authenticated;
revoke execute on function public.admin_create_service(text, text, text, text, uuid, text, text, text, text) from public, anon;
grant execute on function public.admin_create_service(text, text, text, text, uuid, text, text, text, text) to authenticated;
revoke execute on function public.admin_duplicate_service(uuid) from public, anon;
grant execute on function public.admin_duplicate_service(uuid) to authenticated;
revoke execute on function public.admin_reorder_categories(uuid[]) from public, anon;
grant execute on function public.admin_reorder_categories(uuid[]) to authenticated;
revoke execute on function public.admin_reorder_services(uuid, uuid[]) from public, anon;
grant execute on function public.admin_reorder_services(uuid, uuid[]) to authenticated;
revoke execute on function public.admin_set_category_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_category_active(uuid, boolean) to authenticated;
revoke execute on function public.admin_set_service_status(uuid, text) from public, anon;
grant execute on function public.admin_set_service_status(uuid, text) to authenticated;
revoke execute on function public.admin_update_category(uuid, text, text, text) from public, anon;
grant execute on function public.admin_update_category(uuid, text, text, text) to authenticated;
revoke execute on function public.admin_update_service(uuid, text, text, text, uuid, text, text, text, text, boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.admin_update_service(uuid, text, text, text, uuid, text, text, text, text, boolean, boolean, boolean, boolean, boolean) to authenticated;
revoke execute on function public.admin_wallet_adjust(uuid, text, numeric, text) from public, anon;
grant execute on function public.admin_wallet_adjust(uuid, text, numeric, text) to authenticated;
revoke execute on function public.analytics_bookings_summary(timestamp with time zone, timestamp with time zone) from public, anon;
grant execute on function public.analytics_bookings_summary(timestamp with time zone, timestamp with time zone) to authenticated;
revoke execute on function public.analytics_bookings_timeseries(timestamp with time zone, timestamp with time zone, text) from public, anon;
grant execute on function public.analytics_bookings_timeseries(timestamp with time zone, timestamp with time zone, text) to authenticated;
revoke execute on function public.analytics_customers(timestamp with time zone, timestamp with time zone) from public, anon;
grant execute on function public.analytics_customers(timestamp with time zone, timestamp with time zone) to authenticated;
revoke execute on function public.analytics_executive_overview(timestamp with time zone, timestamp with time zone) from public, anon;
grant execute on function public.analytics_executive_overview(timestamp with time zone, timestamp with time zone) to authenticated;
revoke execute on function public.analytics_financial_summary(timestamp with time zone, timestamp with time zone) from public, anon;
grant execute on function public.analytics_financial_summary(timestamp with time zone, timestamp with time zone) to authenticated;
revoke execute on function public.analytics_financial_timeseries(timestamp with time zone, timestamp with time zone, text) from public, anon;
grant execute on function public.analytics_financial_timeseries(timestamp with time zone, timestamp with time zone, text) to authenticated;
revoke execute on function public.analytics_geography(timestamp with time zone, timestamp with time zone) from public, anon;
grant execute on function public.analytics_geography(timestamp with time zone, timestamp with time zone) to authenticated;
revoke execute on function public.analytics_growth_timeseries(timestamp with time zone, timestamp with time zone, text) from public, anon;
grant execute on function public.analytics_growth_timeseries(timestamp with time zone, timestamp with time zone, text) to authenticated;
revoke execute on function public.analytics_kpis(timestamp with time zone, timestamp with time zone) from public, anon;
grant execute on function public.analytics_kpis(timestamp with time zone, timestamp with time zone) to authenticated;
revoke execute on function public.analytics_notification_delivery(timestamp with time zone, timestamp with time zone) from public, anon;
grant execute on function public.analytics_notification_delivery(timestamp with time zone, timestamp with time zone) to authenticated;
revoke execute on function public.analytics_providers(timestamp with time zone, timestamp with time zone, integer) from public, anon;
grant execute on function public.analytics_providers(timestamp with time zone, timestamp with time zone, integer) to authenticated;
revoke execute on function public.analytics_service_categories(timestamp with time zone, timestamp with time zone) from public, anon;
grant execute on function public.analytics_service_categories(timestamp with time zone, timestamp with time zone) to authenticated;
revoke execute on function public.analytics_services(timestamp with time zone, timestamp with time zone) from public, anon;
grant execute on function public.analytics_services(timestamp with time zone, timestamp with time zone) to authenticated;
revoke execute on function public.assign_support_case(uuid, uuid) from public, anon;
grant execute on function public.assign_support_case(uuid, uuid) to authenticated;
revoke execute on function public.broadcast_announcement(text, text, text, text, text) from public, anon;
grant execute on function public.broadcast_announcement(text, text, text, text, text) to authenticated;
revoke execute on function public.create_support_case(text, text, text, text, uuid, uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.create_support_case(text, text, text, text, uuid, uuid, uuid, uuid, uuid, text) to authenticated;
revoke execute on function public.flag_account(uuid, text, text, text) from public, anon;
grant execute on function public.flag_account(uuid, text, text, text) to authenticated;
revoke execute on function public.lift_account_flag(uuid) from public, anon;
grant execute on function public.lift_account_flag(uuid) to authenticated;
revoke execute on function public.record_provider_quality_action(uuid, text, text, boolean) from public, anon;
grant execute on function public.record_provider_quality_action(uuid, text, text, boolean) to authenticated;
revoke execute on function public.set_dispute_outcome(uuid, text, text) from public, anon;
grant execute on function public.set_dispute_outcome(uuid, text, text) to authenticated;
revoke execute on function public.set_quote(uuid, numeric, numeric) from public, anon;
grant execute on function public.set_quote(uuid, numeric, numeric) to authenticated;
revoke execute on function public.update_support_case_priority(uuid, text) from public, anon;
grant execute on function public.update_support_case_priority(uuid, text) to authenticated;
revoke execute on function public.update_support_case_status(uuid, text) from public, anon;
grant execute on function public.update_support_case_status(uuid, text) to authenticated;

-- B2. Functions that act only for the signed-in caller (auth.uid()): their own booking or quote, saved addresses,
--    review, favourites or chat; the assigned provider for location; admins as well where the body says so.
--    get_booking_professional and get_chat_peer_name already return data only to a booking participant.
--    edit_review: only its privileges change here; its body is left alone (a later migration re-creates it).
revoke execute on function public.accept_provider_conduct(text) from public, anon;
grant execute on function public.accept_provider_conduct(text) to authenticated;
revoke execute on function public.accept_quote(uuid) from public, anon;
grant execute on function public.accept_quote(uuid) to authenticated;
revoke execute on function public.clear_provider_location(uuid) from public, anon;
grant execute on function public.clear_provider_location(uuid) to authenticated;
revoke execute on function public.decline_quote(uuid) from public, anon;
grant execute on function public.decline_quote(uuid) to authenticated;
revoke execute on function public.edit_review(uuid, text, integer, integer, integer, integer, integer, integer, boolean, text[]) from public, anon;
grant execute on function public.edit_review(uuid, text, integer, integer, integer, integer, integer, integer, boolean, text[]) to authenticated;
revoke execute on function public.emit_notification(uuid, text, text, text, text, text, text, jsonb, text) from public, anon;
grant execute on function public.emit_notification(uuid, text, text, text, text, text, text, jsonb, text) to authenticated;
revoke execute on function public.get_booking_professional(uuid) from public, anon;
grant execute on function public.get_booking_professional(uuid) to authenticated;
revoke execute on function public.get_chat_peer_name(uuid) from public, anon;
grant execute on function public.get_chat_peer_name(uuid) to authenticated;
revoke execute on function public.get_my_favorite_providers() from public, anon;
grant execute on function public.get_my_favorite_providers() to authenticated;
revoke execute on function public.set_default_address(uuid) from public, anon;
grant execute on function public.set_default_address(uuid) to authenticated;
revoke execute on function public.touch_saved_address(uuid) from public, anon;
grant execute on function public.touch_saved_address(uuid) to authenticated;
revoke execute on function public.upsert_provider_location(uuid, double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.upsert_provider_location(uuid, double precision, double precision, double precision, double precision) to authenticated;

-- B3. Curated read-only projections, shown only inside the signed-in app: list_public_providers feeds the Browse
--    providers screen and get_provider_rating_breakdown feeds provider and admin rating views. The app sends
--    every signed-out user to the welcome screen (src/auth/root-redirect.ts), so no signed-out screen calls them.
revoke execute on function public.get_provider_rating_breakdown(uuid) from public, anon;
grant execute on function public.get_provider_rating_breakdown(uuid) to authenticated;
revoke execute on function public.list_public_providers() from public, anon;
grant execute on function public.list_public_providers() to authenticated;

-- B4. Self-check: every function above must now be callable by authenticated and service_role, and by neither
--     PUBLIC nor anon. Otherwise the migration stops and changes nothing.
do $$
declare
  fns constant text[] := array[
    'public.add_internal_note(text, uuid, text)',
    'public.add_support_case_note(uuid, text, text)',
    'public.admin_create_category(text, text, text, text)',
    'public.admin_create_service(text, text, text, text, uuid, text, text, text, text)',
    'public.admin_duplicate_service(uuid)',
    'public.admin_reorder_categories(uuid[])',
    'public.admin_reorder_services(uuid, uuid[])',
    'public.admin_set_category_active(uuid, boolean)',
    'public.admin_set_service_status(uuid, text)',
    'public.admin_update_category(uuid, text, text, text)',
    'public.admin_update_service(uuid, text, text, text, uuid, text, text, text, text, boolean, boolean, boolean, boolean, boolean)',
    'public.admin_wallet_adjust(uuid, text, numeric, text)',
    'public.analytics_bookings_summary(timestamp with time zone, timestamp with time zone)',
    'public.analytics_bookings_timeseries(timestamp with time zone, timestamp with time zone, text)',
    'public.analytics_customers(timestamp with time zone, timestamp with time zone)',
    'public.analytics_executive_overview(timestamp with time zone, timestamp with time zone)',
    'public.analytics_financial_summary(timestamp with time zone, timestamp with time zone)',
    'public.analytics_financial_timeseries(timestamp with time zone, timestamp with time zone, text)',
    'public.analytics_geography(timestamp with time zone, timestamp with time zone)',
    'public.analytics_growth_timeseries(timestamp with time zone, timestamp with time zone, text)',
    'public.analytics_kpis(timestamp with time zone, timestamp with time zone)',
    'public.analytics_notification_delivery(timestamp with time zone, timestamp with time zone)',
    'public.analytics_providers(timestamp with time zone, timestamp with time zone, integer)',
    'public.analytics_service_categories(timestamp with time zone, timestamp with time zone)',
    'public.analytics_services(timestamp with time zone, timestamp with time zone)',
    'public.assign_support_case(uuid, uuid)',
    'public.broadcast_announcement(text, text, text, text, text)',
    'public.create_support_case(text, text, text, text, uuid, uuid, uuid, uuid, uuid, text)',
    'public.flag_account(uuid, text, text, text)',
    'public.lift_account_flag(uuid)',
    'public.record_provider_quality_action(uuid, text, text, boolean)',
    'public.set_dispute_outcome(uuid, text, text)',
    'public.set_quote(uuid, numeric, numeric)',
    'public.update_support_case_priority(uuid, text)',
    'public.update_support_case_status(uuid, text)',
    'public.accept_provider_conduct(text)',
    'public.accept_quote(uuid)',
    'public.clear_provider_location(uuid)',
    'public.decline_quote(uuid)',
    'public.edit_review(uuid, text, integer, integer, integer, integer, integer, integer, boolean, text[])',
    'public.emit_notification(uuid, text, text, text, text, text, text, jsonb, text)',
    'public.get_booking_professional(uuid)',
    'public.get_chat_peer_name(uuid)',
    'public.get_my_favorite_providers()',
    'public.set_default_address(uuid)',
    'public.touch_saved_address(uuid)',
    'public.upsert_provider_location(uuid, double precision, double precision, double precision, double precision)',
    'public.get_provider_rating_breakdown(uuid)',
    'public.list_public_providers()'
  ];
  fn text;
  f regprocedure;
begin
  foreach fn in array fns loop
    f := fn::regprocedure;
    if exists (
      select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = f and a.privilege_type = 'EXECUTE' and a.grantee = 0
    ) then
      raise exception '0064 self-check: % is still executable by PUBLIC', fn;
    end if;
    if has_function_privilege('anon', f, 'EXECUTE') then
      raise exception '0064 self-check: % is still executable by anon', fn;
    end if;
    if not has_function_privilege('authenticated', f, 'EXECUTE') or not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception '0064 self-check: % is no longer executable by authenticated or service_role', fn;
    end if;
  end loop;
end $$;
