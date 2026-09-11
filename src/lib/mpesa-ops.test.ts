/**
 * src/lib/mpesa-ops.ts — operational review client for M-PESA attempts.
 *
 * The category/urgency/blocking derivation lives in SQL (0053 admin_mpesa_attempt_review) so the
 * UI never re-implements the state machine. This module only:
 *   - wraps the RPC (returns [] on error, never throws to a screen);
 *   - mirrors the two thresholds for display copy, guarded by a static test against the SQL;
 *   - maps categories/urgency to operator-facing labels;
 *   - enforces the UI-side evidence rule for "no collection" (the RPC only requires a note; the
 *     runbook requires a provider reference OR an explicit portal-verified statement).
 */
import fs from 'fs';
import path from 'path';

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...a: unknown[]) => mockRpc(...a) },
}));

import {
  adminGetMpesaAttemptReview,
  MPESA_OPS_THRESHOLDS,
  REVIEW_CATEGORY_LABELS,
  REVIEW_URGENCY_LABELS,
  noCollectionEvidenceIsSufficient,
  type MpesaAttemptReviewRow,
} from '@/lib/mpesa-ops';

const ROW: MpesaAttemptReviewRow = {
  attempt_id: 'a1',
  payment_id: 'p1',
  booking_id: 'b1',
  status: 'timed_out',
  amount: 1,
  created_at: '2026-09-11T15:53:18Z',
  age_seconds: 900,
  callback_received_at: null,
  result_code: null,
  result_desc: null,
  checkout_request_id: 'ws_CO_x',
  merchant_request_id: 'mr-x',
  has_collected_amount: false,
  has_settlement_reference: false,
  discrepancy_count: 0,
  latest_discrepancy_type: null,
  discrepancy_unresolved: false,
  discrepancy_reviewed_at: null,
  payment_status: 'pending',
  blocks_retry: true,
  needs_operator: true,
  resolved_at: null,
  resolved_by_present: false,
  resolution_note: null,
  resolution_reference: null,
  category: 'reconcile',
  urgency: 'due',
  phone_masked: '***399',
};

beforeEach(() => jest.clearAllMocks());

describe('adminGetMpesaAttemptReview', () => {
  it('calls the 0053 review RPC with no arguments and returns its rows', async () => {
    mockRpc.mockResolvedValue({ data: [ROW], error: null });
    const rows = await adminGetMpesaAttemptReview();
    expect(mockRpc).toHaveBeenCalledWith('admin_mpesa_attempt_review');
    expect(rows).toEqual([ROW]);
  });

  it('returns [] on error and on null data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Admin only' } });
    expect(await adminGetMpesaAttemptReview()).toEqual([]);
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await adminGetMpesaAttemptReview()).toEqual([]);
  });
});

describe('adminReviewAttemptDiscrepancy', () => {
  it('records an operator review of contradictory evidence through its own RPC, never a payment mutation', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const { adminReviewAttemptDiscrepancy } = await import('@/lib/mpesa-ops');
    const r = await adminReviewAttemptDiscrepancy('a1', 'Portal confirms original receipt; late callback was a duplicate notification');
    expect(r).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('review_attempt_discrepancy', {
      p_attempt_id: 'a1',
      p_review_note: 'Portal confirms original receipt; late callback was a duplicate notification',
    });
  });
  it('reports failure without throwing', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Admin only' } });
    const { adminReviewAttemptDiscrepancy } = await import('@/lib/mpesa-ops');
    expect((await adminReviewAttemptDiscrepancy('a1', 'x')).ok).toBe(false);
  });
});

describe('thresholds mirror the SQL single source of truth', () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '../../supabase/migrations/0053_mpesa_operational_review.sql'),
    'utf-8',
  );
  it('callback window and stale threshold equal the 0053 interval literals', () => {
    expect(MPESA_OPS_THRESHOLDS.callbackWindowMinutes).toBe(5);
    expect(MPESA_OPS_THRESHOLDS.staleAfterMinutes).toBe(60);
    expect(sql).toContain(`interval '${MPESA_OPS_THRESHOLDS.callbackWindowMinutes} minutes'`);
    expect(sql).toContain(`interval '${MPESA_OPS_THRESHOLDS.staleAfterMinutes} minutes'`);
  });
});

describe('labels', () => {
  it('has an operator label for every category and urgency the SQL can emit', () => {
    for (const c of ['waiting', 'ambiguous', 'reconcile', 'investigate', 'failed', 'no_collection', 'superseded', 'settled'] as const) {
      expect(REVIEW_CATEGORY_LABELS[c]).toEqual(expect.any(String));
    }
    for (const u of ['normal', 'watch', 'due', 'stale'] as const) {
      expect(REVIEW_URGENCY_LABELS[u]).toEqual(expect.any(String));
    }
  });
  it('never describes a blocking/ambiguous state as a safe failure', () => {
    expect(REVIEW_CATEGORY_LABELS.reconcile.toLowerCase()).not.toContain('failed');
    expect(REVIEW_CATEGORY_LABELS.ambiguous.toLowerCase()).not.toContain('failed');
  });
});

describe('noCollectionEvidenceIsSufficient', () => {
  it('accepts a note plus a provider reference', () => {
    expect(noCollectionEvidenceIsSufficient('Portal shows no transaction', 'CASE-123', false)).toBe(true);
  });
  it('accepts a note plus the explicit portal-verified declaration', () => {
    expect(noCollectionEvidenceIsSufficient('Checked business portal 11 Sep', '', true)).toBe(true);
  });
  it('rejects a note alone, and rejects an empty note even with a reference', () => {
    expect(noCollectionEvidenceIsSufficient('customer says nothing was taken', '', false)).toBe(false);
    expect(noCollectionEvidenceIsSufficient('   ', 'CASE-123', false)).toBe(false);
  });
});
