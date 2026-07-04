// wallet.ts — Supabase helpers for customer wallets, transactions, and admin adjustments.
import { supabase } from '@/lib/supabase';
import type { Payment } from '@/lib/payments';

// ── Types ──────────────────────────────────────────────────────────────────

/** The allowed transaction types recorded in the wallet ledger. */
export type WalletTxnType =
  | 'admin_credit'
  | 'admin_debit'
  | 'refund_credit'
  | 'promo_credit'
  | 'referral_credit'
  | 'gift_credit'
  | 'payment_applied'
  | 'adjustment';

/** A row from the wallets table — one per customer. */
export type Wallet = {
  id: string;
  customer_id: string;
  balance: number;
  currency: string;
  created_at: string;
  updated_at: string;
};

/** A row from the wallet_transactions table — immutable ledger entries. */
export type WalletTransaction = {
  id: string;
  wallet_id: string;
  customer_id: string;
  type: WalletTxnType;
  amount: number;
  balance_after: number;
  booking_id: string | null;
  payment_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * Display metadata for every wallet transaction type.
 * `payment_applied` and `admin_debit` are debits; all others are credits.
 */
export const WALLET_TXN_TYPES: Record<
  WalletTxnType,
  { label: string; direction: 'credit' | 'debit' }
> = {
  admin_credit:    { label: 'Admin credit',       direction: 'credit' },
  admin_debit:     { label: 'Admin debit',         direction: 'debit'  },
  refund_credit:   { label: 'Refund',              direction: 'credit' },
  promo_credit:    { label: 'Promo credit',        direction: 'credit' },
  referral_credit: { label: 'Referral reward',     direction: 'credit' },
  gift_credit:     { label: 'Gift credit',         direction: 'credit' },
  payment_applied: { label: 'Applied to booking',  direction: 'debit'  },
  adjustment:      { label: 'Adjustment',          direction: 'credit' }, // display colors by amount sign
};

// ── Internal default ───────────────────────────────────────────────────────

/** Returned when the signed-in customer has no wallet row yet (lazy-created on first use). */
const EMPTY_WALLET: Wallet = {
  id: '',
  customer_id: '',
  balance: 0,
  currency: 'KES',
  created_at: '',
  updated_at: '',
};

// ── Customer helpers ───────────────────────────────────────────────────────

/**
 * Returns the signed-in customer's wallet row.
 * Falls back to a default EMPTY_WALLET (balance 0) when no row exists yet
 * or on error — the wallet is lazy-created on first RPC use.
 */
export async function getMyWallet(): Promise<Wallet> {
  const { data, error } = await supabase.from('wallets').select('*').maybeSingle();
  if (error || !data) return { ...EMPTY_WALLET };
  return data as Wallet;
}

/**
 * Returns the signed-in customer's wallet transactions, newest first.
 * Returns an empty array on error.
 */
export async function getMyWalletTransactions(): Promise<WalletTransaction[]> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as WalletTransaction[] | null) ?? [];
}

/**
 * Applies wallet credit to a pending payment.
 * Calls the `apply_wallet_to_payment` RPC.
 * Returns `{ ok: true }` on success; `{ ok: false, error }` on failure.
 */
export async function applyWalletToPayment(
  paymentId: string,
  amount: number,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('apply_wallet_to_payment', {
    p_payment_id: paymentId,
    p_amount: amount,
  });
  if (error) return { ok: false, error: 'Could not apply wallet credit. Please try again.' };
  return { ok: true };
}

// ── Admin helpers ──────────────────────────────────────────────────────────

/**
 * Admin: returns the wallet for a specific customer.
 * Falls back to EMPTY_WALLET on error or when no row exists.
 */
export async function adminGetWallet(customerId: string): Promise<Wallet> {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('customer_id', customerId)
    .maybeSingle();
  if (error || !data) return { ...EMPTY_WALLET };
  return data as Wallet;
}

/**
 * Admin: returns a customer's wallet transactions, newest first.
 * Returns an empty array on error.
 */
export async function adminGetWalletTransactions(
  customerId: string,
): Promise<WalletTransaction[]> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as WalletTransaction[] | null) ?? [];
}

/**
 * Admin: manually credits or debits a customer's wallet via the `admin_wallet_adjust` RPC.
 * Pass a SIGNED `amount` — positive for credits, negative for debits.
 * Returns `{ ok: true }` on success; `{ ok: false, error }` on failure.
 */
export async function adminAdjustWallet(
  customerId: string,
  type: WalletTxnType,
  amount: number,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('admin_wallet_adjust', {
    p_customer_id: customerId,
    p_type: type,
    p_amount: amount,
    p_note: note,
  });
  if (error) return { ok: false, error: 'Could not adjust wallet. Please try again.' };
  return { ok: true };
}

// ── Payment helper ─────────────────────────────────────────────────────────

/**
 * Returns the remaining amount due on a payment after wallet credit is applied.
 * `wallet_applied` defaults to 0 when absent (backward-compatible with old Payment rows).
 */
export function amountDue(p: Pick<Payment, 'amount' | 'wallet_applied'>): number {
  return p.amount - (p.wallet_applied ?? 0);
}
