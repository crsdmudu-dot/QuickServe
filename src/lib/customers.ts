// customers.ts — Supabase helpers for reading customer profiles (admin use).
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

export type CustomerProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
};

// ── Queries ────────────────────────────────────────────────────────────────

/** Admin: all customer profiles, newest first (admin RLS permits; profiles_select_admin). */
export async function adminGetAllCustomers(): Promise<CustomerProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, created_at')
    .eq('role', 'customer')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as CustomerProfile[] | null) ?? [];
}
