# Delivery-Address Experience — Certification Report

**Status: all non-physical gates GREEN. Ready for S24 Ultra physical address-flow test.**
Apple/APNs and physical iPhone certification remain paused until this address work is confirmed on device.

- **Branch:** `qa/places-api-new-migration` (stacked off `qa/phase-4e2-ios-physical-push`) · HEAD `bff9b1d`
- **Environment:** QA only (Supabase project `wjvjuplooidctlxxozws`). **Production untouched.** **Phase 4F not started.** PRs unmerged.
- **Date:** 2026-08-11

---

## 1. Original behavior
Address autocomplete returned **no suggestions** in QA — typing did nothing and the UI silently fell back to manual entry. Root of the *symptom*: the app calls Edge Functions that were **not deployed to QA** and had **no API key** (network probe returned HTTP 404). Deeper: the existing code targeted the **legacy Google Places API**, which **cannot be enabled on new Cloud projects** (Legacy since 2025‑03‑01).

## 2. Existing architecture discovered (Slice 20 — already complete)
A full, wired address stack already existed; **no second system was built**:
`booking/address.tsx` → `AddressSearch` → `src/lib/places.ts` → **`places-autocomplete` / `place-details` Edge Functions** (JWT‑verified, server‑side key) → `_shared/places.ts` → Google Places → `ApartmentDetailsForm` (5 last‑mile fields) → `createBooking` → `DestinationSummary`/`formatDestination` for display. Data model (migration 0017, already in QA): `address, address_label, latitude, longitude, building_name, floor, door_number, landmark, access_notes`.

## 3. Was an old/partial implementation present?
**Yes — fully implemented but (a) disconnected in QA and (b) on the legacy API.** Not dead code; just unconfigured + outdated API generation.

## 4. Root cause
1. **Config/deploy gap:** the two Places Edge Functions weren't deployed to QA and `GOOGLE_PLACES_API_KEY` wasn't set → 404 → silent empty results.
2. **Legacy API dead‑end:** the classic `/place/autocomplete/json` + `/place/details/json` endpoints can't be enabled on the new QuickServe Cloud project.

## 5. Solution chosen (smallest safe path — repair + migrate, no new system)
- **Migrated the existing stack to Places API (New)** — `POST /v1/places:autocomplete` and `GET /v1/places/{placeId}`, key via `X-Goog-Api-Key` header, Kenya via `includedRegionCodes:["ke"]`, Place Details field mask pinned to `formattedAddress,location` (cheapest **Essentials** SKU). Added **session tokens** (autocomplete billed free per session). `staticMapUrl` unchanged.
- **App‑facing contract preserved** — `booking/address.tsx`/`AddressSearch` unchanged in behavior; only an optional `sessionToken` added.
- **Deployed** both functions to QA + set the key (server‑side secret).
- **Consistency fix:** the customer's own booking detail now renders the same `DestinationSummary` used by provider/admin/review.
- **No new fields, no schema change, no RLS change, no new package, no second address system.**

## 6. Why not build a new address system
The existing Slice 20 implementation is complete, secure (server‑side key proxy), Kenya‑biased, and tested. Building new would duplicate it and risk exposing a key client‑side. Legacy→New was a contained backend migration (3 code files + tests), not a rebuild.

