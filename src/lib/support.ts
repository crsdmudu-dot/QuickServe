// support.ts — the one route a user has to reach a human.
//
// The address is the verified Hired Corp support mailbox, the same one the Auth email templates
// offer (supabase/templates/*.html). It is a public contact address, not a secret.
//
// `buildSupportMailtoUrl` deliberately takes no arguments. Several of the surfaces that show this
// link — the Auth confirmation and recovery screens, and the web Auth bridge — render on a route
// that arrived carrying a one-time token in its parameters or URL fragment. A builder that accepted
// a subject, a body or any context could be handed that token, and a mail client would then receive
// it. Keeping the URL a constant makes that impossible by construction rather than by review.
//
// There is no platform branch: `mailto:` is identical everywhere. What differs is how a surface
// opens it — native screens and the Expo web export go through `Linking.openURL` (see
// src/components/ui/support-link.tsx); the separate Next.js marketing site uses a plain anchor.

export const SUPPORT_EMAIL = 'support@hiredcorp.co.ke';

/** The support mailto URL: scheme and address only, with no subject, body, query or fragment. */
export function buildSupportMailtoUrl(): string {
  return `mailto:${SUPPORT_EMAIL}`;
}
