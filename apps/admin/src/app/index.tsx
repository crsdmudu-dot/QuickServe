import { Redirect, type Href } from 'expo-router';

import { useAdminGuard } from '@/hooks/use-admin-guard';

/**
 * Root "/" route of the ADMIN application.
 *
 * WHY THIS FILE EXISTS — it is the Cloudflare SPA shell, not just a redirect.
 *
 * `app.json` sets `web.output: "static"`, so Expo emits one HTML document per route. Without a
 * root route it emits no `dist/index.html`, and that single missing file broke production: the
 * Worker is configured with `not_found_handling: "single-page-application"`, which answers every
 * unmatched request with `/index.html`. With no such document, Cloudflare returned 404 for the
 * bare root AND for every dynamic route on a hard refresh — `/bookings/<id>` cannot match the
 * literal exported filename `bookings/[id].html`, so it falls through to a fallback that did not
 * exist. `/bookings` kept working only because `bookings/index.html` is a real document, and
 * client-side navigation kept working because it never requests a document at all.
 *
 * `+not-found.html` is NOT a substitute: it is an Expo route reachable only after hydration.
 * Cloudflare's SPA mode serves `/index.html` specifically and nothing else.
 *
 * So the important thing about this file is that it EXISTS and therefore generates
 * `apps/admin/dist/index.html`. `scripts/check-admin-artifact.mjs` fails the build without it and
 * `scripts/check-admin-routing.mjs` proves the fallback actually resolves.
 *
 * BEHAVIOUR. Anonymous access is already handled one level up: `_layout.tsx` redirects a resolved
 * anonymous visitor to `/login` before `<Slot/>` (and therefore this route) ever renders, and it
 * covers the loading and non-admin states with its own opaque overlays. This route only has to
 * answer the remaining question — where an authorized admin landing on "/" should go — so it
 * returns `null` in the states the layout already owns rather than racing it with a second
 * redirect.
 *
 * NO REDIRECT LOOP: `/dashboard` is a terminal route. It renders content and only ever pushes
 * forward (to `/bookings` and `/bookings/<id>`); no admin route redirects back to "/". When
 * `index.html` is served as the fallback for some other URL, Expo Router resolves the REAL
 * location on hydration, so this component does not even mount and the redirect never fires.
 */
export default function AdminIndex() {
  const { loading, session, isAdmin } = useAdminGuard();

  // Loading, anonymous and non-admin are all rendered by the layout's overlays.
  if (loading || !session || !isAdmin) return null;

  return <Redirect href={'/dashboard' as Href} />;
}
