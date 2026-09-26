/**
 * function-execute-privilege-audit.test.ts
 *
 * CI privilege audit (M7) plus the regression guard for migration 0064 (M7 default privileges and lead-PM finding
 * O2). No database is contacted: test/function-privileges.ts replays every migration and computes, for each
 * function SIGNATURE, which roles hold EXECUTE.
 *
 * THE RULE. A SECURITY DEFINER function runs with its owner's rights and skips row-level security. If PUBLIC, anon or
 * authenticated can execute it, anyone with the matching API key can call it through /rest/v1/rpc/<name>. So:
 *   1. every SECURITY DEFINER function that PUBLIC, anon or authenticated can execute must be on ALLOWLIST below,
 *      with the kind of caller check its body performs and a one-line reason (a reviewed security decision);
 *   2. only row-level-security helpers may be executable by PUBLIC or anon;
 *   3. the allowlist has no stale entries, and each entry's kind matches its body (light text checks).
 * Trigger functions are exempt: PostgreSQL refuses to call them directly ("trigger functions can only be called
 * as triggers"). SECURITY INVOKER functions are out of scope: they run with the caller's rights and RLS applies.
 *
 * CONSERVATIVE BY DESIGN. The model starts every new function with the platform's creation-time grants (PUBLIC,
 * anon, authenticated, service_role in schema public) and does NOT credit ALTER DEFAULT PRIVILEGES - not even 0064.
 * A new function therefore passes only with an explicit REVOKE in its migration (or an allowlist entry), which is
 * the project rule. 0064 is the database-side safety net; this test is the independent CI check.
 * The model was cross-checked against a real database built from these migrations: all 133 functions matched.
 */
import * as fs from 'fs';
import * as path from 'path';
import { normalizeSql, splitSqlStatements } from '../../test/sql-text.ts';
import {
  buildFunctionModel,
  inputArgTypes,
  isClientExecutable,
  isTriggerFunction,
  normalizeType,
  type FunctionModel,
  type FunctionState,
  type Migration,
} from '../../test/function-privileges.ts';

const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');
const M7 = '0064_restrict_function_execute_privileges.sql';

type Kind = 'admin' | 'caller' | 'admin-or-caller' | 'signed-in-read' | 'rls-helper';

/**
 * Every SECURITY DEFINER function that a client role may execute, with the check that makes that safe.
 *   admin           - raises unless public.is_admin()
 *   caller          - acts only on rows of the signed-in caller (auth.uid())
 *   admin-or-caller - admin, or the caller's own / participating row
 *   signed-in-read  - curated read-only projection for any signed-in user
 *   rls-helper      - called inside RLS policies as the querying role, so anon must keep EXECUTE
 * Adding an entry is a security decision: review the function's caller check first.
 * ALLOWLIST_0064 is the reviewed set as of 0064; later migrations add their entries to their own
 * section below, so the 0064 checks (O2_SWEPT) stay pinned to what 0064 actually changed.
 */
