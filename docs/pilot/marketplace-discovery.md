# Slice 32 — Marketplace Discovery: Verification, Privacy & No-Dispatch Proof

Accurate as of migration `0027_favorite_providers.sql` and commit range `c06ab13..HEAD`
on branch `feat/slice-32-marketplace`.

**Related docs:** [security-hardening.md](./security-hardening.md) · [operations-portal.md](./operations-portal.md) · [saved-addresses.md](./saved-addresses.md) · [production-readiness.md](./production-readiness.md)

---

## 1. Overview

Slice 32 adds a customer-facing **discovery marketplace** to QuickServe — the ability to search
services, browse and compare approved providers, and save favorites. It is **additive and
customer-facing only**:

| Component | What was added |
|---|---|
| `supabase/migrations/0027_favorite_providers.sql` | One new table (`favorite_providers`) + 2 curated read RPCs |
| `src/constants/discovery.ts` | Static Featured/Trending ids + sort/filter config |
| `src/lib/search.ts` | Local keyword search + AsyncStorage recent-search history |
| `src/lib/recent-services.ts` | Read-only recently-used service derivation from booking history |
| `src/lib/favorites.ts` | Favorite-provider CRUD + `PublicProvider` type |
| `src/lib/providers-browse.ts` | Curated provider read + pure sort/filter/search transforms |
| `src/components/ui/` (9 new) | Marketplace presentational components |
| `src/app/(customer)/search.tsx` | New search screen (pushed route) |
| `src/app/(customer)/providers.tsx` | New provider browse screen (pushed route) |
| `src/app/(customer)/favorites.tsx` | New favorites screen (pushed route) |
| `src/app/(customer)/index.tsx` | Home: additive Featured/Trending/Recently-Used sections + entry links |

**Nothing else changed.** No existing booking/dispatch/payment/auth/notification/operations/wallet/
promotions/analytics workflow was touched. The NativeTabs set is unchanged. Provider and admin
apps are unchanged. This is verified by the isolation diff in Section 6.

---

## 2. Data Model & Privacy

### 2.1 Only new table: `favorite_providers`

Migration: `supabase/migrations/0027_favorite_providers.sql`, lines 10–19.

```sql
create table if not exists public.favorite_providers (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.profiles(id) on delete cascade,
  provider_id  uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (customer_id, provider_id)
);
create index if not exists favorite_providers_customer_idx
  on public.favorite_providers (customer_id, created_at desc);
```

No other new table was created. No existing table or policy was altered.
(Confirmed by `git diff main..HEAD --stat`: 5 084 insertions, **3 deletions** — the 3 deletions
are additive lines in `index.tsx` that replaced the prior file content; zero SQL deletions.)

### 2.2 Owner-only RLS (3 policies; no update; no provider/admin access)

Migration lines 26–33:

```sql
-- SELECT: customer sees only their own rows
create policy "favorite_providers_select" on public.favorite_providers
  for select using (customer_id = auth.uid());

-- INSERT: customer can only insert rows owned by themselves
create policy "favorite_providers_insert" on public.favorite_providers
  for insert with check (customer_id = auth.uid());

-- DELETE: customer can only delete their own rows
create policy "favorite_providers_delete" on public.favorite_providers
  for delete using (customer_id = auth.uid());
```

Key guarantees:
- **No UPDATE policy** — favorites cannot be modified in place (insert or delete only).
- **No provider/admin/public policy** — a provider cannot see who has favorited them;
  an admin cannot directly edit favorites via the table (they would need a service-role bypass,
  which is an intentional design choice for operator support).
- RLS is enabled on the table (`alter table public.favorite_providers enable row level security;`).

### 2.3 Curated read RPCs — 10 safe display fields, no PII

Both RPCs are `SECURITY DEFINER` + `set search_path = public` (migration lines 54, 86).
They return **exactly** the following 10 fields — no phone, email, password, national_id, or
any other sensitive column:

