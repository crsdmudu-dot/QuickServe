/**
 * tracking-status.ts — Customer-facing tracking label derived from booking status.
 *
 * Pure TypeScript — no network, no Supabase, no Deno APIs.
 */

import type { BookingStatus } from '@/constants/booking-status';

/**
 * Returns a customer-facing tracking label based on the booking status and
 * optional live distance to the provider.
 *
 * | Status            | distanceKm       | Label            |
 * |-------------------|------------------|------------------|
 * | on_the_way        | < 0.1 km         | 'Arrived'        |
 * | on_the_way        | < 0.5 km         | 'Nearby'         |
 * | on_the_way        | ≥ 0.5 km or none | 'Heading to you' |
 * | in_progress       | any              | 'Work started'   |
 * | completed         | any              | 'Work completed' |
 * | anything else     | any              | null             |
 *
 * @param status     Current booking status.
 * @param distanceKm Live distance between provider and customer (km). Optional.
 * @returns          A human-readable label, or null when tracking is not active.
 */
export function trackingLabel(
  status: BookingStatus,
  distanceKm?: number,
): string | null {
  switch (status) {
    case 'on_the_way': {
      if (distanceKm !== undefined && distanceKm < 0.1) return 'Arrived';
      if (distanceKm !== undefined && distanceKm < 0.5) return 'Nearby';
      return 'Heading to you';
    }
    case 'in_progress':
      return 'Work started';
    case 'completed':
      return 'Work completed';
    default:
      return null;
  }
}