const ALLOWLIST_0064: Record<string, { kind: Kind; why: string }> = {
  'public.accept_provider_conduct(text)': { kind: 'caller', why: "records the caller's own acceptance (auth.uid())" },
  'public.accept_quote(uuid)': { kind: 'caller', why: "only the booking's customer, only a quote in state 'sent'" },
  'public.add_internal_note(text,uuid,text)': { kind: 'admin', why: 'admin notes' },
  'public.add_support_case_note(uuid,text,text)': { kind: 'admin', why: 'support desk' },
  'public.admin_create_category(text,text,text,text)': { kind: 'admin', why: 'catalogue management' },
  'public.admin_create_service(text,text,text,text,uuid,text,text,text,text)': { kind: 'admin', why: 'catalogue management' },
  'public.admin_duplicate_service(uuid)': { kind: 'admin', why: 'catalogue management' },
  'public.admin_mpesa_attempt_review()': { kind: 'admin', why: 'M-PESA operations review' },
  'public.admin_mpesa_callback_events()': { kind: 'admin', why: 'M-PESA operations review' },
  'public.admin_reorder_categories(uuid[])': { kind: 'admin', why: 'catalogue management' },
  'public.admin_reorder_services(uuid,uuid[])': { kind: 'admin', why: 'catalogue management' },
  'public.admin_set_category_active(uuid,boolean)': { kind: 'admin', why: 'catalogue management' },
  'public.admin_set_service_status(uuid,text)': { kind: 'admin', why: 'catalogue management' },
  'public.admin_update_category(uuid,text,text,text)': { kind: 'admin', why: 'catalogue management' },
  'public.admin_update_service(uuid,text,text,text,uuid,text,text,text,text,boolean,boolean,boolean,boolean,boolean)': { kind: 'admin', why: 'catalogue management' },
  'public.admin_wallet_adjust(uuid,text,numeric,text)': { kind: 'admin', why: 'wallet adjustments' },
  'public.analytics_bookings_summary(timestamp with time zone,timestamp with time zone)': { kind: 'admin', why: 'admin analytics' },
  'public.analytics_bookings_timeseries(timestamp with time zone,timestamp with time zone,text)': { kind: 'admin', why: 'admin analytics' },
  'public.analytics_customers(timestamp with time zone,timestamp with time zone)': { kind: 'admin', why: 'admin analytics' },
  'public.analytics_executive_overview(timestamp with time zone,timestamp with time zone)': { kind: 'admin', why: 'admin analytics' },
  'public.analytics_financial_summary(timestamp with time zone,timestamp with time zone)': { kind: 'admin', why: 'admin analytics' },
  'public.analytics_financial_timeseries(timestamp with time zone,timestamp with time zone,text)': { kind: 'admin', why: 'admin analytics' },
  'public.analytics_geography(timestamp with time zone,timestamp with time zone)': { kind: 'admin', why: 'admin analytics' },
  'public.analytics_growth_timeseries(timestamp with time zone,timestamp with time zone,text)': { kind: 'admin', why: 'admin analytics' },
  'public.analytics_kpis(timestamp with time zone,timestamp with time zone)': { kind: 'admin', why: 'admin analytics' },
  'public.analytics_notification_delivery(timestamp with time zone,timestamp with time zone)': { kind: 'admin', why: 'admin analytics' },
  'public.analytics_providers(timestamp with time zone,timestamp with time zone,integer)': { kind: 'admin', why: 'admin analytics' },
  'public.analytics_service_categories(timestamp with time zone,timestamp with time zone)': { kind: 'admin', why: 'admin analytics' },
  'public.analytics_services(timestamp with time zone,timestamp with time zone)': { kind: 'admin', why: 'admin analytics' },
  'public.apply_wallet_to_payment(uuid,numeric)': { kind: 'caller', why: "only the caller's own pending payment" },
  'public.assign_support_case(uuid,uuid)': { kind: 'admin', why: 'support desk' },
  'public.broadcast_announcement(text,text,text,text,text)': { kind: 'admin', why: 'admin announcements' },
  'public.clear_provider_location(uuid)': { kind: 'admin-or-caller', why: 'the assigned provider, or an admin' },
  'public.confirm_payment_attempt(uuid,numeric,text,text)': { kind: 'admin', why: 'manual payment confirmation' },
  'public.create_support_case(text,text,text,text,uuid,uuid,uuid,uuid,uuid,text)': { kind: 'admin', why: 'support desk' },
  'public.decline_quote(uuid)': { kind: 'caller', why: "only the booking's customer, only a quote in state 'sent'" },
  'public.deletion_path_frozen(text,text)': { kind: 'rls-helper', why: 'storage.objects policies (0059); yes/no about a storage path' },
  'public.edit_review(uuid,text,integer,integer,integer,integer,integer,integer,boolean,text[])': { kind: 'caller', why: "the caller's own review, inside the edit window" },
  'public.emit_notification(uuid,text,text,text,text,text,text,jsonb,text)': { kind: 'admin-or-caller', why: 'an admin, or a notification to the caller themself' },
  'public.flag_account(uuid,text,text,text)': { kind: 'admin', why: 'account flags' },
  'public.get_booking_professional(uuid)': { kind: 'admin-or-caller', why: "the booking's customer, or an admin" },
  'public.get_chat_peer_name(uuid)': { kind: 'caller', why: 'booking participants only (customer or assigned provider)' },
  'public.get_my_favorite_providers()': { kind: 'caller', why: "the caller's own favourites" },
  'public.get_provider_rating_breakdown(uuid)': { kind: 'signed-in-read', why: 'rating aggregates of non-hidden reviews; no text, no reviewer' },
  'public.initiate_payment_attempt(uuid,text,text,text,jsonb)': { kind: 'admin-or-caller', why: 'the payment owner, or an admin' },
  'public.is_active_user()': { kind: 'rls-helper', why: 'restrictive *_deny_deleted_identity policies (0056); yes/no about the caller' },
  'public.is_admin()': { kind: 'rls-helper', why: 'admin policies since 0003; yes/no about the caller' },
  'public.lift_account_flag(uuid)': { kind: 'admin', why: 'account flags' },
  'public.list_public_providers()': { kind: 'signed-in-read', why: 'approved-provider directory; curated columns, no phone/email/address' },
  'public.override_payment_status(uuid,text)': { kind: 'admin', why: 'payment operations' },
  'public.place_legal_hold(uuid,uuid,text)': { kind: 'admin', why: 'legal holds' },
  'public.reconcile_payment_attempt_no_collection(uuid,text,text,text)': { kind: 'admin', why: 'payment operations' },
  'public.record_provider_deduction(uuid,numeric,text,text)': { kind: 'admin', why: 'payout ledger' },
  'public.record_provider_payout(uuid,numeric,text,text,text,uuid,timestamp with time zone)': { kind: 'admin', why: 'payout ledger' },
  'public.record_provider_quality_action(uuid,text,text,boolean)': { kind: 'admin', why: 'provider quality' },
  'public.redeem_promo(uuid,text)': { kind: 'caller', why: "only the caller's own pending payment" },
  'public.release_legal_hold(uuid,text)': { kind: 'admin', why: 'legal holds' },
  'public.reserve_mpesa_attempt(uuid,text)': { kind: 'admin-or-caller', why: 'the payment owner or an admin; service_role backend path has no uid' },
  'public.reverse_provider_deduction(uuid,text)': { kind: 'admin', why: 'payout ledger' },
  'public.review_attempt_discrepancy(uuid,text)': { kind: 'admin', why: 'M-PESA operations review' },
  'public.review_mpesa_callback_event(uuid,text)': { kind: 'admin', why: 'M-PESA operations review' },
  'public.set_default_address(uuid)': { kind: 'caller', why: "the caller's own saved address" },
  'public.set_dispute_outcome(uuid,text,text)': { kind: 'admin', why: 'support desk' },
  'public.set_quote(uuid,numeric,numeric)': { kind: 'admin', why: 'quote authority (0049)' },
  'public.touch_saved_address(uuid)': { kind: 'caller', why: "the caller's own saved address" },
  'public.update_support_case_priority(uuid,text)': { kind: 'admin', why: 'support desk' },
  'public.update_support_case_status(uuid,text)': { kind: 'admin', why: 'support desk' },
  'public.upsert_provider_location(uuid,double precision,double precision,double precision,double precision)': { kind: 'caller', why: 'the assigned provider of an active booking' },
};

