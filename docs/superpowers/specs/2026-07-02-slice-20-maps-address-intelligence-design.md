# Slice 20 — Maps & Address Intelligence (Design Spec)

**Date:** 2026-07-02
**Status:** Approved design → implementation plan
**Builds on:** the existing booking flow (`booking/address.tsx` → `BookingDraft` → `createBooking`) and the Edge-Function pattern (Slices 13/15).

---

## 1. Goal & Non-Goals

Upgrade address entry from plain text to a Glovo/Uber-style location experience: search → suggestions → select → confirm (card + static map) → apartment/access details → review. Providers and admin see a clear structured destination. **Fully backward-compatible** with existing plain-text bookings.

**Non-goals (out of scope):** live GPS tracking, provider route navigation, ETA, auto-dispatch by distance, saved addresses, multiple customer addresses, interactive draggable map. **No** payment/auth/push/chat changes; no admin business-logic change beyond displaying structured address.

---

## 2. Architecture

- **Places via Edge Function proxy (no key in app):** two Supabase Edge Functions —
  `places-autocomplete` (query → suggestion list) and `place-details` (place id → `{ formatted_address, lat, lng }`). The **Google Places** key lives ONLY as an Edge secret (`PLACES_API_KEY`); it never ships in the bundle. Reuses the Slice-13/15 `_shared` + `config.toml` pattern; `verify_jwt = true` (only signed-in users search).
- **Switchable provider abstraction:** a pure `PlacesProvider` interface (`autocomplete`, `details`) with a Google implementation, so Mapbox can replace it later without touching screens. Pure request-building/parsing lives in `_shared/places.ts` (Jest-testable); the Deno fetch glue is thin.
- **Static map, no native SDK:** the selected location shows a static map **image URL** (Google Static Maps, built by a pure helper) — lightweight, web + native safe, no `react-native-maps`.
- **Client seam:** `src/lib/places.ts` wraps `supabase.functions.invoke('places-autocomplete'|'place-details')` and exposes `staticMapUrl(lat,lng)` — the only surface the screens call.

---

## 3. Database — migration `0017_booking_address_fields.sql`

Extend `bookings` with **nullable** structured columns (existing `address text not null` unchanged; old bookings keep working):
```sql
alter table public.bookings
  add column if not exists address_label  text,
  add column if not exists latitude       double precision,
  add column if not exists longitude      double precision,
  add column if not exists building_name  text,
  add column if not exists floor          text,
  add column if not exists door_number    text,
  add column if not exists landmark       text,
  add column if not exists access_notes   text;
```
No RLS change (existing booking policies cover the new columns). `address` remains the required human-readable string (set to the selected formatted address, or the typed text if search is skipped). **Fallback rule:** any consumer renders structured fields when present, else the `address` text.

---

## 4. Client Data Layer

- **`src/lib/places.ts`** (+ test): `type PlaceSuggestion = { placeId; primaryText; secondaryText }`; `type PlaceDetails = { formattedAddress; latitude; longitude }`.
  - `searchPlaces(query): Promise<PlaceSuggestion[]>` → `functions.invoke('places-autocomplete')`; `[]` on error/empty.
  - `getPlaceDetails(placeId): Promise<PlaceDetails | null>` → `functions.invoke('place-details')`.
  - `staticMapUrl(lat, lng, opts?): string` — pure; builds a static-map image URL (via an Edge-provided signed URL or a public static endpoint param — key still not in app; see §7). Returns a stable URL string.
- **`src/lib/bookings.ts`:** add the 8 structured fields to the `Booking` type and to `NewBooking`/`createBooking` insert (all optional; `address` still required). No behavior change when they're absent.
- **`BookingDraft`** (`src/booking/booking-draft.tsx`): add optional structured location fields + setters (address_label, lat, lng, building_name, floor, door_number, landmark, access_notes); `address` stays the human string. Backward-compatible defaults (all empty/null).

---

## 5. Address helper (pure, testable) — `src/lib/address-format.ts`

- `formatDestination(b)` → a normalized, human-readable multi-line destination from a booking/draft, using structured fields when present, else falling back to `address`. Used by provider + admin displays and the review summary. Pure + unit-tested (fallback, partial fields, full fields).

---

## 6. UI (customer)

