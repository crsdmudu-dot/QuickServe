# Slice 35 — Dynamic Service & Marketplace Management (Design Spec)

**Date:** 2026-07-07
**Status:** Design → (user review, then implementation plan)
**Builds on (reuses):** `constants/services.ts` (`Service`/`ServiceCategory` types + the 19 seed services + 4 categories to migrate), every service consumer (~24 files: booking `[id]`/`review`, search, favorites, discovery, receipts, recent-services, analytics, admin bookings, provider screens, `booking-status-card`), the `is_admin()` RLS + SECURITY DEFINER RPC pattern, the `(admin-web)` CRUD pattern (`promos/index.tsx`), and `bookings.service_id text` (unchanged). Nothing in booking/dispatch/payment/wallet/promotions/payout/auth/notifications/analytics/Operations is touched.

## 1. Goal & Decisions

Replace code-defined services with an **admin-managed, database-driven marketplace** — launch/disable/modify services with no code deploy, reflected immediately in the customer/provider apps. **`constants/services.ts` should never need editing again.**

**Confirmed decisions (brainstorm):**
- **`services.slug` = the existing code ids** (`'house-cleaning'`, etc.). The app keys services by **slug** everywhere; `bookings.service_id`/`favorite_services.service_id`/receipts stay `text` (= slug). `services.id` (uuid) is an **internal admin PK only**. **Zero migration of booking/favorite data → zero regression.**
- **Apps read services from the DB via a `ServicesProvider`/`useServices()` cache** (loaded once at app start; RLS returns active for customers/providers, all for admin). Components resolve via `getServiceBySlug(slug)` synchronously from the cache (skeletons while loading). **`constants/services.ts` → keeps the `Service`/`ServiceCategory` TYPES + a thin legacy shim.** Featured / trending / popular come from **DB flags**.
- **Reordering = move up/down buttons** persisting `display_order` via a reorder RPC (robust on react-native-web; no drag-and-drop library). `display_order` is DB-driven regardless.

## 2. Scope & Constraints (hard rules)

**In scope:** `services` + `service_categories` tables; RLS (active for apps, all for admin); admin CRUD RPCs (create/edit/duplicate/hide/disable/archive/restore/reorder + toggles) with validation; a services-catalog client lib + a `ServicesProvider` cache; refactor of all service consumers to the cache (keying by slug); DB-driven featured/trending/popular; a data migration seeding the current 19 services + 4 categories; the admin Services & Categories management UI; verification.

**Out of scope / MUST NOT change (additive/behavioral-neutral):**
- No booking-workflow / dispatch / provider-ranking / payment / wallet / promotions / provider-payout / auth / notification / analytics / Operations change. No AI.
- The booking flow keeps using `service_id` (slug) exactly as today — only the *source* of the service catalog changes (constants → DB cache). No change to how a booking is created/dispatched/paid.
- Icons are **predefined names/emoji** (no arbitrary uploads).

## 3. Data model — migration `0030_services_marketplace.sql` (+ seed)

### 3.1 `service_categories`
- `id uuid pk default gen_random_uuid()`, `slug text not null unique`, `name text not null`, `icon text`, `color text`, `display_order int not null default 0`, `active boolean not null default true`, `created_at`/`updated_at timestamptz not null default now()`.

### 3.2 `services`
- `id uuid pk default gen_random_uuid()`, `slug text not null unique`, `name text not null`, `short_description text`, `full_description text`, `category_id uuid references service_categories(id)`, `icon text`, `color text`, `display_order int not null default 0`,
- `status text not null check (in 'draft','active','hidden','disabled','archived') default 'draft'`,
- `featured boolean not null default false`, `trending boolean not null default false`, `emergency_available boolean not null default false`, `inspection_required boolean not null default false`, `available_24_7 boolean not null default false`,
- `estimated_duration text`, `starting_price_text text`, `active_from timestamptz`, `active_until timestamptz`, `created_at`/`updated_at`.
- **Unique `(category_id, name)`** (prevent duplicate names within a category); `slug` globally unique. Indexes on `status`, `category_id`, `display_order`.