/**
 * Store-compliance F5 (user-content safeguards), reviewed with each migration. Admin entries check
 * public.is_active_admin() (approved and not deleted), which is stricter than is_admin().
 */
const ALLOWLIST_F5: Record<string, { kind: Kind; why: string }> = {
  // 0065: reports and moderation
  'public.is_active_admin()': { kind: 'rls-helper', why: 'F5 admin-only policies; yes/no about the caller (never granted to anon)' },
  'public.report_content(text,uuid,text)': { kind: 'caller', why: 'reports as the caller; the reported user is derived server-side; active users only' },
  'public.admin_get_content_reports(text)': { kind: 'admin', why: 'moderation queue' },
  'public.admin_resolve_content_report(uuid,text,text)': { kind: 'admin', why: 'moderation queue' },
  'public.admin_set_message_hidden(uuid,boolean,uuid,text)': { kind: 'admin', why: 'moderation: hide a chat message' },
  'public.admin_set_review_hidden(uuid,boolean,uuid,text)': { kind: 'admin', why: 'moderation: hide a review' },
  'public.admin_clear_profile_text(uuid,uuid,text)': { kind: 'admin', why: "moderation: clear a provider's bio and skills" },
  // 0066: blocks
  'public.block_user(uuid)': { kind: 'caller', why: 'the caller blocks a counterpart or an approved provider; active users only' },
  'public.unblock_user(uuid)': { kind: 'caller', why: "removes only the caller's own block" },
  'public.get_my_blocked_users()': { kind: 'caller', why: "the caller's own block list" },
  'public.booking_chat_blocked(uuid)': { kind: 'admin-or-caller', why: "yes/no for the booking's participants or an admin; also used by the chat insert policy" },
  'public.admin_blocked_provider_ids(uuid)': { kind: 'admin', why: 'dispatch warning on the admin assign screen' },
  // 0068: Terms acceptance
  'public.accept_terms(text,text)': { kind: 'caller', why: "records the caller's own acceptance of the current Terms version only; active users only" },
  'public.has_accepted_current_terms()': { kind: 'rls-helper', why: 'restrictive chat/review insert policies and the bio trigger; yes/no about the caller (never granted to anon)' },
};

