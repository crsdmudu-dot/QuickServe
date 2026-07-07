# Slice 35 — Dynamic Service & Marketplace Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace code-defined services with an admin-managed, DB-driven marketplace — launch/disable/modify services with no code deploy, reflected in the customer/provider apps — with zero booking regression and no workflow change.

**Architecture:** Migration `0030` adds `service_categories` + `services` (RLS: non-admin sees only active, admin sees all; admin-only insert/update; NO delete) + admin CRUD RPCs (validation + move-up/down reorder) + an idempotent seed of the current 4 categories + 19 services (`slug` == existing ids). A `services-catalog` lib + a `ServicesProvider`/`useServices()` cache expose the catalog; every consumer resolves by **slug** through a fallback chain (DB → `constants/services.ts` shim → raw slug). Featured/trending/popular come from DB flags. `constants/services.ts` is KEPT as seed source / legacy fallback / type compat / rollback.

**Tech Stack:** Supabase (migration + RLS + SECURITY DEFINER RPCs + seed), Expo Router (customer/provider apps + `(admin-web)`), TypeScript, Jest + RNTL.

**Spec:** `docs/superpowers/specs/2026-07-07-slice-35-dynamic-service-marketplace-design.md`

## Global Constraints (bind every task — incorporating the approved clarifications)

1. **Explicit RLS:** non-admin users SELECT only `status='active'` services (and `active=true` categories); admins SELECT all; only admins INSERT/UPDATE; **NO DELETE policy** on either table.
2. **Old bookings never break:** resolving a `service_id` slug uses the fallback order **DB service (if RLS-accessible) → `constants/services.ts` legacy shim → raw `service_id` (safe generic label)**. Booking detail/history/admin/provider/receipt/analytics screens MUST render a safe fallback for a disabled/hidden/archived/missing slug.
3. **Do NOT remove `constants/services.ts`** — keep it fully (the `Service`/`ServiceCategory`/`ServiceBadge` types + the `SERVICES` array + helpers) as: seed source, legacy fallback, type compatibility, rollback layer.
4. **Slugs are compatibility keys:** `services.slug` == old service id; slug is **immutable after creation** (the update RPC must reject slug changes — and never for a slug referenced by bookings); validate **slug format** (`^[a-z0-9]+(-[a-z0-9]+)*$`); prevent duplicate slugs.
5. **Idempotent, non-destructive seed:** re-running the seed uses `on conflict (slug) do nothing` — it MUST NOT overwrite admin-edited service/category content.
6. **Status behavior:** `active` = visible + bookable in customer/provider apps; `draft`/`hidden`/`disabled`/`archived` = admin-visible only + not shown/bookable to customers/providers. **No booking workflow change** — booking still keys by slug exactly as today.
7. **Featured/trending/popular from DB** after migration; no hardcoded featured/trending remain as source of truth (only as legacy fallback). Popular folds into `featured`.
8. **No** booking-workflow / dispatch / provider-ranking / payment / wallet / promotions / payout / auth / notification / analytics / Operations change. **No AI.** Icons = predefined names/emoji (no upload). Reorder = move up/down.
9. Migration file is `supabase/migrations/0030_services_marketplace.sql` (next after 0029). Reuse: `is_admin()` RLS + SECURITY DEFINER RPC idiom (0026); owner/admin patterns; `(admin-web)` CRUD (`promos/index.tsx`); `bookings.service_id text` (unchanged). **Gate every task:** `npm test` green, `npx tsc --noEmit` clean, `expo export` web + android green.

---

## File Structure

**Create**
- `supabase/migrations/0030_services_marketplace.sql` — 2 tables + RLS + RPCs + idempotent seed.
- `src/lib/services-catalog.ts` (+ test).
- `src/services/services-provider.tsx` (`ServicesProvider` + `useServices`) (+ test).
- `src/constants/icons.ts` — the predefined icon-name/emoji set (+ test).
- `src/app/(admin-web)/services/index.tsx` (+ category/service management, or split into a couple of components under `src/components/admin-web/services/`) (+ tests).
- `docs/pilot/services-marketplace.md` — verification + compatibility-audit + rollback doc.

**Modify (behavioral-neutral / additive)**
- `src/constants/services.ts` — KEEP the array + types; add the new optional fields to the `Service` type + a `getServiceById` legacy helper if missing (fallback). Do NOT delete.
- `src/constants/discovery.ts` — `FEATURED_/TRENDING_SERVICE_IDS` demoted to legacy fallback (no longer the source of truth).
- The service consumers (~24 files) + root layout (mount `ServicesProvider`) — refactor to `useServices()`/`getServiceBySlug`.
- `src/components/admin-web/admin-sidebar.tsx` — add the "Services" entry.

