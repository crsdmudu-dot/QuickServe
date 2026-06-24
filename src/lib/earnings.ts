// earnings.ts — Supabase helpers for reading and managing provider earnings.
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

export type PayoutStatus = 'pending' | 'paid';

export type ProviderEarning = {
  id: string;
  provider_id: string;
  booking_id: string;
  amount: number;
  payout_status: PayoutStatus;
  created_at: string;
};

export type EarningsSummary = { pending: number; paid: number };

// ── Queries ────────────────────────────────────────────────────────────────

/** Provider: returns the signed-in provider's own earnings, newest first (RLS limits to caller's rows). */
export async function getMyEarnings(): Promise<ProviderEarning[]> {
  const { data, error } = await supabase
    .from('provider_earnings')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as ProviderEarning[] | null) ?? [];
}

/** Provider: returns a summary of own earnings, grouped by payout status. */
export async function getProviderEarningsSummary(): Promise<EarningsSummary> {
  const rows = await getMyEarnings();
  return rows.reduce(
    (acc, row) => {
      if (row.payout_status === 'pending') acc.pending += row.amount;
      else if (row.payout_status === 'paid') acc.paid += row.amount;
      return acc;
    },
    { pending: 0, paid: 0 },
  );
}

/** Admin: returns all earnings for one provider, newest first (admin RLS sees all rows). */
export async function adminGetProviderEarnings(providerId: string): Promise<ProviderEarning[]> {
  const { data, error } = await supabase
    .from('provider_earnings')
    .select('*')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as ProviderEarning[] | null) ?? [];
}

// ── Mutations ──────────────────────────────────────────────────────────────

/** Admin: mark a provider earning as paid out via the mark_payout_paid RPC. */
export async function adminMarkPayoutPaid(
  earningId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('mark_payout_paid', { p_earning_id: earningId });
  if (error) return { ok: false, error: 'Could not update payout. Please try again.' };
  return { ok: true };
}