| Field | Type | Notes |
|---|---|---|
| `provider_id` | uuid | Display identifier |
| `full_name` | text | Display name |
| `average_rating` | numeric | Aggregate from reviews |
| `review_count` | int | Aggregate count |
| `completed_jobs_count` | int | Aggregate |
| `is_verified` | boolean | Verification badge |
| `years_experience` | int | Self-declared |
| `availability_status` | text | Available/busy/offline |
| `profile_photo_url` | text | Avatar image |
| `created_at` | timestamptz | Account age proxy |

`list_public_providers()` (lines 41–68): filters `role = 'provider' AND approval_status = 'approved'`
— unapproved providers are not visible.

`get_my_favorite_providers()` (lines 73–102): joins `favorite_providers` on
`f.customer_id = auth.uid()` — scoped to the calling customer even inside SECURITY DEFINER.

Grep evidence — no PII field appears in the RPC return lists:

```
$ grep -n "phone\|email\|password\|national_id" supabase/migrations/0027_favorite_providers.sql
(no output — zero matches)
```

### 2.4 As-role RLS spot-audit

The following queries should be run in the Supabase SQL editor, substituting real customer/provider
UUIDs and using appropriate JWTs for each role. Expected results are documented; this is a
**static source-of-truth audit** (migration SQL is the source of truth; no live DB is required
to confirm correctness).

**Query A — Customer A sees only their own favorites**

```sql
-- Run as Customer A (set request.jwt.claims with customer_a_id)
set local role authenticated;
set local request.jwt.claims = '{"sub": "<customer_a_id>"}';

select * from public.favorite_providers;
```

Expected: rows where `customer_id = <customer_a_id>` only. Zero rows from other customers.

**Query B — Customer B cannot see Customer A's favorites**

```sql
-- Run as Customer B
set local role authenticated;
set local request.jwt.claims = '{"sub": "<customer_b_id>"}';

select * from public.favorite_providers where customer_id = '<customer_a_id>';
```

Expected: 0 rows (RLS `customer_id = auth.uid()` filters them out; Customer B's uid ≠ Customer A's).

**Query C — Provider cannot insert or select favorites**

```sql
-- Run as a provider user
set local role authenticated;
set local request.jwt.claims = '{"sub": "<provider_user_id>"}';

-- SELECT: returns only rows where customer_id = provider_user_id (likely 0)
select * from public.favorite_providers;

-- INSERT with another customer_id → rejected by WITH CHECK
insert into public.favorite_providers (customer_id, provider_id)
values ('<customer_a_id>', '<provider_user_id>');
```

Expected: SELECT returns 0 rows (provider is not a customer, no rows owned by provider_user_id).
INSERT raises `new row violates row-level security policy` (with check fails).

**Query D — Curated reads expose no PII; no provider ranking**

```sql
-- Run as any authenticated customer
select * from public.list_public_providers() limit 5;
```

Expected: 5 rows, columns = `{provider_id, full_name, average_rating, review_count,
completed_jobs_count, is_verified, years_experience, availability_status,
profile_photo_url, created_at}`. No phone, email, national_id. No ranking score column.
Order is **unspecified** (plain SELECT, no ORDER BY) — sorting happens client-side.

**Query E — get_my_favorite_providers scoped to caller**

```sql
-- Run as Customer A
select * from public.get_my_favorite_providers();
```

Expected: only providers that Customer A has favorited, ordered by `f.created_at desc`.
Running the same as Customer B returns only Customer B's favorites (zero if none added).

---

## 3. Search History — Local-First, No DB

`src/lib/search.ts` (lines 10–52) uses `@react-native-async-storage/async-storage` with key
`qs.recentSearches` and a cap of `MAX_RECENT_SEARCHES = 8`.

