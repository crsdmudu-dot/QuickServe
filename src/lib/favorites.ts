// favorites.ts — Supabase helpers for customer favorite providers.
// customer_id is ALWAYS taken from auth (never from callers).
// Reads rely on RLS (no manual customer_id filter).
// Mutations return { ok: boolean; error?: string }.
// Reads return [] on error.
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * The 10 curated public fields returned by the list_public_providers and
 * get_my_favorite_providers RPCs. No PII is exposed — the RPC is SECURITY DEFINER
 * and strips sensitive columns (email, phone, etc.) server-side.
 */
export type PublicProvider = {
  provider_id: string;
  full_name: string | null;
  average_rating: number | null;
  review_count: number;
  completed_jobs_count: number;
  is_verified: boolean;
  years_experience: number | null;
  /** 'available' | 'busy' | 'offline' (or similar DB enum value) */
  availability_status: string;
  profile_photo_url: string | null;
  created_at: string;
};

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * Returns the signed-in customer's favorited providers (10 curated fields each).
 * Calls the get_my_favorite_providers RPC which is RLS-scoped to the caller.
 * Returns [] on error.
 */
export async function getMyFavoriteProviders(): Promise<PublicProvider[]> {
  const { data, error } = await supabase.rpc('get_my_favorite_providers');
  if (error) return [];
  return (data as PublicProvider[]) ?? [];
}

/**
 * Returns only the provider_id strings from the signed-in customer's favorites.
 * Useful for the favorite indicator UI and for the favoritesOnly filter.
 * RLS restricts rows to the owner — no manual customer_id filter needed.
 * Returns [] on error.
 */
export async function getFavoriteProviderIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('favorite_providers')
    .select('provider_id');
  if (error) return [];
  if (!data) return [];
  return (data as { provider_id: string }[]).map((r) => r.provider_id);
}

// ── Mutations ──────────────────────────────────────────────────────────────

/**
 * Adds a provider to the signed-in customer's favorites.
 * customer_id is taken from auth — never passed by callers.
 *
 * DUPLICATE SAFETY: the table has a unique(customer_id, provider_id) constraint.
 * A repeat favorite will error with PostgREST code 23505 — this is treated as
 * success ({ ok: true }) because already-favorited is not a failure.
 */
export async function addFavoriteProvider(
  providerId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: 'You must be signed in.' };

  const { error } = await supabase
    .from('favorite_providers')
    .insert({ customer_id: u.user.id, provider_id: providerId });

  if (error) {
    // Unique-constraint violation → already favorited → treat as success.
    const code = (error as { code?: string }).code;
    const msg = (error as { message?: string }).message ?? '';
    if (code === '23505' || msg.includes('23505') || msg.toLowerCase().includes('unique')) {
      return { ok: true };
    }
    return { ok: false, error: 'Could not add favorite.' };
  }
  return { ok: true };
}

/**
 * Removes a provider from the signed-in customer's favorites.
 * customer_id is taken from auth — never passed by callers.
 * RLS also enforces ownership server-side.
 *
 * SAFE REMOVAL: removing a non-existent favorite is NOT an error → { ok: true }.
 * A dangling provider row (provider deleted) simply isn't returned by the curated
 * read, so callers do not need to guard against it.
 */
export async function removeFavoriteProvider(
  providerId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: 'You must be signed in.' };

  const { error } = await supabase
    .from('favorite_providers')
    .delete()
    .eq('customer_id', u.user.id)
    .eq('provider_id', providerId);

  if (error) return { ok: false, error: 'Could not remove favorite.' };
  return { ok: true };
}

// ── Convenience helpers (pure form when ids supplied) ──────────────────────

/**
 * Checks whether a provider is in the customer's favorites.
 *
 * - If `favoriteIds` is supplied: pure synchronous check (no I/O).
 * - Otherwise: fetches ids from DB and checks asynchronously.
 *
 * Prefer the supplied-ids form in list UIs (call getFavoriteProviderIds once,
 * then pass the array into this function for each card — avoids N+1 requests).
 */
export async function isFavoriteProvider(
  providerId: string,
  favoriteIds?: string[],
): Promise<boolean> {
  if (favoriteIds !== undefined) {
    return favoriteIds.includes(providerId);
  }
  const ids = await getFavoriteProviderIds();
  return ids.includes(providerId);
}
