// discovery.ts — Static discovery constants for the Search, Discovery & Marketplace slice.
// Featured/Trending are STATIC curated lists (no DB, no admin).
// ProviderSorts/Filters are pure config consumed by the UI and T3 filterProviders/sortProviders.

import { SERVICES, type Service, type ServiceCategory } from '@/constants/services';

// ── Featured & Trending (static curation) ─────────────────────────────────

/** A curated mix of services to highlight on the discovery home screen. */
export const FEATURED_SERVICE_IDS: string[] = [
  'house-cleaning',
  'mechanic',
  'food-delivery',
  'massage',
  'ac-repair',
];

/** A curated list of trending services — overlaps minimally with featured. */
export const TRENDING_SERVICE_IDS: string[] = [
  'plumbing',
  'grocery-delivery',
  'handyman',
  'haircuts',
  'movers-packers',
  'tire-replacement',
];

/** Returns Service objects for FEATURED_SERVICE_IDS in order; unknown ids are silently dropped. */
export function getFeaturedServices(): Service[] {
  return FEATURED_SERVICE_IDS.flatMap((id) => {
    const s = SERVICES.find((svc) => svc.id === id);
    return s ? [s] : [];
  });
}

/** Returns Service objects for TRENDING_SERVICE_IDS in order; unknown ids are silently dropped. */
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