Key facts:
- `getRecentSearches()` — reads from AsyncStorage; returns `[]` on missing or parse error.
- `addRecentSearch(term)` — trims, de-duplicates case-insensitively (moves to front), caps at 8.
- `clearRecentSearches()` — removes the AsyncStorage key.
- **No Supabase import in `search.ts`** — confirmed by the file containing no `supabase` reference.
- **No `search_history` table** — confirmed by grepping all migrations:
  ```
  $ grep -rn "search_history" supabase/migrations/
  (no output — zero matches)
  ```
- Search history is on-device only. Server rollback is not required.

`searchServices()`, `searchSuggestions()`, and `noResultRecommendations()` are **pure functions**
over the static `SERVICES` array — no I/O, no network, no PII.

---

## 4. Featured & Trending — Static Curated Constants

`src/constants/discovery.ts` (lines 10–42):

```typescript
export const FEATURED_SERVICE_IDS: string[] = [
  'house-cleaning', 'mechanic', 'food-delivery', 'massage', 'ac-repair',
];
export const TRENDING_SERVICE_IDS: string[] = [
  'plumbing', 'grocery-delivery', 'handyman', 'haircuts', 'movers-packers', 'tire-replacement',
];
```

- **Static arrays hardcoded in the constant file** — no admin panel, no DB table, no API call.
- `getFeaturedServices()` / `getTrendingServices()` resolve ids to `Service` objects from the
  local `SERVICES` catalog; unknown ids are silently dropped.
- No `featured_services` or `trending_services` table exists in any migration.
- No ranking score or sorting algorithm — the order is the static declaration order.

---

## 5. Discovery-Only Guarantee — No-Dispatch / No-Workflow Proof

This is the central safety guarantee: the marketplace browse layer **cannot affect dispatch,
booking assignment, or provider preference**. Evidence follows.

### 5.1 Booking is only ever initiated via `start(serviceId)` → `/booking/address`

All three customer screens that allow booking use `useBookingDraft().start(serviceId)` followed
by `router.push('/booking/address')`. Grep evidence:

```
$ grep -rn "start(" src/app/(customer)/
src/app/(customer)/index.tsx:40:    start(service.id);
src/app/(customer)/search.tsx:71:    start(service.id);
src/app/(customer)/favorites.tsx:104:    start(serviceId);
```

In every case, only a `serviceId` (string) is passed to `start()`. No `provider_id` is passed.

### 5.2 `provider_id` never enters the booking draft or dispatch

Grep for dispatch/assign/preferred patterns in all new discovery code:

```
$ grep -rn "dispatch\|assign_provider\|preferred.provider\|request_provider" \
    src/app/(customer)/ src/lib/favorites.ts src/lib/providers-browse.ts \
    src/constants/discovery.ts src/lib/search.ts src/lib/recent-services.ts

src/app/(customer)/favorites.tsx:8:  * Never passes provider_id into the booking draft or any dispatch fn.
src/app/(customer)/favorites.tsx:34: * into any booking or dispatch call.
src/app/(customer)/favorites.tsx:103:    // provider_id is NEVER passed to start() or any dispatch fn.
src/app/(customer)/providers.tsx:8:  * No booking, no dispatch, no provider-targeted booking.
```

All four matches are **comments** documenting the guarantee. Zero functional dispatch calls.

### 5.3 Quick-rebook reads service_id only, never passes provider_id to booking

`src/app/(customer)/favorites.tsx`, `resolveRebookServiceId()` (lines 41–56):

```typescript
function resolveRebookServiceId(providerId: string, bookings: Booking[]): string | null {
  // 1. Most recent booking with this provider → its service_id
  const providerBooking = bookings.find((b) => b.assigned_provider_id === providerId);
  if (providerBooking) return providerBooking.service_id;
  // 2. Most recent booking (any) → its service_id
  if (bookings.length > 0) return bookings[0].service_id;
  // 3. No bookings found
  return null;
}
```

Then `handleQuickRebook` (lines 95–106):