const ALLOWLIST: Record<string, { kind: Kind; why: string }> = { ...ALLOWLIST_0064, ...ALLOWLIST_F5 };

/** The 49 functions 0064 Part B takes away from PUBLIC and anon (O2). */
const O2_SWEPT = Object.keys(ALLOWLIST_0064).filter(
  (k) =>
    ALLOWLIST_0064[k].kind !== 'rls-helper' &&
    ![
      'public.admin_mpesa_attempt_review()',
      'public.admin_mpesa_callback_events()',
      'public.apply_wallet_to_payment(uuid,numeric)',
      'public.confirm_payment_attempt(uuid,numeric,text,text)',
      'public.initiate_payment_attempt(uuid,text,text,text,jsonb)',
      'public.override_payment_status(uuid,text)',
      'public.place_legal_hold(uuid,uuid,text)',
      'public.reconcile_payment_attempt_no_collection(uuid,text,text,text)',
      'public.record_provider_deduction(uuid,numeric,text,text)',
      'public.record_provider_payout(uuid,numeric,text,text,text,uuid,timestamp with time zone)',
      'public.redeem_promo(uuid,text)',
      'public.release_legal_hold(uuid,text)',
      'public.reserve_mpesa_attempt(uuid,text)',
      'public.reverse_provider_deduction(uuid,text)',
      'public.review_attempt_discrepancy(uuid,text)',
      'public.review_mpesa_callback_event(uuid,text)',
    ].includes(k),
);

const readMigrations = (): Migration[] =>
  fs
    .readdirSync(MIGRATIONS)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
    .map((file) => ({ file, sql: fs.readFileSync(path.join(MIGRATIONS, file), 'utf-8') }));

const anonOrPublic = (f: FunctionState) => f.execute.has('public') || f.execute.has('anon');

/** Names of functions called inside any CREATE POLICY (including policies built inside DO blocks). */
function policyFunctionText(migrations: Migration[]): string {
  return migrations
    .flatMap((m) => splitSqlStatements(m.sql).map(normalizeSql))
    .filter((s) => s.includes('create policy'))
    .join('\n');
}

