# Slice 35 — Dynamic Service & Marketplace Management: Verification & Compatibility Guide

Accurate as of migration `0030_services_marketplace.sql` and branch `feat/slice-35-services-marketplace`
(commit range `db1e647..ace9a3a`).

**Related docs:** [marketplace-discovery.md](./marketplace-discovery.md) · [analytics.md](./analytics.md) · [operations-portal.md](./operations-portal.md) · [security-hardening.md](./security-hardening.md) · [provider-quality.md](./provider-quality.md)

---

## 1. Overview

Slice 35 replaces code-defined services with an **admin-managed DB catalog**. The app no longer
hard-codes which services exist, what they cost, or which are featured/trending. An admin can add,
edit, reorder, activate, archive, or duplicate services at runtime — and the entire mobile + web
surface updates immediately on next load.

| Dimension | Before (main) | After (slice 35) |
|---|---|---|
| Service catalog | `constants/services.ts` array (19 hard-coded) | `services` + `service_categories` DB tables |
| Featured / Trending | `constants/discovery.ts` static arrays | `services.featured` / `services.trending` DB flags |
| Service ordering | Fixed code order | `display_order` column, admin-editable |
| Categories | `CATEGORY_ORDER` constant | `service_categories` DB table, admin-editable |
| Admin management | None | Full CRUD via 9 SECURITY DEFINER RPCs + management UI |
| Service resolution | `SERVICES.find(s => s.id === slug)` (can return undefined) | `getServiceBySlug(slug)` — 3-step fallback, never throws, never returns blank |

**Zero booking regression.** `bookings.service_id` remains `text` (the slug). Existing bookings never
break because `getServiceBySlug` has a 3-step fallback chain (DB cache → constants shim → generic
humanized label). No booking/dispatch/payment/wallet/auth/notification/analytics logic was changed.

**Compatibility key.** `services.slug` is identical to the old `Service.id` strings used everywhere
in the app. This single invariant ensures all existing bookings, favorites, receipts, and analytics
continue to resolve correctly with no data migration.

---

## 2. Data Model & RLS

### Tables

**`public.service_categories`** — one row per top-level category.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Internal PK, never exposed to consumers |
| `slug` | `text` unique | Format `^[a-z0-9]+(-[a-z0-9]+)*$`; DB-enforced check constraint; **immutable** (update RPC accepts no slug param) |
| `name` | `text` | Display name |
| `icon` | `text` | Glyph or emoji; nullable |
| `color` | `text` | Hex color; nullable |
| `display_order` | `int` | Non-admin consumers see categories sorted by this |
| `active` | `boolean` default `true` | Inactive categories are hidden from non-admin callers |
| `created_at`, `updated_at` | `timestamptz` | Auto-set / auto-updated |

**`public.services`** — one row per bookable service.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Internal PK |
| `slug` | `text` unique | Format-checked; **immutable** after creation |
| `name` | `text` | Display title |
| `short_description` | `text` | Subtitle; nullable |
| `full_description` | `text` | Long-form; nullable |
| `category_id` | `uuid` FK → `service_categories.id` | Nullable (allows orphan drafts) |
| `icon`, `color` | `text` | Display glyph / hex; nullable |
| `display_order` | `int` | Sort within category |
| `status` | `text` check `('draft','active','hidden','disabled','archived')` default `'draft'` | Lifecycle state; only `'active'` rows are visible to non-admin |
| `featured`, `trending`, `emergency_available`, `inspection_required`, `available_24_7` | `boolean` default `false` | Operational flags |
| `estimated_duration`, `starting_price_text` | `text` | Display-only metadata; nullable |
| `active_from`, `active_until` | `timestamptz` | Optional scheduling window; nullable |
| `created_at`, `updated_at` | `timestamptz` | Auto-managed |
| **UNIQUE** | `(category_id, name)` | Prevents duplicate service names within a category |

### Row-Level Security (RLS)

RLS is enabled on both tables (`alter table … enable row level security`). There are **exactly 3 policies per table** (6 total) — and **no `for delete` policy on either table**. Hard delete is prohibited at the DB level; the archive path (`admin_set_service_status('archived')`) is the only removal mechanism.

