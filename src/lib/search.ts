// search.ts — Local keyword search over SERVICES + recent searches via AsyncStorage.
// Pure/local — NO network, NO Supabase, NO PII.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CATEGORY_LABELS, type Service } from '@/constants/services';

// ── Recent searches (AsyncStorage) ────────────────────────────────────────

const RECENT_SEARCHES_KEY = 'qs.recentSearches';
export const MAX_RECENT_SEARCHES = 8;

/**
 * Returns the user's recent search terms, newest-first.
 * Returns [] on missing key or parse error — never throws.
 */
export async function getRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Adds a search term to the front of the recent-searches list.
 * - Trims whitespace; ignores empty strings.
 * - De-duplicates case-insensitively: if the term already exists, moves it to front.
 * - Caps the list at MAX_RECENT_SEARCHES (newest-first).
 * - Persists to AsyncStorage.
 */
export async function addRecentSearch(term: string): Promise<void> {
  const trimmed = term.trim();
  if (!trimmed) return;

  const existing = await getRecentSearches();
  // Remove any case-insensitive duplicate
  const filtered = existing.filter(
    (t) => t.toLowerCase() !== trimmed.toLowerCase(),
  );
  // Prepend the new term and cap
  const updated = [trimmed, ...filtered].slice(0, MAX_RECENT_SEARCHES);
  await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
}

/** Removes all recent searches from AsyncStorage. */
export async function clearRecentSearches(): Promise<void> {
  await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
}

// ── Keyword search (pure, over a supplied services list) ─────────────────

/**
 * Returns services whose title, subtitle, or category label contains the query
 * (case-insensitive). Empty/whitespace query returns [].
 * Preserves the order from the supplied list.
 *
 * @param services - The list to search over (pass useServices().services from a screen).
 * @param query    - The search string.
 */
export function searchServices(services: Service[], query: string): Service[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return services.filter((svc) => {
    const categoryLabel = (CATEGORY_LABELS[svc.category] ?? svc.category).toLowerCase();
    return (
      svc.title.toLowerCase().includes(q) ||
      (svc.subtitle?.toLowerCase().includes(q) ?? false) ||
      categoryLabel.includes(q)
    );
  });
}

/**
 * Returns up to 6 suggestion strings derived from the LIVE catalogue (`services`,
 * pass useServices().services) — never from the hardcoded constants — so a
 * suggestion can never reference a service that is not in the live DB catalogue.
 * Matches service titles, then category labels for categories present in the
 * catalogue. De-duped; empty/whitespace query returns [].
 */
export function searchSuggestions(services: Service[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const seen = new Set<string>();
  const results: string[] = [];

  const MAX_SUGGESTIONS = 6;

  // Service titles from the live catalogue.
  for (const svc of services) {
    if (results.length >= MAX_SUGGESTIONS) break;
    if (svc.title.toLowerCase().includes(q)) {
      const key = svc.title.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push(svc.title);
      }
    }
  }

  // Category labels, only for categories that actually have a live service.
  for (const svc of services) {
    if (results.length >= MAX_SUGGESTIONS) break;
    const label = CATEGORY_LABELS[svc.category] ?? svc.category;
    if (label.toLowerCase().includes(q)) {
      const key = label.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push(label);
      }
    }
  }

  return results;
}

/**
 * Returns recommended services when a search yields no results — drawn from the
 * LIVE catalogue (`services`, pass useServices().services), de-duped, capped at 6.
 * Never returns services absent from the live DB catalogue.
 */
export function noResultRecommendations(services: Service[]): Service[] {
  const seen = new Set<string>();
  const results: Service[] = [];

  for (const svc of services) {
    if (results.length >= 6) break;
    if (!seen.has(svc.id)) {
      seen.add(svc.id);
      results.push(svc);
    }
  }

  return results;
}
