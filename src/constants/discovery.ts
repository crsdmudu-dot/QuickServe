// discovery.ts — Static discovery constants for the Search, Discovery & Marketplace slice.
// ProviderSorts/Filters are pure config consumed by the UI and T3 filterProviders/sortProviders.
//
// ── IMPORTANT: LEGACY FALLBACK ────────────────────────────────────────────────
// FEATURED_SERVICE_IDS, TRENDING_SERVICE_IDS, getFeaturedServices(), and
// getTrendingServices() are NO LONGER the source of truth for featured/trending
// data. The DB flags (services.featured / services.trending) are the source of
// truth, exposed via ServicesProvider.getFeatured() / getTrending().
//
// These constants are KEPT as a FALLBACK: ServicesProvider falls back to them
// when the DB cache is empty (e.g. the DB read failed or returned no rows).
// Do NOT delete them. Do NOT use them directly in new UI code — use useServices()
// from @/services/services-provider instead.
// ─────────────────────────────────────────────────────────────────────────────

import { SERVICES, type Service, type ServiceCategory } from '@/constants/services';

// ── Featured & Trending (LEGACY FALLBACK — see note above) ────────────────

/**
 * @legacy FALLBACK — DB flags are the source of truth (via ServicesProvider).
 * A curated mix of service ids to highlight on the discovery home screen.
 * Used only when the ServicesProvider DB cache is empty.
 */
export const FEATURED_SERVICE_IDS: string[] = [
  'house-cleaning',
  'mechanic',
  'food-delivery',
  'massage',
  'ac-repair',
];

/**
 * @legacy FALLBACK — DB flags are the source of truth (via ServicesProvider).
 * A curated list of trending service ids.
 * Used only when the ServicesProvider DB cache is empty.
 */
export const TRENDING_SERVICE_IDS: string[] = [
  'plumbing',
  'grocery-delivery',
  'handyman',
  'haircuts',
  'movers-packers',
  'tire-replacement',
];

/**
 * @legacy FALLBACK — DB flags are the source of truth (via ServicesProvider).
 * Returns Service objects for FEATURED_SERVICE_IDS in order; unknown ids are silently dropped.
 * Used only when the ServicesProvider DB cache is empty.
 */
export function getFeaturedServices(): Service[] {
  return FEATURED_SERVICE_IDS.flatMap((id) => {
    const s = SERVICES.find((svc) => svc.id === id);
    return s ? [s] : [];
  });
}

/**
 * @legacy FALLBACK — DB flags are the source of truth (via ServicesProvider).
 * Returns Service objects for TRENDING_SERVICE_IDS in order; unknown ids are silently dropped.
 * Used only when the ServicesProvider DB cache is empty.
 */
export function getTrendingServices(): Service[] {
  return TRENDING_SERVICE_IDS.flatMap((id) => {
    const s = SERVICES.find((svc) => svc.id === id);
    return s ? [s] : [];
  });
}

// ── Popular search terms ───────────────────────────────────────────────────

/** Static human-readable search terms shown in the search bar as suggestions. */
export const POPULAR_SEARCHES: string[] = [
  'Cleaning',
  'Plumber',
  'Electrician',
  'AC Repair',
  'Handyman',
  'Movers',
  'Food Delivery',
  'Massage',
];

// ── Provider sort & filter config ─────────────────────────────────────────

export type ProviderSortKey =
  | 'highest_rated'
  | 'most_jobs'
  | 'fastest_response'
  | 'recently_active'
  | 'alphabetical';

export const PROVIDER_SORTS: { id: ProviderSortKey; label: string }[] = [
  { id: 'highest_rated', label: 'Highest rated' },
  { id: 'most_jobs', label: 'Most jobs completed' },
  { id: 'fastest_response', label: 'Fastest response' },
  { id: 'recently_active', label: 'Recently active' },
  { id: 'alphabetical', label: 'Alphabetical' },
];

export type ProviderFilterKey =
  | 'rating'
  | 'availability'
  | 'verified_only'
  | 'category'
  | 'service'
  | 'favorites'
  | 'recently_used';

export const PROVIDER_FILTERS: { id: ProviderFilterKey; label: string }[] = [
  { id: 'rating', label: 'Minimum rating' },
  { id: 'availability', label: 'Available now' },
  { id: 'verified_only', label: 'Verified only' },
  { id: 'category', label: 'Category' },
  { id: 'service', label: 'Service' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'recently_used', label: 'Recently used' },
];

/**
 * Value type for provider filters used by the UI and T3 filterProviders.
 * All fields optional — unset means "no filter on this dimension."
 */
export type ProviderFilters = {
  minRating?: number;
  availableOnly?: boolean;
  verifiedOnly?: boolean;
  category?: ServiceCategory;
  serviceId?: string;
  favoritesOnly?: boolean;
  recentlyUsedOnly?: boolean;
};
