// attempts.ts — Supabase helpers for payment attempts + M-Pesa STK Push.
import { supabase } from '@/lib/supabase';
import { isValidKenyanPhone, normalizeKenyanPhone } from '@/lib/mpesa';

// ── Types ──────────────────────────────────────────────────────────────────

export type AttemptStatus =
  | 'initiated'
  | 'pending'
  | 'successful'
  | 'failed'
  | 'cancelled'
  // Phase 4D.2: a stale pending M-Pesa attempt with no callback, aged past the
  // reconciliation window (see migration 0036 reconcile_stale_payment_attempts).
  | 'timed_out';
export type PaymentMethod = 'mpesa' | 'card' | 'cash';

export type PaymentAttempt = {
  id: string;
  payment_id: string;
  provider: PaymentMethod;
  phone: string | null;
  amount: number;
  status: AttemptStatus;
  external_reference: string | null;
  raw_response: unknown | null;
  created_at: string;
  merchant_request_id: string | null;
  checkout_request_id: string | null;
  result_code: number | null;
  result_desc: string | null;
  callback_received_at: string | null;
  // Settlement evidence added by migration 0045. Optional so rows selected before 0045 is
  // applied still type-check. settlement_reference is the provider's actual transaction
  // identity (M-Pesa MpesaReceiptNumber); external_reference above remains the REQUEST id.
  settlement_reference?: string | null;
  collected_amount?: number | null;
  resolution_note?: string | null;
  resolution_reference?: string | null;
  resolved_at?: string | null;
};

// ── Customer Mutations ─────────────────────────────────────────────────────

/**
 * Customer: validate phone then invoke the `mpesa-stk-push` Edge Function.
 *
 * Steps:
 *  1. Reject invalid phone numbers immediately — never calls any network.
 *  2. Normalize the phone to 12-digit international format (254XXXXXXXXX).
 *  3. Invoke the backend `mpesa-stk-push` Edge Function, which holds Daraja
 *     credentials and MPESA_MODE server-side. The client is mode-agnostic.
 *
 * Note: `amount` and `accountReference` are kept in the signature so the
 * caller in `booking/[id].tsx` is untouched; the server derives them from
 * the payment and booking records.
 */
export async function initiateMpesaPayment(input: {
  paymentId: string;
  amount: number;
  phone: string;
  accountReference: string;
}): Promise<{ ok: boolean; error?: string }> {
  // 1. Validate phone before any network call.
  if (!isValidKenyanPhone(input.phone)) {
    return { ok: false, error: 'Enter a valid M-Pesa phone number.' };
  }
  // 2. Normalize to 254XXXXXXXXX.
  const normalized = normalizeKenyanPhone(input.phone)!;
  // 3. Invoke the backend Edge Function (holds Daraja creds + MPESA_MODE; never the app).
  const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
    body: { payment_id: input.paymentId, phone: normalized },
  });
  if (error) return { ok: false, error: 'Could not start payment. Please try again.' };
  if (!data?.ok) {
    return {
      ok: false,
      error: typeof data?.error === 'string' ? data.error : 'Could not start payment. Please try again.',
    };
  }
  return { ok: true };
}

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * Customer (own) or admin: returns all attempts for one payment, newest first.
 * RLS on the table scopes rows to the signed-in user.
 */
export async function getPaymentAttempts(paymentId: string): Promise<PaymentAttempt[]> {
  const { data, error } = await supabase
    .from('payment_attempts')
    .select('*')
    .eq('payment_id', paymentId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as PaymentAttempt[] | null) ?? [];
}

/** Admin: returns all attempts across every payment, newest first. */
export async function adminGetPaymentAttempts(): Promise<PaymentAttempt[]> {
  const { data, error } = await supabase
    .from('payment_attempts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as PaymentAttempt[] | null) ?? [];
}

// ── Admin Mutations ────────────────────────────────────────────────────────

/**
 * Admin: confirm that this attempt WAS collected externally (migration 0045).
 *
 * The old one-argument RPC was dropped because it settled a payment with no evidence at all:
 * it never read the attempt amount, the wallet/promo split, or any provider reference. The
 * backend now requires the collected amount to equal BOTH the attempt amount and the payment's
 * current external due, plus a note and — for non-cash providers — the provider's transaction
 * reference, which becomes the authoritative settlement identity.
 *
 * The server is the authority for all of that. The checks here only stop obviously incomplete
 * submissions from making a pointless round trip.
 */
export async function adminConfirmAttempt(
  attemptId: string,
  collectedAmount: number,
  confirmationNote: string,
  confirmationReference: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('confirm_payment_attempt', {
    p_attempt_id: attemptId,
    p_collected_amount: collectedAmount,
    p_confirmation_note: confirmationNote,
    p_confirmation_reference: confirmationReference,
  });
  if (error) return { ok: false, error: 'Could not confirm payment. Please try again.' };
  return { ok: true };
}

/**
 * Admin: record that this attempt did NOT collect (migration 0045).
 *
 * Replaces the evidence-free `cancel_payment_attempt`. Moving an attempt out of a blocking
 * state asserts that the provider was checked and no money moved — a financially material
 * claim — so a note is mandatory and the actor and timestamp are recorded server-side. It never
 * writes a settlement reference.
 */
export async function adminReconcileAttemptNoCollection(
  attemptId: string,
  reconciliationNote: string,
  providerReference: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('reconcile_payment_attempt_no_collection', {
    p_attempt_id: attemptId,
    p_reconciliation_note: reconciliationNote,
    p_provider_reference: providerReference,
  });
  if (error) return { ok: false, error: 'Could not reconcile attempt. Please try again.' };
  return { ok: true };
}
