// earnings.ts — Provider entitlement, deductions, and payout ledger (Provider Payout V1).
//
// MONEY FLOW: customer -> KwikServe/platform -> provider. Customer collection and provider payout
// are separate financial events. provider_earnings.amount is the provider's ENTITLEMENT and is
// already post-platform-split (payments enforces provider_share + quickserve_share = amount), so
// platform commission is never subtracted again here. Customer wallet credit and customer promo
// discount are customer-side instruments and never reduce provider entitlement.
//
// AUTHORITATIVE FIGURES COME FROM THE DATABASE. `provider_payout_ledger` is a security_invoker
// view that computes entitlement, deductions, net payable, disbursed and outstanding over the
// RLS-protected tables. This module does NOT recompute those figures in TypeScript — a second
// implementation of financial arithmetic is exactly what we are avoiding. The only client-side
// arithmetic below is input validation, and the database repeats every one of those checks.
//
// RECORDING, NOT PAYING. recordProviderPayout records that an admin ALREADY transferred money to
// a provider externally (M-Pesa, bank, cash). Nothing here initiates a transfer: there is no B2C,
// no bank API, no payout Edge Function.
//
// IMMUTABILITY. Deductions and payouts are append-only. A wrong deduction is corrected by a full
// reversal plus a fresh deduction; more money owed is a further payout. There is no edit or
// delete path for either, by design.
import { supabase } from '@/lib/supabase';
import { newIdempotencyKey } from '@/lib/idempotency';

// ── Types ──────────────────────────────────────────────────────────────────

/** Stored projection on provider_earnings, maintained only by the payout RPCs.
 *  `pending` also covers a fully-deducted earning with nothing left to pay — the amounts, not
 *  the status, are authoritative for the zero-liability condition. */
export type PayoutStatus = 'pending' | 'partially_paid' | 'paid';

/** Closed list from 0041. Deliberately excludes commission, platform fee, wallet, promo and any
 *  customer discount — none of those may ever be booked against a provider. */
export type DeductionCategory =
  | 'service_issue'
  | 'damage_or_loss'
  | 'cancellation_or_no_show'
  | 'other_authorized';

export const DEDUCTION_CATEGORIES: { value: DeductionCategory; label: string }[] = [
  { value: 'service_issue', label: 'Service issue' },
  { value: 'damage_or_loss', label: 'Damage or loss' },
  { value: 'cancellation_or_no_show', label: 'Cancellation or no-show' },
  { value: 'other_authorized', label: 'Other (authorized)' },
];

export type PayoutMethod = 'mpesa_manual' | 'bank_transfer' | 'cash' | 'other';

/** `evidence` mirrors provider_payouts_evidence_check: electronic methods always produce a
 *  transaction reference; cash and other must name the mechanism in a note instead. */
export const PAYOUT_METHODS: {
  value: PayoutMethod;
  label: string;
  evidence: 'reference' | 'note';
}[] = [
  { value: 'mpesa_manual', label: 'M-Pesa (manual)', evidence: 'reference' },
  { value: 'bank_transfer', label: 'Bank transfer', evidence: 'reference' },
  { value: 'cash', label: 'Cash', evidence: 'note' },
  { value: 'other', label: 'Other', evidence: 'note' },
];

export function evidenceFieldFor(method: PayoutMethod): 'reference' | 'note' {
  return PAYOUT_METHODS.find((m) => m.value === method)?.evidence ?? 'note';
}

export type ProviderEarning = {
  id: string;
  provider_id: string;
  booking_id: string;
  /** Provider entitlement (already post-platform-split). Never call this a "payout". */
  amount: number;
  payout_status: PayoutStatus;
  created_at: string;
};

/** One row of public.provider_payout_ledger. Field names mirror the view exactly. */
export type ProviderPayoutLedgerRow = {
  earning_id: string;
  booking_id: string;
  provider_id: string;
  provider_entitlement: number;
  deductions_total: number;
  net_provider_payable: number;
  amount_disbursed: number;
  outstanding_provider_liability: number;
  stored_payout_status: PayoutStatus;
  derived_payout_status: PayoutStatus;
};

export type ProviderEarningDeduction = {
  id: string;
  earning_id: string;
  amount: number;
  category: DeductionCategory;
  reason: string;
  /** Null on an original deduction; set on a reversal, pointing at the deduction it reverses. */
  reversal_of: string | null;
  created_by: string;
  created_at: string;
};

export type ProviderPayout = {
  id: string;
  earning_id: string;
  provider_id: string;
  amount: number;
  method: PayoutMethod;
  reference: string | null;
  note: string | null;
  paid_at: string;
  recorded_by: string;
  created_at: string;
};

export type EarningsSummary = {
  entitlement: number;
  deductions: number;
  net_payable: number;
  disbursed: number;
  outstanding: number;
};

// ── Queries ────────────────────────────────────────────────────────────────

/** Provider: own earnings, newest first (RLS limits to caller's rows). */
export async function getMyEarnings(): Promise<ProviderEarning[]> {
  const { data, error } = await supabase
    .from('provider_earnings')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as ProviderEarning[] | null) ?? [];
}