**Reuse (do not change behavior):** booking flow (keys by slug), `bookings.service_id`, `favorite_services.service_id`, receipts, `DataTable`/`Card`/`Input`/`Button`/`PageMeta`.

---

## Task Order (dependency-ordered)

1. **T1** — Migration 0030 tables + explicit RLS + slug/format/immutability constraints + schema tests.
2. **T2** — Admin CRUD RPCs (validation + reorder) + idempotent non-destructive seed + RPC/seed tests.
3. **T3** — `services-catalog.ts` lib (reads + admin mutation wrappers) + tests.
4. **T4** — `ServicesProvider`/`useServices()` cache + fallback chain + `constants/icons.ts`; keep `constants/services.ts`/`discovery.ts` as fallback + tests.
5. **T5** — Consumer refactor (all ~24) to the cache + the compatibility audit across the 12 surfaces + tests.
6. **T6** — Admin Services & Categories management UI (CRUD + toggles + status + duplicate + reorder + icon picker) + sidebar + tests.
7. **T7** — Verification doc (as-role RLS, migration, DB-driven featured/trending/ordering, compatibility-audit results, fallback proof, rollback) + isolation + final gate.

Each task ends green (`npm test` / `tsc` / both exports).

---

### Task 1: Migration 0030 — tables + explicit RLS + slug constraints

**Files:** Create `supabase/migrations/0030_services_marketplace.sql` (tables + RLS only — RPCs/seed in T2); Test `src/__tests__/services-marketplace-schema.test.ts`

**Build (SQL):**
- `service_categories` + `services` per spec §3.1–3.2. `services.slug` `check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')` + `unique`; `status` check (5 values); `unique (category_id, name)`; indexes (`status`, `category_id`, `display_order`). `category_id` references `service_categories(id)`.
- **RLS (explicit):** enable on both.
  - `services_select`: `for select using (status = 'active' or public.is_admin())`.
  - `service_categories_select`: `for select using (active = true or public.is_admin())`.
  - `<t>_insert`: `for insert with check (public.is_admin())`; `<t>_update`: `for update using (public.is_admin()) with check (public.is_admin())`.
  - **NO delete policy** on either table.
- SQL comments: "non-admin select active only; admin all; admin-only write; no delete (archive path)".

**Test (static fs-read):** both tables + columns/enums; slug format check + unique; unique(category_id,name); RLS enabled; `services_select` uses `status = 'active' or public.is_admin()`; `service_categories_select` uses `active = true or public.is_admin()`; admin-only insert/update; **NO `for delete`** on either; indexes present.

**Steps:** SQL → static test → `npm test` → `tsc` → both exports → commit `feat: slice35 migration 0030 services tables + explicit RLS`.

---

### Task 2: Admin CRUD RPCs + idempotent seed

**Files:** Modify `supabase/migrations/0030_services_marketplace.sql` (append RPCs + seed); Test extend `services-marketplace-schema.test.ts`

**Build (SQL — all RPCs `security definer set search_path = public`, first line `if not public.is_admin() then raise ...`):**
- Categories: `admin_create_category`, `admin_update_category` (NO slug change), `admin_reorder_categories(p_ordered_ids uuid[])` (atomic `display_order`), `admin_set_category_active(p_id uuid, p_active boolean)` — **archiving/deactivating raises if the category still has `status='active'` services**.
- Services: `admin_create_service(...)` (validate slug format + uniqueness; unique name-in-category), `admin_update_service(...)` (all fields + 5 toggles; **reject any slug change** — `if p_slug is distinct from existing.slug then raise 'slug is immutable'`), `admin_set_service_status(p_id, p_status)` (hide/disable/archive/restore/activate), `admin_duplicate_service(p_id)` (copies fields, `slug := old || '-copy'` unique-ified, `status := 'draft'`), `admin_reorder_services(p_category_id uuid, p_ordered_ids uuid[])`.
- **Validation → friendly raises:** duplicate slug / bad slug format; duplicate name within category; category-with-active-services deactivate/archive; slug immutability.
- **Seed (idempotent, non-destructive):** `insert into service_categories (...) values (...) on conflict (slug) do nothing;` for the 4 categories; `insert into services (...) select ... on conflict (slug) do nothing;` for the 19 services — slug==id, name=title, short_description=subtitle, icon=emoji, category_id matched, starting_price_text from startingPrice, display_order per order, status='active', featured from `FEATURED_SERVICE_IDS`, trending from `TRENDING_SERVICE_IDS`. **`do nothing` preserves admin edits on rerun.**

