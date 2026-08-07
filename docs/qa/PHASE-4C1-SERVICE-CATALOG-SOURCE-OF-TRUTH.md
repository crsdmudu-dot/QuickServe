# Phase 4C.1 — Service Catalog Source-of-Truth Hardening

## 1. Executive Summary

The customer app treated a **successful-but-empty** service-catalogue query the same as a **query
failure** — both resurrected the hardcoded 19-service list in `src/constants/services.ts`. This is
wrong for an admin-controlled production catalogue: if an admin intentionally hides/disables every
service, the customer app must show an intentional empty state, not the legacy hardcoded catalogue.

This change makes the **database authoritative on a successful fetch** (empty included) and reserves
the hardcoded fallback for genuine fetch failures only. It is a minimal, client-only change:
no schema, RLS, RPC, migration, Edge Function, or backend data changes.

- **Before:** successful empty DB result → hardcoded 19-service fallback.
- **After:** successful empty DB result → intentional empty state (no fallback).
- **Failure:** genuine DB error → existing hardcoded fallback retained.

## 2. Starting Behavior (proven from source)

`ServicesProvider` fetched via `Promise.all([listActiveServices(), listActiveServiceCategories()])`.
Both helpers **swallow Supabase errors and return `[]`** (`src/lib/services-catalog.ts`), so the
provider received `[]` for *both* success-empty and error. It then decided fallback using
`dbServices.length > 0 ? <DB> : SERVICES` in five places (`services`, `categories`,
`getServicesByCategory`, `getFeatured`, `getTrending`). Net effect:

| Scenario | listActive* result | Provider behaviour (before) |
|---|---|---|
| success + rows | `[...]` | DB catalogue ✅ |
| success + empty | `[]` | **hardcoded 19-service fallback** ❌ |
| genuine error | `[]` (swallowed) | hardcoded fallback (by accident) |

## 3. Business Rule

- **CASE A** — success with ≥1 active service → use DB catalogue, no fallback.
- **CASE B** — success with zero active services → use `[]`, render an intentional empty state, do
  **not** resurrect the hardcoded catalogue.
- **CASE C** — genuine query failure → retain the existing hardcoded fallback (for now).

The distinction is based on **query success vs failure**, never on array length.

## 4. Root Cause

`listActiveServices()`/`listActiveServiceCategories()` collapse success-empty and error into the
same `[]`, and the provider inferred failure from `length === 0`. There was no way to distinguish
`SUCCESS_EMPTY` from `FETCH_ERROR`.

## 5. Downstream Zero-Service Audit

Audited every customer consumer of `useServices()` for zero-service safety:

- **`(customer)/home.tsx`** — rendered section headers (Popular/Featured/Trending + one per category)
  with empty rows when `services=[]`; no crash, no `services[0]` indexing, but no empty state. **This
  is the one consumer changed** (adds the empty state).
- **`(customer)/search.tsx`** — already renders `MarketplaceEmptyState` (`no-results`/`search-empty`);
  degrades cleanly with an empty catalogue. No change.
- **`(customer)/preferences.tsx`** — already guards `services.length === 0`. No change.
- No customer screen indexes `services[0]`/`categories[0]` unguarded. No broader runtime changes were
  required, so scope stayed minimal (no STOP needed).

## 6. Implementation

Smallest safe change using a discriminated fetch result:

**`src/lib/services-catalog.ts`**
- Added `type CatalogFetch<T> = { ok: true; data: T[] } | { ok: false; data: [] }`.
- Added error-aware `fetchActiveServices()` / `fetchActiveServiceCategories()` that return
  `{ ok: false }` on a Supabase error and `{ ok: true, data }` on success (empty included).
- Refactored `listActiveServices()` / `listActiveServiceCategories()` into **thin wrappers** over the
  new fetchers (`return (await fetch…()).data`) — their `[] on error; never throws` contract is
  preserved, so existing callers and tests are unaffected.

**`src/services/services-provider.tsx`**
- Fetches via `fetchActiveServices()` / `fetchActiveServiceCategories()`.
- New `failed` state: `true` only when a fetch genuinely errors (`ok:false`) or throws.
- All five fallback sites now branch on `failed` instead of `dbServices.length > 0`:
  a successful empty result yields `[]`; the hardcoded fallback (`SERVICES`, `CATEGORY_ORDER`,
  `getFeaturedServices`, `getTrendingServices`) is used **only when `failed`**.
- `getServiceBySlug`’s per-slug legacy shim is **unchanged** — it still resolves historical/archived
  slugs from constants so old bookings never break. This is a per-item lookup, distinct from the
  catalogue list, and is intentionally retained.

**`src/app/(customer)/home.tsx`**
- Added `catalogueEmpty = !servicesLoading && services.length === 0`.
- When empty, renders the existing `EmptyState` primitive (title “No services available right now”,
  message “Please check back soon.”) instead of the service sections — neutral copy, no admin
  terminology, no booking action for unavailable services.

