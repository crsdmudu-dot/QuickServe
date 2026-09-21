// wallet-admin.ts — admin-only wallet reads and adjustments, split out of @/lib/wallet.
//
// These call admin-guarded RPCs / cross-customer reads, so they belong with the admin
// application. Customer wallet functions, the transaction-type map and amountDue() remain shared.
import { supabase } from '@/lib/supabase';
import { EMPTY_WALLET, type Wallet, type WalletTransaction, type WalletTxnType } from '@/lib/wallet';

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
 * Returns an empty array on error. Pass page + pageSize for pagination.
 */
export async function adminGetWalletTransactions(
  customerId: string,
  page?: number,
  pageSize?: number,
): Promise<WalletTransaction[]> {
  let q = supabase
    .from('wallet_transactions')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (page != null && pageSize != null) q = q.range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, error } = await q;
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
