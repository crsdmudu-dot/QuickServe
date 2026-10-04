// terms.ts — the Terms of Service version people accept before posting content (F5.4).
//
// CURRENT_TERMS_VERSION must equal public.current_terms_version() in the database (migration 0068) and the version on
// the website's Terms page. A guard test (terms-acceptance-migration-guard) checks that the app and the migration agree.
// PLACEHOLDER until the owner's final Terms text: when it exists, this string and the migration's are what change.
export const CURRENT_TERMS_VERSION = 'draft-2026-09-26';

/** The key points shown in the app's Terms prompt (plain words; the full Terms live on the website). */
export const TERMS_KEY_POINTS: readonly string[] = [
  'Be respectful. No abusive, hateful, sexual or threatening messages, reviews or profiles.',
  "Only share what is true and yours to share. No spam, scams or other people's personal details.",
  'You can report or block anyone. Our team reviews every report within 24 hours.',
  'We may remove content and suspend accounts that break these rules.',
];

/**
 * The website address (EXPO_PUBLIC_WEBSITE_URL), or null unless it is a plain https origin such as
 * https://kwikserve.co.ke (no path, no spaces). Every link to a website page is built from this one rule, so a missing
 * or unexpected value hides the links instead of opening a broken or outside address.
 */
export function websiteOrigin(): string | null {
  const base = (process.env.EXPO_PUBLIC_WEBSITE_URL ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9.-]+$/i.test(base) ? base : null;
}

/**
 * The address of the full Terms on the website, or null while the website address is not configured
 * (EXPO_PUBLIC_WEBSITE_URL, an https origin). The app then shows the key points only, never a broken link.
 */
export function termsUrl(): string | null {
  const origin = websiteOrigin();
  return origin ? `${origin}/terms` : null;
}

/**
 * The address of the Privacy Policy on the website (D-12), or null while the website address is not configured.
 * It ends in "/" because the website serves every page at an address with a trailing slash.
 */
export function privacyUrl(): string | null {
  const origin = websiteOrigin();
  return origin ? `${origin}/privacy/` : null;
}
