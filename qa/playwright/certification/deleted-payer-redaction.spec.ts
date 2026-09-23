/**
 * deleted-payer-redaction.spec.ts — connected certification of migration 0058.
 *
 * Proves, against the certified QA project, that a deleted payer's phone number cannot survive
 * in `payment_attempts.raw_response` or `payment_attempts.phone`, in either payload shape the
 * writers produce, and cannot be reintroduced afterwards by any write path — late, duplicate,
 * contradictory or concurrent — while every non-personal field (amounts, receipt, settlement
 * reference, statuses, earnings, the counterparty's data) is left byte-identical.
 *
 * Every subject is a uniquely marked DISPOSABLE identity created here and removed in afterAll,
 * with seeded financial rows removed in dependency order, so fixed-account totals return to
 * baseline (delta-zero asserted at the end). No fixed account is touched.
 *
 * Requires 0058 applied to QA. Until then every case fails at the first redaction assertion —
 * deliberately: this suite must not be readable as passing on a project that lacks the repair.
 */
import { test, expect, request, type APIRequestContext } from '@playwright/test';
import { certificationConfigured, certificationSkipReason, qaSupabaseAnonKey, qaSupabaseUrl } from '../support/connected/qa-accounts';
import {
  adminCreateUser,
  adminDeleteUser,
  approvedAdminProfileIds,
  deleteProviderPendingNotification,
  signInAs,
  sweepEphemeralUsers,
} from '../support/connected/qa-auth';
import { applyMpesaCallback, createAttemptWithCheckoutId } from '../support/connected/qa-payments';

const PW = 'QaRedact-123!';
const PREFIX = 'qa-redact'; // distinct marker so sweeps never cross other suites
const ZERO_PHONE = '+254700000001';
/** Synthetic payer MSISDN. It must never survive deletion in any field, in any shape. */
const FULL_PHONE = '254712345678';
const MASKED = '***678';

type Row = Record<string, unknown>;

