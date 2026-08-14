// trust.ts — Static trust & safety content + pure customer trust signal derivation.
// PURE constants and derivation only — no DB calls, no network, no writes.

// ── Service Guarantees ─────────────────────────────────────────────────────

/** What KwikServe guarantees to customers on every booking. */
export const SERVICE_GUARANTEES: { title: string; body: string }[] = [
  {
    title: 'Vetted professionals',
    body: 'Every provider on KwikServe is background-checked and onboarded through a structured approval process before serving customers.',
  },
  {
    title: 'Secure payment',
    body: 'Payments are processed through secure channels. Your card and M-Pesa details are never shared with providers.',
  },
  {
    title: 'On-time commitment',
    body: 'Providers commit to your agreed time window. If a provider is running late, you will be notified in advance.',
  },
  {
    title: 'Quality workmanship',
    body: 'Providers are expected to complete every job to a high standard. We take quality feedback seriously and act on it.',
  },
  {
    title: 'Dedicated support',
    body: 'Our customer support team is available to help you before, during, and after your booking.',
  },
];

// ── Safety Reminders ───────────────────────────────────────────────────────

/** Safety tips shown to customers before or during a service visit. */
export const SAFETY_REMINDERS: { title: string; body: string }[] = [
  {
    title: 'Share your location with a friend',
    body: 'Before a home visit, let a trusted person know the provider\'s name, your address, and the expected duration of the service.',
  },
  {
    title: 'Verify the provider',
    body: 'Check the provider\'s profile photo and name against the person who arrives. If something feels off, contact support immediately.',
  },
  {
    title: 'Keep valuables secure',
    body: 'Store personal documents, jewellery, and other valuables out of sight before a provider arrives.',
  },
  {
    title: 'Stay accessible during the service',
    body: 'Be reachable by phone so the provider can contact you if they need clarification during the job.',
  },
];

// ── Customer Tips ──────────────────────────────────────────────────────────

/** Practical tips to help customers get the most from their bookings. */
export const CUSTOMER_TIPS: { title: string; body: string }[] = [
  {
    title: 'Take clear before photos',
    body: 'Photograph the area or item to be serviced before the provider arrives. This protects both you and the provider in case of any dispute.',
  },
  {
    title: 'Be available at the start',
    body: 'Be present or send a trusted person to receive the provider at the agreed time. Missed arrivals may count as cancellations.',
  },
  {
    title: 'Rate your experience honestly',
    body: 'Honest ratings help other customers make informed choices and motivate providers to maintain high standards.',
  },
  {
    title: 'Describe the job clearly',
    body: 'When booking, add relevant details about the scope of work so the provider can arrive prepared.',
  },
];

// ── Trust Messages ─────────────────────────────────────────────────────────

/**
 * Short trust-building messages for display in UI banners, empty states, etc.
 * These are factual statements — no fabricated numbers.
 */
export const TRUST_MESSAGES: string[] = [
  'All providers are background-checked and individually approved.',
  'Your payment is protected until the job is confirmed complete.',
  'Rate your provider after every booking to keep quality high.',
  'Need help? Our support team is always a message away.',
  'Providers who consistently underperform are removed from the platform.',
];

// ── Pure Derivation ────────────────────────────────────────────────────────

/**
 * Derives a list of trust signal badges for a provider from their public profile data.
 * Pure, display-only — no DB calls, no side effects, never throws.
 *
 * Thresholds mirror Slice 33 achievement thresholds (verified / jobs / rating).
 */
export function deriveCustomerTrustSignals(p: {
  is_verified?: boolean;
  completed_jobs_count?: number;
  average_rating?: number | null;
}): { key: string; label: string; icon: string }[] {
  const signals: { key: string; label: string; icon: string }[] = [];

  // Verified provider
  if (p.is_verified === true) {
    signals.push({ key: 'verified', label: 'Verified provider', icon: '✅' });
  }

  // Jobs completed — mirrors Slice 33 thresholds (100 / 50 / 10 / 1)
  const jobs = p.completed_jobs_count ?? 0;
  if (jobs >= 100) {
    signals.push({ key: 'jobs_100', label: '100+ jobs completed', icon: '💯' });
  } else if (jobs >= 50) {
    signals.push({ key: 'jobs_50', label: '50+ jobs completed', icon: '🏅' });
  } else if (jobs >= 10) {
    signals.push({ key: 'jobs_10', label: '10+ jobs completed', icon: '🔟' });
  } else if (jobs >= 1) {
    signals.push({ key: 'first_job', label: 'Has completed jobs', icon: '🎉' });
  }

  // Top rated — mirrors Slice 33 rating threshold (4.8)
  const rating = p.average_rating ?? null;
  if (rating != null && rating >= 4.8) {
    signals.push({ key: 'top_rated', label: 'Top rated 4.8★', icon: '⭐' });
  }

  return signals;
}
