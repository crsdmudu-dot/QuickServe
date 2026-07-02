# Slice 20 — Maps & Address Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Glovo/Uber-style address entry — search → suggestions → select → confirm (card + static map) → apartment/access details → review — with the Google Places key held server-side, fully backward-compatible with existing plain-text bookings.

**Architecture:** Two Edge Functions (`places-autocomplete`, `place-details`) hold the Google key as a secret and proxy results behind a switchable `PlacesProvider` abstraction (pure logic in `_shared/places.ts`). The app calls them via `src/lib/places.ts`; a pure `address-format.ts` renders structured fields with `address`-text fallback. 8 nullable `bookings` columns; a manual-entry path preserves today's exact flow.

**Tech Stack:** Expo RN + TS, Expo Router, Supabase (Postgres + Edge Functions on Deno), Google Places (server-side), Jest + RNTL.

## Global Constraints

- **Google Places key is server-side ONLY** (`PLACES_API_KEY` Edge secret) — never in the app bundle, never committed. `verify_jwt = true` on both functions.
- **Existing `bookings.address text not null` stays; all new columns nullable.** Existing bookings must not break — every consumer falls back to `address` when structured fields are absent.
- **Manual address entry must still work with zero Places config** (mock/empty/error → the user can type an address; structured fields stay null).
- No payment/auth/push/chat change. Admin change is display-only (no business logic).
- DB pattern mirrors `0010`+; Edge pattern mirrors `mpesa-*`/`send-push` (`_shared` pure helpers Jest-tested; Deno glue thin; app tsconfig excludes Deno files). Pure helpers stay Deno-free.
- Merge gate every task: `npm test` green, `npx tsc --noEmit` clean, `expo export --platform web` AND `--platform android` succeed.

---

## File Structure

**Create**
- `supabase/migrations/0017_booking_address_fields.sql` — 8 nullable columns.
- `supabase/functions/_shared/places.ts` (+ Jest test) — pure request/parse + `staticMapUrl` builder.
- `supabase/functions/places-autocomplete/index.ts`, `supabase/functions/place-details/index.ts`.
- `src/lib/places.ts` (+ test) — client seam (`searchPlaces`/`getPlaceDetails`/`staticMapUrl`).
- `src/lib/address-format.ts` (+ test) — `formatDestination` (pure, fallback-aware).
- `src/components/ui/address-search.tsx`, `selected-address-card.tsx`, `apartment-details-form.tsx`, `destination-summary.tsx` (+ tests).
- `docs/pilot/places-setup.md`.

**Modify**
- `src/lib/bookings.ts` — `Booking`/`NewBooking`/`createBooking` gain the 8 optional fields.
- `src/booking/booking-draft.tsx` — optional structured location fields + setters.
- `src/app/booking/address.tsx` — reworked search sub-flow + manual fallback.
- `src/app/booking/review.tsx` — location summary.
- `src/app/provider/job/[id].tsx`, `src/app/admin/booking/[id].tsx`, `src/app/(admin-web)/bookings/[id].tsx` — Destination display.
- `supabase/config.toml`, `.env.example` (name only), `tsconfig.json` (exclude the 2 Deno index files).

---

## Task Order (dependency-ordered)

1. **T1** — Migration `0017` (nullable columns).
2. **T2** — `_shared/places.ts` pure helpers + Jest (request build, parse, `staticMapUrl`). Independent of T1.
3. **T3** — Edge Functions `places-autocomplete` + `place-details` + `config.toml` + tsconfig excludes + `.env.example`.
4. **T4** — `src/lib/places.ts` client seam + `bookings.ts`/`BookingDraft` structured fields (+ tests).
5. **T5** — `src/lib/address-format.ts` `formatDestination` + tests.
6. **T6** — Customer UI components: `AddressSearch`, `SelectedAddressCard`, `ApartmentDetailsForm`, `DestinationSummary` (+ tests).
7. **T7** — Rework `booking/address.tsx` (search sub-flow + manual fallback) + `review.tsx` summary.
8. **T8** — Provider + admin (mobile + web) Destination display.
9. **T9** — `places-setup.md` + verification + final gate.