/** Provider: own payout ledger (RLS-scoped by the security_invoker view). */
export async function getMyPayoutLedger(): Promise<ProviderPayoutLedgerRow[]> {
  const { data, error } = await supabase.from('provider_payout_ledger').select('*');
  if (error) return [];
  return (data as ProviderPayoutLedgerRow[] | null) ?? [];
}

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

/** Deductions and their reversals for one earning, oldest first so the audit trail reads in order.
 *  Readable by the owning provider and by admin (RLS). */
export async function getEarningDeductions(
  earningId: string,
): Promise<ProviderEarningDeduction[]> {
  const { data, error } = await supabase
    .from('provider_earning_deductions')
    .select('*')
    .eq('earning_id', earningId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data as ProviderEarningDeduction[] | null) ?? [];
}

/** Recorded disbursements for one earning, newest first. Provider-visible evidence. */
export async function getEarningPayouts(earningId: string): Promise<ProviderPayout[]> {
  const { data, error } = await supabase
    .from('provider_payouts')
    .select('*')
    .eq('earning_id', earningId)
    .order('paid_at', { ascending: false });
  if (error) return [];
  return (data as ProviderPayout[] | null) ?? [];
}

/** True when this deduction has already been reversed by another row in the same list. */
export function isDeductionReversed(
  deduction: ProviderEarningDeduction,
  all: ProviderEarningDeduction[],
): boolean {
  return all.some((d) => d.reversal_of === deduction.id);
}

/** Provider: totals across own earnings, summed from the ledger view (never recomputed here). */
export async function getProviderEarningsSummary(): Promise<EarningsSummary> {
  const rows = await getMyPayoutLedger();
  return rows.reduce<EarningsSummary>(
    (acc, r) => ({
      entitlement: acc.entitlement + r.provider_entitlement,
      deductions: acc.deductions + r.deductions_total,
      net_payable: acc.net_payable + r.net_provider_payable,
      disbursed: acc.disbursed + r.amount_disbursed,
      outstanding: acc.outstanding + r.outstanding_provider_liability,
    }),
    { entitlement: 0, deductions: 0, net_payable: 0, disbursed: 0, outstanding: 0 },
  );
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

// ── Client-side validation (the database repeats every one of these) ───────

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateDeductionInput(input: {
  amount: number;
  category: string;
  reason: string;
  entitlement: number;
  deductionsTotal: number;
  amountDisbursed: number;
}): ValidationResult {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'Amount must be greater than zero.' };
  }
  if (!DEDUCTION_CATEGORIES.some((c) => c.value === input.category)) {
    return { ok: false, error: 'Choose a deduction category.' };
  }
  if (input.reason.trim() === '') {
    return { ok: false, error: 'A written reason is required.' };
  }
  const newDeductions = input.deductionsTotal + input.amount;
  if (newDeductions > input.entitlement) {
    return { ok: false, error: 'Deductions would exceed the provider entitlement.' };
  }
  if (input.entitlement - newDeductions < input.amountDisbursed) {
    return { ok: false, error: 'Deduction would fall below the amount already paid out.' };
  }
  return { ok: true };
}

export function validatePayoutInput(input: {
  amount: number;
  method: string;
  reference: string;
  note: string;
  outstanding: number;
}): ValidationResult {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'Amount must be greater than zero.' };
  }
  if (!PAYOUT_METHODS.some((m) => m.value === input.method)) {
    return { ok: false, error: 'Choose a payout method.' };
  }
  if (input.outstanding <= 0) {
    return { ok: false, error: 'Nothing is outstanding for this earning.' };
  }
  if (input.amount > input.outstanding) {
    return { ok: false, error: 'Amount exceeds the outstanding provider liability.' };
  }
  const needs = evidenceFieldFor(input.method as PayoutMethod);
  if (needs === 'reference' && input.reference.trim() === '') {
    return { ok: false, error: 'A transaction reference is required for this method.' };
  }
  if (needs === 'note' && input.note.trim() === '') {
    return { ok: false, error: 'A note describing the payment is required for this method.' };
  }
  return { ok: true };
}

// ── Mutations — admin only. The RPCs re-check is_admin() server-side. ──────

/** Fresh idempotency key for ONE payout submission attempt.
 *  Generate once when the form opens; reuse it for every retry of that same submission so a
 *  timeout cannot produce a second disbursement record. Only a new, distinct payout gets a new
 *  key — see resetPayoutIdempotencyKey. */
export function newPayoutIdempotencyKey(): string {
  return newIdempotencyKey();
}

export type LedgerState = {
  earning_id: string;
  provider_entitlement: number;
  deductions_total: number;
  net_provider_payable: number;
  amount_disbursed: number;
  outstanding_provider_liability: number;
  derived_payout_status: PayoutStatus;
};

export type MutationResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Surface the server's message when it is a deliberate financial refusal (they are written for
 *  operators), and fall back to a generic message otherwise. Never claim a transfer was undone. */
function rpcError(message: string | undefined, fallback: string): string {
  return message && message.trim() !== '' ? message : fallback;
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
