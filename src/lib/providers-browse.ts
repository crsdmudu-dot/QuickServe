// providers-browse.ts — Curated provider read + pure client-side sort/filter/search.
// listPublicProviders() reads from Supabase via the list_public_providers RPC.
// sortProviders / filterProviders / searchProviders are PURE transforms:
//   - return NEW arrays, never mutate input
//   - no I/O, no ranking algorithm, no dispatch/booking side effects
//   - filters are additive & combinable (AND logic)
import { supabase } from '@/lib/supabase';
import type { PublicProvider } from '@/lib/favorites';
import type { ProviderFilters, ProviderSortKey } from '@/constants/discovery';

// Re-export PublicProvider so browse-screen consumers can import from one place.
export type { PublicProvider } from '@/lib/favorites';

// ── Remote read ────────────────────────────────────────────────────────────

/**
 * Returns the curated list of public providers via the list_public_providers RPC.
 * The RPC is SECURITY DEFINER and exposes only 10 non-PII fields per provider.
 * Returns [] on error.
 */
export async function listPublicProviders(): Promise<PublicProvider[]> {
  const { data, error } = await supabase.rpc('list_public_providers');
  if (error) return [];
  return (data as PublicProvider[]) ?? [];
}

// ── Pure sort ──────────────────────────────────────────────────────────────

/**
 * Returns a NEW sorted copy of `list` — input is never mutated.
 * Pure function: no I/O, no side effects.
 *
 * Sort behaviours:
 * - highest_rated    → average_rating desc (nulls last), tiebreak review_count desc
 * - most_jobs        → completed_jobs_count desc
 * - fastest_response → FUTURE-READY: no response-time data in the curated shape today.
 *                      Proxy: available providers first, then most jobs. Deterministic & no-throw.
 * - recently_active  → available providers first, then created_at desc (recency proxy).
 *                      Deterministic proxy until a last_active_at field is exposed.
 * - alphabetical     → full_name locale ascending, nulls last
 */
export function sortProviders(list: PublicProvider[], sort: ProviderSortKey): PublicProvider[] {
  const sorted = [...list]; // new array — input unchanged

  switch (sort) {
    case 'highest_rated':
      sorted.sort((a, b) => {
        const ra = a.average_rating ?? -1;
        const rb = b.average_rating ?? -1;
        if (rb !== ra) return rb - ra; // desc, nulls (mapped to -1) last
        return b.review_count - a.review_count; // tiebreak: more reviews first
      });
      break;

    case 'most_jobs':
      sorted.sort((a, b) => b.completed_jobs_count - a.completed_jobs_count);
      break;

    case 'fastest_response':
      // FUTURE-READY: no per-provider response-time data in the curated read today.
      // Proxy: available providers first (status === 'available'), then most completed
      // jobs as a rough activity signal. Replace this when response_time_minutes is added.
      sorted.sort((a, b) => {
        const aAvail = a.availability_status === 'available' ? 0 : 1;
        const bAvail = b.availability_status === 'available' ? 0 : 1;
        if (aAvail !== bAvail) return aAvail - bAvail;
        return b.completed_jobs_count - a.completed_jobs_count;
      });
      break;

    case 'recently_active':
      // Proxy: available providers first, then newest created_at as recency signal.
      // Replace created_at with last_active_at when that field is exposed.
      sorted.sort((a, b) => {
        const aAvail = a.availability_status === 'available' ? 0 : 1;
        const bAvail = b.availability_status === 'available' ? 0 : 1;
        if (aAvail !== bAvail) return aAvail - bAvail;
        // created_at desc (newest first) as recency proxy
        return b.created_at.localeCompare(a.created_at);
      });
      break;

    case 'alphabetical':
      sorted.sort((a, b) => {
        if (a.full_name === null && b.full_name === null) return 0;
        if (a.full_name === null) return 1; // nulls last
        if (b.full_name === null) return -1;
        return a.full_name.localeCompare(b.full_name);
      });
      break;
  }

  return sorted;
}

// ── Pure filter ────────────────────────────────────────────────────────────

/**
 * Returns a NEW filtered copy of `list` — input is never mutated.
 * Pure function: no I/O, no side effects, no ranking/dispatch.
 *
 * All provided filters apply cumulatively (AND). Unset (undefined/falsy) filters
 * are skipped so partial filter objects work naturally.
 *
 * Filter behaviours:
 * - minRating        → (average_rating ?? 0) >= minRating
 * - availableOnly    → availability_status === 'available'
 * - verifiedOnly     → is_verified === true
 * - favoritesOnly    → provider_id ∈ ctx.favoriteIds (absent → treated as empty → [])
 * - recentlyUsedOnly → provider_id ∈ ctx.recentlyUsedProviderIds
 * - category / serviceId → FUTURE-READY: the curated PublicProvider shape has no
 *   per-service/category mapping field today. These filters are treated as a no-op
 *   pass-through until the RPC exposes service/category data. Document in the UI.
 */
export function filterProviders(
  list: PublicProvider[],
  filters: ProviderFilters,
  ctx?: { favoriteIds?: string[]; recentlyUsedProviderIds?: string[] },
): PublicProvider[] {
  // Work on a shallow copy to be explicit that we don't mutate input.
  let result = [...list];

  if (filters.minRating !== undefined) {
    result = result.filter((p) => (p.average_rating ?? 0) >= (filters.minRating as number));
  }

  if (filters.availableOnly) {
    result = result.filter((p) => p.availability_status === 'available');
  }

  if (filters.verifiedOnly) {
    result = result.filter((p) => p.is_verified === true);
  }

  if (filters.favoritesOnly) {
    const ids = ctx?.favoriteIds ?? [];
    result = result.filter((p) => ids.includes(p.provider_id));
  }

  if (filters.recentlyUsedOnly) {
    const ids = ctx?.recentlyUsedProviderIds ?? [];
    result = result.filter((p) => ids.includes(p.provider_id));
  }

  // FUTURE-READY: category & serviceId filters are no-ops today because the
  // PublicProvider curated shape does not include a service/category mapping.
  // When the list_public_providers RPC is extended with service metadata, add
  // filtering logic here. Until then, these are intentional pass-throughs.
  // filters.category and filters.serviceId are consumed by the type but not applied.

  return result;
}

// ── Pure search ────────────────────────────────────────────────────────────

/**
 * Returns a NEW array of providers whose full_name contains `query` (case-insensitive).
 * Empty or whitespace-only query → returns the full input list (no filtering).
 * Pure function: no I/O, no side effects.
 */
export function searchProviders(list: PublicProvider[], query: string): PublicProvider[] {
  const trimmed = query.trim();
  if (!trimmed) return [...list];
  const lower = trimmed.toLowerCase();
  return list.filter((p) => p.full_name !== null && p.full_name.toLowerCase().includes(lower));
}
