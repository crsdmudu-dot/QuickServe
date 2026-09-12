/**
 * mpesa-callback-amount-parse.test.ts
 *
 * Static regression guards for migration 0050, which makes the M-Pesa callback amount extraction
 * parse-safe. Reads the migration files as TEXT (fs); no live DB, no network.
 *
 * WHAT THESE PROVE AND WHAT THEY DO NOT.
 * These are source-level guards: they prove the fix is present, that it is shaped so a malformed
 * Amount can only reach the fail-closed branch, and that every surrounding settlement guarantee
 * from 0045 survived the rewrite byte-for-byte. They do NOT execute PostgreSQL, so they cannot by
 * themselves demonstrate that a non-numeric Amount no longer raises 22P02 at runtime — only that
 * the cast is now trapped. Runtime proof belongs to a QA runtime gate against a live database.
 *
 * The defect: `(i->>'Value')::numeric` aborted the entire callback transaction on any
 * non-numeric Amount, discarding all evidence that the callback ever arrived.
 */
import * as fs from 'fs';
import * as path from 'path';

const readMigration = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/', f), 'utf-8');

/** Strip SQL comments so no assertion can pass on prose alone. */
const executableSql = (s: string) =>
  s
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');

const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();

const M0045 = '0045_harden_payment_settlement.sql';
const M0050 = '0050_parse_safe_mpesa_callback_amount.sql';

/** Extract the apply_mpesa_callback definition (header line through its closing `end; $fn$;`). */
function extractFn(sql: string): string {
  const start = sql.indexOf('create or replace function public.apply_mpesa_callback');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf('end; $fn$;', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + 'end; $fn$;'.length);
}

