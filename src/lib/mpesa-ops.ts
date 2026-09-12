/**
 * mpesa-ops.ts — operational review client for M-PESA payment attempts (migration 0053).
 *
 * The state classification (category, urgency, blocks_retry, needs_operator) is derived in SQL
 * by admin_mpesa_attempt_review() from the existing attempt/payment columns. This module never
 * re-implements that logic: it wraps the RPC, mirrors the two thresholds for display copy, maps
 * categories to operator labels, and enforces the UI-side evidence rule for "no collection".
 *
 * The only money-affecting actions remain the two protected 0045 RPCs in ./attempts.ts.
 */
import { supabase } from '@/lib/supabase';

/** Mirror of 0053 mpesa_ops_callback_window() / mpesa_ops_stale_after(). A test asserts equality. */
export const MPESA_OPS_THRESHOLDS = {
  callbackWindowMinutes: 5,
  staleAfterMinutes: 60,
} as const;

export type ReviewCategory =
  | 'waiting'
  | 'ambiguous'
  | 'reconcile'
  | 'investigate'
  | 'failed'
  | 'no_collection'
  | 'superseded'
  | 'settled';

export type ReviewUrgency = 'normal' | 'watch' | 'due' | 'stale';

export type MpesaAttemptReviewRow = {
  attempt_id: string;
  payment_id: string;
  booking_id: string;
  status: 'initiated' | 'pending' | 'successful' | 'failed' | 'cancelled' | 'timed_out';
  amount: number;
  created_at: string;
  age_seconds: number;
  callback_received_at: string | null;
  result_code: number | null;
  result_desc: string | null;
  checkout_request_id: string | null;
  merchant_request_id: string | null;
  has_collected_amount: boolean;
  has_settlement_reference: boolean;
  discrepancy_count: number;
  latest_discrepancy_type: string | null;
  /** true while more discrepancy entries exist than an operator has reviewed — on ANY status. */
  discrepancy_unresolved: boolean;
  discrepancy_reviewed_at: string | null;
  payment_status: string;
  blocks_retry: boolean;
  needs_operator: boolean;
  resolved_at: string | null;
  resolved_by_present: boolean;
  resolution_note: string | null;
  resolution_reference: string | null;
  category: ReviewCategory;
  urgency: ReviewUrgency;
  /** '***' + last three digits, or null. The raw MSISDN is never returned. */
  phone_masked: string | null;
};

export const REVIEW_CATEGORY_LABELS: Record<ReviewCategory, string> = {
  waiting: 'Waiting for callback',
  ambiguous: 'Ambiguous — monitor',
  reconcile: 'Reconciliation required',
  investigate: 'Investigate discrepancy',
  failed: 'Provider reported failure',
  no_collection: 'Resolved: no collection',
  superseded: 'Superseded by settled attempt',
  settled: 'Settled',
};

export const REVIEW_URGENCY_LABELS: Record<ReviewUrgency, string> = {
  normal: 'Normal',
  watch: 'Past callback window',
  due: 'Action due',
  stale: 'Stale (over 1 hour)',
};

/** Admin: the operational review rows, most urgent first. Returns [] on any error. */
export async function adminGetMpesaAttemptReview(): Promise<MpesaAttemptReviewRow[]> {
  const { data, error } = await supabase.rpc('admin_mpesa_attempt_review');
  if (error) return [];
  return (data as MpesaAttemptReviewRow[] | null) ?? [];
}

/**
 * Admin: acknowledge contradictory evidence on an attempt (0053 review_attempt_discrepancy).
 * Records reviewer, time, note and how many discrepancy entries were examined. Never changes the
 * attempt or payment status and never moves money; a later discrepancy re-opens the attempt.
 */
export async function adminReviewAttemptDiscrepancy(
  attemptId: string,
  reviewNote: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('review_attempt_discrepancy', {
    p_attempt_id: attemptId,
    p_review_note: reviewNote,
  });
  if (error) return { ok: false, error: 'Could not record the review. Please try again.' };
  return { ok: true };
}

/**
 * Runbook rule for reconcile_payment_attempt_no_collection. Since 0053 the RPC itself enforces
 * this (p_evidence_source is mandatory and persisted); the client check only avoids a pointless
 * round trip. Before 0053 the RPC required a note only,
 * but an operator must also hold conclusive evidence that no money moved — a provider
 * enquiry/case reference, or an explicit declaration that the Safaricom business portal shows
 * no transaction for this request. Customer assertion alone is never sufficient.
 */
export function noCollectionEvidenceIsSufficient(
  note: string,
  reference: string,
  portalChecked: boolean,
): boolean {
  if (!note.trim()) return false;
  return reference.trim().length > 0 || portalChecked;
}

// ── Unmatched (orphan) callback evidence — migration 0054 ────────────────────

export type MpesaCallbackEventRow = {
  event_id: string;
  classification:
    | 'unknown_checkout_request_id'
    | 'missing_checkout_request_id'
    | 'malformed_authenticated_callback';
  first_seen_at: string;
  last_seen_at: string;
  age_seconds: number;
  seen_count: number;
  merchant_request_id: string | null;
  checkout_request_id: string | null;
  result_code: number | null;
  result_desc: string | null;
  amount: number | null;
  receipt: string | null;
  transaction_date: string | null;
  /** '***' + last three digits, or null. The MSISDN is never stored or returned. */
  phone_masked: string | null;
  /** Exact CheckoutRequestID match evaluated at read time — never phone or amount. */
  matched_attempt_id: string | null;
  matched_attempt_status: string | null;
  matched_payment_id: string | null;
  /** 'high' when an unmatched ResultCode 0 carries an amount or receipt: money may have moved. */
  urgency: 'high' | 'normal';
  needs_review: boolean;
  reviewed_at: string | null;
  reviewed_by_present: boolean;
  review_note: string | null;
};

export const CALLBACK_EVENT_LABELS: Record<MpesaCallbackEventRow['classification'], string> = {
  unknown_checkout_request_id: 'Unknown CheckoutRequestID',
  missing_checkout_request_id: 'No CheckoutRequestID in callback',
  malformed_authenticated_callback: 'Malformed authenticated callback',
};

/** Admin: authenticated callbacks that matched no attempt, unreviewed and high-urgency first. */
export async function adminGetMpesaCallbackEvents(): Promise<MpesaCallbackEventRow[]> {
  const { data, error } = await supabase.rpc('admin_mpesa_callback_events');
  if (error) return [];
  return (data as MpesaCallbackEventRow[] | null) ?? [];
}

/**
 * Admin: record that orphan evidence was reviewed (who/when/why). Evidence is never deleted and
 * no payment, attempt or settlement state changes. A new conflicting callback is a new row and
 * re-raises attention on its own.
 */
export async function adminReviewMpesaCallbackEvent(
  eventId: string,
  reviewNote: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('review_mpesa_callback_event', {
    p_event_id: eventId,
    p_review_note: reviewNote,
  });
  if (error) return { ok: false, error: 'Could not record the review. Please try again.' };
  return { ok: true };
}

/** Human-readable age, e.g. "40 sec", "25 min", "3 h 10 min". */
export function formatAge(ageSeconds: number): string {
  if (ageSeconds < 60) return `${ageSeconds} sec`;
  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}