### 3.3 Status & visibility model (single source of truth = `status`)
- `status` is the lifecycle. **Customer & provider apps see ONLY `status = 'active'`** services (whose category is `active`, and — when set — `now()` within `active_from`/`active_until`). This is the "only see active" guarantee.
- Admin quick-actions map to status: **Visible** ⇄ `active`/`hidden`; **Bookable** ⇄ `active`/`disabled`; **Archive**/**Restore** ⇄ `archived`/prior. `draft` = new & unpublished. (No separate `is_visible`/`is_bookable` columns — status is the one gate, matching the CRUD verbs hide/disable/archive/restore.)
- Admin toggles **Featured / Trending / Emergency / 24-7 / Requires-inspection** map to the boolean columns.

### 3.4 Seed (the migration, idempotent)
Insert the 4 categories (home/auto/delivery/personal — `slug`=key, `name`=label, `display_order` per `CATEGORY_ORDER`, `active=true`) and the 19 services from `constants/services.ts` with: `slug`=existing id, `name`=title, `short_description`=subtitle, `icon`=emoji, `category_id`=matched category, `starting_price_text` from `startingPrice`, `display_order` per current order, `status='active'`, `featured` from `FEATURED_SERVICE_IDS` (Slice 32), `trending` from `TRENDING_SERVICE_IDS`. `on conflict (slug) do nothing` (idempotent). → All 19 active + 4 categories = **no customer-facing regression** (slugs == ids).

## 4. RLS & RPCs

**RLS:**
- `service_categories` / `services` **select**: `using (active = true / status = 'active' or public.is_admin())` (apps get active only; admin gets all).
- **insert/update**: `public.is_admin()` only. **No hard delete** exposed (archive/`active=false` is the removal path).

**Admin CRUD RPCs** (SECURITY DEFINER, `set search_path = public`, each starts with the `is_admin()` guard; enforce validation atomically):
- Categories: `admin_create_category`, `admin_update_category`, `admin_reorder_categories(p_ordered_ids uuid[])`, `admin_set_category_active(id, active)` — archiving a category **raises if it still has `active` services** (must archive/move them first).
- Services: `admin_create_service`, `admin_update_service` (all fields + the 5 boolean toggles), `admin_set_service_status(id, status)` (hide/disable/archive/restore/activate), `admin_duplicate_service(id)` (copies fields, new slug `<slug>-copy`, status `draft`), `admin_reorder_services(p_category_id uuid, p_ordered_ids uuid[])`.
- **Validation:** duplicate `slug` → friendly error (unique constraint / 23505); duplicate `name` within category → friendly error (unique `(category_id, name)`); category-with-active-services archive → raise. Reorder RPCs update `display_order` atomically.

## 5. Client — catalog lib + services cache; constants fate

- `src/lib/services-catalog.ts` — reads: `getActiveServices()`, `getActiveCategories()` (RLS active), `adminGetAllServices()`/`adminGetAllCategories()` (admin all); admin mutations wrapping the RPCs (`adminCreateService`/`adminUpdateService`/`adminSetServiceStatus`/`adminDuplicateService`/`adminReorderServices` + category equivalents) → `{ ok, error? }`; a `DbService`/`DbCategory` type (the DB shape). Friendly errors for slug/name/category-active violations.
- `src/services/services-provider.tsx` — a `ServicesProvider` loaded once near the app root; caches active services + categories; exposes `useServices()` → `{ services, categories, loading, getServiceBySlug(slug), getServicesByCategory(catSlug), getFeatured(), getTrending(), getPopular(), reload() }`. `getServiceBySlug` is synchronous over the cache (so `SERVICES.find(...)` consumers become `getServiceBySlug(...)`), returning a `Service`-shaped object (compat).
- `src/constants/services.ts` → **legacy shim:** keep the `Service` type (now `category` is a slug string; add optional new fields) + `ServiceCategory`/`ServiceBadge` types; REMOVE the hardcoded `SERVICES` array & `getPopular/getServicesByCategory` (now from the provider) — or keep a tiny fallback used only if the cache is empty (documented legacy compat). `constants/discovery.ts` `FEATURED_/TRENDING_SERVICE_IDS` removed (now DB flags).
- **Consumer refactor:** all ~24 consumers switch from `SERVICES`/`getPopularServices`/`getServicesByCategory` to `useServices()` cache accessors, keying by **slug**. Screens that list services (home, search, provider, favorites, preferences, discovery) render from the cached active list with `Skeleton` while loading. Resolution of a booking/favorite/receipt `service_id` → `getServiceBySlug(service_id)` (same slug). No booking/dispatch/payment logic touched.

## 6. Admin UI

`(admin-web)/services/` (sidebar entry "Services"):
- **Categories:** list (ordered by `display_order`) with create/edit/hide(active toggle)/archive + **move up/down** (reorder RPC). Guard message when archiving a category with active services.
- **Services:** list (grouped by category, ordered) with create/edit form (all fields + **toggles**: Featured / Trending / Emergency / 24-7 / Requires-inspection + status quick-actions **Visible/Bookable/Hide/Disable/Archive/Restore**) + **duplicate** + **move up/down** (reorder). An **icon picker** over predefined icon names/emoji (no upload). Validation errors surfaced inline (duplicate slug/name).
- Reuse `DataTable`/`Card`/`Input`/`Button`/`PageMeta` + the `(admin-web)` shell.

## 7. Homepage / Search / Provider / Customer (DB-driven)

- **Home:** Featured & Trending sections from `useServices().getFeatured()/getTrending()` (DB flags); "Popular"/browse from the cached active list + categories. No constants.
- **Search:** `searchServices` operates over the cached **active** services.
- **Provider & Customer:** any service listing shows only **active** services (RLS + cache). Booking still keys by slug.

## 8. Testing / Verification

- **DB/RLS (as-role):** a customer & a provider read ONLY `status='active'` services (never draft/hidden/disabled/archived, never inactive categories); admin reads all; insert/update admin-only; category-with-active-services archive raises; duplicate slug / duplicate name-in-category rejected; reorder persists `display_order`.
- **Migration:** all 19 services seeded with `slug`==id + `status='active'` + correct category/order/featured/trending; 4 categories seeded; idempotent.
- **Featured/trending/ordering DB-driven:** flipping a flag / reordering in the DB changes the app output (via the cache) — proven by the provider tests.
- **No regression:** `getServiceBySlug(existing_service_id)` resolves for every seeded slug; booking/favorite/receipt resolution intact; booking flow unchanged.
- **Consumers:** home/search/provider/favorites render from the cache; admin CRUD (create/edit/duplicate/status/reorder/toggles) via the RPCs.
- Gate: `npm test` green, `npx tsc --noEmit` clean, `expo export` web + android green.

## 9. Guardrails restated (verification will prove)

DB-driven catalog with admin CRUD; only the service *source* changes (constants → DB cache) — the booking flow keys by slug exactly as before. No booking/dispatch/ranking/payment/wallet/promotions/payout/auth/notification/analytics/Operations change. No AI. Icons predefined. Reorder via move-buttons persisting `display_order`. Migration idempotent + zero customer-facing regression (slugs == ids, all 19 active).

## 10. Open assumptions

- `services.id` uuid is internal (admin PK/FKs); the app-facing key is `slug` (== old ids) — so no `bookings`/`favorite_services` data change.
- "Popular" (old `badge='Popular'`) folds into `featured`; `badge='New'` folds into `trending` (seed mapping) — the home "Popular" section becomes featured-driven (no separate popular flag).
- `estimated_duration`/`starting_price_text` are text (display-only; no pricing logic — payments unchanged).
- `constants/services.ts` retains types (+ optional tiny fallback) for legacy compat; the seed migration is the single source at launch. It is not edited again for catalog changes.
- The `ServicesProvider` caches once per app session with a `reload()`; "immediately reflected" = on next load/reload (no realtime subscription this slice — no notification/analytics change).
