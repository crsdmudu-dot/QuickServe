// earnings-admin.ts — admin-only earnings, payout and deduction operations, split out of
// @/lib/earnings.
//
// Every function here either reads across providers or calls an admin-guarded ledger RPC.
// Provider-facing reads, the category/method constants and the validators stay shared.
import { supabase } from '@/lib/supabase';
import {
  rpcError,
  type DeductionCategory,
  type LedgerState,
  type MutationResult,
  type PayoutMethod,
  type ProviderEarning,
  type ProviderPayoutLedgerRow,
} from '@/lib/earnings';

/** Admin: the whole payout ledger (admin RLS sees all rows). */
export async function adminGetPayoutLedger(): Promise<ProviderPayoutLedgerRow[]> {
  const { data, error } = await supabase.from('provider_payout_ledger').select('*');
  if (error) return [];
  return (data as ProviderPayoutLedgerRow[] | null) ?? [];
}

/** Admin: payout ledger for one provider. */
export async function adminGetProviderPayoutLedger(
  providerId: string,
): Promise<ProviderPayoutLedgerRow[]> {
  const { data, error } = await supabase
    .from('provider_payout_ledger')
    .select('*')
    .eq('provider_id', providerId);
  if (error) return [];
  return (data as ProviderPayoutLedgerRow[] | null) ?? [];
}

/** Admin: all earnings for one provider, newest first. */
export async function adminGetProviderEarnings(providerId: string): Promise<ProviderEarning[]> {
  const { data, error } = await supabase
    .from('provider_earnings')
    .select('*')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as ProviderEarning[] | null) ?? [];
}

/** Admin: all provider earnings, newest first. */
export async function adminGetAllEarnings(): Promise<ProviderEarning[]> {
  const { data, error } = await supabase
    .from('provider_earnings')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as ProviderEarning[] | null) ?? [];
}

/** Admin: record a provider-borne deduction. */
export async function adminRecordProviderDeduction(input: {
  earningId: string;
  amount: number;
  category: DeductionCategory;
  reason: string;
}): Promise<MutationResult<LedgerState & { deduction_id: string }>> {
  const { data, error } = await supabase.rpc('record_provider_deduction', {
    p_earning_id: input.earningId,
    p_amount: input.amount,
    p_category: input.category,
    p_reason: input.reason.trim(),
  });
  if (error) return { ok: false, error: rpcError(error.message, 'Could not record deduction.') };
  return { ok: true, data: data as LedgerState & { deduction_id: string } };
}

/** Admin: fully reverse one unreversed deduction. Partial reversal does not exist. */
export async function adminReverseProviderDeduction(input: {
  deductionId: string;
  reason: string;
}): Promise<MutationResult<LedgerState & { reversal_id: string }>> {
  const { data, error } = await supabase.rpc('reverse_provider_deduction', {
    p_deduction_id: input.deductionId,
    p_reason: input.reason.trim(),
  });
  if (error) return { ok: false, error: rpcError(error.message, 'Could not reverse deduction.') };
  return { ok: true, data: data as LedgerState & { reversal_id: string } };
}

/** Admin: RECORD a payout that has already been transferred externally.
 *  This performs no transfer. `idempotencyKey` must be stable across retries of one submission. */
export async function adminRecordProviderPayout(input: {
  earningId: string;
  amount: number;
  method: PayoutMethod;
  reference: string | null;
  note: string | null;
  idempotencyKey: string;
  paidAt: string;
}): Promise<MutationResult<LedgerState & { payout_id: string; idempotent_replay: boolean }>> {
  const { data, error } = await supabase.rpc('record_provider_payout', {
    p_earning_id: input.earningId,
    p_amount: input.amount,
    p_method: input.method,
    p_reference: input.reference,
    p_note: input.note,
    p_idempotency_key: input.idempotencyKey,
    p_paid_at: input.paidAt,
  });
  if (error) {
    // Do NOT retry with a new key here. An ambiguous failure may mean the row was written; a new
    // key would create a second disbursement record for the same money.
    return { ok: false, error: rpcError(error.message, 'Could not record payout.') };
  }
  return {
    ok: true,
    data: data as LedgerState & { payout_id: string; idempotent_replay: boolean },
  };
}
