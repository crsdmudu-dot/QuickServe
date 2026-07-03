/**
 * geo.ts — Pure geographic helpers.
 *
 * No network, no secrets, no Deno APIs.
 * Uses only standard Math globals available in Node, Deno, and browsers.
 */

export type LatLng = { latitude: number; longitude: number };

const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance in km between two points using the haversine formula.
 *
 * Returns 0 if either input contains non-finite coordinates.
 *
 * Example:
 *   haversineKm({ latitude: -1.286389, longitude: 36.817223 }, { latitude: -1.292066, longitude: 36.821946 })
 *   → ~0.76 km
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  // Guard against NaN / Infinity inputs.
  if (
    !isFinite(a.latitude) ||
    !isFinite(a.longitude) ||
    !isFinite(b.latitude) ||
    !isFinite(b.longitude)
  ) {
    return 0;
  }

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinDLng * sinDLng;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Human-readable distance label.
 *
 * - < 1 km → "250 m" (rounded to nearest 10 m)
 * - ≥ 1 km → "1.2 km" (one decimal place)
 *
 * Examples:
 *   formatDistanceKm(1.234) → '1.2 km'
 *   formatDistanceKm(0.25)  → '250 m'
 */
export function formatDistanceKm(km: number): string {
  if (km < 1) {
    const metres = Math.round((km * 1000) / 10) * 10;
    return `${metres} m`;
  }
  return `${km.toFixed(1)} km`;
}

/**
 * Estimated travel time in minutes.
 *
 * Formula: `Math.max(1, Math.ceil((km / speedKmh) * 60))`
 *
 * @param km       Distance in kilometres.
 * @param speedKmh Average speed in km/h (default 22).
 * @returns        Minutes rounded up; always at least 1.
 *
 * Examples:
 *   etaMinutes(11, 22) → 30
 *   etaMinutes(0, 22)  → 1
 */
export function etaMinutes(km: number, speedKmh: number = 22): number {
  return Math.max(1, Math.ceil((km / speedKmh) * 60));
}

/**
 * Human-readable ETA label.
 *
 * - < 60 min → "~8 min"
 * - ≥ 60 min → "~1 hr 5 min"
 *
 * Examples:
 *   formatEta(8)  → '~8 min'
 *   formatEta(65) → '~1 hr 5 min'
 */
export function formatEta(minutes: number): string {
  if (minutes < 60) {
    return `~${minutes} min`;
  }
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `~${hrs} hr`;
  }
  return `~${hrs} hr ${mins} min`;
}