**`service_categories` policies** (migration lines 29–36):

| Policy name | Operation | Predicate |
|---|---|---|
| `service_categories_select` | SELECT | `active = true OR public.is_admin()` — non-admin sees only active categories |
| `service_categories_insert` | INSERT | `public.is_admin()` — admin-only write |
| `service_categories_update` | UPDATE | `public.is_admin()` (using + with check) — admin-only write |
| *(none)* | DELETE | **No delete policy** — hard delete is blocked |

**`services` policies** (migration lines 76–83):

| Policy name | Operation | Predicate |
|---|---|---|
| `services_select` | SELECT | `status = 'active' OR public.is_admin()` — non-admin sees only active services |
| `services_insert` | INSERT | `public.is_admin()` — admin-only write |
| `services_update` | UPDATE | `public.is_admin()` (using + with check) — admin-only write |
| *(none)* | DELETE | **No delete policy** — hard delete is blocked |

### As-Role RLS Spot Audit

Run these queries in the Supabase SQL editor to verify RLS behaves as designed:

```sql
-- ── A. Non-admin customer: sees only active categories ───────────────────────
-- Expected: only rows where active = true (4 rows in seed state)
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"cust-uuid","role":"authenticated"}';
select slug, active from public.service_categories order by display_order;
-- Expected result: home, auto, delivery, personal (all active = true)

-- ── B. Non-admin customer: sees only active services ────────────────────────
-- Expected: only rows where status = 'active' (19 rows in seed state)
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"cust-uuid","role":"authenticated"}';
select slug, status from public.services order by display_order limit 5;
-- Expected result: 5 active services; no draft/hidden/disabled/archived rows

-- ── C. Admin: sees all services (any status) ────────────────────────────────
-- Expected: all rows including draft / hidden / archived
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"admin-uuid","role":"authenticated","user_metadata":{"role":"admin"}}';
select count(*) from public.services;
-- Expected result: >= 19 (seed) + any admin-created drafts

-- ── D. Non-admin: INSERT blocked ────────────────────────────────────────────
-- Expected: ERROR — new row violates row-level security policy
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"cust-uuid","role":"authenticated"}';
insert into public.services (slug, name, status) values ('test-svc', 'Test', 'draft');
-- Expected: ERROR 42501

-- ── E. Non-admin: DELETE attempt blocked (no delete policy = default deny) ──
-- Expected: 0 rows deleted (RLS default-deny with no policy = block)
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"cust-uuid","role":"authenticated"}';
delete from public.services where slug = 'house-cleaning';
-- Expected: 0 rows affected

-- ── F. Admin: DELETE still blocked (no delete policy on table) ───────────────
-- Admins can archive (status='archived') but cannot hard-delete via RLS.
-- Expected: 0 rows deleted
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"admin-uuid","role":"authenticated","user_metadata":{"role":"admin"}}';
delete from public.services where slug = 'house-cleaning';
-- Expected: 0 rows affected (no FOR DELETE policy exists)
```

---

## 3. Migration & Seed

Migration file: `supabase/migrations/0030_services_marketplace.sql`

### Idempotent, Non-Destructive Seed

The seed uses `ON CONFLICT (slug) DO NOTHING` on **both** insert statements (migration lines 402, 453).
This means:
- Re-running the migration never overwrites admin edits.
- There is no `DO UPDATE` clause — existing rows are left completely intact.
- The seed is safe to apply on an already-populated database.

### 4 Categories Seeded

| Slug | Name | `display_order` | `active` |
|---|---|---|---|
| `home` | Home Services | 0 | true |
| `auto` | Auto Services | 1 | true |
| `delivery` | Delivery Services | 2 | true |
| `personal` | Personal Care | 3 | true |

### 19 Services Seeded (slug = old `Service.id`)

All seeded with `status = 'active'`. `featured` and `trending` flags match
`FEATURED_SERVICE_IDS` / `TRENDING_SERVICE_IDS` from `constants/discovery.ts`.