describe('0050 — parse-safe M-Pesa callback amount', () => {
  let raw0050: string;
  let sql0050: string;
  let raw0045: string;

  beforeAll(() => {
    raw0050 = readMigration(M0050);
    sql0050 = norm(executableSql(raw0050));
    raw0045 = readMigration(M0045);
  });

  // ── forward-only: the already-applied migration must not be edited ──────────

  it('does not edit 0045: the original bare cast is still there', () => {
    // 0045 is applied in production. Editing it would desynchronise recorded history from source.
    expect(executableSql(raw0045)).toContain("select (i->>'Value')::numeric into v_amount");
  });

  it('replaces the function in place rather than dropping it (preserves the 0035/0043 ACL)', () => {
    expect(sql0050).toContain('create or replace function public.apply_mpesa_callback');
    expect(sql0050).not.toContain('drop function');
  });

  it('issues no GRANT or REVOKE, so the execute ACL is inherited untouched', () => {
    expect(sql0050).not.toContain('grant ');
    expect(sql0050).not.toContain('revoke ');
  });

  it('changes exactly one object and touches no data or schema', () => {
    expect(sql0050.match(/create or replace function/g)).toHaveLength(1);
    for (const forbidden of [
      'insert into',
      'delete from',
      'truncate',
      'alter table',
      'create table',
      'create index',
      'create policy',
      'drop policy',
      'add constraint',
    ]) {
      expect(sql0050).not.toContain(forbidden);
    }
  });

  // ── the fix itself ─────────────────────────────────────────────────────────

  it('no longer casts the raw jsonb value directly to numeric', () => {
    expect(sql0050).not.toContain("select (i->>'value')::numeric into v_amount");
  });

  it('reads the Amount as text first, then converts it separately', () => {
    expect(sql0050).toContain("select btrim(i->>'value') into v_amount_text");
    expect(sql0050).toContain('v_amount := v_amount_text::numeric;');
  });

  it('traps the conversion errors that previously aborted the transaction', () => {
    // 22P02 invalid_text_representation and 22003 numeric_value_out_of_range.
    expect(sql0050).toContain(
      'exception when invalid_text_representation or numeric_value_out_of_range then',
    );
  });

  it('does not swallow unrelated failures — only the two conversion conditions are trapped', () => {
    expect(sql0050).not.toContain('exception when others');
    expect(sql0050.match(/exception when/g)).toHaveLength(2); // the new trap + 0045's unique_violation
    expect(sql0050).toContain('exception when unique_violation then');
  });

  it('turns an unparseable amount into NULL, never into a legitimate-looking 0', () => {
    expect(sql0050).toContain('v_amount := null;');
    expect(sql0050).not.toMatch(/v_amount\s*:=\s*0\b/);
    expect(sql0050).not.toContain('coalesce(v_amount_text::numeric, 0)');
  });

  // ── a malformed amount cannot settle ───────────────────────────────────────

  it('routes a NULL amount into the pre-existing fail-closed branch', () => {
    expect(sql0050).toContain(
      "if v_amount is null or v_amount <= 0 or v_receipt is null then v_reason := 'missing_or_invalid_callback_evidence';",
    );
  });

  it('only ever sets the attempt successful behind the v_settled flag', () => {
    // v_settled is set true in exactly one place, and only after every contradiction check.
    expect(sql0050.match(/v_settled := true;/g)).toHaveLength(1);
    expect(sql0050).toContain('if not v_settled then');
    expect(sql0050).toContain("set status = 'successful',");
  });

  it('still requires the amount to equal both the attempt amount and the external due', () => {
    expect(sql0050).toContain('elsif v_amount <> v_attempt.amount or v_amount <> v_due then');
    expect(sql0050).toContain("v_reason := 'amount_mismatch';");
  });

  it('marks the payment paid only on the settled path and only while still pending', () => {
    expect(sql0050).toContain("update public.payments set status = 'paid',");
    expect(sql0050).toContain("where id = v_payment.id and status = 'pending';");
  });

  it('records why the amount was unusable instead of discarding the evidence', () => {
    expect(sql0050).toContain(
      "'observed_amount_raw', v_amount_text, 'amount_parse_failed', v_amount_bad",
    );
  });

  // ── everything else from 0045 must be preserved ────────────────────────────

  it('keeps the identical-duplicate callback as an idempotent no-op', () => {
    expect(sql0050).toContain(
      'if v_attempt.settlement_reference is not distinct from v_receipt and v_attempt.collected_amount is not distinct from v_amount then return;',
    );
  });

  it('keeps the full contradiction matrix', () => {
    for (const reason of [
      'conflicting_callback_after_settlement',
      'success_after_definitive_failure',
      'payment_already_settled_elsewhere',
      'booking_not_completed',
      'sibling_attempt_exists_double_collection_risk',
      'amount_mismatch',
      'missing_or_invalid_callback_evidence',
      'late_failure_after_terminal',
      'settlement_reference_already_used',
    ]) {
      expect(sql0050).toContain(reason);
    }
  });

  it('keeps checkout-request matching and the payment-then-attempt lock order', () => {
    expect(sql0050).toContain('where checkout_request_id = p_checkout_request_id');
    expect(sql0050).toContain(
      'select * into v_payment from public.payments where id = v_attempt.payment_id for update;',
    );
    expect(sql0050).toContain(
      'select * into v_attempt from public.payment_attempts where id = v_attempt.id for update;',
    );
  });

  it('keeps the failure-callback branch and its late-failure evidence path', () => {
    expect(sql0050).toContain('if p_result_code is distinct from 0 then');
    expect(sql0050).toContain("set status = 'failed',");
  });

  it('keeps sibling cancellation after settlement', () => {
    expect(sql0050).toContain("set status = 'cancelled', resolution_note =");
    expect(sql0050).toContain("and status in ('initiated','pending','timed_out');");
  });

  it('keeps the security and signature contract', () => {
    expect(sql0050).toContain('returns void language plpgsql security definer set search_path = public');
    expect(sql0050).toContain('p_checkout_request_id text');
    expect(sql0050).toContain('p_merchant_request_id text');
    expect(sql0050).toContain('p_result_code integer');
    expect(sql0050).toContain('p_raw jsonb');
  });

  it('imposes no percentage or derived arithmetic on the amount', () => {
    expect(sql0050).toContain('v_due := v_payment.amount - v_payment.wallet_applied - v_payment.promo_discount;');
  });

  // ── the decisive guard: nothing else drifted ───────────────────────────────

  it('is the 0045 definition plus exactly the three intended edits, and nothing more', () => {
    const fn45 = extractFn(executableSql(raw0045));
    const fn50 = extractFn(executableSql(raw0050));

    // Apply the intended delta to the 0045 body and require it to reproduce 0050 exactly.
    const rebuilt = fn45
      .replace(
        '  v_amount       numeric;\n',
        '  v_amount       numeric;\n  v_amount_text  text;\n  v_amount_bad   boolean := false;\n',
      )
      .replace(
        "    select (i->>'Value')::numeric into v_amount\n" +
          "      from jsonb_array_elements(v_meta) i where i->>'Name' = 'Amount' limit 1;\n",
        "    select btrim(i->>'Value') into v_amount_text\n" +
          "      from jsonb_array_elements(v_meta) i where i->>'Name' = 'Amount' limit 1;\n" +
          '    if v_amount_text is not null then\n' +
          '      begin\n' +
          '        v_amount := v_amount_text::numeric;\n' +
          '      exception when invalid_text_representation or numeric_value_out_of_range then\n' +
          '        v_amount     := null;\n' +
          '        v_amount_bad := true;\n' +
          '      end;\n' +
          '    end if;\n',
      )
      .replace(
        "             'observed_amount', v_amount, 'observed_receipt', v_receipt,\n",
        "             'observed_amount', v_amount, 'observed_receipt', v_receipt,\n" +
          "             'observed_amount_raw', v_amount_text, 'amount_parse_failed', v_amount_bad,\n",
      );

    expect(rebuilt).toBe(fn50);
  });
});