**Test (static + light):** all RPCs present + `security definer` + `is_admin()` guard; `admin_update_service` contains a slug-immutability guard; `admin_set_category_active`/archive contains the active-services guard; `admin_reorder_*` update `display_order`; seed uses `on conflict (slug) do nothing` for both tables; the 4 category slugs + all 19 service slugs appear in the seed (== the constants ids); no `on conflict ... do update` (non-destructive).

**Steps:** append SQL → extend test → `npm test` → `tsc` → both exports → commit `feat: slice35 services CRUD RPCs + idempotent seed`.

---

### Task 3: services-catalog lib

**Files:** Create `src/lib/services-catalog.ts`; Test alongside

**Build:**
- Types `DbCategory` / `DbService` (the DB shape incl status + flags).
- Reads (RLS-scoped): `getActiveServices()`/`getActiveCategories()` (non-admin gets active), `adminGetAllServices()`/`adminGetAllCategories()` (admin gets all) — `[]` on error.
- Admin mutations wrapping the RPCs: `adminCreateService`/`adminUpdateService`/`adminSetServiceStatus`/`adminDuplicateService`/`adminReorderServices` + `adminCreateCategory`/`adminUpdateCategory`/`adminReorderCategories`/`adminSetCategoryActive` → `{ ok, error? }` with friendly messages for slug-format/duplicate-slug/duplicate-name/category-active/slug-immutable errors.
- A `toService(db: DbService): Service` mapper (DB shape → the legacy `Service` compat shape, keying by slug).

**Tests:** each read builds the right query; each mutation calls the right rpc with params; friendly error mapping (dup slug/name, category-active, immutable slug); `toService` mapping.

**Steps:** TDD → `npm test` → `tsc` → both exports → commit `feat: slice35 services-catalog lib`.

---

### Task 4: ServicesProvider cache + fallback chain + icons; keep constants as fallback

**Files:** Create `src/services/services-provider.tsx`, `src/constants/icons.ts`; Modify `src/constants/services.ts` (add fields + keep array), `src/constants/discovery.ts` (demote to fallback); Tests alongside

**Build:**
- `constants/icons.ts` — `PREDEFINED_ICONS: { name; glyph }[]` (the emoji set used by the current services + a few extras) + `iconByName(name)`. No uploads.
- `constants/services.ts` — KEEP `SERVICES` + helpers; extend the `Service` type with the new optional fields (status?, featured?, trending?, emergency?, etc.) so cache + fallback share the shape; `getServiceById(id)` legacy helper (fallback). Do NOT delete.
- `constants/discovery.ts` — mark `FEATURED_/TRENDING_SERVICE_IDS` as legacy fallback (used only if the DB cache is empty). No longer the source of truth.
- `services/services-provider.tsx` — `ServicesProvider` (mount near app root) loads `getActiveServices()`+`getActiveCategories()` once, caches; `useServices()` → `{ services, categories, loading, error, reload, getServiceBySlug, getServicesByCategory, getFeatured, getTrending, getPopular }`.
  - `getServiceBySlug(slug)`: **fallback chain** — cache DB hit → else `SERVICES.find(s=>s.id===slug)` (constants shim) → else a safe generic `{ id: slug, title: <humanized slug>, icon: '🧩', category: 'other' }`. Never throws; always returns a displayable `Service`. This guarantees old bookings never break.
  - `getFeatured()/getTrending()` from DB flags (fallback to the discovery constants only when the cache is empty); `getPopular()` = featured; `getServicesByCategory(catSlug)` from the cached active list.

**Tests:** provider loads + caches (mock catalog lib); `getServiceBySlug` — DB hit, constants-shim fallback, generic fallback for unknown slug (no throw); `getFeatured/getTrending` from DB flags + fallback when empty; `getServicesByCategory`; loading state.

**Steps:** TDD → `npm test` → `tsc` → both exports → commit `feat: slice35 ServicesProvider cache + fallback + icons`.

---

### Task 5: Consumer refactor + compatibility audit (12 surfaces)

**Files:** Modify the ~24 consumers + mount `ServicesProvider` in the root layout; Tests updated; Create `.superpowers/sdd/s35-compat-audit.md` scratch (or inline in the T7 doc)

