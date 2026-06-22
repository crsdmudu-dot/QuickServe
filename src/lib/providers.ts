// providers.ts — Supabase helpers for reading and approving service providers.
import { supabase } from '@/lib/supabase';

export type ProviderProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  approval_status: 'pending' | 'approved' | 'rejected';
};

// ── Queries ────────────────────────────────────────────────────────────────

/** Returns all provider profiles waiting for admin approval. */
export async function getPendingProviders(): Promise<ProviderProfile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, phone, approval_status')
    .eq('role', 'provider')
    .eq('approval_status', 'pending');
  return (data as ProviderProfile[] | null) ?? [];
}

/** Returns all approved provider profiles available for dispatch. */
export async function getApprovedProviders(): Promise<ProviderProfile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, phone, approval_status')
    .eq('role', 'provider')
    .eq('approval_status', 'approved');
  return (data as ProviderProfile[] | null) ?? [];
}

// ── Mutations ──────────────────────────────────────────────────────────────

/** Approves or rejects a provider account. */
export async function setProviderApproval(
  id: string,
  status: 'approved' | 'rejected',
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('profiles')
    .update({ approval_status: status })
    .eq('id', id);
  if (error) return { ok: false, error: 'Could not update provider. Please try again.' };
  return { ok: true };
}