| Slug | Name | Category | `featured` | `trending` |
|---|---|---|---|---|
| `house-cleaning` | House Cleaning | home | ✓ | |
| `plumbing` | Plumbing | home | | ✓ |
| `electrical` | Electrical Repairs | home | | |
| `ac-repair` | AC Repair & Servicing | home | ✓ | |
| `painting` | Home Painting | home | | |
| `pest-control` | Pest Control | home | | |
| `handyman` | Handyman Services | home | | ✓ |
| `appliance-repair` | Appliance Repair | home | | |
| `movers-packers` | Movers & Packers | home | | ✓ |
| `mechanic` | Mechanic On Demand | auto | ✓ | |
| `tire-replacement` | Tire Replacement | auto | | ✓ |
| `car-towing` | Car Towing | auto | | |
| `grocery-delivery` | Grocery Delivery | delivery | | ✓ |
| `food-delivery` | Food Delivery | delivery | ✓ | |
| `medicine-delivery` | Medicine Delivery | delivery | | |
| `package-delivery` | Package Delivery | delivery | | |
| `haircuts` | Haircuts | personal | | ✓ |
| `makeup` | Makeup | personal | | |
| `massage` | Massage | personal | ✓ | |

---

## 4. Admin RPCs

Migration `0030_services_marketplace.sql` appends **9 CRUD RPCs** (T2 section). All 9 share these invariants:

- `SECURITY DEFINER SET search_path = public` — bypasses RLS while holding a fixed search path.
- First statement: `if not public.is_admin() then raise exception 'not authorized'; end if;` — non-admin callers are rejected before any data access.
- **No hard delete** — the only removal RPC is `admin_set_service_status('archived')`.
- **Slug immutable on update** — neither `admin_update_service` nor `admin_update_category` accepts a `p_slug` parameter; the slug column is never touched after creation.

### Category RPCs (4)

| RPC | Key behavior |
|---|---|
| `admin_create_category(p_slug, p_name, p_icon, p_color)` | Validates `p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`; raises `'invalid slug format'` if invalid; inserts at `max(display_order)+1` |
| `admin_update_category(p_id, p_name, p_icon, p_color)` | Updates name/icon/color only — **no `p_slug` param** (slug immutable) |
| `admin_set_category_active(p_id, p_active)` | **Category-active guard**: if `p_active = false` and active services exist in this category, raises `'category has active services'`; prevents orphaning active services |
| `admin_reorder_categories(p_ordered_ids uuid[])` | Sets `display_order` atomically via `unnest + generate_subscripts` |

### Service RPCs (5)

| RPC | Key behavior |
|---|---|
| `admin_create_service(p_slug, p_name, p_short_description, p_full_description, p_category_id, p_icon, p_color, p_estimated_duration, p_starting_price_text)` | Validates slug format; inserts with `status='draft'`; `display_order = max()+1` within category |
| `admin_update_service(p_id, p_name, p_short_description, p_full_description, p_category_id, p_icon, p_color, p_estimated_duration, p_starting_price_text, p_featured, p_trending, p_emergency_available, p_inspection_required, p_available_24_7)` | 14 params, **no `p_slug`** (slug immutable); updates all editable fields + 5 boolean toggles; `coalesce` preserves existing values when null passed |
| `admin_set_service_status(p_id, p_status)` | Validates `p_status in ('draft','active','hidden','disabled','archived')`; raises `'invalid status value'` otherwise; no hard delete |
| `admin_duplicate_service(p_id)` | Copies all fields; slug = `src_slug + '-copy'` (unique-ified with `-2`, `-3`, … suffix); name = `src_name + ' (copy)'`; `status = 'draft'`; `featured = false`, `trending = false` |
| `admin_reorder_services(p_category_id, p_ordered_ids uuid[])` | Sets `display_order` atomically within the given category |

### Duplicate + Format Guards

- **Duplicate slug**: `services.slug` has a `UNIQUE` constraint → `admin_create_service` / `admin_duplicate_service` raise `23505 unique_violation` mapped to `'A service/category with that slug already exists.'`
- **Duplicate name-in-category**: `UNIQUE(category_id, name)` → `admin_create_service` / `admin_update_service` raise `23505` mapped to `'A service with that name already exists in this category.'`
- **Invalid slug format**: DB check constraint + RPC pre-validation raise `'invalid slug format'` → mapped to `'Slug must be lowercase letters, numbers and hyphens.'`
- All error mapping lives in `mapRpcError` (`src/lib/services-catalog.ts` line 130) — no raw Supabase error leaks to the UI.