Rework the booking address step into a small sub-flow (keep the route entry `booking/address.tsx`):
- **Address search** (`AddressSearch` component / screen): a search `Input` → debounced `searchPlaces` → **suggestions list**; tapping a suggestion → `getPlaceDetails` → sets draft `address`(formatted)/`address_label`/lat/lng.
- **Selected address card** (`SelectedAddressCard`): shows the chosen address + a **static map thumbnail** (`staticMapUrl`) + a "Change" affordance.
- **Apartment details form** (`ApartmentDetailsForm`): inputs for building name, floor, door/unit, landmark, access notes → draft fields (all optional).
- **Manual fallback:** if search fails / user prefers typing, a "Enter address manually" path sets `address` text only (structured fields stay null) — preserves today's flow exactly.
- **Booking review** (`booking/review.tsx`): a **location summary** via `formatDestination` (address + apt/access details) before submit.
Reuse the polished component kit + tokens. Debounce + loading/empty/error states on search.

---

## 7. Static Map & Key Safety

The Google key must not appear in the app. Two safe options for the static map (plan picks one):
- **Preferred:** a tiny `map-image` Edge Function (or reuse place-details) returns a **signed static-map URL** the app just renders as an `<Image>` — key stays server-side.
- **Alternative:** omit the network map and render a lightweight local placeholder card with the coordinates if a signed URL is unavailable.
Either way the app never holds the key; `staticMapUrl` returns whatever the server/seam provides, with a graceful no-image fallback.

---

## 8. Provider & Admin Display

- **Provider job detail** (`src/app/provider/job/[id].tsx`): a **Destination** section via `formatDestination` — address label, building, floor, door/unit, landmark, access notes (or the plain address when structured fields are absent). Display only; no logic change.
- **Admin** (`src/app/admin/booking/[id].tsx` + `(admin-web)/bookings/[id].tsx`): show the structured destination in the booking detail; the booking **list** keeps showing the readable `address`/label. Display only.
- Mobile customer booking detail may also show the destination summary (read-only).

---

## 9. Security & Config

- `PLACES_API_KEY` (Google) — Edge secret only; documented in `.env.example` (name only) + a `docs/pilot/places-setup.md` (enable Places API + Static Maps, restrict the key to the Edge Function's server usage, set the secret, deploy functions). `config.toml`: both functions `verify_jwt = true`.
- No key in the app bundle; no RLS/schema change beyond the additive nullable columns; no payment/auth/push/chat change.

---

## 10. Testing

- **Pure/Jest:** `_shared/places.ts` (request build + response parse for autocomplete/details, malformed → safe), `address-format.ts` (fallback/partial/full), `staticMapUrl` builder; `places.ts` client (mocked `functions.invoke` — success/`[]`/null/error); `bookings.ts`/draft new fields.
- **Component (RNTL):** `AddressSearch` (debounced search renders suggestions, select sets draft), `SelectedAddressCard`, `ApartmentDetailsForm`, review location summary; provider/admin destination display.
- **No live Places calls in tests.** Edge glue verified manually against the API (documented). Existing booking-flow tests stay green (manual-fallback preserves current behavior).
- Gate: `npm test` green, `npx tsc --noEmit` clean, `expo export --platform web` + `--platform android` succeed.

---

## 11. Backward Compatibility (explicit)

- `bookings.address` stays `not null`; all new columns nullable.
- Existing bookings (no structured fields) render via the `address` fallback everywhere (`formatDestination`).
- The manual-entry path reproduces today's exact flow (address text only), so the booking flow keeps working even with zero Places config (mock/empty → manual).

---

## 12. Deliverables

1. `supabase/migrations/0017_booking_address_fields.sql` (additive nullable columns).
2. `supabase/functions/_shared/places.ts` (+ tests), `places-autocomplete/index.ts`, `place-details/index.ts` (+ optional `map-image`); `config.toml` + `.env.example` (`PLACES_API_KEY` name).
3. `src/lib/places.ts` (+ test), `src/lib/address-format.ts` (+ test); `bookings.ts` + `BookingDraft` structured fields.
4. Customer UI: `AddressSearch`, `SelectedAddressCard`, `ApartmentDetailsForm`, reworked `booking/address.tsx` + review location summary (+ manual fallback).
5. Provider + admin (mobile + web) destination display via `formatDestination`.
6. `docs/pilot/places-setup.md` (key/secret/deploy) + verification notes; green gate.
