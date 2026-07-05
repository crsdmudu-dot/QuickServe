# Slice 32 — Search, Discovery & Marketplace Experience (Design Spec)

**Date:** 2026-07-05
**Status:** Design → (user review, then implementation plan)
**Builds on (reuses):** the customer app (`src/app/(customer)/*`), `constants/services.ts` (`getPopularServices`/`getServicesByCategory`/`CATEGORY_ORDER`/`CATEGORY_LABELS`), the booking draft (`useBookingDraft().start(serviceId)` → `/booking/address`), provider profile fields on `profiles` (`average_rating`, `completed_jobs_count`, `is_verified`, `years_experience`, `availability_status`, `profile_photo_url`, `created_at`), the owner-only RLS pattern from `customer_addresses` (0019), and existing UI (`SearchBar`, `ServiceCard`, `ProfessionalCard`, `Card`, `SectionHeader`). Nothing in payment/wallet/promotions/dispatch/payout/analytics/operations/auth/notifications is touched.

## 1. Goal & Decisions

Turn QuickServe into a polished **discovery marketplace**: fast search, richer browsing, comparable provider cards, favorites, and UI polish — all **additive** and **customer-facing only**, with **no** booking/dispatch/ranking/business-workflow change.

**Confirmed decisions (brainstorm):**
- **Search history is local-first** (AsyncStorage, customer-only, capped + clearable). **`favorite_providers` is the ONLY new DB table.** No `search_history` table.
- **Provider discovery is a discovery-only browse layer** — browse / compare / sort / filter / favorite providers. It does **NOT** change how bookings assign providers. **"Quick rebooking" deep-links into the existing booking flow** (prefilled service via `start(serviceId)`); it never requests a specific provider or touches dispatch.
- **Featured & Trending are static curated constants** (`FEATURED_SERVICE_IDS` / `TRENDING_SERVICE_IDS` in code). No admin UI, no schema. Popular stays static (existing); Recently-used derives read-only from the customer's own bookings.

## 2. Scope & Constraints (hard rules)

**In scope:** marketplace search (services + categories, instant, suggestions, recent, popular, empty + no-result states), service discovery (popular/featured/trending/recently-used/browse-all/better category cards), provider discovery (richer comparable cards + client-side sort + additive filters + favorites), favorites (add/remove/screen/indicator/quick-rebook), local search history, and UI polish (skeletons, empty states, spacing, hierarchy, transitions).

**Out of scope / MUST NOT change (additive-only):**
- No payment / wallet / promotions / dispatch / provider-payout / analytics / Operations Portal / auth / notifications change. No AI/ML/personalized recommendations. **No ranking algorithm** — sorting & filtering are UI-only (client-side over a curated read). No maps / live location / distance routing / dynamic pricing / provider bidding / search-indexing engine.
- No change to the booking/dispatch workflow: discovery is browse-only; booking still goes through the existing flow. No provider PII exposed (curated fields only — same convention as the existing public-provider read; no phone).

## 3. Data model — migration `0027_favorite_providers.sql` (the ONLY new table)

`favorite_providers` (owner-only, additive; favorites are user data → delete allowed):
- `id uuid pk default gen_random_uuid()`
- `customer_id uuid not null references profiles(id) on delete cascade`
- `provider_id uuid not null references profiles(id) on delete cascade`
- `created_at timestamptz not null default now()`
- `unique (customer_id, provider_id)`; index `(customer_id, created_at desc)`.
- **RLS owner-only** (mirror `customer_addresses`): `select`/`insert`/`delete` `using/with check (customer_id = auth.uid())`. No update needed. Customers only ever see/modify their own favorites.

**Provider browse read (additive, read-only):** reuse/extend the existing curated public-provider read; if no listing read exists, add an additive SECURITY DEFINER `list_public_providers()` returning **curated** fields only (id, full_name, profile_photo_url, skills, is_verified, average_rating, completed_jobs_count, years_experience, availability_status, created_at) for approved+visible providers — **no PII, no ranking** (plain select; sort/filter happen client-side). A `get_my_favorite_providers()` read returns the same curated fields for the customer's favorites. Both are read-only and change no existing behavior.

## 4. Client libs & constants

- `src/lib/favorites.ts` — `addFavorite(providerId)`, `removeFavorite(providerId)`, `getMyFavorites()` (curated provider list), `getFavoriteIds()` (for indicators). Mutations return `{ ok, error? }`; reads return `[]` on error (existing idiom).
- `src/lib/search.ts` — **local recent searches** (AsyncStorage key e.g. `qs.recentSearches`, max 8, `getRecentSearches`/`addRecentSearch`/`clearRecentSearches`) + **service/category keyword search** (`searchServices(query)` over `constants/services.ts` — title/subtitle/category match) + `searchSuggestions(query)`. Pure/local — no network, no PII.
- `src/lib/providers-browse.ts` — `listProviders()` (curated read) + pure client-side `sortProviders(list, sortKey)` and `filterProviders(list, filters)` helpers. **Sorting/filtering are pure UI transforms — not a ranking algorithm.**
- `src/lib/recent-services.ts` — `getRecentlyUsedServices()` derived read-only from the customer's existing bookings (distinct recent service ids).
- `src/constants/discovery.ts` — `FEATURED_SERVICE_IDS`, `TRENDING_SERVICE_IDS`, `POPULAR_SEARCHES` (static), `PROVIDER_SORTS` (highest_rated | most_jobs | fastest_response | recently_active | alphabetical, with labels), `PROVIDER_FILTERS` definitions (rating, availability, verified_only, category, service, favorites, recently_used).