### As-Role RPC Spot Audit

```sql
-- ── A. Non-admin: admin_create_category rejected ─────────────────────────────
-- Expected: ERROR P0001 not authorized
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"cust-uuid","role":"authenticated"}';
select public.admin_create_category('test-cat', 'Test', null, null);
-- Expected: ERROR P0001

-- ── B. Admin: create → then update without slug param ────────────────────────
-- Expected: category name changes; slug does not change
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"admin-uuid","role":"authenticated","user_metadata":{"role":"admin"}}';
select public.admin_create_category('my-new-cat', 'My New Cat', null, null);
-- Returns: a UUID (the new category id)
select public.admin_update_category(
  (select id from public.service_categories where slug = 'my-new-cat'),
  'My Renamed Cat', null, null
);
select slug, name from public.service_categories where slug = 'my-new-cat';
-- Expected: slug = 'my-new-cat' (unchanged), name = 'My Renamed Cat'

-- ── C. Category-active guard ─────────────────────────────────────────────────
-- Expected: ERROR P0001 category has active services (if any active services exist in 'home')
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"admin-uuid","role":"authenticated","user_metadata":{"role":"admin"}}';
select public.admin_set_category_active(
  (select id from public.service_categories where slug = 'home'),
  false
);
-- Expected: ERROR P0001 'category has active services' (home has 9 active services in seed)

-- ── D. Invalid slug format rejected ──────────────────────────────────────────
-- Expected: ERROR P0001 invalid slug format
select public.admin_create_service(
  'Invalid Slug!', 'Bad Service', null, null,
  (select id from public.service_categories where slug = 'home'),
  null, null, null, null
);
-- Expected: ERROR P0001

-- ── E. Duplicate slug rejected ───────────────────────────────────────────────
-- Expected: ERROR 23505 unique_violation
select public.admin_create_service(
  'house-cleaning', 'Duplicate', null, null,
  (select id from public.service_categories where slug = 'home'),
  null, null, null, null
);
-- Expected: ERROR 23505
```

---

## 5. DB-Driven Catalog

### Provider: `ServicesProvider` (`src/services/services-provider.tsx`)

The `ServicesProvider` is mounted at the root of the app in `src/app/_layout.tsx`:

```
ThemeProvider > AuthProvider > ServicesProvider > BookingDraftProvider > content
```

On mount it fires `Promise.all([listActiveServices(), listActiveServiceCategories()])`, populates
two lookup maps (`serviceBySlug`, `categoryById`), and exposes a context value via `useServices()`.

### Cache Fallback Chain

If the DB call fails or returns empty:

| State | Behavior |
|---|---|
| `dbServices.length > 0` | Use DB rows, mapped via `toService()`, sorted by category rank then `display_order` |
| `dbServices.length === 0` | Fall back to `constants/services.ts` `SERVICES` array (compile-time catalog) |
| `dbCategories.length > 0` | Use DB categories, sorted by `display_order` |
| `dbCategories.length === 0` | Fall back to `CATEGORY_ORDER` / `CATEGORY_LABELS` from constants |

### DB-Driven Featured / Trending / Popular

| Method | When DB has rows | When DB is empty (fallback) |
|---|---|---|
| `getFeatured()` | Filters `dbServices` where `featured = true`, maps via `toService()` | `getFeaturedServices()` from `constants/discovery.ts` |
| `getTrending()` | Filters `dbServices` where `trending = true`, maps via `toService()` | `getTrendingServices()` from `constants/discovery.ts` |
| `getPopular()` | Delegates to `getFeatured()` | Same as above |

`constants/discovery.ts` `FEATURED_SERVICE_IDS` / `TRENDING_SERVICE_IDS` are now marked
`@legacy FALLBACK` — they are exported and retained but are not the source of truth for any UI.

### Ordering