## 7. Google Places / Cloud / API configuration status
- **Provider:** Google Places API (New). No other provider; no client Maps SDK/dependency.
- **APIs enabled on QuickServe project:** Places API (New) + Maps Static API (both current; not legacy).
- **Key:** stored only as the QA Supabase secret `GOOGLE_PLACES_API_KEY`; **API‑restricted** to Places (New) + Maps Static; application restriction None (Supabase egress isn't static), no referrer.

## 8. Security / key‑handling assessment
Key is **server‑side only**, sent as the `X-Goog-Api-Key` header; **never** in the app bundle (secret scan of web+android exports = clean). The static‑map `mapUrl` embeds the key as a query param **by necessity** (rendered in `<Image>`), assembled server‑side and returned opaque; mitigated by the API restriction. A future hardening could proxy the image through the Edge Function.

## 9. Billing / cost
Places API (New) gives **10,000 free calls per product per month**. With 350 ms debounce + session tokens: **~$0.007/booking** (Details Essentials + one static map; autocomplete free in‑session). At ~1,000 bookings/month this is **within the free tier (~$0)**. No billing change was made beyond enabling the two APIs.

## 10. Exact files changed
| File | Change |
|---|---|
| `supabase/functions/_shared/places.ts` | New‑API builders/parsers + `PlacesRequest`; `staticMapUrl` unchanged |
| `supabase/functions/places-autocomplete/index.ts` | POST + headers/body + optional `sessionToken`; same `{query}`→`{suggestions}` |
| `supabase/functions/place-details/index.ts` | GET + field‑mask header + optional `sessionToken`; static map unchanged |
| `src/lib/places.ts` | optional `sessionToken`; crash‑safe `newSessionToken()` |
| `src/components/ui/address-search.tsx` | one session token per search (reuse → pass to details → rotate/reset) |
| `src/app/booking/[id].tsx` | render `DestinationSummary` on the customer detail (consistency) |
| tests | `places-shared`, `places`, `address-search`, `booking-detail` (+ focused cases) |
| `qa/native/*` | `places-probe.mjs` (probe); `flows/address-journey.yaml` + CI wiring |

## 11. Backend / database changes
- **Edge Functions deployed to QA** (`places-autocomplete`, `place-details`). **No database migration** — 0017 already applied to QA.

## 12. Automated test results
- **Full Jest: 3024 passed** (229 suites). Root **tsc** + **QA tsc** clean. **Website Vitest: 102 passed.**
- **Expo config** valid; **web + Android export** succeeded; **secret scan** (dist) clean.
- Focused address coverage: New‑API request/response shapes, Kenya restriction, field‑mask exactness, session‑token reuse/rotation/reset, no‑token‑per‑keystroke, graceful failure/manual fallback, static‑map unchanged, no key literal.

## 13. Google Places QA probe (read‑only, real authenticated path)
`qa/native/places-probe.mjs` — Westlands/Kilimani/Karen/Lavington/Nairobi Hospital → HTTP 200, 5 relevant `…Nairobi, Kenya` suggestions each; one session token threaded autocomplete→details; Westlands → `formattedAddress` + `lat/lng` (`-1.2675, 36.812`); key never exposed (only inside server‑built `mapUrl`).

## 14. Android emulator results (Pixel_9_Pro_XL, QA build)
Full 21‑step journey PASS (screenshots `p01`–`p15`): live Kenya autocomplete → select → **all 5 last‑mile fields** → Continue → **address survives navigation** (Review) → **QA booking created** → **DB persistence verified** (all 9 fields + Google coords, Google vs customer data separate) → **assigned‑provider view** shows full `DestinationSummary` → **Directions "Navigate"** fired `google.navigation:` intent → **manual‑entry fallback** reaches schedule → no crash/stale/duplicate → cleanup (0 residual). Privacy: provider saw the address only **after assignment** (RLS assigned‑only).

## 15. iOS Simulator results (GitHub macOS CI, iPhone SE / iOS 18.1)
- **Address journey — PASS** (run `31514117853`, step green; screenshots `a01`–`a06`): live Places (New) autocomplete → suggestion select → formatted address → **all 5 last‑mile fields filled cleanly** → Continue → schedule → notes → **Review shows the full structured breakdown** (Building/Floor/Door/Landmark/Access + Westlands, Nairobi, Kenya).
- **Full workflow re‑verified green** (run `31517379029`): entry, nav/search, notification refresh, **address journey**, and Phase 3F all pass. (An initial 3F `star-5` `scrollUntilVisible` flake cleared on re‑run; not related to these changes.)

## 16. Screenshots / artifacts
Android: `.adbtmp/p01`–`p15` (local). iOS: `maestro-ios-artifacts` on runs `31514117853` / `31517379029` (`a01`–`a06`, 14‑day retention).

## 17. Provider address display + role/privacy isolation
Assigned provider sees the full destination (`DestinationSummary`) + Directions. **RLS** (`bookings_select_provider = assigned_provider_id = auth.uid()`) restricts booking rows (address + all fields) to customer (own) / assigned provider / admin — enforced server‑side; unassigned bookings and other providers see nothing. No pool/RPC bypass (`getProviderJobs` queries the RLS‑protected table). **No privacy defect found.**

## 18. iOS‑specific observations (handled)
- Google suggestion cards + Review destination lines **group into one accessibility label** on iOS → matched with `.*…*` regex.
- Soft keyboard covers lower form fields → dismiss via a **non‑interactive title tap before each field** so focus lands correctly; `hideKeyboard` is unreliable on iOS.
- Maestro's iOS edge‑swipe **`back` does not reliably navigate** the booking Stack → back‑preservation asserted on the Android emulator instead (documented, not faked).

## 19. Remaining physical‑only checks
- **S24 Ultra** physical address‑flow regression (next).
- **iPhone 16 Pro** address regression — to be folded into the paused Phase 4E.2 physical iPhone/APNs certification.

## 20. Confirmations
- **Production untouched** — every action targeted the QA project `wjvjuplooidctlxxozws`; no Production DB/function/env/credential change was issued.
- **Phase 4F not started.** PRs unmerged. Apple/APNs & physical iPhone certification remain paused until the address flow is confirmed on device.

## 21. Non‑blocking future improvements
- Proxy the static‑map image through an Edge Function to remove the key from `mapUrl`.
- Optional 3‑char minimum before firing autocomplete (marginal cost saving).