## 5. Screens (customer app; all additive)

- **Enhanced Home** (`(customer)/index.tsx`) — additive sections: Featured, Trending, Recently used, Popular (existing), Browse all categories (better category grid), with polished cards/skeletons. Search bar routes to the Search screen.
- **Search** (`(customer)/search.tsx`) — instant search field; as-you-type results over services + categories; **suggestions**, **recent searches** (local, with clear), **popular searches** (static); **empty state** (before typing → recent + popular); **no-result state** → recommendations (popular/featured). Tapping a result → `start(serviceId)` → existing booking flow.
- **Provider discovery / browse** (`(customer)/providers.tsx`) — list of `MarketplaceProviderCard`s from `listProviders()`; a **sort control** (the 5 sorts, client-side); **filter** chips/sheet (rating / availability / verified-only / category / service / favorites / recently-used — **additive & combinable**); loading skeletons + empty/no-match states. Favorite toggle on each card.
- **Favorites** (`(customer)/favorites.tsx`) — the customer's favorited providers (cards + favorite indicator) with **quick rebooking** (a CTA that deep-links into the existing booking flow, prefilled service) and remove-favorite. Empty state when none.

(Wiring into the customer tab/nav is additive — a new entry or links from Home; no change to existing tabs' behavior.)

## 6. Components (new/enhanced, presentational)

- `MarketplaceProviderCard` — rating (`average_rating`), jobs completed (`completed_jobs_count`), **verification badge** (`is_verified`), years on QuickServe (from `created_at`; or `years_experience`), **availability indicator** (`availability_status`), **favorite button** (heart toggle → favorites lib). **Response time & distance are future-ready**: rendered only when data exists (no column today → omitted); no backend added for them this slice.
- `FavoriteButton` (heart toggle, optimistic), `ProviderSortControl`, `ProviderFilterBar`/sheet.
- Search: `SearchField` (instant/controlled), `SearchSuggestions`, `RecentSearches` (chips + clear), `PopularSearches`.
- Discovery: enhanced `ServiceCard`, `CategoryCard`, `CategoryGrid`; `Skeleton` loading component; richer `EmptyState` variants.
- Reuse tokens + existing primitives; keep each component focused.

## 7. Sorting & Filtering (UI-only)

- **Sorts** (client-side, over the fetched curated list): highest_rated, most_jobs, fastest_response (future-ready — uses response data when present, else stable fallback), recently_active (`availability_status`/recency), alphabetical. **No ranking algorithm; no dispatch influence.**
- **Filters** (additive & combinable, client-side): rating (min), availability, verified_only, category, service, favorites (intersect with favorite ids), recently_used (intersect with the customer's booked-before providers). Any combination narrows the same list.

## 8. UI Polish

Loading skeletons for lists/cards; consistent empty states (search-empty, no-results, no-favorites, no-providers); better provider/service/category cards + category grid; smoother transitions; improved spacing & visual hierarchy — all token-driven, additive, no behavior change.

## 9. Admin

**None** (decision: static Featured/Trending → no admin work). No admin screens/schema touched.

## 10. Testing

- **DB/RLS:** as-role — a customer sees/modifies only their own `favorite_providers`; another customer/provider cannot read them; the curated provider read exposes no PII. Unique constraint prevents duplicate favorites.
- **Libs:** favorites add/remove/list; local recent-searches cap + clear; `searchServices`/suggestions matching; pure `sortProviders`/`filterProviders` for every sort + each filter + combinations; recently-used derivation.
- **Components/screens:** search instant results + recent/popular + empty + no-result; provider browse sort+filter+favorite; favorites screen + quick-rebook deep-links to the booking flow; home discovery sections render. Skeletons/empty states.
- Gate: `npm test` green, `npx tsc --noEmit` clean, `expo export` web + android green.

## 11. Guardrails restated (verification will prove)

Additive only; one new table (`favorite_providers`, owner-only RLS); search history local (no schema); no payment/wallet/promotions/dispatch/payout/analytics/operations/auth/notification change; no booking/dispatch workflow change (discovery browse-only; quick-rebook = existing flow prefilled); no AI/ranking (sort/filter are UI transforms); no maps/distance/pricing/bidding; no provider PII exposed.

## 12. Open assumptions

- The curated provider browse read reuses the existing public-provider field convention (no phone); if a listing read must be added it is additive/read-only.
- `response_time` and `distance` have no data source this slice → shown only when present (future-ready), sorts back them with available data as a documented proxy.
- Recently-used (services + providers) derives read-only from existing bookings; no new writes.
- Featured/Trending curation lives in code (`constants/discovery.ts`) — editable by devs, not runtime-configurable (out of scope: admin toggle).