Active services on consumer screens are sorted by:
1. Category rank (position of the category slug in `CATEGORY_ORDER`)
2. `display_order` within the category

`constants/services.ts` is **never mutated** and is retained as seed source, fallback catalog, legacy
types, and the rollback baseline.

---

## 6. Compatibility Audit

All 15 surfaces that display service names or lists were audited. Every surface resolves service
labels via `useServices()` / `getServiceBySlug()` (the 3-step fallback) or the cache list — no
surface uses `SERVICES.find()` directly in the refactored code.

| # | Surface | File | Resolution method | Changed |
|---|---|---|---|---|
| 1 | Booking detail (customer) | `src/app/booking/[id].tsx` | `getServiceBySlug(booking.service_id)` | Yes — T5 |
| 2 | Booking review / summary | `src/app/booking/review.tsx` | `getServiceBySlug(draft.serviceId)` | Yes — T5 |
| 3 | Booking status card | `src/components/customer/booking-status-card.tsx` | `getServiceBySlug(booking.service_id)` | Yes — T5 |
| 4 | Provider job detail | `src/app/provider/job/[id].tsx` | `getServiceBySlug(booking.service_id)` | Yes — T5 |
| 5 | Provider home (job list) | `src/app/provider/(tabs)/index.tsx` | `getServiceBySlug(j.service_id)` | Yes — T5 |
| 6 | Admin mobile booking list | `src/app/admin/index.tsx` | `getServiceBySlug(b.service_id)` | Yes — T5 |
| 7 | Admin mobile booking detail | `src/app/admin/booking/[id].tsx` | `getServiceBySlug(b.service_id)` | Yes — T5 |
| 8 | Admin web booking list | `src/app/(admin-web)/bookings/index.tsx` | `getServiceBySlug(row.service_id)` via `buildColumns` | Yes — T5 |
| 9 | Admin web booking detail | `src/app/(admin-web)/bookings/[id].tsx` | `getServiceBySlug(b.service_id)` | Yes — T5 |
| 10 | Analytics labels | `src/app/(admin-web)/analytics/index.tsx` | `getServiceBySlug(s.service_id).title` (labels only) | Yes — T5 |
| 11 | Customer home | `src/app/(customer)/index.tsx` | `useServices()` cache — `getFeatured()`, `getTrending()`, `getServicesByCategory()`, `getServiceBySlug()` for recents | Yes — T5 |
| 12 | Customer search | `src/app/(customer)/search.tsx` | `searchServices(services, query)` over cache | Yes — T5 |
| 13 | Customer preferences (favorites) | `src/app/(customer)/preferences.tsx` | `services` cache list | Yes — T5 |
| 14 | Marketplace discovery | `src/app/(customer)/index.tsx` | `getFeatured()` / `getTrending()` from DB flags | Yes — T5 |
| 15 | Recent services | `src/lib/recent-services.ts` + home screen | `getRecentlyUsedServiceIds()` + `getServiceBySlug()` | Yes — T5 |

**Surfaces left unchanged (no refactor needed):**

| Surface | File | Reason |
|---|---|---|
| Provider filter / sort controls | `src/app/(customer)/providers.tsx`, `src/lib/providers-browse.ts`, filter-controls component | Consume discovery `ServiceCategory` type strings only — no service name lookup |
| Popular searches | `src/constants/discovery.ts` | Static search terms; no service name resolution |
| Receipts | `src/lib/receipts.ts` | `buildReceipt` derives no service name (slug stored; screen resolves label) |
| Favorite services | `src/lib/favorite-services.ts` | Stores/reads slugs; resolution is the screen's responsibility |

---

## 7. Fallback Proof

The `getServiceBySlug(slug: string): Service` function in `ServicesProvider` **never throws** and
**always returns a displayable `Service`** with a non-blank `title`.

### 3-Step Fallback Chain

