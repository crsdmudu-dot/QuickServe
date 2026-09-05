/**
 * payment-settlement-hardening.test.ts
 *
 * Static regression guards for the settlement hardening in migrations 0045/0046 and for the
 * mpesa-stk-push Edge Function. Reads the files as TEXT (fs); no live DB, no network.
 *
 * These do not prove runtime behaviour — that is the QA schema/runtime gate's job. They exist so
 * the specific defects this work closed cannot silently regress in CI:
 *
 *   - a settlement path that sets 'paid' without comparing any amount;
 *   - a generic admin override that can mint a provider earning;
 *   - an evidence-free attempt cancellation;
 *   - 'timed_out' treated as a safe failure and released for retry;
 *   - legacy-data-sensitive constraints leaking into the forward-safe migration;
 *   - the Edge Function contacting Daraja before an attempt row exists.
 *
 * The M-Pesa CallbackMetadata shape is still specification-derived and NOT runtime-certified;
 * these tests only assert the extraction is fail-closed, never that it matches a real callback.
 */
import * as fs from 'fs';
import * as path from 'path';

const readMigration = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/', f), 'utf-8');
const readFn = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/', f), 'utf-8');

// Strip SQL comments so assertions never pass on prose alone.
const executableSql = (s: string) =>
  s
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();

const BLOCKING = "('initiated','pending','timed_out')";

describe('0045 — forward-safe settlement model', () => {
  let raw: string;
  let sql: string;

  beforeAll(() => {
    raw = readMigration('0045_harden_payment_settlement.sql');
    sql = norm(executableSql(raw));
  });

  it('drops both evidence-free RPCs rather than leaving a compatibility overload', () => {
    expect(sql).toContain('drop function if exists public.confirm_payment_attempt(uuid);');
    expect(sql).toContain('drop function if exists public.cancel_payment_attempt(uuid);');
  });

  it('replaces confirm with the four-argument evidence-bearing signature', () => {
    expect(sql).toContain('p_attempt_id uuid, p_collected_amount numeric');
    expect(sql).toContain('p_confirmation_note text, p_confirmation_reference text');
  });

  it('adds the no-collection reconciliation RPC and never lets it claim settlement identity', () => {
    expect(sql).toContain('create or replace function public.reconcile_payment_attempt_no_collection(');
    // Everything between that CREATE and its terminator must not touch settlement_reference.
    const start = raw.indexOf('create or replace function public.reconcile_payment_attempt_no_collection(');
    const body = raw.slice(start, raw.indexOf('$fn$;', start));
    expect(body).not.toContain('settlement_reference');
  });

  it('requires exact amount equality in confirm_payment_attempt (no >= underpayment path)', () => {
    expect(sql).toContain(
      'if p_collected_amount <> v_attempt.amount or p_collected_amount <> v_due then',
    );
  });

  it('requires the callback amount to equal both the attempt amount and the external due', () => {
    expect(sql).toContain('v_amount <> v_attempt.amount or v_amount <> v_due');
  });

  it('fails closed when the callback carries no usable amount or receipt', () => {
    expect(sql).toContain('v_amount is null or v_amount <= 0 or v_receipt is null');
  });

  it('never accepts CheckoutRequestID as proof of collection', () => {
    // The receipt is the settlement identity; the checkout id only locates the attempt.
    expect(sql).toContain("i->>'name' = 'mpesareceiptnumber'");
    expect(sql).not.toContain('settlement_reference = p_checkout_request_id');
  });

  it('stores provider references trimmed but never case-folded', () => {
    expect(sql).toContain("btrim(i->>'value')");
    expect(sql).not.toContain('lower(v_receipt)');
    expect(sql).not.toContain('upper(v_receipt)');
  });

  it('guards the callback sibling conflict for EVERY source status, not just cancelled', () => {
    // The original defect scoped this to cancelled, leaving timed_out able to settle while a
    // live sibling attempt could still collect.
    expect(sql).toContain(
      "elsif exists (select 1 from public.payment_attempts a where a.payment_id = v_payment.id and a.id <> v_attempt.id and a.status in ('initiated','pending','timed_out','successful')) then",
    );
    expect(sql).not.toContain("elsif v_attempt.status = 'cancelled' and exists");
  });

  it('treats timed_out as blocking everywhere the funding mix or retry is gated', () => {
    const occurrences = sql.split(BLOCKING).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(5);
  });

  it('freezes wallet and promo allocation while a blocking attempt exists', () => {
    expect(sql).toContain("raise exception 'payment has an open external attempt'");
  });

  it('keeps the certified 0040/0043/0044 locking and authorization in the customer RPCs', () => {
    expect(sql).toContain('from public.payments where id = p_payment_id for update');
    expect(sql).toContain('is distinct from auth.uid()');
    expect(sql).toContain(
      'select * into pc from public.promo_codes where code = upper(btrim(p_code)) for update',
    );
  });

  it('removes paid and refunded from the generic override', () => {
    expect(sql).toContain("p_status not in ('pending','cancelled')");
    expect(sql).toContain("raise exception 'a paid payment cannot be changed through this override'");
  });

  it('settles a zero-due payment only at booking completion and only with no live attempt', () => {
    expect(sql).toContain("when (new.status = 'completed' and old.status is distinct from 'completed')");
    expect(sql).toContain('(p.amount - p.wallet_applied - p.promo_discount) = 0');
    expect(sql).toContain("a.status in ('initiated','pending','timed_out','successful')");
  });

  it('appends contradictory evidence instead of overwriting it', () => {
    expect(sql).toContain("coalesce(discrepancy, '[]'::jsonb) ||");
    expect(sql).not.toMatch(/discrepancy\s*=\s*jsonb_build/);
  });

  it('translates a duplicate settlement reference into a domain error, not a raw 23505', () => {
    expect(sql).toContain('exception when unique_violation');
    expect(sql).toContain("raise exception 'settlement reference already used'");
  });

  it('creates the settlement-reference index but defers legacy-sensitive objects to 0046', () => {
    expect(sql).toContain('create unique index if not exists payment_attempts_settlement_reference_uq');
    expect(sql).toContain('check (amount > 0) not valid');
    expect(sql).not.toContain('one_blocking_per_payment');
    expect(sql).not.toContain('validate constraint');
  });

  it('revokes PUBLIC and anon on every settlement RPC it grants to authenticated', () => {
    for (const fn of [
      'public.confirm_payment_attempt(uuid, numeric, text, text)',
      'public.reconcile_payment_attempt_no_collection(uuid, text, text)',
      'public.override_payment_status(uuid, text)',
    ]) {
      expect(sql).toContain(`revoke execute on function ${fn} from public;`);
      expect(sql).toContain(`revoke execute on function ${fn} from anon;`);
      expect(sql).toContain(`grant execute on function ${fn} to authenticated;`);
    }
  });
});

