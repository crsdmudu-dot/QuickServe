// favorite-services.ts — Supabase helpers for customer favorite services.
// Mirrors the Slice 32 favorites.ts idiom:
//   - customer_id is ALWAYS taken from auth (never from callers).
//   - Reads rely on RLS (owner-scoped by DB policy, no manual filter).
//   - Mutations return { ok: boolean; error?: string }.
//   - Reads return [] on error.
//   - DUPLICATE insert (23505) → { ok: true } (already-favorited is not a failure).
//   - Removing a non-existent row → { ok: true } (idempotent delete).
import { supabase } from '@/lib/supabase';
import { SERVICES, type Service } from '@/constants/services';

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * Returns the signed-in customer's favorited services as resolved Service objects.
 * Unknown service_ids are dropped (not present in SERVICES).
 * Returns [] on error.
 */
export async function getMyFavoriteServices(): Promise<Service[]> {
  const { data, error } = await supabase
    .from('favorite_services')
    .select('service_id')
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  const rows = data as { service_id: string }[];
  const result: Service[] = [];
  for (const row of rows) {
    const svc = SERVICES.find((s) => s.id === row.service_id);
    if (svc) result.push(svc);
    // Unknown ids are silently dropped
  }
  return result;
}

/**
 * Returns only the service_id strings from the signed-in customer's favorites.
 * Useful for favorite-indicator UI (pass the array into isFavoriteService).
 * Returns [] on error.
 */
export async function getFavoriteServiceIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('favorite_services')
    .select('service_id');

  if (error || !data) return [];
  return (data as { service_id: string }[]).map((r) => r.service_id);
}

// ── Mutations ──────────────────────────────────────────────────────────────

/**
 * Adds a service to the signed-in customer's favorites.
 * customer_id is taken from auth — never passed by callers.
 *
 * DUPLICATE SAFETY: the table has a unique(customer_id, service_id) constraint.
 * A repeat favorite will error with PostgREST code 23505 — this is treated as
 * success ({ ok: true }) because already-favorited is not a failure.
 */
export async function addFavoriteService(
  serviceId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: 'You must be signed in.' };

  const { error } = await supabase
    .from('favorite_services')
    .insert({ customer_id: u.user.id, service_id: serviceId });

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
 * Removes a service from the signed-in customer's favorites.
 * customer_id is taken from auth — never passed by callers.
 * RLS also enforces ownership server-side.
 *
 * SAFE REMOVAL: removing a non-existent favorite is NOT an error → { ok: true }.
 */
export async function removeFavoriteService(
  serviceId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: 'You must be signed in.' };

  const { error } = await supabase
    .from('favorite_services')
    .delete()
    .eq('customer_id', u.user.id)
    .eq('service_id', serviceId);

  if (error) return { ok: false, error: 'Could not remove favorite.' };
  return { ok: true };
}

// ── Convenience helpers (pure form when ids supplied) ──────────────────────

/**
 * Checks whether a service is in the customer's favorites.
 *
 * - If `favoriteIds` is supplied: pure synchronous check (no I/O) — returns boolean directly.
 * - Otherwise: fetches ids from DB and checks asynchronously — returns Promise<boolean>.
 *
 * Prefer the supplied-ids form in list UIs (call getFavoriteServiceIds once,
 * then pass the array into this function for each card — avoids N+1 requests).
 */
export function isFavoriteService(serviceId: string, favoriteIds: string[]): boolean;
export function isFavoriteService(serviceId: string): Promise<boolean>;
export function isFavoriteService(
  serviceId: string,
  favoriteIds?: string[],
): boolean | Promise<boolean> {
  if (favoriteIds !== undefined) {
    return favoriteIds.includes(serviceId);
  }
  return getFavoriteServiceIds().then((ids) => ids.includes(serviceId));
}
