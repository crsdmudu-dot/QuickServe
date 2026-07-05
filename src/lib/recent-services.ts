// recent-services.ts — Derives recently-used services from booking history.
// READ-ONLY from getCustomerBookings — no writes, no DB changes.

import { SERVICES, type Service } from '@/constants/services';
import { getCustomerBookings } from '@/lib/bookings';

/**
 * Returns the services the customer has most recently booked, distinct, newest-first.
 *
 * Algorithm:
 * 1. Fetch bookings via getCustomerBookings() (already ordered newest-first by created_at).
 * 2. Walk the service_ids in order; keep the first occurrence of each (distinct, preserves newest-first).
 * 3. Resolve each service_id to a Service from the local SERVICES catalog; drop unknown ids.
 * 4. Cap at `limit` (default 6).
 * 5. Return [] on any error or if there are no bookings.
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
