# Slice 32 — Search, Discovery & Marketplace Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn QuickServe into a polished discovery marketplace — fast search, richer browsing, comparable provider cards, favorites, and UI polish — all additive and customer-facing, with no booking/dispatch/ranking/business-workflow change.

**Architecture:** One new table (`favorite_providers`, owner-only RLS) + additive read-only curated provider reads. Local-first search history (AsyncStorage). Static Featured/Trending constants. New/enhanced customer screens + components, with **client-side** sort/filter (not a ranking algorithm) over curated reads. Booking still flows through the existing `useBookingDraft().start(serviceId)` → `/booking/address`; discovery is browse-only.

**Tech Stack:** Supabase (one additive migration + curated read RPCs), Expo Router `(customer)` app, `@react-native-async-storage/async-storage` (already a dep), TypeScript, Jest + RNTL.

**Spec:** `docs/superpowers/specs/2026-07-05-slice-32-search-discovery-marketplace-design.md`

## Global Constraints (bind every task)

- **Additive only.** `favorite_providers` is the ONLY new table. Search history is **local-first (AsyncStorage)** — no `search_history` table. Featured/Trending are **static curated constants** (`constants/discovery.ts`) — no admin, no schema.
- **Discovery-only browse layer.** NO provider-request booking, NO preferred-provider dispatch, NO ranking algorithm. Sorting & filtering are **pure client-side UI transforms** over a curated read. **Quick rebooking uses ONLY the existing booking flow** (`start(serviceId)` → `/booking/address`) — never targets a specific provider, never touches dispatch.
- **No change to:** payment / wallet / promotions / dispatch / provider-payout / analytics / Operations Portal / auth / notifications. No AI recommendations. No maps / distance / routing / pricing / bidding / search-index engine. No provider PII exposed (curated fields only — mirror the existing 0005 public-provider read; no phone).
- Migration file is `supabase/migrations/0027_favorite_providers.sql` (next after 0026). Reuse patterns: owner-only RLS from `customer_addresses` (0019); curated provider fields from the 0005 public-provider read; lib idioms from `promotions.ts`/`favorites`-style (reads → `[]`, mutations → `{ ok, error? }`); AsyncStorage as used in `src/lib/supabase.ts`; NativeTabs are explicit → new screens are additive pushed routes (no tab-bar change).
- **Gate every task:** `npm test` green, `npx tsc --noEmit` clean, `npx expo export --platform web` + `--platform android` succeed.

---

## File Structure

**Create**
- `supabase/migrations/0027_favorite_providers.sql` — table + owner-only RLS + 2 curated read RPCs.
- `src/constants/discovery.ts` — Featured/Trending ids, popular searches, sort/filter defs (+ test).
- `src/lib/search.ts`, `src/lib/recent-services.ts`, `src/lib/favorites.ts`, `src/lib/providers-browse.ts` (+ tests).
- `src/components/ui/` — `marketplace-provider-card.tsx`, `favorite-button.tsx`, `provider-sort-control.tsx`, `provider-filter-bar.tsx`, `search-field.tsx`, `search-suggestions.tsx`, `recent-searches.tsx`, `popular-searches.tsx`, `skeleton.tsx`, `category-grid.tsx` (+ enhanced `service-card.tsx`/`category-card.tsx`) (+ tests).
- `src/app/(customer)/search.tsx`, `src/app/(customer)/providers.tsx`, `src/app/(customer)/favorites.tsx` (+ screen tests).
- `docs/pilot/marketplace-discovery.md` — verification doc.

**Modify (additive only)**
- `src/app/(customer)/index.tsx` — additive discovery sections + entry links (search/providers/favorites). No existing behavior removed.

**Reuse (do not change behavior):** `constants/services.ts`, `useBookingDraft`, `Card`/`SearchBar`/`SectionHeader`/`Avatar`/`VerifiedBadge`, the 0005 curated provider read, `customer_addresses` RLS pattern.

---

## Task Order (dependency-ordered)

1. **T1** — Migration 0027: `favorite_providers` + owner-only RLS + curated provider read RPCs + schema/RLS tests.
2. **T2** — `constants/discovery.ts` + `lib/search.ts` (local recents + keyword search) + `lib/recent-services.ts` + tests.
3. **T3** — `lib/favorites.ts` + `lib/providers-browse.ts` (curated read + pure sort/filter) + tests.
4. **T4** — Components (provider card, favorite button, sort/filter controls, search components, skeletons, card/grid improvements, empty states) + tests.
5. **T5** — Screens (Search, Provider browse, Favorites) + enhanced Home + entry links + tests.
6. **T6** — Verification doc + isolation + no-dispatch/workflow-change proof + final gate.