```
getServiceBySlug(slug)
    │
    ├── Step 1: DB cache hit (serviceBySlug[slug] exists)
    │       → toService(dbRow, categorySlug)
    │       → title = dbRow.name (always non-null, DB enforced)
    │
    ├── Step 2: Not in DB cache — try constants shim
    │       → getServiceById(slug) from constants/services.ts
    │       → Covers services that were active in old bookings but are now archived
    │       → title = legacy Service.title (always non-blank for the 19 seeded services)
    │
    └── Step 3: Unknown slug (not in DB, not in constants)
            → { id: slug, title: humanize(slug), icon: '🧩', category: 'home' }
            → humanize('future-service-alpha') = 'Future Service Alpha'
            → Always produces a readable title — never returns '' or undefined
```

### Test Coverage

`src/__tests__/s35-fallback.test.tsx` proves all three cases across multiple surfaces:

| Test case | Surface(s) | Expected outcome | Verified in test |
|---|---|---|---|
| **(a) ACTIVE** — slug in DB cache | `BookingStatusCard`, `BookingDetailScreen`, `AdminBookingDetailScreen`, mock fixture | Returns DB name (`'House Cleaning'`) | Yes |
| **(b) ARCHIVED** — slug in constants but not in DB | Same surfaces | Returns constants shim title (`'Plumbing'`, `'Pest Control'`) | Yes |
| **(c) UNKNOWN** — slug in neither | Same surfaces | Returns humanized generic (`'Totally Unknown Xyz'`, `'Future Service Alpha'`, `'Brand New Unknown Service'`) | Yes |
| **Never throws** | `getServiceBySlug` with 5 edge-case slugs | No exception thrown | Yes — `expect(() => …).not.toThrow()` |
| **No blank title** | All three cases above | `svc.title` is always a non-empty string | Implicitly verified by `getByText` assertions |

Additional fallback coverage in `s35-fallback.test.tsx`:
- `getRecentlyUsedServiceIds` returns slugs for archived/unknown services without crashing (screen resolves via `getServiceBySlug`).
- `searchServices(services, query)` operates on the cache list passed explicitly — no global import.

---

## 8. Isolation & No-Workflow Proof

### Files Changed (`git diff main..HEAD --name-only`)

All 52 changed files fall exclusively into these categories:

| Category | Files |
|---|---|
| **Migration** | `supabase/migrations/0030_services_marketplace.sql` (only migration) |
| **Services lib** | `src/lib/services-catalog.ts`, `src/lib/services-catalog.test.ts` |
| **Services provider** | `src/services/services-provider.tsx`, `src/services/services-provider.test.tsx` |
| **Constants** | `src/constants/services.ts` (additive: +9 optional fields + `getServiceById`), `src/constants/discovery.ts` (comments only — demoted to `@legacy FALLBACK`), `src/constants/icons.ts` (new), `src/constants/icons.test.ts` (new) |
| **Consumer refactor** | `src/app/booking/[id].tsx`, `src/app/booking/review.tsx`, `src/app/(customer)/index.tsx`, `src/app/(customer)/search.tsx`, `src/app/(customer)/preferences.tsx`, `src/app/provider/(tabs)/index.tsx`, `src/app/provider/job/[id].tsx`, `src/app/admin/index.tsx`, `src/app/admin/booking/[id].tsx`, `src/app/(admin-web)/bookings/index.tsx`, `src/app/(admin-web)/bookings/[id].tsx`, `src/app/(admin-web)/analytics/index.tsx`, `src/components/customer/booking-status-card.tsx` |
| **Admin UI (new)** | `src/app/(admin-web)/services/index.tsx` + 5 components under `src/components/admin-web/services/` + `src/components/admin-web/admin-sidebar.tsx` |
| **Shared libs** | `src/lib/search.ts`, `src/lib/search.test.ts`, `src/lib/recent-services.ts` |
| **Root layout** | `src/app/_layout.tsx` (ServicesProvider added to provider tree) |
| **Tests** | `src/__tests__/s35-admin-services.test.tsx`, `src/__tests__/s35-fallback.test.tsx`, `src/__tests__/services-marketplace-schema.test.ts`, + 14 existing test files with `useServices` mock additions |
| **Test util** | `test/mock-services.ts` |

### No-Workflow Proof

The following systems are **completely unchanged** in this slice:

| System | Evidence |
|---|---|
| **Booking workflow** | `src/lib/bookings.ts` not in diff; `createBooking(serviceId, …)` signature unchanged; booking creation flow (`start(slug)` → `/booking/address` → `/booking/review`) identical |
| **`bookings.service_id`** | Remains `text not null` (migration `0002_bookings.sql`); no migration touches this column; no data migration |
| **Dispatch / assignment** | `src/lib/dispatch.ts`, `assignProvider` — not in diff |
| **Provider ranking** | Not in diff |
| **Payment / M-Pesa** | `src/lib/payments.ts`, `src/lib/attempts.ts`, `src/lib/mpesa.ts` — not in diff |
| **Wallet** | `src/lib/wallet.ts` — not in diff |
| **Promotions** | `src/lib/promotions.ts` — not in diff |
| **Payout / earnings** | `src/lib/earnings.ts` — not in diff |
| **Auth** | `src/auth/auth-context.tsx` — not in diff; `is_admin()` RPC reused from migration `0026` |
| **Notifications** | `src/lib/notifications.ts` — not in diff |
| **Analytics logic** | `src/app/(admin-web)/analytics/index.tsx` changed ONLY in two label lines: `SERVICES.find(…)?.title ?? s.service_id` → `getServiceBySlug(s.service_id).title`; no query, aggregation, `.from`, `.rpc`, `.eq`, date-range, or KPI logic change |
| **Operations portal** | Not in diff |
| **Only migration 0030** | `git diff main..HEAD --name-only` shows only `supabase/migrations/0030_services_marketplace.sql`; no other migration touched |
| **`constants/services.ts` kept** | File retained; SERVICES array, CATEGORY_ORDER/LABELS, getServicesByCategory, getPopularServices all intact; 9 optional fields and `getServiceById` added (additive only) |

---

## 9. Rollback

### Application Rollback (pre-merge)

```bash
git revert feat/slice-35-services-marketplace
# or, before merging:
git checkout main
```

The retained `constants/services.ts` and the `getServiceById` fallback mean the app continues to
function on the static constants catalog with zero code changes required.

### DB Rollback

If the migration has been applied and needs to be reversed:

```sql
-- Step 1: Drop all 9 admin RPCs
drop function if exists public.admin_reorder_services(uuid, uuid[]);
drop function if exists public.admin_duplicate_service(uuid);
drop function if exists public.admin_set_service_status(uuid, text);
drop function if exists public.admin_update_service(uuid, text, text, text, uuid, text, text, text, text, boolean, boolean, boolean, boolean, boolean);
drop function if exists public.admin_create_service(text, text, text, text, uuid, text, text, text, text);
drop function if exists public.admin_reorder_categories(uuid[]);
drop function if exists public.admin_set_category_active(uuid, boolean);
drop function if exists public.admin_update_category(uuid, text, text, text);
drop function if exists public.admin_create_category(text, text, text, text);

-- Step 2: Drop the tables (cascade drops RLS policies + indexes)
drop table if exists public.services cascade;
drop table if exists public.service_categories cascade;
```

**Post-rollback app state:**

- The app automatically falls back to `constants/services.ts` (the ServicesProvider returns `SERVICES`
  when the DB tables are gone / queries return empty).
- `bookings.service_id` slugs are unchanged — all existing booking records remain intact and
  resolve correctly via the constants catalog.
- No customer-facing booking data needs to be reversed.

---

## 10. Release Gate

All 5 final-gate checks passed on 2026-07-07:

| Check | Result |
|---|---|
| `npm test` | **PASS** — 2572 tests, 198 suites, 0 failures |
| `npx expo export --platform android` | **PASS** — bundle exported to `dist/` (run before tsc to generate route types) |
| `npx expo export --platform web` | **PASS** — all routes exported including `/(admin-web)/services` |
| `npx tsc --noEmit` | **PASS** — 0 type errors |
| `git status` | **CLEAN** — only `supabase/.temp/` untracked (ignored); doc committed |

**Merge readiness:** All gate checks pass. No Critical or Important defects found. The 1 Critical
defect identified during T5 (Rules-of-Hooks violation in `provider/job/[id].tsx`) was fixed in
commit `3ad1fc8` before this verification. The 3 cosmetic Minor issues from T6 are documented only.
Branch is merge-ready.