**Build — migrate each consumer from `SERVICES`/`getPopularServices`/`getServicesByCategory`/discovery constants to `useServices()`/`getServiceBySlug` (keyed by slug), with the fallback + `Skeleton` while `loading`. Explicitly audit these 12 surfaces and confirm each renders correctly for active AND for a disabled/hidden/archived/missing slug:**
1. **Booking creation** (`booking/address` / start flow) — service picker uses the cached **active** list; `start(slug)` unchanged.
2. **Booking detail/history** (`booking/[id]`, `(customer)/bookings`, `booking-status-card`) — resolve via `getServiceBySlug` with fallback (archived slug → constants shim → generic).
3. **Customer search** (`(customer)/search`, `lib/search.ts`) — search over cached active services.
4. **Provider browse** (`provider/(tabs)/index`, `provider/job/[id]`) — active services; job's service via `getServiceBySlug`.
5. **Favorites** (`(customer)/favorites`, `lib/favorite-services.ts`) — resolve favorited slugs via `getServiceBySlug` (fallback if a favorited service is later archived).
6. **Recent services** (`lib/recent-services.ts`, `(customer)/preferences`) — resolve booked slugs via fallback.
7. **Reviews** (`booking/review`) — service label via `getServiceBySlug`.
8. **Receipts** (`lib/receipts.ts`) — service label via fallback.
9. **Analytics labels** (`lib/analytics.ts`, `(admin-web)/analytics`) — service-name labels via `getServiceBySlug`/`getServiceById` fallback (DISPLAY labels only — NO analytics logic/query change).
10. **Provider profile/quality** (`provider/quality`) — any service references via fallback.
11. **Admin booking/detail views** (`admin/index`, `admin/booking/[id]`, `(admin-web)/bookings*`) — admin resolves via `getServiceBySlug` (admin cache has all; still fallback-safe).
12. **Home discovery** (`(customer)/index`) — Featured/Trending/browse from the cache (DB flags).

- Home/search/provider/favorites/preferences render the cached **active** list with skeletons; keep every existing screen's behavior/nav otherwise. NO booking/dispatch/payment/analytics-logic change — only the *service label/list source*.

**Tests:** each refactored surface renders from a mocked `useServices()` (active list + `getServiceBySlug`); a **fallback test** — a booking/favorite/receipt referencing an archived/unknown slug still renders a safe label (constants shim then generic); home featured/trending from the cache flags. Keep existing consumer tests green (provide a test `ServicesProvider` wrapper / mock).

**Steps:** `expo export --platform android` (route types unaffected but safe) → TDD → `npm test` → `tsc` → both exports → commit `feat: slice35 consumer refactor to DB catalog + compatibility fallback`.

---

### Task 6: Admin Services & Categories management UI

**Files:** Create `src/app/(admin-web)/services/index.tsx` (+ components under `src/components/admin-web/services/` as needed); Modify `admin-sidebar.tsx`; Tests

**Build:**
- **Categories** section: list ordered by `display_order` with create/edit form (slug[create-only]/name/icon/color), **move up/down** (→ `adminReorderCategories`), hide (`adminSetCategoryActive(false)`), and archive with the active-services guard message.
- **Services** section: list grouped by category & order with a create/edit form (all fields; slug editable ONLY on create; **toggles** Featured/Trending/Emergency/24-7/Requires-inspection; status quick-actions **Visible/Bookable/Hide/Disable/Archive/Restore** via `adminSetServiceStatus`), **duplicate** (`adminDuplicateService`), **move up/down** (`adminReorderServices`), and an **icon picker** over `PREDEFINED_ICONS` (no upload). Inline validation errors (duplicate slug/name, immutable slug, bad format).
- Sidebar: add `{ label: 'Services', route: '/(admin-web)/services', segment: 'services' }`.
- Reuse `DataTable`/`Card`/`Input`/`Button`/`PageMeta` + the `(admin-web)` shell. On any mutation success, reload the admin lists.

**Tests:** categories/services lists render (admin all); create/edit calls the right RPC wrapper; toggles + status quick-actions call `adminUpdateService`/`adminSetServiceStatus`; duplicate; reorder move up/down calls the reorder RPC; icon picker offers predefined icons only; validation errors surfaced. Sidebar shows Services.

**Steps:** `expo export --platform android` (route types) → TDD → `npm test` → `tsc` → `expo export --platform web` → commit `feat: slice35 admin services & categories management UI`.

---

### Task 7: Verification + compatibility audit + isolation + final gate (FINAL)

**Files:** Create `docs/pilot/services-marketplace.md`