Each task ends green (`npm test` / `tsc` / both exports).

---

### Task 1: Migration 0027 — favorite_providers + owner-only RLS + curated reads

**Files:** Create `supabase/migrations/0027_favorite_providers.sql`; Test `src/__tests__/favorites-schema.test.ts`

**Build (SQL):**
- `create table if not exists public.favorite_providers ( id uuid pk default gen_random_uuid(), customer_id uuid not null references public.profiles(id) on delete cascade, provider_id uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), unique (customer_id, provider_id) )`. Index `(customer_id, created_at desc)`.
- `enable row level security`. **Owner-only RLS** (mirror `customer_addresses`): `favorite_providers_select`/`_insert`/`_delete` `using/with check (customer_id = auth.uid())`. (Delete allowed — remove favorite. No update policy.)
- **Curated read RPCs** (SECURITY DEFINER, `set search_path = public`; mirror the 0005 public-provider field convention — NO phone/PII):
  - `list_public_providers()` → returns curated rows (id, full_name, profile_photo_url, skills, is_verified, average_rating, completed_jobs_count, years_experience, availability_status, created_at) for approved/visible providers. Plain select — **no ordering/ranking logic** (sort happens client-side).
  - `get_my_favorite_providers()` → same curated fields, for `favorite_providers` rows where `customer_id = auth.uid()`. (SECURITY DEFINER but scoped to the caller's favorites via auth.uid().)
- SQL comments: "additive; owner-only favorites; curated reads expose no PII; no ranking (sort/filter client-side)".
- Grep 0005 first to mirror the EXACT existing curated-provider function name/fields; do not expose fields it doesn't.

**Test (`favorites-schema.test.ts`, static fs-read):** table + RLS enabled; the 3 owner-only policies use `customer_id = auth.uid()`; unique `(customer_id, provider_id)`; the 2 read RPCs are `security definer` + `set search_path = public`; no phone/PII column in the RPC return lists; no existing table/policy altered (only new objects).

**Steps:** write SQL → static test → `npm test` → `tsc` → both exports → commit `feat: slice32 migration 0027 favorite_providers + curated reads`.

---

### Task 2: Discovery constants + search lib + recent-services

**Files:** Create `src/constants/discovery.ts`, `src/lib/search.ts`, `src/lib/recent-services.ts`; Tests alongside

**Build:**
- `constants/discovery.ts` — `FEATURED_SERVICE_IDS: string[]`, `TRENDING_SERVICE_IDS: string[]` (curated from `SERVICES` ids), `POPULAR_SEARCHES: string[]`, `PROVIDER_SORTS` (`{ id: 'highest_rated'|'most_jobs'|'fastest_response'|'recently_active'|'alphabetical'; label }[]`), `PROVIDER_FILTERS` defs (`rating`,`availability`,`verified_only`,`category`,`service`,`favorites`,`recently_used`). Helper `getFeaturedServices()`/`getTrendingServices()` resolving ids → `Service` from `constants/services.ts`.
- `lib/search.ts` — **local recent searches** via AsyncStorage (`@react-native-async-storage/async-storage`, key `qs.recentSearches`, max 8): `getRecentSearches(): Promise<string[]>`, `addRecentSearch(term)`, `clearRecentSearches()`. **Keyword search** (pure, over `SERVICES`): `searchServices(query): Service[]` (match title/subtitle/category, case-insensitive), `searchSuggestions(query): string[]`. No network, no PII.
- `lib/recent-services.ts` — `getRecentlyUsedServices(): Promise<Service[]>` derived read-only from the customer's existing bookings (distinct recent service ids → resolve to `Service`). Reuse an existing bookings read; return `[]` on error.

**Tests:** recents cap at 8 + de-dupe (newest first) + clear (mock AsyncStorage); `searchServices` matches by title/subtitle/category + empty query; suggestions; `getRecentlyUsedServices` derivation (mock bookings). 

**Steps:** TDD → `npm test` → `tsc` → both exports → commit `feat: slice32 discovery constants + local search + recent services`.

---

### Task 3: Favorites lib + providers-browse (curated read + pure sort/filter)

**Files:** Create `src/lib/favorites.ts`, `src/lib/providers-browse.ts`; Tests alongside

**Build:**
- `lib/favorites.ts` — `addFavorite(providerId): Promise<{ok;error?}>` (insert into `favorite_providers`, `customer_id = auth uid`), `removeFavorite(providerId)` (delete where customer+provider), `getMyFavorites(): Promise<PublicProvider[]>` (rpc `get_my_favorite_providers`), `getFavoriteIds(): Promise<string[]>` (select provider_id). Reads → `[]`, mutations → `{ ok, error? }`. Add a `PublicProvider` type (the curated fields).
- `lib/providers-browse.ts` — `listProviders(): Promise<PublicProvider[]>` (rpc `list_public_providers`). **Pure** helpers (no I/O): `sortProviders(list, sortKey): PublicProvider[]` — highest_rated (average_rating desc), most_jobs (completed_jobs_count desc), fastest_response (future-ready — response field when present else stable fallback), recently_active (availability/recency), alphabetical (full_name). `filterProviders(list, filters, ctx): PublicProvider[]` — additive & combinable: rating(min), availability, verified_only, category/service (via skills/service mapping), favorites (intersect favoriteIds), recently_used (intersect the customer's booked-before provider ids). **These are pure array transforms — NOT a ranking algorithm and NEVER influence dispatch.**

**Tests:** favorites add/remove/list/ids (mock supabase); `sortProviders` for all 5 sorts (stable + correct order); `filterProviders` for each filter + a combination (additive intersection); error paths.

**Steps:** TDD → `npm test` → `tsc` → both exports → commit `feat: slice32 favorites + providers-browse (curated read + client sort/filter)`.

---

### Task 4: Components (cards, favorite button, sort/filter, search, skeletons, empty states)

**Files:** Create the components listed in File Structure under `src/components/ui/`; enhance `service-card.tsx`/`category-card.tsx`; Tests alongside

**Build (presentational; consume T2/T3 libs + tokens; no direct supabase except favorites lib):**
- `marketplace-provider-card.tsx` `MarketplaceProviderCard({ provider, isFavorite, onToggleFavorite, onPress })` — avatar/name, **rating**, **jobs completed**, **verification badge**, **years on QuickServe** (from `created_at`/`years_experience`), **availability indicator** (`availability_status`), **FavoriteButton**. **Response time & distance rendered ONLY when present** (future-ready — omit today; no backend). No phone/PII.
- `favorite-button.tsx` `FavoriteButton({ active, onToggle })` — heart toggle, optimistic, accessible.
- `provider-sort-control.tsx` (`PROVIDER_SORTS` chips → onChange) + `provider-filter-bar.tsx` (filter chips/sheet, additive/combinable → onChange).
- Search: `search-field.tsx` (instant/controlled input), `search-suggestions.tsx`, `recent-searches.tsx` (chips + clear), `popular-searches.tsx`.
- `skeleton.tsx` (shimmer/placeholder block) + reuse/extend `empty-state.tsx` variants (search-empty, no-results, no-favorites, no-providers).
- Enhanced `service-card.tsx` / `category-card.tsx` + new `category-grid.tsx` — better visual hierarchy/spacing (additive props, keep existing usage working).

**Tests:** provider card renders rating/jobs/verified/years/availability + favorite toggle fires; response-time/distance hidden when absent; FavoriteButton toggles; sort/filter controls emit selections; search components render + recent clear; skeleton renders; empty-state variants; enhanced cards keep existing props working.

**Steps:** TDD → `npm test` → `tsc` → both exports → commit `feat: slice32 marketplace components`.

---

### Task 5: Screens (Search, Provider browse, Favorites) + enhanced Home

**Files:** Create `src/app/(customer)/{search,providers,favorites}.tsx`; Modify `src/app/(customer)/index.tsx`; Tests in `src/__tests__/`

**Build:**
- `search.tsx` — `SearchField` (instant, controlled state); as-you-type `searchServices` results; before typing → `RecentSearches` (local) + `PopularSearches`; `SearchSuggestions`; **empty state**; **no-result** → recommendations (featured/popular). Tapping a service → `addRecentSearch` + `start(serviceId)` → `/booking/address`.
- `providers.tsx` — `listProviders()` (loading → skeletons); `ProviderSortControl` (client-side `sortProviders`) + `ProviderFilterBar` (client-side `filterProviders`, combinable); grid/list of `MarketplaceProviderCard` with favorite toggle (favorites lib, optimistic); empty/no-match states.
- `favorites.tsx` — `getMyFavorites()`; `MarketplaceProviderCard`s with remove-favorite; **quick rebooking** = a CTA that calls `start(serviceId)` → `/booking/address` (existing flow, prefilled service) — **never targets the provider, never touches dispatch**; empty state when none.
- `index.tsx` (Home) — additive sections: Featured, Trending, Recently used, (existing Popular), Browse-all category grid; polished cards/skeletons; entry links: search bar → `/(customer)/search`, a "Browse providers" link → `/(customer)/providers`, a "Favorites" link → `/(customer)/favorites`. Do NOT remove/alter existing Home behavior or the tab set (new screens are pushed routes, not tabs).

**Tests:** search screen (instant results, recent+popular before typing, no-result recommendations, tap → start + navigate); providers screen (renders from listProviders, a sort reorders, a filter narrows, favorite toggles); favorites screen (renders favorites, remove, **quick-rebook calls `start(serviceId)` + routes to `/booking/address`** and does NOT call any dispatch/provider-request fn); home renders the new sections + entry links. Keep existing customer tests green.

**Steps:** `expo export --platform android` (route types) → TDD screens → `npm test` → `tsc` → `expo export --platform web` → commit `feat: slice32 discovery screens + enhanced home`.

---

### Task 6: Verification + isolation + no-dispatch proof + final gate (FINAL)

**Files:** Create `docs/pilot/marketplace-discovery.md`

- **Isolation:** `git diff <base>..HEAD --name-only` — changes only under `supabase/migrations/0027*`, `src/constants/discovery*`, `src/lib/{search,recent-services,favorites,providers-browse}*`, `src/components/ui/*` (new + enhanced cards), `src/app/(customer)/{search,providers,favorites,index}.tsx`, and this doc + tests. Prove: **NO** change to payment/wallet/promotions/dispatch/payout/analytics/operations/auth/notification files; **NO** migration other than 0027; **NO** existing-table/policy alteration; **only** the additive Home edits.
- **No-dispatch/workflow proof:** grep the discovery screens/libs — booking is only ever initiated via `useBookingDraft().start(serviceId)` → `/booking/address`; there is **no** "request this provider" path, no provider id passed into booking/dispatch, no dispatch/ranking call. `sortProviders`/`filterProviders` are pure and consumed only by the browse UI. Document this.
- **RLS/access:** `favorite_providers` owner-only (as-role spot-audit: another customer/provider can't read the caller's favorites); curated reads expose no PII. Document the queries + expected results.
- **Additive DB note:** migration 0027 is additive (one table + read RPCs; no existing-table change, no backfill).
- **Final gate:** `npm test` green, `tsc` clean, `expo export` web + android green, `git status` clean.
- Commit `test: slice32 marketplace discovery verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-32-marketplace`. Abandon = `git checkout main` + delete branch.
- **Per-task revert:** independent commits — `git revert <commit>` rolls back one. Reverting T4/T5 removes UI (libs/table harmless if unused); reverting T2/T3 removes libs.
- **DB rollback:** migration 0027 is purely additive (one new table + 2 read RPCs; no existing-table/policy/data change). Undo = a follow-up `drop function list_public_providers, get_my_favorite_providers; drop table favorite_providers cascade;` — no data migration to reverse. Local search history is on-device only (no server state to roll back).
- **No payment/dispatch/workflow involvement** — rollback confined to the additive marketplace layer; existing booking/dispatch untouched throughout.

---

## Self-Review

- **Requirement coverage:** migration 0027 + favorite_providers + owner-only RLS (T1) · favorites.ts (T3) · search.ts + local AsyncStorage history (T2) · providers-browse.ts (T3) · recent-services.ts (T2) · constants/discovery.ts + static Featured/Trending (T2) · MarketplaceProviderCard + FavoriteButton + sort/filter controls + service/category card improvements + skeletons/empty states (T4) · enhanced Home + Search + Provider browse + Favorites screens (T5) · quick rebooking via existing flow (T5) · no-dispatch/workflow verification + rollback (T6/this section). Every "Include" item mapped.
- **Constraint coverage:** discovery-only browse / no provider-request booking / no preferred-provider dispatch / quick-rebook via existing flow (Global Constraints, T5, T6 proof) · local-first search history (T2) · static Featured/Trending (T2) · favorite_providers only new table (T1) · no payment/wallet/promotions/dispatch/payout/analytics/operations/auth/notification change (T6 isolation) · no AI/ranking (sort/filter pure UI, T3) · no maps/distance/routing (absent).
- **Placeholder scan:** none (response-time/distance future-ready = intentional).
- **Name consistency:** RPC names (`list_public_providers`/`get_my_favorite_providers`) identical T1(SQL)↔T3(rpc); `favorite_providers` table T1↔T3; `PublicProvider` type T3↔T4↔T5; lib fn names (`addFavorite`/`removeFavorite`/`getMyFavorites`/`getFavoriteIds`/`listProviders`/`sortProviders`/`filterProviders`/`getRecentSearches`/`addRecentSearch`/`clearRecentSearches`/`searchServices`/`getRecentlyUsedServices`) consistent T2/T3↔T4↔T5; `PROVIDER_SORTS`/`PROVIDER_FILTERS`/`FEATURED_SERVICE_IDS`/`TRENDING_SERVICE_IDS` consistent T2↔T4↔T5; component filenames T4↔T5; `start(serviceId)`→`/booking/address` used verbatim for quick-rebook.
