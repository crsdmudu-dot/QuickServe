// payments.ts — Supabase helpers for reading and managing payments.
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'cancelled';

export type Payment = {
  id: string;
  booking_id: string;
  customer_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider_share: number;
  quickserve_share: number;
  payment_method: 'mpesa' | 'card' | 'cash' | null;
  paid_at: string | null;
  created_at: string;
};

// ── Queries ────────────────────────────────────────────────────────────────

/** Customer: returns the signed-in customer's own payments, newest first. */
export async function getMyPayments(): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as Payment[] | null) ?? [];
}

/** Customer: returns the payment for one booking, or null if none exists. */
export async function getPaymentForBooking(bookingId: string): Promise<Payment | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (error) return null;
  return data ?? null;
}

// ── Mutations ──────────────────────────────────────────────────────────────

/** Admin: returns all payments, newest first. */
export async function adminGetAllPayments(): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as Payment[] | null) ?? [];
}

/** Admin: override a payment's status via the override_payment_status RPC. */
export async function adminOverridePaymentStatus(
  paymentId: string,
  status: PaymentStatus,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('override_payment_status', {
    p_payment_id: paymentId,
    p_status: status,
  });
  if (error)
    return { ok: false, error: 'Could not update payment status. Please try again.' };
  return { ok: true };
}