T4/T5 depend on T2 (types). T6 depends on T4/T5. T7 depends on T6. T8 depends on T5.

---

### Task 1: Migration `0017_booking_address_fields.sql`

**Files:** Create `supabase/migrations/0017_booking_address_fields.sql`

- `alter table public.bookings add column if not exists` (all nullable): `address_label text`, `latitude double precision`, `longitude double precision`, `building_name text`, `floor text`, `door_number text`, `landmark text`, `access_notes text`. No RLS change (existing policies cover new columns); `address` unchanged.

**Checks:** applies cleanly; `\d bookings` shows the 8 nullable columns; `npm test` green, `tsc` clean. Commit `feat: slice20 booking address fields (0017)`.

---

### Task 2: `_shared/places.ts` pure helpers

**Files:** Create `supabase/functions/_shared/places.ts`, test at `src/__tests__/places-shared.test.ts` (jest-expo discovers; relative import — same as `daraja.test.ts`).

**Produces (pure, no Deno APIs):**
- `type PlaceSuggestion = { placeId: string; primaryText: string; secondaryText: string }`.
- `type PlaceDetails = { formattedAddress: string; latitude: number; longitude: number }`.
- `buildAutocompleteRequest(baseUrl, key, query, opts?)` → `{ url }` (Google Autocomplete endpoint + `input`/`key`/`components=country:ke`/`sessiontoken?`).
- `parseAutocomplete(json): PlaceSuggestion[]` — from Google `predictions[]` (`place_id`, `structured_formatting.main_text`/`secondary_text`); `[]` on malformed.
- `buildDetailsRequest(baseUrl, key, placeId)` → `{ url }` (Details endpoint + `fields=formatted_address,geometry`).
- `parseDetails(json): PlaceDetails | null` — from `result.formatted_address` + `result.geometry.location.{lat,lng}`; null on malformed.
- `staticMapUrl(params: { baseUrl; key; lat; lng; zoom?; size? }): string` — pure Static Maps URL (server-side key). (The app never calls this with a key; the Edge/details response supplies the finished URL — see T3/T4.)

**Tests:** request URLs contain the right params; parse success + malformed (`{}`/null → `[]`/null); staticMapUrl shape.

**Steps:** TDD → `tsc` → commit `feat: slice20 places pure helpers`.

---

### Task 3: Edge Functions

**Files:** Create `supabase/functions/places-autocomplete/index.ts`, `place-details/index.ts`; Modify `supabase/config.toml`, `tsconfig.json`, `.env.example`