No timers/retries/hacks; no dependency or lockfile changes.

## 7. Empty-State Behavior

Reuses the product’s existing `EmptyState` primitive (`src/components/ui/empty-state.tsx`). Copy is
simple and neutral (no “outage”, no “hidden/disabled/archived/database”). Renders identically on
Android/iOS/Expo web, is accessible, shows no stale hardcoded cards, and offers no booking action.

## 8. Regression Tests

- **`src/services/services-provider.test.tsx`** (rewired to the `fetch*` shape):
  - **CASE A** — success with rows → DB catalogue (existing tests retained).
  - **CASE B** (the focused regression) — success empty → `count === 0`, `!== SERVICES.length`,
    featured/trending empty, `home-cat === 0`, `error === none`. **Fails on the pre-fix baseline
    (Received 19), passes after the fix.**
  - **CASE C** — both `ok:false` (realistic swallowed error) and thrown/rejected fetch → fallback to
    `SERVICES` with an error message.
  - `getFeatured`/`getTrending`/`getServicesByCategory` fall back **on error only**, not on empty.
- **`src/lib/services-catalog.test.ts`** — added `fetchActiveServices`/`fetchActiveServiceCategories`
  tests proving `{ ok:true, data:[] }` on empty success vs `{ ok:false }` on error; existing
  `listActive*` “[] on error” tests still pass (delegation preserved).
- **`src/__tests__/home-empty-catalogue.test.tsx`** (new) — “admin has zero active services”: the
  home screen shows the empty state and does **not** render hardcoded services or category sections.
  Fails on baseline (category headers present, no empty state), passes after the fix.
- **`src/__tests__/admin-login-transition.test.tsx`** — mock updated to expose the new `fetch*`
  helpers (it renders the real provider).

**Baseline proof:** temporarily simulating the old `length === 0` fallback made CASE B fail with
`Expected 0, Received 19`; reverting restored green.

## 9. Validation

| Gate | Result |
|---|---|
| Targeted catalog/provider/home tests (6 suites) | ✅ 146 passed |
| Root Jest (full) | ✅ 223 suites / 2959 tests |
| Website Vitest | ✅ 7 files / 102 tests |
| Root TypeScript | ✅ PASS |
| QA TypeScript | ✅ PASS |
| Lint | 59 errors (pre-existing, unchanged — no new errors); non-gating |
| Expo config | ✅ |
| Expo web export | ✅ exit 0 |
| Expo Android export | ✅ exit 0 |
| Secret scan (src) | ✅ clean |

PR-CI-equivalent locally = the same gate set the `PR CI` workflow runs (types, Jest, Vitest, lint,
Expo web+android export); the actual PR workflow additionally runs on Ubuntu/Node 22.

## 10. Admin Functionality Preservation

Admin catalogue management is untouched. The admin RPC wrappers (`adminCreateService`,
`adminUpdateService`, `adminSetServiceStatus`, `adminDuplicateService`, `adminReorderServices`,
category management, ordering) and `listAdminServices`/`listAdminServiceCategories` in
`services-catalog.ts` were **not modified** (only `fetchActive*` added and `listActive*` refactored to
delegate). The admin services test suite (`src/__tests__/s35-admin-services.test.tsx`) passes
unchanged. Create/edit/duplicate/activate/hide/disable/draft/archive and category
create/edit/toggle/reorder behave exactly as before; the change is customer-read-side only.

## 11. Environment / Security Impact

- No schema, migration, RLS, RPC, or Edge Function change; no backend data mutation.
- **Production read-only check:** still **19 active services** (anon count) — catalogue not modified.
- QA catalogue not modified (no QA calls made in this phase).
- No service-role exposure; no payment/push/location changes; no secrets in tracked files.

## 12. Deployment Readiness Impact

Closes the correctness gap where an admin “hide all services” decision would be silently overridden by
the hardcoded catalogue. The DB is now the source of truth on success; the hardcoded list survives
only as a genuine-failure safety net. Client-only; ships with the next app build (not deployed here).

## 13. Remaining Limitations

- The hardcoded fallback is intentionally **retained** for genuine `FETCH_ERROR` (per scope). A future
  phase may replace it with a cached/offline snapshot and remove `constants/services.ts` from the
  runtime path.
- Empty-state copy is a reasonable neutral default; product may refine wording later.
- `getServiceBySlug` still uses the constants shim for historical/archived slugs (by design).

## 14. Final Status

**COMPLETE.** Success-empty is now authoritative (intentional empty state); genuine failures retain
the hardcoded fallback; admin behavior preserved; Production/QA unchanged (Production still 19 active).
No schema/migration/RLS/Edge/payment/push/deploy/OTA/store actions; no secrets exposed. Full Platform
Certification is NOT claimed.