describe('0046 — legacy-data-sensitive enforcement, deferred behind a preflight', () => {
  let raw: string;
  let sql: string;

  beforeAll(() => {
    raw = readMigration('0046_enforce_payment_attempt_invariants.sql');
    sql = norm(executableSql(raw));
  });

  it('carries the production precondition prominently', () => {
    expect(raw).toContain('PRODUCTION PRECONDITION');
    expect(raw).toContain('DO NOT APPLY 0046 until the mandatory read-only production preflight');
  });

  it('enforces at most one blocking attempt per payment, including timed_out', () => {
    expect(sql).toContain('create unique index if not exists payment_attempts_one_blocking_per_payment');
    expect(sql).toContain(`where status in ${BLOCKING}`);
  });

  it('makes a non-null checkout_request_id identify exactly one attempt', () => {
    expect(sql).toContain('payment_attempts_checkout_request_id_uq');
    expect(sql).toContain('where checkout_request_id is not null');
  });

  it('validates the constraint 0045 added NOT VALID, by its exact name', () => {
    expect(sql).toContain(
      'alter table public.payment_attempts validate constraint payment_attempts_amount_positive_check;',
    );
  });

  it('contains no cleanup, backfill or other data mutation', () => {
    expect(sql).not.toMatch(/^\s*(insert|update|delete|truncate)/m);
    expect(sql).not.toContain('create or replace function');
  });
});

