// customer-profile.ts — Static customer profile constants + pure completion derivation.
// PURE constants and derivation only — no DB calls, no network, no writes.

// ── Profile Completion Items ───────────────────────────────────────────────

/**
 * Ordered list of customer profile completion items.
 * Items with `futureReady: true` are shown to the user but
 * EXCLUDED from the completion percentage calculation.
 */
export const PROFILE_COMPLETION_ITEMS: {
  key: string;
  label: string;
  futureReady?: boolean;
}[] = [
  // ── Active items (included in the %) ─────────────────────────────────────
  { key: 'full_name',       label: 'Full name'       },
  { key: 'phone',           label: 'Phone number'    },
  { key: 'default_address', label: 'Default address' },
  // ── Future-ready items (shown but excluded from %) ────────────────────────
  { key: 'language',                    label: 'Language',                    futureReady: true },
  { key: 'communication_preferences',   label: 'Communication preferences',   futureReady: true },
  { key: 'notification_preferences',    label: 'Notification preferences',    futureReady: true },
];

// ── Future-Ready Preferences ───────────────────────────────────────────────

/**
 * Display labels for future-ready preference items.
 * These are shown in the profile UI but not yet backed by DB columns.
 */
export const FUTURE_READY_PREFERENCES: { key: string; label: string }[] = [
  { key: 'language',                  label: 'Language'                  },
  { key: 'communication_preferences', label: 'Communication preferences' },
  { key: 'notification_preferences',  label: 'Notification preferences'  },
];

// ── Pure Derivation ────────────────────────────────────────────────────────

/**
 * Computes customer profile completion from pure inputs.
 *
 * Rules:
 * - full_name:       done when non-empty string.
 * - phone:           done when present (non-null, non-empty).
 * - default_address: done when `hasDefaultAddress` is true.
 * - future-ready items: always `done: false`, EXCLUDED from %.
 * - percent = round(100 * doneActive / totalActive).
 *
 * Pure, deterministic, never throws.
 */
export function computeCustomerProfileCompletion(input: {
  profile: { full_name?: string | null; phone?: string | null } | null;
  hasDefaultAddress: boolean;
}): {
  percent: number;
  items: { key: string; label: string; done: boolean; futureReady?: boolean }[];
  missing: string[];
} {
  const { profile, hasDefaultAddress } = input;

  const items = PROFILE_COMPLETION_ITEMS.map((item) => {
    let done = false;

    if (!item.futureReady) {
      switch (item.key) {
        case 'full_name':
          done = Boolean(profile?.full_name?.trim());
          break;
        case 'phone':
          done = Boolean(profile?.phone?.trim());
          break;
        case 'default_address':
          done = hasDefaultAddress;
          break;
        default:
          done = false;
      }
    }
    // future-ready items are never done

    return { key: item.key, label: item.label, done, futureReady: item.futureReady };
  });

  const activeItems  = items.filter((i) => !i.futureReady);
  const doneActive   = activeItems.filter((i) => i.done).length;
  const totalActive  = activeItems.length;
  const percent      = totalActive === 0 ? 0 : Math.round((100 * doneActive) / totalActive);

  const missing = activeItems.filter((i) => !i.done).map((i) => i.label);

  return { percent, items, missing };
}
