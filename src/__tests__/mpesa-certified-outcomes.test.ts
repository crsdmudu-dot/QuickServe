/**
 * Regression cases for the three real Production M-PESA Express outcomes certified on
 * 2026-09-11 (no secrets, phone numbers or receipts are reproduced — identifiers are synthetic):
 *
 *   Attempt 1 — ResultCode 1038 "No response from user."           → failed,     payment pending
 *   Attempt 2 — ResultCode 1032 "Request Cancelled by user."        → failed,     payment pending
 *   Attempt 3 — ResultCode 0    "The service request is processed successfully."
 *                                                                    → successful, payment paid
 *
 * Two layers are pinned here:
 *   1. the callback parser the Edge function feeds into apply_mpesa_callback (behavioural);
 *   2. the 0050 settlement contract those outcomes exercised (static, so a later migration that
 *      re-creates apply_mpesa_callback cannot silently change the certified behaviour).
 * The database-level effects are exercised against QA by scripts/qa/mpesa-ops-scenarios.sql.
 */
import fs from 'fs';
import path from 'path';

type Parsed = {
  merchantRequestId: string | null;
  checkoutRequestId: string | null;
  resultCode: number | null;
  resultDesc: string | null;
};
type DarajaShared = { parseStkCallback: (body: unknown) => Parsed };

function loadShared(): DarajaShared {
  // Deno module with a `.ts` import extension: loaded at runtime only (see stk-ambiguity test).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.resolve(__dirname, '../../supabase/functions/_shared/daraja.ts')) as DarajaShared;
}

function callback(resultCode: number, resultDesc: string, metadata?: Record<string, unknown>) {
  const stk: Record<string, unknown> = {
    MerchantRequestID: 'mr-certified-synthetic',
    CheckoutRequestID: 'ws_CO_certified_synthetic',
    ResultCode: resultCode,
    ResultDesc: resultDesc,
  };
  if (metadata) {
    stk.CallbackMetadata = {
      Item: Object.entries(metadata).map(([Name, Value]) => ({ Name, Value })),
    };
  }
  return { Body: { stkCallback: stk } };
}

describe('certified callback shapes parse to the fields apply_mpesa_callback needs', () => {
  const { parseStkCallback } = loadShared();

  it('1038 No response from user → non-zero code, ids present', () => {
    const p = parseStkCallback(callback(1038, 'No response from user.'));
    expect(p).toEqual({
      merchantRequestId: 'mr-certified-synthetic',
      checkoutRequestId: 'ws_CO_certified_synthetic',
      resultCode: 1038,
      resultDesc: 'No response from user.',
    });
  });

  it('1032 Request Cancelled by user → non-zero code, ids present', () => {
    const p = parseStkCallback(callback(1032, 'Request Cancelled by user.'));
    expect(p.resultCode).toBe(1032);
    expect(p.checkoutRequestId).toBe('ws_CO_certified_synthetic');
  });

  it('0 processed successfully → zero code (settlement evidence is read by the RPC from the raw body)', () => {
    const p = parseStkCallback(
      callback(0, 'The service request is processed successfully.', {
        Amount: 1,
        MpesaReceiptNumber: 'SYNTHETIC00',
        TransactionDate: 20260911203845,
        PhoneNumber: 254700000000,
      }),
    );
    expect(p.resultCode).toBe(0);
    expect(p.merchantRequestId).toBe('mr-certified-synthetic');
  });

  it('a body without stkCallback identifiers parses to nulls so the Edge function skips the RPC', () => {
    expect(parseStkCallback({ Body: {} }).checkoutRequestId).toBeNull();
    expect(parseStkCallback(null).resultCode).toBeNull();
  });
});

describe('0050 settlement contract exercised by the certified outcomes is unchanged', () => {
  const dir = path.resolve(__dirname, '../../supabase/migrations');
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  // The LAST migration that (re)creates apply_mpesa_callback must still be 0050: nothing after
  // it may redefine the callback contract without revisiting these certified cases.
  const owners = files.filter((f) =>
    fs.readFileSync(path.join(dir, f), 'utf-8').toLowerCase().includes('create or replace function public.apply_mpesa_callback('),
  );
  const latest = owners[owners.length - 1];
  const body = fs.readFileSync(path.join(dir, latest), 'utf-8').toLowerCase();

  it('is still owned by 0050', () => {
    expect(latest).toMatch(/^0050_/);
  });

  it('non-zero ResultCode moves an initiated/pending attempt to failed and never settles', () => {
    const start = body.indexOf('if p_result_code is distinct from 0 then');
    expect(start).toBeGreaterThan(-1);
    const failBranch = body.slice(start, body.indexOf('success callbacks: fail-closed evidence extraction'));
    expect(failBranch).toMatch(/status\s*=\s*'failed'/);
    expect(failBranch).not.toContain("'paid'");
    expect(failBranch).not.toContain("'successful'");
  });

  it('ResultCode 0 settles only with a parseable Amount and MpesaReceiptNumber equal to the attempt and due', () => {
    expect(body).toContain('mpesareceiptnumber');
    expect(body).toContain("'amount_mismatch'");
    expect(body).toContain("'missing_or_invalid_callback_evidence'");
    expect(body).toMatch(/update public\.payments[\s\S]*'paid'[\s\S]*status = 'pending'/);
  });

  it('a duplicate successful callback is a no-op and a conflicting one is recorded, never re-settled', () => {
    expect(body).toContain("'conflicting_callback_after_settlement'");
    expect(body).toContain("'settlement_reference_already_used'");
  });
});