describe('mpesa-stk-push — reserve before contacting the provider', () => {
  let src: string;

  /** Drop comments so a doc-block mention can never satisfy a source-contract assertion. */
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  beforeAll(() => {
    src = readFn('mpesa-stk-push/index.ts');
  });

  it('never inserts a payment_attempts row directly', () => {
    // All attempt creation must go through the hardened RPC, which locks the payment and
    // enforces the blocking-attempt invariant server-side.
    expect(src).not.toContain('payment_attempts');
  });

  it('reserves the attempt before any Daraja call', () => {
    const reserveAt = src.indexOf("rpc('reserve_mpesa_attempt'");
    const tokenAt = src.indexOf('getOAuthToken(');
    const pushAt = src.indexOf('stkPush(');
    expect(reserveAt).toBeGreaterThan(-1);
    expect(reserveAt).toBeLessThan(tokenAt);
    expect(reserveAt).toBeLessThan(pushAt);
  });

  it('marks the attempt failed ONLY behind HTTP success, a parsed body and an explicit code', () => {
    // A definitive rejection is the ONLY route to mark_attempt_failed. Every guard below must
    // sit in front of it, in this order, or an externally transmitted request could be failed.
    const code = strip(src);
    expect(code.match(/mark_attempt_failed/g) ?? []).toHaveLength(1);

    const okGuard = code.indexOf('if (!result.ok)');
    const bodyRead = code.indexOf('const resp = result.body');
    const bodyGuard = code.indexOf('if (!resp)');
    const codeRead = code.indexOf('const rawCode = resp.ResponseCode');
    const rejectGuard = code.indexOf("responseCode !== null && responseCode !== '0'");
    const failAt = code.indexOf('mark_attempt_failed');

    expect(okGuard).toBeGreaterThan(-1);
    expect(bodyGuard).toBeGreaterThan(-1);
    expect(rejectGuard).toBeGreaterThan(-1);
    expect(okGuard).toBeLessThan(bodyRead);
    expect(bodyGuard).toBeLessThan(codeRead);
    expect(codeRead).toBeLessThan(rejectGuard);
    expect(rejectGuard).toBeLessThan(failAt);

    // The old predicate read a MISSING ResponseCode as a rejection. It must not come back.
    expect(code).not.toContain("resp.ResponseCode !== '0'");
    // An explicit code must be proven present before it can mean anything.
    expect(code).toContain("typeof rawCode === 'string' || typeof rawCode === 'number'");
    expect(code).toContain(': null');
  });

  it('leaves the attempt initiated on every ambiguous outcome instead of failing it', () => {
    // Anything that leaves the outcome unproven - a thrown request, a non-2xx answer, an
    // unparseable body, a missing ResponseCode - may still have reached the provider. Marking
    // it failed would release the freeze and permit a retry while the customer could be charged.
    const code = strip(src);
    const failAt = code.indexOf('mark_attempt_failed');

    // 1. transport throw: the catch must answer ambiguously before any failure route.
    const afterSubmit = code.slice(code.indexOf('result = await stkPush(token, payload);'));
    expect(code).toContain('result = await stkPush(token, payload);');
    expect(afterSubmit.indexOf('Payment status unknown')).toBeGreaterThan(-1);
    expect(afterSubmit.indexOf('Payment status unknown')).toBeLessThan(
      afterSubmit.indexOf('mark_attempt_failed'),
    );

    // 2. non-2xx, 3. unparseable body, 4. absent ResponseCode - each returns before failing.
    for (const guard of ['if (!result.ok)', 'if (!resp)', 'if (responseCode === null)']) {
      const at = code.indexOf(guard);
      expect(at).toBeGreaterThan(-1);
      const ret = code.indexOf('Payment status unknown', at);
      expect(ret).toBeGreaterThan(-1);
      // the ambiguous return belongs to this guard, not to some later block
      expect(ret - at).toBeLessThan(200);
    }
    // The absent-code guard is a pure return: it must never reach the failure RPC.
    expect(code.indexOf('if (responseCode === null)')).toBeGreaterThan(failAt);
  });

  it('records definitive acceptance through the acceptance RPC', () => {
    expect(src).toContain("rpc('mark_attempt_accepted'");
    expect(src).toContain('p_checkout_request_id: checkoutRequestId');
  });

  it('requires BOTH provider identifiers before acceptance and never invents one', () => {
    // A callback can only be correlated by CheckoutRequestID, and mark_attempt_accepted takes
    // both ids with no SQL default - a missing one must be ambiguous, never a fabricated value.
    const code = strip(src);
    const idGuard = code.indexOf('if (!merchantRequestId || !checkoutRequestId)');
    expect(idGuard).toBeGreaterThan(-1);
    expect(idGuard).toBeLessThan(code.indexOf('mark_attempt_accepted'));
    expect(code.indexOf('Payment status unknown', idGuard)).toBeGreaterThan(-1);
    // the weaker single-id guard must not be the only protection
    expect(code).not.toContain('if (!checkoutRequestId)');
  });

  it('sends the DB-reserved amount to Daraja, never a recomputed one', () => {
    // The RPC decides the amount under the payment row lock; this function must not re-derive it.
    const code = strip(src);
    expect(code).toContain(
      'const amountDue = Number((reservation as { amount: number | string }).amount)',
    );
    expect(code).toContain('amount: amountDue,');
    // the pre-0045 client-side computation must stay gone
    expect(code).not.toContain('Number(payment.wallet_applied');
    expect(code).not.toContain('Number(payment.promo_discount');
  });

  it('does not retry Daraja or create a second attempt when acceptance cannot be recorded', () => {
    expect(src).toContain('Payment started but could not be recorded.');
  });
});
