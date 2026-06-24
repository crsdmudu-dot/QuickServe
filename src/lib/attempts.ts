// attempts.ts — Supabase helpers for payment attempts + M-Pesa STK Push.
import { supabase } from '@/lib/supabase';
import { initiateStkPushMock, isValidKenyanPhone, normalizeKenyanPhone } from '@/lib/mpesa';

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
 * Customer: validate phone, run the mock STK Push, then create the attempt via RPC.
 *
 * Steps:
 *  1. Reject invalid phone numbers immediately — never calls Supabase.
 *  2. Normalize the phone to 12-digit international format (254XXXXXXXXX).
 *  3. Call the mock STK Push (pure, no network).
 *  4. Persist the attempt via the `initiate_payment_attempt` RPC.
 */
export async function initiateMpesaPayment(input: {
  paymentId: string;
  amount: number;
  phone: string;
  accountReference: string;
}): Promise<{ ok: boolean; error?: string }> {
  // Step 1: Validate phone before touching Supabase.
  if (!isValidKenyanPhone(input.phone)) {
    return { ok: false, error: 'Enter a valid M-Pesa phone number.' };
  }

  // Step 2: Normalize to 254XXXXXXXXX.
  const normalized = normalizeKenyanPhone(input.phone)!;

  // Step 3: Run the mock STK Push (pure, synchronous).
  const stk = initiateStkPushMock({
    phone: normalized,
    amount: input.amount,
    accountReference: input.accountReference,
  });

  // Step 4: Persist the attempt via RPC.
  const { error } = await supabase.rpc('initiate_payment_attempt', {
    p_payment_id: input.paymentId,
    p_provider: 'mpesa',
    p_phone: normalized,
    p_external_reference: stk.externalReference,
    p_raw_response: stk.raw,
  });

  if (error) return { ok: false, error: 'Could not start payment. Please try again.' };
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
