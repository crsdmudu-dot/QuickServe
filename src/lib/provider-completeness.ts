// provider-completeness.ts — Pure derivation of provider profile completeness.
// PURE logic only — no DB calls, no network, no writes.

import type { ProviderProfile } from '@/lib/providers';
import {
  PROFILE_COMPLETENESS_ITEMS,
  type CompletenessItemKey,
} from '@/constants/provider-quality';

// ── Types ──────────────────────────────────────────────────────────────────

export type CompletenessResult = {
  /** Percentage of ACTIVE (non-futureReady) items that are done (0–100, integer). */
  percent: number;
  /** Full list of all items (active + future-ready) with their done state. */
  items: {
    key: CompletenessItemKey;
    label: string;
    done: boolean;
    futureReady: boolean;
  }[];
  /** Labels of ACTIVE items that are NOT yet done. */
  missing: string[];
};

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Returns true/false for each completeness item key based on the profile.
 * Future-ready items always return false (not yet supported).
 */
function isDone(key: CompletenessItemKey, profile: ProviderProfile | null): boolean {
  if (!profile) return false;
  switch (key) {
    case 'photo':
      return !!profile.profile_photo_url;
    case 'bio':
      return !!profile.bio && profile.bio.trim().length > 0;
    case 'experience':
      return profile.years_experience != null;
    case 'service_categories':
      return !!profile.skills && profile.skills.length > 0;
    case 'contact_details':
      return !!profile.phone;
    case 'availability':
      // availability_status is always set on a valid profile row
      return !!profile.availability_status;
    // Future-ready items: not yet supported — always false
    case 'government_verification':
    case 'payment_details':
      return false;
    default:
      return false;
  }
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Derives profile completeness from a ProviderProfile.
 *
 * - `percent` is computed over ACTIVE items only (futureReady items excluded).
 * - `items` includes every entry (active + future-ready) for display.
 * - `missing` lists labels of active items not yet done.
 * - Null profile → percent 0, all active items not done.
 * - Pure, deterministic, never throws.
 */
export function calculateProviderCompleteness(
  profile: ProviderProfile | null,
): CompletenessResult {
  const items = PROFILE_COMPLETENESS_ITEMS.map((item) => ({
    key: item.key,
    label: item.label,
    done: item.futureReady ? false : isDone(item.key, profile),
    futureReady: item.futureReady === true,
  }));

  const activeItems = items.filter((i) => !i.futureReady);
  const doneActive = activeItems.filter((i) => i.done).length;
  const totalActive = activeItems.length;

  const percent = totalActive === 0 ? 0 : Math.round((100 * doneActive) / totalActive);
  const missing = activeItems.filter((i) => !i.done).map((i) => i.label);

  return { percent, items, missing };
}