/** Everything the audit rule says, as a list of violations (empty = pass). */
export function auditViolations(model: FunctionModel, allowlist: typeof ALLOWLIST, policyText: string): string[] {
  const out: string[] = model.unsupported.map((u) => `unsupported: ${u}`);
  for (const f of model.functions.values()) {
    if (!f.securityDefiner || isTriggerFunction(f) || !isClientExecutable(f)) continue;
    const entry = allowlist[f.key];
    if (!entry) {
      out.push(`not allowlisted: ${f.key} (${f.definedIn}) is SECURITY DEFINER and executable by ${[...f.execute].filter((r) => ['public', 'anon', 'authenticated'].includes(r)).sort().join(', ')}`);
      continue;
    }
    if (anonOrPublic(f) && entry.kind !== 'rls-helper') out.push(`anon/PUBLIC can execute ${f.key}, which is not an RLS helper`);
    const body = f.definition;
    // is_active_admin() (F5) is is_admin() plus "approved and not deleted", so it satisfies an admin check.
    if ((entry.kind === 'admin' || entry.kind === 'admin-or-caller') && !/\bis_(active_)?admin\s*\(/.test(body)) out.push(`${f.key}: kind ${entry.kind} but no is_admin() call`);
    if ((entry.kind === 'caller' || entry.kind === 'admin-or-caller') && !/\bauth\.uid\(\)/.test(body)) out.push(`${f.key}: kind ${entry.kind} but no auth.uid() check`);
    if (entry.kind === 'rls-helper' && !new RegExp(`\\b${f.name}\\(`).test(policyText)) out.push(`${f.key}: kind rls-helper but no policy calls it`);
    if (entry.kind === 'signed-in-read' && /\b(insert\s+into|update\s+[a-z_.]+\s+set|delete\s+from)\b/.test(body)) out.push(`${f.key}: kind signed-in-read but it writes`);
    if (!entry.why.trim()) out.push(`${f.key}: allowlist entry has no reason`);
  }
  for (const key of Object.keys(allowlist)) {
    const f = model.functions.get(key);
    if (!f || !f.securityDefiner || isTriggerFunction(f) || !isClientExecutable(f)) out.push(`stale allowlist entry: ${key}`);
  }
  return out;
}

describe('function EXECUTE privilege audit (M7) and 0064', () => {
  let migrations: Migration[];
  let model: FunctionModel;
  let policyText: string;

  beforeAll(() => {
    migrations = readMigrations();
    model = buildFunctionModel(migrations);
    policyText = policyFunctionText(migrations);
  });

  describe('model sanity', () => {
    it('replays every migration without an unsupported construct and finds the full inventory', () => {
      expect(model.unsupported).toEqual([]);
      expect(model.functions.size).toBeGreaterThan(120);
    });

    it('agrees with the known history: 0035, 0062 and a trigger function', () => {
      const f = (k: string) => model.functions.get(k) as FunctionState;
      expect([...f('public.apply_mpesa_callback(text,text,integer,text,jsonb)').execute].sort()).toEqual(['postgres', 'service_role']);
      expect(isClientExecutable(f('public.notify_user(uuid,uuid,text,text,text,text,text,text)'))).toBe(false);
      expect(isClientExecutable(f('public.notify_send_push(jsonb)'))).toBe(false);
      expect(isTriggerFunction(f('public.tg_notify_booking_created()'))).toBe(true);
      expect(f('public.set_quote(uuid,numeric,numeric)').securityDefiner).toBe(true);
    });
  });

  describe('the audit rule', () => {
    it('every client-executable SECURITY DEFINER function is allowlisted with a matching kind; only RLS helpers are open to anon', () => {
      expect(auditViolations(model, ALLOWLIST, policyText)).toEqual([]);
    });

    it('the allowlist holds 68 reviewed entries as of 0064 plus the F5 entries, and exactly three may be called by anon', () => {
      expect(Object.keys(ALLOWLIST_0064)).toHaveLength(68);
      expect(Object.keys(ALLOWLIST_F5)).toHaveLength(14);
      expect(Object.keys(ALLOWLIST)).toHaveLength(68 + 14);
      const anon = [...model.functions.values()].filter((f) => f.securityDefiner && !isTriggerFunction(f) && anonOrPublic(f)).map((f) => f.key);
      expect(anon.sort()).toEqual(['public.deletion_path_frozen(text,text)', 'public.is_active_user()', 'public.is_admin()']);
    });
  });

  describe('0064 Part A (M7): default privileges for future functions', () => {
    let statements: string[];
    beforeAll(() => {
      statements = splitSqlStatements(fs.readFileSync(path.join(MIGRATIONS, M7), 'utf-8')).map(normalizeSql);
    });

    it('revokes PUBLIC globally (no IN SCHEMA: a per-schema revoke cannot remove a built-in default)', () => {
      expect(statements).toContain('alter default privileges for role postgres revoke execute on functions from public');
    });

    it('revokes anon and authenticated in schema public', () => {
      expect(statements).toContain('alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated');
    });

    it('has exactly those two default-privilege statements, none for supabase_admin, and grants no default', () => {
      const adp = statements.filter((s) => s.startsWith('alter default privileges'));
      expect(adp).toHaveLength(2);
      expect(adp.join(' ')).not.toMatch(/supabase_admin|\bgrant\b/);
    });

    it('proves itself with a throwaway probe function that is created, checked and dropped', () => {
      expect(statements).toContain("create function public.m7_default_privileges_probe() returns integer language sql as 'select 1'");
      expect(statements).toContain('drop function public.m7_default_privileges_probe()');
      expect(model.functions.has('public.m7_default_privileges_probe()')).toBe(false);
    });

    it('no migration grants a default EXECUTE on functions to PUBLIC, anon or authenticated', () => {
      for (const s of model.defaultPrivilegeStatements) {
        expect({ file: s.file, grantsClients: /\bgrant\b[^;]*\bon (functions|routines)\b[^;]*\bto\b[^;]*\b(public|anon|authenticated)\b/.test(s.statement) }).toEqual({
          file: s.file,
          grantsClients: false,
        });
      }
      // No migration before 0064 touched default privileges, so 0064 is where the M7 state begins.
      expect(model.defaultPrivilegeStatements.filter((s) => s.file < M7)).toEqual([]);
    });
  });

  describe('0064 Part B (O2): existing SECURITY DEFINER functions lose PUBLIC and anon', () => {
    // Measured on the state right after 0064, so a later migration that legitimately re-creates one of these
    // functions does not break this record of what 0064 did (the audit rule above still covers the latest state).
    let before: FunctionModel;
    let through: FunctionModel;
    beforeAll(() => {
      before = buildFunctionModel(migrations.filter((m) => m.file < M7));
      through = buildFunctionModel(migrations.filter((m) => m.file <= M7));
    });

    it('covers 49 functions, each still executable by authenticated and service_role, by neither PUBLIC nor anon', () => {
      expect(O2_SWEPT).toHaveLength(49);
      for (const key of O2_SWEPT) {
        const f = through.functions.get(key) as FunctionState;
        expect({ key, anonOrPublic: anonOrPublic(f), authenticated: f.execute.has('authenticated'), service: f.execute.has('service_role') }).toEqual({
          key,
          anonOrPublic: false,
          authenticated: true,
          service: true,
        });
      }
    });

    it('includes the functions named in the finding', () => {
      for (const k of [
        'public.edit_review(uuid,text,integer,integer,integer,integer,integer,integer,boolean,text[])',
        'public.list_public_providers()',
        'public.get_provider_rating_breakdown(uuid)',
        'public.get_booking_professional(uuid)',
        'public.get_chat_peer_name(uuid)',
      ]) {
        expect(O2_SWEPT).toContain(k);
      }
    });

    it('0064 changes EXECUTE for exactly those 49 functions, removing only PUBLIC and anon (every other ACL unchanged)', () => {
      const changed: string[] = [];
      for (const [key, f] of through.functions) {
        const b = before.functions.get(key);
        expect(b).toBeDefined();
        const removed = [...(b as FunctionState).execute].filter((r) => !f.execute.has(r)).sort();
        const added = [...f.execute].filter((r) => !(b as FunctionState).execute.has(r));
        expect({ key, added }).toEqual({ key, added: [] });
        if (removed.length) {
          expect({ key, removed }).toEqual({ key, removed: ['anon', 'public'] });
          changed.push(key);
        }
      }
      expect(changed.sort()).toEqual([...O2_SWEPT].sort());
      expect(before.functions.size).toBe(through.functions.size);
    });

    it('does not change any function body (no CREATE, DROP or ALTER FUNCTION except the probe)', () => {
      const text = splitSqlStatements(fs.readFileSync(path.join(MIGRATIONS, M7), 'utf-8')).map(normalizeSql);
      const ddl = text.filter((s) => /^(create|drop|alter) (or replace )?(function|procedure)/.test(s));
      expect(ddl).toEqual([
        "create function public.m7_default_privileges_probe() returns integer language sql as 'select 1'",
        'drop function public.m7_default_privileges_probe()',
      ]);
    });
  });

  describe('negative controls (the audit can fail)', () => {
    const withLater = (sql: string) => buildFunctionModel([...migrations, { file: '0999_control.sql', sql }]);
    const planted = 'create function public.planted_definer() returns void language sql security definer set search_path = public as $$ select 1 $$;';

    it('a planted SECURITY DEFINER function without revokes fails the audit, even after 0064', () => {
      expect(auditViolations(withLater(planted), ALLOWLIST, policyText)).toEqual([
        'not allowlisted: public.planted_definer() (0999_control.sql) is SECURITY DEFINER and executable by anon, authenticated, public',
      ]);
    });

    it('revoking only anon and authenticated (the 0035 defect) still fails: PUBLIC remains', () => {
      const v = auditViolations(withLater(`${planted}\nrevoke execute on function public.planted_definer() from anon, authenticated;`), ALLOWLIST, policyText);
      expect(v).toEqual(['not allowlisted: public.planted_definer() (0999_control.sql) is SECURITY DEFINER and executable by public']);
    });

    it('the full revoke passes; a deliberate grant to authenticated fails until allowlisted', () => {
      const revoked = `${planted}\nrevoke all on function public.planted_definer() from public, anon, authenticated;`;
      expect(auditViolations(withLater(revoked), ALLOWLIST, policyText)).toEqual([]);
      const granted = `${revoked}\ngrant execute on function public.planted_definer() to authenticated;`;
      expect(auditViolations(withLater(granted), ALLOWLIST, policyText)).toHaveLength(1);
      const listed = { ...ALLOWLIST, 'public.planted_definer()': { kind: 'signed-in-read' as Kind, why: 'control' } };
      expect(auditViolations(withLater(granted), listed, policyText)).toEqual([]);
    });

    it('dropping and re-creating a revoked helper without a new revoke fails (the drop resets its grants)', () => {
      const def = model.functions.get('public.notify_send_push(jsonb)') as FunctionState;
      expect(def).toBeDefined();
      const v = auditViolations(
        withLater(
          'drop function public.notify_send_push(jsonb);\n' +
            'create function public.notify_send_push(p_payload jsonb) returns void language plpgsql security definer set search_path = public as $$ begin null; end $$;',
        ),
        ALLOWLIST,
        policyText,
      );
      expect(v).toEqual(['not allowlisted: public.notify_send_push(jsonb) (0999_control.sql) is SECURITY DEFINER and executable by anon, authenticated, public']);
    });

    it('a schema-wide grant to anon fails for every function it reopens', () => {
      const v = auditViolations(withLater('grant execute on all functions in schema public to anon;'), ALLOWLIST, policyText);
      expect(v).toContain('anon/PUBLIC can execute public.set_quote(uuid,numeric,numeric), which is not an RLS helper');
      expect(v.some((x) => x.startsWith('not allowlisted: public.notify_user('))).toBe(true);
    });

    it('re-granting anon on one allowlisted admin function fails', () => {
      expect(auditViolations(withLater('grant execute on function public.set_quote(uuid, numeric, numeric) to anon;'), ALLOWLIST, policyText)).toEqual([
        'anon/PUBLIC can execute public.set_quote(uuid,numeric,numeric), which is not an RLS helper',
      ]);
    });

    it('a planted definer function in schema private fails (PUBLIC)', () => {
      const v = auditViolations(withLater('create function private.planted() returns int language sql security definer as $$ select 1 $$;'), ALLOWLIST, policyText);
      expect(v).toEqual(['not allowlisted: private.planted() (0999_control.sql) is SECURITY DEFINER and executable by public']);
    });

    it('dynamic SQL that grants on functions fails closed', () => {
      const v = auditViolations(withLater("do $$ begin execute 'grant execute on function public.set_quote(uuid, numeric, numeric) to anon'; end $$;"), ALLOWLIST, policyText);
      expect(v.some((x) => x.startsWith('unsupported: 0999_control.sql'))).toBe(true);
    });

    it('a dropped allowlisted function leaves a stale entry, which fails', () => {
      expect(auditViolations(withLater('drop function public.set_quote(uuid, numeric, numeric);'), ALLOWLIST, policyText)).toEqual([
        'stale allowlist entry: public.set_quote(uuid,numeric,numeric)',
      ]);
    });

    it('a kind that does not match the body fails', () => {
      const wrong = { ...ALLOWLIST, 'public.accept_quote(uuid)': { kind: 'admin' as Kind, why: 'wrong on purpose' } };
      expect(auditViolations(model, wrong, policyText)).toEqual(['public.accept_quote(uuid): kind admin but no is_admin() call']);
    });

    it('out of scope by design: trigger functions and SECURITY INVOKER functions are not flagged', () => {
      expect(auditViolations(withLater('create function public.tg_planted() returns trigger language plpgsql security definer as $$ begin return new; end $$;'), ALLOWLIST, policyText)).toEqual([]);
      expect(auditViolations(withLater('create function public.planted_invoker() returns int language sql as $$ select 1 $$;'), ALLOWLIST, policyText)).toEqual([]);
    });
  });

  describe('parser controls', () => {
    it('reads input argument types the way PostgreSQL identifies a function', () => {
      expect(inputArgTypes('p_user uuid, p_n numeric(10, 2) default 0, out p_id uuid')).toEqual(['uuid', 'numeric']);
      expect(inputArgTypes('timestamptz, p_to timestamp with time zone, double precision, int, text[]')).toEqual([
        'timestamp with time zone',
        'timestamp with time zone',
        'double precision',
        'integer',
        'text[]',
      ]);
      expect(inputArgTypes("in p_kind text = 'x', variadic p_ids uuid[]")).toEqual(['text', 'uuid[]']);
      expect(normalizeType('public.my_enum')).toBe('my_enum');
    });

    it('keeps comments out: a revoke that only appears in a comment is not a revoke', () => {
      const m = withLaterOnly(`${'create function public.c1() returns int language sql security definer as $$ select 1 $$;'}\n-- revoke all on function public.c1() from public, anon, authenticated;`);
      expect(isClientExecutable(m.functions.get('public.c1()') as FunctionState)).toBe(true);
    });
  });
});

function withLaterOnly(sql: string): FunctionModel {
  return buildFunctionModel([{ file: '0001_control.sql', sql }]);
}
