// providers.ts — Supabase helpers for reading and approving service providers.
import { supabase } from '@/lib/supabase';

export type ProviderProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  approval_status: 'pending' | 'approved' | 'rejected';
  profile_photo_url: string | null;
  bio: string | null;
  years_experience: number | null;
  skills: string[] | null;
  is_verified: boolean;
  completed_jobs_count: number;
  average_rating: number | null;
  availability_status: 'available' | 'unavailable';
};

/** Fields a provider can edit on their own profile. */
export type EditableProviderFields = {
  profile_photo_url?: string;
  bio?: string;
  years_experience?: number;
  skills?: string[];
  availability_status?: 'available' | 'unavailable';
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

/** Returns a single provider profile by id, or null if not found. */
export async function getProviderProfile(id: string): Promise<ProviderProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data ?? null;
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

/** Updates the signed-in provider's own editable fields. */
export async function updateMyProviderProfile(
  fields: EditableProviderFields,
): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: 'You must be signed in.' };
  const { error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', data.user.id);
  if (error) return { ok: false, error: 'Could not update profile. Please try again.' };
  return { ok: true };
}

/** Admin: update any provider's profile including privileged fields like is_verified. */
export async function adminUpdateProviderProfile(
  id: string,
  fields: Partial<ProviderProfile>,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', id);
  if (error) return { ok: false, error: 'Could not update provider profile. Please try again.' };
  return { ok: true };
}