**Build (Deno.serve, `verify_jwt=true`):**
- `places-autocomplete`: parse `{ query }`; require non-empty; `key = Deno.env.get('PLACES_API_KEY')`; `buildAutocompleteRequest` → `fetch` → `parseAutocomplete` → `json({ ok:true, suggestions })`. Empty/invalid → `{ ok:true, suggestions: [] }`; error → `{ ok:false, error }` 200/500.
- `place-details`: parse `{ placeId }`; `buildDetailsRequest` → fetch → `parseDetails`; also compute `staticMapUrl` (key server-side) and return `{ ok:true, details: { formattedAddress, latitude, longitude, mapUrl } }`. Not found → `{ ok:true, details: null }`.
- Both use a JSON helper; wrap in try/catch. The key is read from env only; never returned to the client except inside the finished `mapUrl` (a signed/parameter'd image URL is acceptable — document the restriction).
- `config.toml`: `[functions.places-autocomplete] verify_jwt=true`, `[functions.place-details] verify_jwt=true`.
- `tsconfig.json`: exclude `supabase/functions/places-autocomplete/index.ts` + `place-details/index.ts` (keep `_shared/places.ts` checked).
- `.env.example`: add `PLACES_API_KEY=` (name/placeholder; comment: set via `supabase secrets set`, server-only, restrict to server usage).

**Checks:** `tsc` clean (Deno excluded), `npm test` green; commit `feat: slice20 places edge functions + config`.

---

### Task 4: Client places seam + booking fields

**Files:** Create `src/lib/places.ts` (+ test); Modify `src/lib/bookings.ts`, `src/booking/booking-draft.tsx`

- `places.ts`:
  - `searchPlaces(query): Promise<PlaceSuggestion[]>` → `functions.invoke('places-autocomplete', { body:{ query } })`; `data?.suggestions ?? []`; `[]` on error/empty query.
  - `getPlaceDetails(placeId): Promise<PlaceDetailsWithMap | null>` (`{ formattedAddress; latitude; longitude; mapUrl }`) → `functions.invoke('place-details', { body:{ placeId } })`; null on error.
  - Re-export `PlaceSuggestion` type (mirror the shared shape).
- `bookings.ts`: add the 8 fields to `Booking` (all `| null`) and to `NewBooking` (all optional) + include them in the `createBooking` insert (undefined-safe → null). `address` still required.
- `BookingDraft`: add `address_label`, `latitude`, `longitude`, `building_name`, `floor`, `door_number`, `landmark`, `access_notes` (nullable/empty defaults) + a `setLocation(partial)` setter; keep `address`/`setAddress`. Backward-compatible EMPTY defaults.

**Tests:** `places.test.ts` (mock `functions.invoke`): search success/`[]`/error; details success/null. `bookings`/draft additive fields don't break existing tests.

**Steps:** TDD → `tsc` → commit `feat: slice20 client places seam + booking fields`.

---

### Task 5: `address-format.ts`

**Files:** Create `src/lib/address-format.ts` (+ test)

- `type DestinationInput` = the address-bearing subset (`address`, `address_label?`, `building_name?`, `floor?`, `door_number?`, `landmark?`, `access_notes?`, lat/lng?).
- `formatDestination(input): { primary: string; lines: string[] }` — `primary` = `address_label || address`; `lines` = the present apartment/access details as labeled strings (Building …, Floor …, Door …, Landmark …, Access …), skipping empties. Pure; never throws; **fallback = the `address` text when no structured fields**.

**Tests:** full fields; partial; none (→ just `address`); empty/whitespace fields skipped.

**Steps:** TDD → `tsc` → commit `feat: slice20 address formatter`.

---

### Task 6: Customer UI components

**Files:** Create `src/components/ui/{address-search,selected-address-card,apartment-details-form,destination-summary}.tsx` (+ tests)

- `AddressSearch`: props `{ onSelect(details, suggestion) }`; a search `Input` (debounced ~350ms) → `searchPlaces` → suggestions list (`primaryText`/`secondaryText`); tap → `getPlaceDetails` → `onSelect`. Loading/empty/error states; a "Enter manually" affordance callback. No key handling.
- `SelectedAddressCard`: props `{ formattedAddress; mapUrl? ; onChange }` — address text + static map `<Image source={{uri: mapUrl}}>` when present (graceful no-image fallback) + Change button.
- `ApartmentDetailsForm`: controlled inputs for building/floor/door/landmark/access → `onChange(partial)`; all optional.
- `DestinationSummary`: props `{ input }` → renders `formatDestination` (primary + lines) — reused by review, provider, admin.

**Tests (RNTL):** AddressSearch debounced search renders suggestions + select fires onSelect (mock `@/lib/places`); SelectedAddressCard renders address + Change (+ image when mapUrl); ApartmentDetailsForm edits fire onChange; DestinationSummary renders fallback vs structured.

**Steps:** TDD → `tsc` → commit `feat: slice20 address UI components`.

---

### Task 7: Rework booking address step + review summary

**Files:** Modify `src/app/booking/address.tsx`, `src/app/booking/review.tsx`

- `address.tsx`: sub-flow — `AddressSearch` → on select, store `address`(formatted)/`address_label`/lat/lng/`mapUrl` in the draft; show `SelectedAddressCard` + `ApartmentDetailsForm`. **Manual fallback:** "Enter address manually" reveals the current plain `Input` → sets `address` text only (structured stay null) → today's exact validation/continue. Continue is enabled when `address` is non-empty (search OR manual) — preserving existing gating.
- `review.tsx`: add a **Location** section = `<DestinationSummary input={draft} />` before submit; `createBooking` sends the structured fields (or nulls). No change to other review content or submit logic.

**Checks:** keep `booking-address.test.tsx`/`booking-review.test.tsx` green (mock `@/lib/places`; manual path reproduces old behavior — update mocks additively, never weaken). `npm test`, `tsc`, both exports. Commit `feat: slice20 booking address search + review summary`.

---

### Task 8: Provider + admin destination display

**Files:** Modify `src/app/provider/job/[id].tsx`, `src/app/admin/booking/[id].tsx`, `src/app/(admin-web)/bookings/[id].tsx`

- Each: add a **Destination** section using `<DestinationSummary input={booking} />` (booking already loaded; `Booking` now carries the fields). Falls back to `address` for old bookings. Booking **lists** unchanged (still show `address`/label). Display only — no logic/route change.

**Checks:** keep provider/admin detail tests green (mock as needed); `npm test`, `tsc`, both exports. Commit `feat: slice20 provider + admin destination display`.

---

### Task 9: Setup doc + verification + final gate

**Files:** Create `docs/pilot/places-setup.md`

- **Setup doc:** enable Google **Places API** + **Static Maps API**; create a key restricted to server usage (IP/API restrictions — the key is used only by the Edge Functions, never the app); `supabase secrets set PLACES_API_KEY=…`; `supabase functions deploy places-autocomplete place-details`; `config.toml` `verify_jwt` note; mock/unconfigured behavior (search returns empty → manual entry still works).
- **Verification (documented):** autocomplete returns suggestions; details returns formatted+lat/lng+mapUrl; a booking saves structured fields; an OLD booking (no fields) still renders via `address` fallback on customer/provider/admin; manual-entry booking works with Places disabled; key never in the app bundle (grep the web/android export for the key = absent).
- **Backward-compat check:** existing booking-flow + provider/admin tests green; `address` still required and populated.
- **Final gate:** `expo export --platform web` AND `--platform android` succeed → `tsc` clean → `npm test` green → `git status` clean.
- Commit `test: slice20 places verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-20-maps`. Abandon = `git checkout main` + delete branch.
- **Per-task revert:** independent commits — `git revert <commit>` rolls back one (migration/helpers/functions/UI) without affecting others.
- **Disable Places without code revert:** unset `PLACES_API_KEY` / don't deploy the functions → `searchPlaces` returns `[]`, UI shows the manual-entry path — the booking flow keeps working (backward-compat by design).
- **Remove functions:** `supabase functions delete places-autocomplete place-details`.
- **Schema rollback:** forward-only; if needed `0018_rollback_address_fields.sql` drops the 8 columns (safe — they're nullable and additive; existing `address` untouched). Do not edit `0017` after it's applied to a shared env.
- **Secrets:** rotate `PLACES_API_KEY` via `supabase secrets set` if leaked; none in git.

---

## Self-Review

- **Spec coverage:** 0017 columns (T1), pure places helpers (T2), edge functions + server key + config (T3), client seam + booking/draft fields (T4), address-format fallback (T5), UI components (T6), address search + manual fallback + review summary (T7), provider + admin mobile + web display (T8), setup + verification + backward-compat + rollback (T9 + sections). PlacesProvider abstraction (T2 shared + T3 impl), server-only key (T3/T9), manual fallback (T4/T7), backward compat (T1/T5/T7/T8/T9) — all covered. No payment/auth/push/chat change.
- **Placeholder scan:** none; `PLACES_API_KEY` intentionally operator-set.
- **Type/name consistency:** `PlaceSuggestion`/`PlaceDetails` (T2) reused by client (T4) + UI (T6); `formatDestination`/`DestinationSummary` consistent T5↔T6↔T7↔T8; booking 8 fields consistent T1↔T4↔T5↔T8; `searchPlaces`/`getPlaceDetails` consistent T4↔T6↔T7; edge fn names `places-autocomplete`/`place-details` consistent T3↔T4↔T9.