- **as-role RLS spot-audit (documented):** a customer & provider SELECT only `status='active'` services / `active` categories (never draft/hidden/disabled/archived / inactive categories); admin SELECTs all; insert/update admin-only; no delete policy; category-with-active-services archive raises; duplicate slug / duplicate name-in-category / bad slug format / slug-change rejected; reorder persists `display_order`. SQL + expected results.
- **Migration proof:** all 19 service slugs (== ids) + 4 categories seeded `active`, correct category/order/featured/trending; seed idempotent + non-destructive (`on conflict do nothing`).
- **DB-driven proof:** flipping featured/trending or reordering in the DB changes app output via the cache (cite the provider tests); no hardcoded featured/trending remain as source of truth (only fallback).
- **Compatibility audit:** the 12-surface table — each renders for an active slug AND degrades safely for a disabled/hidden/archived/missing slug (DB → constants shim → raw). Cite the fallback test.
- **Isolation / no-workflow proof:** `git diff main..HEAD --name-only` — only the marketplace layer + the service-consumer refactors + docs/tests. Prove NO booking-workflow/dispatch/ranking/payment/wallet/promotions/payout/auth/notification/analytics-logic/Operations change (the consumer edits are service label/list source only; `bookings.service_id`/booking creation/dispatch/payment untouched). `constants/services.ts` retained.
- **Rollback:** revert the branch (pre-merge); DB rollback = `drop` the RPCs + `drop table services, service_categories cascade;` — `constants/services.ts` still holds the full catalog so the app runs on the constants fallback (the `getServiceBySlug` chain degrades to the shim); no booking data to reverse.
- **Final gate:** `npm test` green, `tsc` clean (run `expo export --platform android` before tsc), `expo export` web + android green, `git status` clean.
- Commit `test: slice35 services marketplace verification + compatibility audit`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-35-services-marketplace`. Abandon = `git checkout main` + delete branch.
- **Per-task revert:** independent commits — `git revert <commit>`. Reverting the consumer refactor (T5) restores the constants-based rendering; the tables/RPCs are harmless if unused.
- **DB rollback:** additive migration — undo = `drop function <the CRUD RPCs>; drop table public.services, public.service_categories cascade;`. Because `constants/services.ts` is retained (the full 19-service catalog) and `getServiceBySlug` falls back to it, **the app keeps working on the constants fallback** with no booking data to reverse (`bookings.service_id` slugs unchanged throughout).
- **No booking/dispatch/payment/workflow involvement** — rollback confined to the additive catalog tables/RPCs + the (revertible) service-source refactor.

---

## Self-Review

- **Requirement coverage (incl. the 9 clarifications):** explicit RLS active-only/admin-all/admin-write/no-delete (T1, clar.1) · old-bookings fallback chain DB→constants→raw (T4 getServiceBySlug + T5 audit, clar.2) · constants/services.ts kept as seed/fallback/types/rollback (T4, clar.3) · slug=id + immutable + format + unique (T1 constraint + T2 update-guard, clar.4) · idempotent non-destructive seed on-conflict-do-nothing (T2, clar.5) · status active=visible/bookable, others admin-only (T1 RLS + spec §3.3, clar.6) · compatibility audit across the 12 surfaces (T5 + T7, clar.7) · featured/trending/popular from DB, constants only fallback (T2 seed flags + T4 provider + T5 discovery demote, clar.8) · reorder move up/down (T2 RPC + T6 UI, clar.9). Plus: tables/fields (T1), CRUD (T2/T6), homepage/search/provider/customer DB-driven (T5), icons predefined (T4/T6), ordering persisted (T2/T6), validation (T2), migration (T2), verification + rollback (T7).
- **Constraint coverage:** no booking/dispatch/ranking/payment/wallet/promotions/payout/auth/notification/analytics/Operations change (Global + T7 isolation) — only the service catalog source changes; booking keys by slug unchanged. No AI. No hard delete.
- **Placeholder scan:** none (generic-slug fallback + future icon extras are intentional).
- **Name consistency:** table names + RPC names (`admin_create_service`/`admin_update_service`/`admin_set_service_status`/`admin_duplicate_service`/`admin_reorder_services` + category equivalents) identical T2(SQL)↔T3(rpc)↔T6(UI); `services-catalog`/`DbService`/`DbCategory`/`toService` T3↔T4↔T6; `useServices`/`getServiceBySlug`/`getFeatured`/`getTrending`/`getServicesByCategory` T4↔T5; `slug` as the app-facing key throughout; `PREDEFINED_ICONS` T4↔T6.