test.describe('Phase 4 — Deleted-payer payload redaction (0058)', { tag: ['@certification', '@connected'] }, () => {
  const createdUserIds: string[] = [];
  const seededBookingIds: string[] = [];
  let baseline: Record<string, number> = {};
  let suiteStart = new Date().toISOString();

  test.beforeEach(({}, testInfo) => {
    test.skip(!certificationConfigured(), certificationSkipReason());
    test.skip(!process.env.QA_SERVICE_ROLE_KEY, 'QA_SERVICE_ROLE_KEY is required for redaction certification.');
    test.skip(testInfo.project.name !== 'chromium', 'Connected coverage is Chromium-only.');
  });

  test.beforeAll(async ({}, testInfo) => {
    if (!certificationConfigured() || !process.env.QA_SERVICE_ROLE_KEY || testInfo.project.name !== 'chromium') return;
    suiteStart = new Date().toISOString();
    baseline = await totals();
  });

  test.afterAll(async ({}, testInfo) => {
    if (!certificationConfigured() || !process.env.QA_SERVICE_ROLE_KEY || testInfo.project.name !== 'chromium') return;
    const failures: string[] = [];
    // Financial rows in dependency order: payouts RESTRICT earnings; bookings cascade the rest.
    for (const b of seededBookingIds) {
      try {
        const earnings = await svcGet<{ id: string }[]>(`/rest/v1/provider_earnings?booking_id=eq.${b}&select=id`);
        if (earnings.length) {
          await svcDelete(`/rest/v1/provider_payouts?earning_id=in.(${earnings.map((e) => e.id).join(',')})`);
        }
        await svcDelete(`/rest/v1/provider_earnings?booking_id=eq.${b}`);
        await svcDelete(`/rest/v1/payments?booking_id=eq.${b}`);
        await svcDelete(`/rest/v1/bookings?id=eq.${b}`);
      } catch (err) {
        failures.push(`seed cleanup ${b}: ${(err as Error).message}`);
      }
    }
    let recipients: string[] = [];
    try { recipients = await approvedAdminProfileIds(); } catch (err) { failures.push(`admin recipients: ${(err as Error).message}`); }
    for (const id of createdUserIds) {
      try {
        await deleteProviderPendingNotification(id, recipients).catch(() => {});
        await svcDelete(`/rest/v1/notifications?user_id=eq.${id}`);
        await svcDelete(`/rest/v1/account_flags?subject_id=eq.${id}`);
        await svcDelete(`/rest/v1/favorite_providers?or=(customer_id.eq.${id},provider_id.eq.${id})`);
        await svcDelete(`/rest/v1/account_deletions?user_id=eq.${id}`);
        await svcDelete(`/rest/v1/account_deletion_attempts?user_id=eq.${id}`);
        await svcDelete(`/rest/v1/wallets?customer_id=eq.${id}`);
        await svcDelete(`/rest/v1/profiles?id=eq.${id}`);
        await adminDeleteUser(id).catch(() => {});
      } catch (err) {
        failures.push(`user cleanup ${id}: ${(err as Error).message}`);
      }
    }
    await svcDelete(`/rest/v1/notifications?type=in.(admin_provider_pending,admin_attempt_discrepancy)&created_at=gt.${encodeURIComponent(suiteStart)}`);
    await sweepEphemeralUsers(PREFIX);
    const after = await totals();
    if (failures.length) throw new Error(`deleted-payer-redaction cleanup failures:\n${failures.join('\n')}`);
    expect(after, 'fixed-account totals must return to baseline (delta zero)').toEqual(baseline);
  });

  // ── service-role plumbing ────────────────────────────────────────────────────────────────
  async function service(): Promise<APIRequestContext> {
    const key = process.env.QA_SERVICE_ROLE_KEY as string;
    return request.newContext({
      baseURL: qaSupabaseUrl(),
      extraHTTPHeaders: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
  }
  async function svcGet<T = unknown>(path: string): Promise<T> {
    const s = await service();
    try { const r = await s.get(path); return (await r.json()) as T; } finally { await s.dispose(); }
  }
  async function svcPost<T = unknown>(path: string, data: unknown): Promise<T> {
    const s = await service();
    try {
      const r = await s.post(path, { data, headers: { Prefer: 'return=representation' } });
      expect(r.status(), `POST ${path.split('?')[0]}`).toBeLessThan(300);
      return (await r.json()) as T;
    } finally { await s.dispose(); }
  }
  async function svcPatch(path: string, data: unknown): Promise<number> {
    const s = await service();
    try { const r = await s.patch(path, { data }); return r.status(); } finally { await s.dispose(); }
  }
  async function svcDelete(path: string): Promise<void> {
    const s = await service();
    try { await s.delete(path); } finally { await s.dispose(); }
  }
  async function svcRpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
    const s = await service();
    try { const r = await s.post(`/rest/v1/rpc/${fn}`, { data: args }); return (await r.json()) as T; } finally { await s.dispose(); }
  }
  async function count(table: string, filter = ''): Promise<number> {
    const s = await service();
    try {
      const r = await s.get(`/rest/v1/${table}?select=id${filter}`, { headers: { Prefer: 'count=exact', Range: '0-0' } });
      const cr = r.headers()['content-range'] ?? '';
      return Number(cr.split('/')[1] ?? -1);
    } finally { await s.dispose(); }
  }
  async function totals(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const t of ['bookings', 'payments', 'payment_attempts', 'provider_earnings', 'notifications', 'booking_activity', 'profiles', 'device_tokens']) {
      out[t] = await count(t);
    }
    out.admin_provider_pending = await count('notifications', '&type=eq.admin_provider_pending&booking_id=is.null');
    out.tombstones = await count('profiles', '&deleted_at=not.is.null');
    return out;
  }
  async function userReads(token: string, path: string): Promise<{ status: number; rows: unknown[] }> {
    const ctx = await request.newContext({
      baseURL: qaSupabaseUrl(),
      extraHTTPHeaders: { apikey: qaSupabaseAnonKey() as string, Authorization: `Bearer ${token}` },
    });
    try { const r = await ctx.get(path); let rows: unknown[] = []; try { rows = (await r.json()) as unknown[]; } catch { /* */ } return { status: r.status(), rows: Array.isArray(rows) ? rows : [] }; } finally { await ctx.dispose(); }
  }

  // ── subjects and seeding ─────────────────────────────────────────────────────────────────
  async function createSubject(role: 'customer' | 'provider'): Promise<{ id: string; email: string }> {
    const email = `${PREFIX}-${role}-${crypto.randomUUID()}@example.com`;
    const r = await adminCreateUser(email, PW, { full_name: 'QA Redaction Subject', phone: ZERO_PHONE, role });
    expect(r.status, `create ${role}`).toBe(200);
    const id = (r.body.id as string) ?? ((r.body.user as { id?: string } | undefined)?.id as string);
    expect(id).toBeTruthy();
    createdUserIds.push(id);
    if (role === 'provider') await svcPatch(`/rest/v1/profiles?id=eq.${id}`, { approval_status: 'approved' });
    return { id, email };
  }

  /** The Daraja STK callback body as the writer stores it, with the payer phone as a NUMBER item. */
  function callbackRaw(amount: number, receipt: string, phone: string | number, checkoutId: string): Record<string, unknown> {
    return {
      Body: {
        stkCallback: {
          MerchantRequestID: `mr-${checkoutId}`,
          CheckoutRequestID: checkoutId,
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: amount },
              { Name: 'MpesaReceiptNumber', Value: receipt },
              { Name: 'TransactionDate', Value: 20300301090000 },
              { Name: 'PhoneNumber', Value: phone },
            ],
          },
        },
      },
    };
  }

  type Seeded = { bookingId: string; paymentId: string; attemptId: string; checkoutId: string; receipt: string };

  /**
   * A COMPLETED booking whose payment is settled THROUGH the real callback writer, so the
   * attempt's raw_response is exactly what production would hold — including the phone.
   * `both` also merges the mock STK acceptance shape (top-level PhoneNumber) into the same row.
   */
  async function seedSettledViaCallback(customerId: string, providerId: string, shape: 'callback' | 'both'): Promise<Seeded> {
    const [b] = await svcPost<{ id: string }[]>('/rest/v1/bookings', {
      customer_id: customerId, assigned_provider_id: providerId, service_id: 'house_cleaning',
      address: '12 Test Lane, Nairobi', notes: 'gate code 4321', latitude: -1.29, longitude: 36.82,
      scheduled_for: new Date().toISOString(), status: 'completed', assigned_provider_name: 'QA Provider', assigned_provider_phone: ZERO_PHONE,
    });
    seededBookingIds.push(b.id);
    const [p] = await svcPost<{ id: string }[]>('/rest/v1/payments', {
      booking_id: b.id, customer_id: customerId, amount: 1500, currency: 'KES', status: 'pending',
      provider_share: 1200, quickserve_share: 300,
    });
    const checkoutId = `${PREFIX}-${crypto.randomUUID()}`;
    const attemptId = await createAttemptWithCheckoutId(p.id, 1500, checkoutId);
    expect(await svcPatch(`/rest/v1/payment_attempts?id=eq.${attemptId}`, { phone: FULL_PHONE })).toBeLessThan(300);

    const receipt = `QA-RED-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const r = await applyMpesaCallback(checkoutId, 0, 'ok', callbackRaw(1500, receipt, Number(FULL_PHONE), checkoutId));
    expect(r.status, 'settle via real callback writer').toBeLessThan(300);

    if (shape === 'both') {
      const row = await readAttempt(attemptId);
      const merged = { ...(row.raw_response as Record<string, unknown>), PhoneNumber: FULL_PHONE, Amount: 1500 };
      expect(await svcPatch(`/rest/v1/payment_attempts?id=eq.${attemptId}`, { raw_response: merged })).toBeLessThan(300);
    }
    // The settle path creates the earning; it must be PAID or deletion is (correctly) blocked.
    await svcPatch(`/rest/v1/provider_earnings?booking_id=eq.${b.id}`, { payout_status: 'paid' });
    return { bookingId: b.id, paymentId: p.id, attemptId, checkoutId, receipt };
  }

  async function readAttempt(id: string): Promise<Row> {
    const rows = await svcGet<Row[]>(`/rest/v1/payment_attempts?id=eq.${id}&select=*`);
    expect(rows).toHaveLength(1);
    return rows[0];
  }
  function items(raw: unknown): Row[] {
    const arr = (raw as { Body?: { stkCallback?: { CallbackMetadata?: { Item?: Row[] } } } })?.Body?.stkCallback?.CallbackMetadata?.Item;
    return Array.isArray(arr) ? arr : [];
  }
  function item(raw: unknown, name: string): unknown {
    return items(raw).find((i) => i.Name === name)?.Value;
  }
  function containsFullPhone(v: unknown): boolean {
    return JSON.stringify(v ?? null).includes(FULL_PHONE);
  }
  async function deleteAccount(userId: string): Promise<Row> {
    return svcRpc<Row>('delete_account', { p_user: userId });
  }

  // ── 1. Deletion redacts both shapes and only the phone ───────────────────────────────────
  test('deletion masks the phone in both payload shapes and the phone column, and changes nothing else', { tag: ['@p0', '@security'] }, async () => {
    const c = await createSubject('customer');
    const pr = await createSubject('provider');
    const s = await seedSettledViaCallback(c.id, pr.id, 'both');

    const before = await readAttempt(s.attemptId);
    expect(containsFullPhone(before.raw_response), 'precondition: phone present in raw').toBe(true);
    expect(before.phone).toBe(FULL_PHONE);
    expect(item(before.raw_response, 'PhoneNumber')).toBe(Number(FULL_PHONE));
    expect((before.raw_response as Row).PhoneNumber).toBe(FULL_PHONE);

    const res = await deleteAccount(c.id);
    expect(res.status).toBe('pending_auth_delete');

    const after = await readAttempt(s.attemptId);
    expect(containsFullPhone(after.raw_response), 'no full phone anywhere in raw').toBe(false);
    expect(item(after.raw_response, 'PhoneNumber'), 'callback item masked').toBe(MASKED);
    expect((after.raw_response as Row).PhoneNumber, 'top-level key masked').toBe(MASKED);
    expect(after.phone, 'phone column masked').toBe(MASKED);

    // Everything that is not a phone is byte-identical.
    expect(item(after.raw_response, 'Amount')).toEqual(item(before.raw_response, 'Amount'));
    expect(item(after.raw_response, 'MpesaReceiptNumber')).toBe(s.receipt);
    expect(item(after.raw_response, 'TransactionDate')).toEqual(item(before.raw_response, 'TransactionDate'));
    expect((after.raw_response as Row).Amount).toEqual((before.raw_response as Row).Amount);
    for (const k of ['status', 'amount', 'settlement_reference', 'collected_amount', 'checkout_request_id', 'merchant_request_id', 'result_code', 'discrepancy']) {
      expect(after[k], k).toEqual(before[k]);
    }
    expect(after.status).toBe('successful');
    expect(after.settlement_reference).toBe(s.receipt);

    const [pay] = await svcGet<Row[]>(`/rest/v1/payments?id=eq.${s.paymentId}&select=status,amount,provider_share,quickserve_share`);
    expect(pay).toEqual({ status: 'paid', amount: 1500, provider_share: 1200, quickserve_share: 300 });
    const earnings = await svcGet<Row[]>(`/rest/v1/provider_earnings?booking_id=eq.${s.bookingId}&select=amount,payout_status`);
    expect(earnings.every((e) => e.payout_status === 'paid')).toBe(true);
    const [prov] = await svcGet<Row[]>(`/rest/v1/profiles?id=eq.${pr.id}&select=full_name,phone,deleted_at`);
    expect(prov, 'provider untouched').toEqual({ full_name: 'QA Redaction Subject', phone: ZERO_PHONE, deleted_at: null });
  });

  // ── 2. Scoping: a payer who did not delete is untouched ──────────────────────────────────
  test('a control payer who did not delete keeps the full phone in their own payload', { tag: ['@p0'] }, async () => {
    const control = await createSubject('customer');
    const deleting = await createSubject('customer');
    const pr = await createSubject('provider');
    const sc = await seedSettledViaCallback(control.id, pr.id, 'both');
    const sd = await seedSettledViaCallback(deleting.id, pr.id, 'both');

    expect((await deleteAccount(deleting.id)).status).toBe('pending_auth_delete');

    const ctl = await readAttempt(sc.attemptId);
    expect(containsFullPhone(ctl.raw_response), 'control raw unchanged').toBe(true);
    expect(ctl.phone).toBe(FULL_PHONE);
    const del = await readAttempt(sd.attemptId);
    expect(containsFullPhone(del.raw_response)).toBe(false);
  });

  // ── 3–5. Late, duplicate and contradictory callbacks after deletion ──────────────────────
  test('a late duplicate success callback after deletion is a no-op and reintroduces nothing', { tag: ['@p0', '@security'] }, async () => {
    const c = await createSubject('customer');
    const pr = await createSubject('provider');
    const s = await seedSettledViaCallback(c.id, pr.id, 'callback');
    expect((await deleteAccount(c.id)).status).toBe('pending_auth_delete');

    const r = await applyMpesaCallback(s.checkoutId, 0, 'ok', callbackRaw(1500, s.receipt, Number(FULL_PHONE), s.checkoutId));
    expect(r.status).toBeLessThan(300);
    const after = await readAttempt(s.attemptId);
    expect(containsFullPhone(after.raw_response)).toBe(false);
    expect(item(after.raw_response, 'PhoneNumber')).toBe(MASKED);
    expect(after.status).toBe('successful');
  });

  test('a contradictory callback after deletion records evidence without the phone and leaves raw masked', { tag: ['@p0', '@security'] }, async () => {
    const c = await createSubject('customer');
    const pr = await createSubject('provider');
    const s = await seedSettledViaCallback(c.id, pr.id, 'callback');
    expect((await deleteAccount(c.id)).status).toBe('pending_auth_delete');

    const otherReceipt = `QA-RED-CONFLICT-${crypto.randomUUID().slice(0, 6)}`;
    const r = await applyMpesaCallback(s.checkoutId, 0, 'ok', callbackRaw(1500, otherReceipt, Number(FULL_PHONE), s.checkoutId));
    expect(r.status).toBeLessThan(300);
    const after = await readAttempt(s.attemptId);
    const disc = after.discrepancy as Row[] | null;
    expect(Array.isArray(disc) && disc.some((d) => d.type === 'conflicting_callback_after_settlement'), 'discrepancy appended').toBe(true);
    expect(containsFullPhone(disc), 'no phone in discrepancy evidence').toBe(false);
    expect(containsFullPhone(after.raw_response), 'raw still masked').toBe(false);
    expect(after.settlement_reference, 'settlement unchanged').toBe(s.receipt);
  });

  test('a late failure callback after deletion appends evidence without the phone', { tag: ['@p1', '@security'] }, async () => {
    const c = await createSubject('customer');
    const pr = await createSubject('provider');
    const s = await seedSettledViaCallback(c.id, pr.id, 'callback');
    expect((await deleteAccount(c.id)).status).toBe('pending_auth_delete');

    const r = await applyMpesaCallback(s.checkoutId, 1, 'late failure', callbackRaw(1500, s.receipt, Number(FULL_PHONE), s.checkoutId));
    expect(r.status).toBeLessThan(300);
    const after = await readAttempt(s.attemptId);
    expect(after.status, 'terminal state never reverted').toBe('successful');
    expect(containsFullPhone(after.raw_response)).toBe(false);
    expect(containsFullPhone(after.discrepancy)).toBe(false);
  });

  // ── 6. The write-time guard, independent of which writer ─────────────────────────────────
  test("a direct write of a full phone to a deleted payer's attempt is redacted at write time", { tag: ['@p0', '@security'] }, async () => {
    const c = await createSubject('customer');
    const pr = await createSubject('provider');
    const s = await seedSettledViaCallback(c.id, pr.id, 'callback');
    expect((await deleteAccount(c.id)).status).toBe('pending_auth_delete');

    const hostile = { ...callbackRaw(1500, s.receipt, FULL_PHONE, s.checkoutId), PhoneNumber: FULL_PHONE, phone: FULL_PHONE };
    expect(await svcPatch(`/rest/v1/payment_attempts?id=eq.${s.attemptId}`, { raw_response: hostile, phone: FULL_PHONE })).toBeLessThan(300);

    const after = await readAttempt(s.attemptId);
    expect(containsFullPhone(after.raw_response), 'trigger redacted the write').toBe(false);
    expect((after.raw_response as Row).PhoneNumber).toBe(MASKED);
    expect((after.raw_response as Row).phone).toBe(MASKED);
    expect(item(after.raw_response, 'PhoneNumber')).toBe(MASKED);
    expect(after.phone).toBe(MASKED);
    expect(item(after.raw_response, 'MpesaReceiptNumber'), 'non-phone fields written through').toBe(s.receipt);
  });

  // ── 7. Ordering and concurrency ──────────────────────────────────────────────────────────
  //
  // Three cases, because a race test alone proves too little. The two ORDERINGS are proved
  // deterministically: write-then-delete exercises the tombstone trigger rewriting a row that
  // already holds the phone; delete-then-write exercises the write-time trigger on a committed
  // tombstone. The RACE then fires many pairs together and measures, from each request's
  // in-flight window, how many pairs actually overlapped; it fails if none did, so it cannot pass
  // as a race while having run sequentially. Lock-level interleaving cannot be injected without a
  // test hook in the schema, which is deliberately not provided; the overlap count is reported
  // so the strength of the evidence is visible in the run log.
  const hostileWrite = (s: Seeded) => ({
    raw_response: { ...callbackRaw(1500, s.receipt, FULL_PHONE, s.checkoutId), PhoneNumber: FULL_PHONE },
    phone: FULL_PHONE,
  });
  async function expectFullyMasked(id: string, s: Seeded, label: string): Promise<void> {
    const [p] = await svcGet<Row[]>(`/rest/v1/profiles?id=eq.${id}&select=deleted_at`);
    expect(p.deleted_at, `${label}: deletion committed`).not.toBeNull();
    const row = await readAttempt(s.attemptId);
    expect(containsFullPhone(row.raw_response), `${label}: raw`).toBe(false);
    expect((row.raw_response as Row).PhoneNumber, `${label}: top-level`).toBe(MASKED);
    expect(item(row.raw_response, 'PhoneNumber'), `${label}: callback item`).toBe(MASKED);
    expect(row.phone, `${label}: phone column`).toBe(MASKED);
    expect(row.settlement_reference, `${label}: settlement intact`).toBe(s.receipt);
    expect(row.status, `${label}: status intact`).toBe('successful');
  }

  test('ordering A — a full-phone write committed BEFORE deletion is rewritten by the deletion', { tag: ['@p0', '@security'] }, async () => {
    const c = await createSubject('customer');
    const pr = await createSubject('provider');
    const s = await seedSettledViaCallback(c.id, pr.id, 'both');
    expect(await svcPatch(`/rest/v1/payment_attempts?id=eq.${s.attemptId}`, hostileWrite(s))).toBeLessThan(300);
    expect(containsFullPhone((await readAttempt(s.attemptId)).raw_response), 'precondition: phone present').toBe(true);
    expect((await deleteAccount(c.id)).status).toBe('pending_auth_delete');
    await expectFullyMasked(c.id, s, 'write-then-delete');
  });

  test('ordering B — a full-phone write AFTER deletion is redacted at write time', { tag: ['@p0', '@security'] }, async () => {
    const c = await createSubject('customer');
    const pr = await createSubject('provider');
    const s = await seedSettledViaCallback(c.id, pr.id, 'both');
    expect((await deleteAccount(c.id)).status).toBe('pending_auth_delete');
    await expectFullyMasked(c.id, s, 'after delete, before write');
    expect(await svcPatch(`/rest/v1/payment_attempts?id=eq.${s.attemptId}`, hostileWrite(s))).toBeLessThan(300);
    await expectFullyMasked(c.id, s, 'delete-then-write');
  });

  test('race — deletion and a full-phone write in flight together never leave or restore the phone', { tag: ['@p0', '@security'] }, async () => {
    const pr = await createSubject('provider');
    const subjects: { id: string; s: Seeded }[] = [];
    for (let i = 0; i < 12; i += 1) {
      const c = await createSubject('customer');
      subjects.push({ id: c.id, s: await seedSettledViaCallback(c.id, pr.id, 'both') });
    }
    type Win = { start: number; end: number };
    const timed = async <T,>(fn: () => Promise<T>): Promise<Win & { value: T }> => {
      const start = Date.now();
      const value = await fn();
      return { start, end: Date.now(), value };
    };
    let overlapped = 0;
    let pairs = 0;
    for (let round = 0; round < 3; round += 1) {
      const results = await Promise.all(
        subjects.map(async ({ id, s }) => {
          const [del, wr] = await Promise.all([
            timed(() => deleteAccount(id)),
            timed(() => svcPatch(`/rest/v1/payment_attempts?id=eq.${s.attemptId}`, hostileWrite(s))),
          ]);
          return { del, wr };
        }),
      );
      for (const { del, wr } of results) {
        pairs += 1;
        if (del.start < wr.end && wr.start < del.end) overlapped += 1;
        expect(['pending_auth_delete', 'deleted']).toContain(del.value.status as string);
        expect(wr.value).toBeLessThan(300);
      }
    }
    // Persisted outcome, inspected only after every request in every round has completed.
    for (const { id, s } of subjects) await expectFullyMasked(id, s, `race subject ${id}`);
    console.log(`[deleted-payer-redaction] race: ${overlapped} of ${pairs} delete/write pairs were in flight together`);
    expect(overlapped, 'the race must have actually raced: at least one pair in flight together').toBeGreaterThan(0);
  });

  // ── 8. Malformed and non-object payloads ─────────────────────────────────────────────────
  test('malformed or non-object raw_response neither errors nor changes on deletion', { tag: ['@p1'] }, async () => {
    const c = await createSubject('customer');
    const pr = await createSubject('provider');
    const s = await seedSettledViaCallback(c.id, pr.id, 'callback');
    const odd: unknown[] = ['not-an-object', 42, ['array', FULL_PHONE], null];
    for (const raw of odd) {
      expect(await svcPatch(`/rest/v1/payment_attempts?id=eq.${s.attemptId}`, { raw_response: raw })).toBeLessThan(300);
    }
    // Arrays and scalars carry no phone in either supported shape and pass through untouched.
    expect(await svcPatch(`/rest/v1/payment_attempts?id=eq.${s.attemptId}`, { raw_response: ['array', FULL_PHONE] })).toBeLessThan(300);
    expect((await deleteAccount(c.id)).status).toBe('pending_auth_delete');
    const after = await readAttempt(s.attemptId);
    expect(after.raw_response, 'non-object passes through unchanged').toEqual(['array', FULL_PHONE]);
    expect(after.phone, 'phone column still masked').toBe(MASKED);
    expect(after.status).toBe('successful');
  });

  // ── 9. Repeat deletion and the retry path ────────────────────────────────────────────────
  test('repeat deletion is idempotent and leaves the redaction in place', { tag: ['@p1'] }, async () => {
    const c = await createSubject('customer');
    const pr = await createSubject('provider');
    const s = await seedSettledViaCallback(c.id, pr.id, 'both');
    const first = await deleteAccount(c.id);
    expect(first.status).toBe('pending_auth_delete');
    const [p1] = await svcGet<Row[]>(`/rest/v1/profiles?id=eq.${c.id}&select=deleted_at`);

    const second = await deleteAccount(c.id);
    expect(second.status, 'retry path intact').toBe('pending_auth_delete');
    const [p2] = await svcGet<Row[]>(`/rest/v1/profiles?id=eq.${c.id}&select=deleted_at`);
    expect(p2.deleted_at, 'tombstone timestamp unchanged on repeat').toBe(p1.deleted_at);

    const after = await readAttempt(s.attemptId);
    expect(containsFullPhone(after.raw_response)).toBe(false);
    expect(after.phone).toBe(MASKED);
    expect(await count('account_deletions', `&user_id=eq.${c.id}`), 'one audit row, not two').toBe(1);
  });

  // ── 10. Existing denial still holds ──────────────────────────────────────────────────────
  test('the deleted payer is denied their attempt rows even with a still-valid token', { tag: ['@p1', '@security'] }, async () => {
    const c = await createSubject('customer');
    const pr = await createSubject('provider');
    const s = await seedSettledViaCallback(c.id, pr.id, 'callback');
    const token = await signInAs(c.email, PW);
    expect(token).toBeTruthy();
    expect((await userReads(token as string, `/rest/v1/payment_attempts?id=eq.${s.attemptId}&select=id`)).rows).toHaveLength(1);

    expect((await deleteAccount(c.id)).status).toBe('pending_auth_delete');
    const denied = await userReads(token as string, `/rest/v1/payment_attempts?id=eq.${s.attemptId}&select=id`);
    expect(denied.rows, 'zero rows for the tombstoned identity').toHaveLength(0);
  });

  // ── 11. Dry-run inventory ────────────────────────────────────────────────────────────────
  test('the dry-run inventory reports no deleted-payer row still needing redaction', { tag: ['@p1'] }, async () => {
    const rows = await svcRpc<Row[]>('deleted_payer_attempts_needing_redaction', {});
    expect(Array.isArray(rows)).toBe(true);
    expect(rows, 'every tombstoned payer in this run is already redacted').toHaveLength(0);
  });
});