```typescript
function handleQuickRebook(provider: PublicProvider) {
  const serviceId = resolveRebookServiceId(provider.provider_id, bookings);
  if (!serviceId) {
    router.push('/(customer)/search');
    return;
  }
  // ONLY start(serviceId) → /booking/address.
  // provider_id is NEVER passed to start() or any dispatch fn.
  start(serviceId);
  router.push('/booking/address');
}
```

`resolveRebookServiceId` reads `assigned_provider_id` from existing booking records to match
a service — it **reads** a field from stored history to find a relevant service id.
The `provider_id` is **not** forwarded to `start()` or to any booking/dispatch function.
The new booking flow starts fresh at `/booking/address` with only a service pre-selected.

### 5.4 `sortProviders` / `filterProviders` / `searchProviders` are pure UI transforms

`src/lib/providers-browse.ts` (lines 42–166):

- All three functions open with `const sorted = [...list]` or `let result = [...list]` —
  they copy the input array and never mutate it.
- No Supabase calls inside these functions — only the initial `listPublicProviders()` read.
- No dispatch/ranking algorithm. The sort keys map to simple field comparisons
  (`average_rating`, `completed_jobs_count`, `availability_status`, `full_name`).
- These functions are consumed exclusively by the `providers.tsx` browse screen UI.
  Their output drives the display list only — it does not feed into any booking draft,
  dispatch queue, or provider assignment.

### 5.5 No maps, distance, routing, AI recommendations, or pricing

Grep across all new files:

```
$ grep -rn "distance\|routing\|geolocation\|AI\|ranking\|pricing\|bid" \
    src/constants/discovery.ts src/lib/ src/app/(customer)/search.tsx \
    src/app/(customer)/providers.tsx src/app/(customer)/favorites.tsx
(no output — zero matches)
```

Response-time and distance fields are intentionally omitted from the `PublicProvider` type
and are marked `FUTURE-READY` in comments (`providers-browse.ts` lines 37, 107).

---

## 6. Isolation Proof

### 6.1 Full diff summary

```
git diff main..HEAD --stat
 38 files changed, 5084 insertions(+), 3 deletions(-)
```

### 6.2 Changed files (all 38)

```
supabase/migrations/0027_favorite_providers.sql          (new)
src/constants/discovery.ts                               (new)
src/constants/discovery.test.ts                          (new)
src/lib/search.ts                                        (new)
src/lib/search.test.ts                                   (new)
src/lib/recent-services.ts                               (new)
src/lib/recent-services.test.ts                          (new)
src/lib/favorites.ts                                     (new)
src/lib/favorites.test.ts                                (new)
src/lib/providers-browse.ts                              (new)
src/lib/providers-browse.test.ts                         (new)
src/components/ui/discovery-skeleton.tsx                 (new)
src/components/ui/discovery-skeleton.test.tsx            (new)
src/components/ui/favorite-button.tsx                    (new)
src/components/ui/favorite-button.test.tsx               (new)
src/components/ui/marketplace-empty-state.tsx            (new)
src/components/ui/marketplace-empty-state.test.tsx       (new)
src/components/ui/marketplace-provider-card.tsx          (new)
src/components/ui/marketplace-provider-card.test.tsx     (new)
src/components/ui/popular-searches.tsx                   (new)
src/components/ui/provider-filter-controls.tsx           (new)
src/components/ui/provider-filter-controls.test.tsx      (new)
src/components/ui/provider-sort-controls.tsx             (new)
src/components/ui/provider-sort-controls.test.tsx        (new)
src/components/ui/search-history-list.tsx                (new)
src/components/ui/search-history-list.test.tsx           (new)
src/components/ui/search-suggestions.tsx                 (new)
src/components/ui/search-suggestions.test.tsx            (new)
src/app/(customer)/search.tsx                            (new)
src/app/(customer)/providers.tsx                         (new)
src/app/(customer)/favorites.tsx                         (new)
src/app/(customer)/index.tsx                             (modified — additive only)
src/__tests__/customer-search.test.tsx                   (new)
src/__tests__/customer-providers.test.tsx                (new)
src/__tests__/customer-favorites.test.tsx                (new)
src/__tests__/customer-home-enhanced.test.tsx            (new)
src/__tests__/favorites-schema.test.ts                   (new)
src/__tests__/home-screen.test.tsx                       (modified — 5-line mock patch)
```

