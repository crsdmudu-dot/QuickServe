// recent-services.ts — Derives recently-used services from booking history.
// READ-ONLY from getCustomerBookings — no writes, no DB changes.

import { SERVICES, type Service } from '@/constants/services';
import { getCustomerBookings } from '@/lib/bookings';

/**
 * Returns the distinct service_ids the customer has most recently booked, newest-first.
 *
 * Algorithm:
 * 1. Fetch bookings via getCustomerBookings() (already ordered newest-first by created_at).
 * 2. Walk the service_ids in order; keep the first occurrence of each (distinct).
 * 3. Cap at `limit` (default 6).
 * 4. Return [] on any error or if there are no bookings.
 *
 * Callers (screens) resolve each slug via getServiceBySlug() from the ServicesProvider
 * for the full 3-step fallback (active → constants shim → generic label).
 * Does NOT write anything. Does NOT change booking behavior.
 */
export async function getRecentlyUsedServiceIds(limit = 6): Promise<string[]> {
  try {
    const bookings = await getCustomerBookings();
    if (!bookings || bookings.length === 0) return [];

    const seen = new Set<string>();
    const results: string[] = [];

    for (const booking of bookings) {
      if (results.length >= limit) break;
      const { service_id } = booking;
      if (seen.has(service_id)) continue;
      seen.add(service_id);
      results.push(service_id);
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Returns the services the customer has most recently booked, distinct, newest-first.
 * Resolves each service_id against the local SERVICES constants catalog.
 * Unknown ids (archived/removed services not in constants) are silently dropped.
 *
 * NOTE: Prefer getRecentlyUsedServiceIds() + getServiceBySlug() from ServicesProvider
 * when inside a React component — that path uses the full 3-step fallback chain.
 * This function is kept for non-React contexts and backward compatibility.
 *
 * Does NOT write anything. Does NOT change booking behavior.
 */
export async function getRecentlyUsedServices(limit = 6): Promise<Service[]> {
  try {
    const bookings = await getCustomerBookings();
    if (!bookings || bookings.length === 0) return [];

    const seen = new Set<string>();
    const results: Service[] = [];

    for (const booking of bookings) {
      if (results.length >= limit) break;
      const { service_id } = booking;
      if (seen.has(service_id)) continue;
      seen.add(service_id);

      const svc = SERVICES.find((s) => s.id === service_id);
      if (svc) results.push(svc);
    }

    return results;
  } catch {
    return [];
  }
}
