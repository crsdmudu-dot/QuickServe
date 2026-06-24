// attempts.ts — Supabase helpers for payment attempts + M-Pesa STK Push.
import { supabase } from '@/lib/supabase';
import { isValidKenyanPhone, normalizeKenyanPhone } from '@/lib/mpesa';

// ── Types ──────────────────────────────────────────────────────────────────

export type AttemptStatus = 'initiated' | 'pending' | 'successful' | 'failed' | 'cancelled';
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
 * Admin: confirm an attempt.
 * Calls `confirm_payment_attempt` RPC which flips the parent payment to paid.
 */
export async function adminConfirmAttempt(
  attemptId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('confirm_payment_attempt', {
    p_attempt_id: attemptId,
  });
  if (error) return { ok: false, error: 'Could not confirm payment. Please try again.' };
  return { ok: true };
}

/**
 * Admin: cancel an attempt.
 * Calls `cancel_payment_attempt` RPC which marks the attempt as cancelled.
 */
export async function adminCancelAttempt(
  attemptId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('cancel_payment_attempt', {
    p_attempt_id: attemptId,
  });
  if (error) return { ok: false, error: 'Could not cancel attempt. Please try again.' };
  return { ok: true };
}