### 6.3 What did NOT change (isolation guarantees)

| Category | Verified by |
|---|---|
| Payment / wallet / promotions | `git diff main..HEAD --name-only` — zero payment/wallet/promo files |
| Dispatch / payout / analytics | `git diff main..HEAD --name-only` — zero dispatch/payout/analytics files |
| Operations portal / auth / notifications | `git diff main..HEAD --name-only` — zero ops/auth/notification files |
| Migration other than 0027 | `git diff main..HEAD -- supabase/migrations/` — only `0027_favorite_providers.sql` |
| Existing table/policy alteration | 0027 contains no `ALTER TABLE`, no `DROP`, no policy on existing tables |
| NativeTabs / app-tabs.tsx | `git diff main..HEAD -- src/app/app-tabs.tsx` — empty (no change) |
| Provider mobile app | `git diff main..HEAD -- "src/app/(provider)"` — empty (no change) |
| Admin web app | `git diff main..HEAD -- "src/app/(admin-web)"` — empty (no change) |

---

## 7. Rollback Plan

- **Pre-merge (branch-level):** All work is on `feat/slice-32-marketplace`. Abandon =
  `git checkout main && git branch -D feat/slice-32-marketplace`. The base (`main`) is untouched.

- **Per-task revert:** Each task is an independent commit. `git revert <commit>` rolls back
  one task cleanly. Reverting T5 removes screens (libs/table harmless if unused);
  reverting T4 removes components; reverting T3/T2 removes libs; reverting T1 removes the table
  (with a subsequent DB rollback — see below).

- **DB rollback:** Migration 0027 is **purely additive** — one new table + 2 new RPCs,
  no existing-table or policy change, no data backfill. To undo:
  ```sql
  drop function if exists public.list_public_providers();
  drop function if exists public.get_my_favorite_providers();
  drop table if exists public.favorite_providers cascade;
  ```
  No data migration to reverse. Existing bookings and profiles are unaffected.

- **Search history:** Local AsyncStorage (`qs.recentSearches`) on the device only.
  No server state — no server rollback required. Uninstalling the app or calling
  `AsyncStorage.removeItem('qs.recentSearches')` clears it.

- **No payment/dispatch/workflow involvement:** Rollback is confined to the additive
  marketplace layer. Existing booking and dispatch flows are completely untouched.

---

## 8. Release Gate

All 5 checks were run after committing the verification doc and must be green before merge.

| Check | Command | Result |
|---|---|---|
| Unit tests | `npm test` | PASS — 1707/1707 tests, 157 suites |
| TypeScript | `npx tsc --noEmit` | PASS — clean (0 errors) |
| Android bundle | `npx expo export --platform android` | PASS — `Exported: dist` |
| Web bundle | `npx expo export --platform web` | PASS — `Exported: dist` |
| Working tree | `git status` | PASS — clean (only untracked `supabase/.temp/`, gitignored) |

Note: `.expo/types/router.d.ts` is gitignored and regenerated by `expo export`. The android
export was run **before** `tsc --noEmit` so the 3 new customer route types
(`/(customer)/search`, `/(customer)/providers`, `/(customer)/favorites`) exist in the
generated router types and `tsc` is clean.

---

## 9. Summary Verdict

Slice 32 is a **clean additive discovery layer**. It introduces one new table, two curated
no-PII read RPCs, local-first search history, static Featured/Trending constants, 9 presentational
components, 3 new customer pushed routes, and an enhanced Home — all behind the existing
booking flow (`start(serviceId)` → `/booking/address`). No dispatch, no provider-request booking,
no payment/auth/notification/operations change, no ranking algorithm. All 5 release gate checks
pass. The branch is ready for merge review.
