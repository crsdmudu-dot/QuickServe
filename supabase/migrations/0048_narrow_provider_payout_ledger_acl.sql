-- Narrow public.provider_payout_ledger to SELECT-only for 'authenticated'. ACL REMEDIATION ONLY.
--
-- WHAT WENT WRONG. 0042 created the view and then ran:
--     revoke all on public.provider_payout_ledger from public, anon;
--     grant  select on public.provider_payout_ledger to authenticated;
-- The revoke list names public and anon but NOT authenticated. Supabase's platform-level
-- ALTER DEFAULT PRIVILEGES for role postgres in schema public grants the full relation privilege
-- set to anon, authenticated and service_role on every new relation, so at CREATE time
-- 'authenticated' already held everything. Granting SELECT to a role that already holds
-- INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN is a no-op, so the view shipped with
--     authenticated=arwdDxtm/postgres
-- where the intent was SELECT only. anon was correctly stripped by 0042; authenticated was not.
--
-- 0043 does NOT fix this. Every grant/revoke in 0043 is ON FUNCTION; provider_payout_ledger is
-- not mentioned there at all. So this is a real, unaddressed least-privilege gap, not a
-- temporary pre-0043 state.
--
-- WHY NOT ALTER DEFAULT PRIVILEGES. The platform default is what produced the broad grant, but
-- changing it would alter privileges for every future relation in schema public, well outside the
-- blast radius of this defect and outside this release. This migration is deliberately scoped to
-- ONE relation. Whether the platform default should be narrowed is a separate decision that must
-- be taken on its own evidence, and NOTHING here changes it.
--
-- WHY NOT RECREATE THE VIEW. The view definition and its security_invoker setting were certified
-- by the 0042 production gate. Re-running CREATE OR REPLACE VIEW would re-trigger the same
-- platform default grant and would put a certified definition back in play for no reason. This
-- migration therefore changes privileges only; the view's query, options and owner are untouched.
--
-- SCOPE. No business DML. No function created, replaced or dropped. No view created, replaced or
-- dropped. No table, index, policy, RLS or trigger change. No ALTER DEFAULT PRIVILEGES. The only
-- mutation class is the ACL of public.provider_payout_ledger, guarded by catalog validation.
--
-- ROLES DELIBERATELY NOT TOUCHED. postgres (the owner) and service_role keep exactly what they
-- have: the frozen 0042 security design revokes from public and anon only, and service_role is
-- the platform's trusted server-side role. Narrowing either is a separate decision with its own
-- evidence, and this migration does not take it.

-- ----------------------------------------------------------------
-- 1. Fail-closed precondition. Act on the certified object or not at all.
--    An ACL migration must never "succeed" against the wrong relation, and it must not repair
--    structural drift: if the view is missing, is not a view, or is not security_invoker, this
--    aborts and the whole migration rolls back. Structural drift is a separate investigation.
-- ----------------------------------------------------------------
do $$
begin
  if to_regclass('public.provider_payout_ledger') is null then
    raise exception 'provider_payout_ledger is absent. 0048 is an ACL-only migration and does not create it.';
  end if;

  if not exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'provider_payout_ledger'
       and c.relkind = 'v'
  ) then
    raise exception 'provider_payout_ledger exists but is not a VIEW. Refusing to change its ACL.';
  end if;

  -- security_invoker is part of the 0042-certified design: without it the view would run with the
  -- owner's rights and bypass the underlying RLS policies. Accept any spelling PostgreSQL may
  -- store for the boolean rather than pinning one literal.
  if not exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral unnest(coalesce(c.reloptions, '{}'::text[])) as opt
     where n.nspname = 'public'
       and c.relname = 'provider_payout_ledger'
       and lower(opt) in ('security_invoker=true', 'security_invoker=on',
                          'security_invoker=1',    'security_invoker=yes')
  ) then
    raise exception 'provider_payout_ledger is not security_invoker=true. Refusing to change its ACL.';
  end if;
end $$;

-- ----------------------------------------------------------------
-- 2. Revoke, then grant back exactly one privilege.
--    REVOKE ALL first is what 0042 omitted for authenticated. Revoking anon and PUBLIC again is
--    intentionally idempotent: 0042 already did it, and repeating it makes this migration's end
--    state independent of what 0042 did or did not achieve on any given database.
--    postgres and service_role are NOT named here and are therefore unchanged.
-- ----------------------------------------------------------------
revoke all privileges on public.provider_payout_ledger from authenticated;
revoke all privileges on public.provider_payout_ledger from anon;
revoke all privileges on public.provider_payout_ledger from public;

grant select on public.provider_payout_ledger to authenticated;

-- ----------------------------------------------------------------
-- 3. Fail-closed postcondition, in the same transaction as the change above.
--    aclexplode is used rather than aclitem string matching: the 0042 verification harness tested
--    for the literal 'authenticated=r/' and reported "no SELECT" for an ACL of
--    'authenticated=arwdDxtm/postgres', which contains SELECT. Enumerating privilege_type is
--    exact, and it is version-agnostic: MAINTAIN (PostgreSQL 17+) is caught by "anything other
--    than SELECT" without naming it, so this migration does not depend on the server version.
--    grantee = 0 is PUBLIC, which is not addressable as a role name.
-- ----------------------------------------------------------------
do $$
declare
  v_extra text;
begin
  if not exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) a
      join pg_roles r on r.oid = a.grantee
     where n.nspname = 'public' and c.relname = 'provider_payout_ledger'
       and r.rolname = 'authenticated' and a.privilege_type = 'SELECT'
  ) then
    raise exception 'authenticated does not hold SELECT on provider_payout_ledger after 0048.';
  end if;

  select string_agg(a.privilege_type, ', ' order by a.privilege_type)
    into v_extra
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) a
    join pg_roles r on r.oid = a.grantee
   where n.nspname = 'public' and c.relname = 'provider_payout_ledger'
     and r.rolname = 'authenticated' and a.privilege_type <> 'SELECT';
  if v_extra is not null then
    raise exception 'authenticated still holds non-SELECT privileges on provider_payout_ledger: %', v_extra;
  end if;

  if exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) a
      join pg_roles r on r.oid = a.grantee
     where n.nspname = 'public' and c.relname = 'provider_payout_ledger'
       and r.rolname = 'anon'
  ) then
    raise exception 'anon still holds privileges on provider_payout_ledger after 0048.';
  end if;

  if exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) a
     where n.nspname = 'public' and c.relname = 'provider_payout_ledger'
       and a.grantee = 0
  ) then
    raise exception 'PUBLIC still holds privileges on provider_payout_ledger after 0048.';
  end if;
end $$;
