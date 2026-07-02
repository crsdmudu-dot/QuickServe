# Slice 21 — Live Service Tracking + ETA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live provider tracking (map + ETA + distance + status) from `on_the_way` through `completed`, via a `provider_locations` table + Supabase Realtime, foreground-only `expo-location`, and static-map refresh (no native SDK).

**Architecture:** Provider upserts location (SECURITY DEFINER RPC, active-assigned-job only) → customer/admin subscribe via Realtime → static-map image (server-key Edge Function) + haversine ETA. Privacy enforced by RLS + the RPC + active-only gating.

**Tech Stack:** Expo RN + TS, Expo Router, expo-location (foreground), Supabase (Postgres + RLS + Realtime + Edge Functions), Google Static Maps (server-side), Jest + RNTL.

## Global Constraints

- **`provider_locations` table + Supabase Realtime** (Postgres changes). **Static-map refresh, NOT react-native-maps — no native map SDK.** **Foreground-only** location.
- **Sharing only for the assigned provider of an ACTIVE booking** (`status in ('on_the_way','in_progress')`), via the `upsert_provider_location` SECURITY DEFINER RPC only (no direct write policy). **Stops on `completed`/`cancelled`** (client stop + `clear_provider_location`).
- Location visible only to the booking's customer/provider/admin (RLS; Realtime honors RLS). No Google key in the app (map URL built server-side, reusing the Slice-20/`GOOGLE_PLACES_API_KEY` posture).
- No payment/auth/chat change; reuse the existing booking lifecycle; preserve existing mobile/web functionality. DB/Edge patterns mirror prior slices; app tsconfig excludes Deno files; pure helpers stay Deno-free + Jest-tested.
- Merge gate every task: `npm test` green, `npx tsc --noEmit` clean, `expo export --platform web` AND `--platform android` succeed.

---

## File Structure

**Create**
- `supabase/migrations/0018_provider_locations.sql` — table + RLS + 2 RPCs + realtime publication.
- `supabase/functions/tracking-map/index.ts` — server-side static-map URL builder.
- `src/lib/geo.ts` (+ test) — haversine distance + ETA.
- `src/lib/tracking-status.ts` (+ test) — status/proximity label.
- `src/lib/tracking.ts` (+ test) — upsert/get/clear/subscribe + getTrackingMapUrl.
- `src/hooks/use-provider-location-sharing.ts` (+ test).
- `src/app/booking/track/[id].tsx` — customer tracking screen.
- `src/components/ui/tracking-map.tsx`, `tracking-status-badge.tsx` (+ tests) — shared display.
- `docs/pilot/tracking-setup.md`.

**Modify**
- `supabase/functions/_shared/places.ts` (+ test) — multi-marker + path `staticMapUrl`.
- `supabase/config.toml`, `tsconfig.json`, `package.json`, `app.json` (expo-location plugin/permission).
- `src/app/provider/job/[id].tsx` — sharing hook + indicator + Navigate button.
- `src/app/booking/[id].tsx` — "Track your provider" entry.
- `src/app/admin/booking/[id].tsx`, `src/app/(admin-web)/bookings/[id].tsx` — read-only Live-location section.

---

## Task Order (dependency-ordered)

1. **T1** — Migration `0018` (table, RLS, `upsert_provider_location`/`clear_provider_location`, realtime publication).
2. **T2** — Pure helpers: `geo.ts` + `tracking-status.ts` + `_shared/places.ts` multi-marker/path (+ tests). Independent of T1.
3. **T3** — `tracking-map` Edge Function + `config.toml` + tsconfig exclude.
4. **T4** — `src/lib/tracking.ts` client seam (upsert/get/clear/subscribe/getTrackingMapUrl) + tests.
5. **T5** — `expo-location` dep + `app.json` permission + `useProviderLocationSharing` hook + tests.
6. **T6** — Shared display components: `tracking-map`, `tracking-status-badge` (+ tests).
7. **T7** — Provider job screen: sharing indicator + Navigate button (wire the hook).
8. **T8** — Customer: "Track your provider" entry + `booking/track/[id].tsx`.
9. **T9** — Admin (mobile + web) read-only Live-location section.
10. **T10** — `tracking-setup.md` + privacy/backward-compat verification + final gate.

T2 parallelizable with T1. T4 depends on T1. T6 depends on T2/T4. T7 depends on T5. T8/T9 depend on T6.

---

### Task 1: Migration `0018_provider_locations.sql`

**Files:** Create `supabase/migrations/0018_provider_locations.sql`

**Build (mirror `0011`/`0013` style):**
- Table `provider_locations` per spec §3 (booking_id PK FK→bookings on delete cascade, provider_id FK→profiles, latitude/longitude not null, heading/speed nullable, updated_at). `enable row level security`.
- **SELECT policy** `provider_locations_select`: `exists (select 1 from public.bookings b where b.id = booking_id and (b.customer_id = auth.uid() or b.assigned_provider_id = auth.uid() or public.is_admin()))`. **No INSERT/UPDATE/DELETE policies.**
- **`upsert_provider_location(p_booking_id uuid, p_lat double precision, p_lng double precision, p_heading double precision, p_speed double precision) returns void`** `security definer set search_path = public`: raise unless the caller is the booking's `assigned_provider_id` AND booking `status in ('on_the_way','in_progress')`; `insert … on conflict (booking_id) do update set latitude/longitude/heading/speed, provider_id = auth.uid(), updated_at = now()`.
- **`clear_provider_location(p_booking_id uuid) returns void`** `security definer`: allow the booking's assigned provider OR admin; `delete from provider_locations where booking_id = p_booking_id`.
- **Realtime:** `alter publication supabase_realtime add table public.provider_locations;` (idempotent — guard with a DO block if needed).

**Checks:** applies cleanly; `\d provider_locations` shows table/RLS; RPCs exist; `npm test` green, `tsc` clean, both exports. Commit `feat: slice21 provider_locations schema (0018)`.

> Behavioral RLS/RPC verification in T10.

---

### Task 2: Pure helpers (geo, tracking-status, static-map markers)

**Files:** Create `src/lib/geo.ts` (+ test), `src/lib/tracking-status.ts` (+ test); Modify `supabase/functions/_shared/places.ts` (+ its test)

- `geo.ts`: `type LatLng = { latitude:number; longitude:number }`; `haversineKm(a,b): number`; `formatDistanceKm(km): string` (e.g. "1.2 km" / "250 m"); `etaMinutes(km, speedKmh=22): number`; `formatEta(min): string` (e.g. "~8 min"). Pure.
- `tracking-status.ts`: `trackingLabel(status: BookingStatus, distanceKm?: number): string | null` — `on_the_way` → distance<0.1 "Arrived" / <0.5 "Nearby" / else "Heading to you"; `in_progress` → "Work started"; `completed` → "Work completed"; else null.
- `_shared/places.ts`: ADD `staticMapUrl` support for **multiple markers** + an optional **path**. Extend the existing signature additively — accept `markers?: Array<{ lat; lng; label?; color? }>` and `path?: Array<{lat;lng}>` (keep the current single-point behavior working). Build `&markers=color:red|label:P|<lat,lng>` per marker + `&path=<lat,lng>|<lat,lng>` + auto-center/zoom when two markers. Do NOT break Slice-20 callers.

**Tests:** haversine known pairs (Nairobi coords) within tolerance; ETA/format; `trackingLabel` all branches + thresholds; multi-marker/path URL contains the right params AND the existing single-marker test stays green.

**Steps:** TDD → `tsc` → commit `feat: slice21 geo + tracking-status + multi-marker map`.

---

### Task 3: `tracking-map` Edge Function

**Files:** Create `supabase/functions/tracking-map/index.ts`; Modify `supabase/config.toml`, `tsconfig.json`

- `Deno.serve`, `verify_jwt=true`. Body `{ providerLat, providerLng, customerLat, customerLng }`. Validate finite numbers; `key = Deno.env.get('GOOGLE_PLACES_API_KEY')`; if `!key` or bad input → `json({ ok:true, mapUrl:null })`. Else `staticMapUrl({ baseUrl:'https://maps.googleapis.com/maps/api', key, markers:[{lat:providerLat,lng:providerLng,label:'P',color:'blue'},{lat:customerLat,lng:customerLng,label:'C',color:'red'}], path:[…two points…] })` → `json({ ok:true, mapUrl })`. try/catch → `{ ok:true, mapUrl:null }`.
- `config.toml`: `[functions.tracking-map] verify_jwt = true`.
- `tsconfig.json`: exclude `supabase/functions/tracking-map/index.ts` (keep `_shared/places.ts` checked).

**Checks:** `tsc` clean (Deno excluded), `npm test` green, both exports. Commit `feat: slice21 tracking-map edge function`.

---

### Task 4: `src/lib/tracking.ts` client seam

**Files:** Create `src/lib/tracking.ts` (+ test)

- `type ProviderLocation = { booking_id; provider_id; latitude; longitude; heading:number|null; speed:number|null; updated_at }`.
- `upsertProviderLocation(bookingId, c: { latitude; longitude; heading?; speed? })` → `rpc('upsert_provider_location', { p_booking_id, p_lat, p_lng, p_heading, p_speed })`; `{ ok, error? }` (swallow → ok:false, best-effort).
- `getProviderLocation(bookingId): Promise<ProviderLocation | null>` — select the row; null on none/error.
- `clearProviderLocation(bookingId)` → `rpc('clear_provider_location', …)`.
- `subscribeProviderLocation(bookingId, onUpdate: (loc: ProviderLocation) => void): () => void` — `supabase.channel('provider_loc:'+bookingId).on('postgres_changes', { event:'*', schema:'public', table:'provider_locations', filter:'booking_id=eq.'+bookingId }, payload => onUpdate(payload.new)).subscribe()`; returns `() => supabase.removeChannel(channel)`.
- `getTrackingMapUrl(provider: LatLng, customer: LatLng): Promise<string | null>` → `functions.invoke('tracking-map', { body:{ providerLat, providerLng, customerLat, customerLng }})`; `data?.mapUrl ?? null`.

**Tests (mock `@/lib/supabase`):** each RPC name/args; getProviderLocation row/null; subscribe wires `.channel/.on/.subscribe` + unsubscribe calls `removeChannel`; getTrackingMapUrl invoke + null on error.

**Steps:** TDD → `tsc` → commit `feat: slice21 tracking client seam`.

---

### Task 5: expo-location + `useProviderLocationSharing`

**Files:** Modify `package.json`, `app.json`; Create `src/hooks/use-provider-location-sharing.ts` (+ test)

- `npx expo install expo-location`; add its config plugin + foreground permission usage strings to `app.json` (only capability added; no background permission).
- `useProviderLocationSharing(booking: { id; status; assigned_provider_id }, isFocused: boolean)`:
  - Active when `isFocused && booking.status in ('on_the_way','in_progress')`. When active: `requestForegroundPermissionsAsync` (decline → set `denied`, no share); `watchPositionAsync({ accuracy: Balanced, timeInterval: 8000, distanceInterval: 25 }, pos => upsertProviderLocation(booking.id, pos.coords))`. Remove the subscription on inactive/unmount; on transition to `completed`/`cancelled` call `clearProviderLocation`. Returns `{ sharing: boolean; permission: 'granted'|'denied'|'undetermined' }`.
- Guard `expo-location` for tests: mock it; the hook must be test-safe (no real GPS).

**Tests (mock `expo-location` + `@/lib/tracking`):** shares (calls watch + upsert) only when focused + active; does NOT share when unfocused or status pending/completed; permission denied → no upsert; cleanup stops watcher; terminal status → `clearProviderLocation`.

**Steps:** TDD → `expo export` → `tsc` → `npm test` → commit `feat: slice21 provider location sharing hook`.

---

### Task 6: Shared display components

**Files:** Create `src/components/ui/tracking-map.tsx` (+ test), `src/components/ui/tracking-status-badge.tsx` (+ test)

- `tracking-map.tsx`: props `{ provider: LatLng | null; customer: LatLng; refreshMs?=10000 }` — fetches `getTrackingMapUrl` (throttled ~10s) when provider set → `<Image source={{uri:mapUrl}}>`; graceful placeholder card when no url/provider. RN/RN-web safe.
- `tracking-status-badge.tsx`: props `{ status: BookingStatus; distanceKm?: number }` → pill from `trackingLabel` (token colors). null label → renders nothing.

**Tests:** tracking-map renders image when a url resolves (mock `@/lib/tracking`), placeholder when null; badge renders each label + nothing when null.

**Steps:** TDD → `tsc` → commit `feat: slice21 tracking display components`.

---

### Task 7: Provider job screen — sharing indicator + Navigate

**Files:** Modify `src/app/provider/job/[id].tsx`

- Wire `useProviderLocationSharing(booking, useIsFocused())` (expo-router `useIsFocused`/`useFocusEffect`). Show a small "Sharing your location" indicator when `sharing`, a "Location permission needed" note when `denied`. Add a **Navigate** `Button` (shown when booking has lat/lng) → `Linking.openURL` (`google.navigation:q=<lat>,<lng>` / `http://maps.apple.com/?daddr=<lat>,<lng>`, platform-guarded). No change to status actions/photos/chat.

**Checks:** keep `provider-job-detail.test.tsx` green (mock `expo-location`/`@/lib/tracking`/the hook); `npm test`, `tsc`, both exports. Commit `feat: slice21 provider sharing indicator + navigate`.

---

### Task 8: Customer tracking screen + entry

**Files:** Create `src/app/booking/track/[id].tsx`; Modify `src/app/booking/[id].tsx`

- Entry: on booking detail, a **"Track your provider"** `Button` when `status in ('on_the_way','in_progress')` → `router.push('/booking/track/'+id)`.
- Track screen: load booking (`getBookingById`); `subscribeProviderLocation` → local `location` state; render `TrackingMap` (provider live loc + booking customer lat/lng), `TrackingStatusBadge` (status + haversine distance), ETA + distance text (`geo`), "last updated"/stale ("reconnecting… last seen …" if >30s). On mount also `getProviderLocation` for last-known. Cleanup unsubscribe. Chat entry unchanged/reachable. Read-only.

**Checks:** keep `booking-detail.test.tsx` green (mock `@/lib/tracking`); add a track-screen test (renders status/ETA from a mocked location; stale state); `npm test`, `tsc`, both exports. Commit `feat: slice21 customer tracking screen`.

---

### Task 9: Admin read-only Live-location

**Files:** Modify `src/app/admin/booking/[id].tsx`, `src/app/(admin-web)/bookings/[id].tsx`

- Add a **Live location** section (for `on_the_way`/`in_progress` bookings): subscribe (or `getProviderLocation` + subscribe) → `TrackingMap` + last-known coords/time + `TrackingStatusBadge`. Read-only; existing status/activity timeline unchanged.

**Checks:** keep admin detail tests green (mock `@/lib/tracking`); `npm test`, `tsc`, both exports. Commit `feat: slice21 admin live-location oversight`.

---

### Task 10: Setup doc + privacy verification + final gate

**Files:** Create `docs/pilot/tracking-setup.md`

- **Setup doc:** enable Google **Static Maps API** (same `GOOGLE_PLACES_API_KEY`); enable **Realtime** for `provider_locations` (publication in `0018`; confirm in dashboard); deploy `tracking-map` (`supabase functions deploy tracking-map`); expo-location dev/EAS build note (foreground permission prompt; Expo Go limitations for continuous GPS); throttle/battery notes.
- **Privacy/RLS verification (documented SQL + manual):** customer B cannot select customer A's provider_location; a provider who is NOT assigned cannot `upsert_provider_location` (RPC raises); upsert rejected when status not `on_the_way`/`in_progress`; on `completed`/`cancelled` sharing stops + `clear_provider_location` empties the row; Realtime only delivers rows the subscriber may read (RLS); the Google key is absent from the exported bundle (grep `dist/`).
- **Backward-compat:** bookings without tracking (no provider_location row) show no live map — the "Track your provider" entry only appears for active bookings; nothing else changes. Existing flows/tests green.
- **Final gate:** `expo export --platform web` AND `--platform android` succeed → `tsc` clean → `npm test` green → `git status` clean.
- Commit `test: slice21 tracking verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-21-tracking`. Abandon = `git checkout main` + delete branch.
- **Per-task revert:** independent commits — `git revert <commit>` rolls back one wave (migration/helpers/functions/hook/UI) without affecting others.
- **Kill switch (no code revert):** don't deploy `tracking-map` → the map shows the graceful no-image placeholder; sharing still writes to the table but is only visible to permitted users. To fully disable sharing, revoke the RPCs (`revoke execute on function public.upsert_provider_location … from authenticated`) — the provider hook's upserts no-op and tracking goes dark, privacy-safe.
- **Remove function:** `supabase functions delete tracking-map`.
- **Schema rollback:** forward-only; if needed `0019_rollback_provider_locations.sql` — `alter publication supabase_realtime drop table public.provider_locations;` then `drop function upsert_provider_location, clear_provider_location; drop table provider_locations cascade;` (additive/isolated — nothing else depends on it).

---

## Self-Review

- **Spec coverage:** table+RLS+RPCs+realtime (T1), geo+tracking-status+multi-marker map (T2), tracking-map edge (T3), tracking client seam+subscribe (T4), expo-location+sharing hook (T5), display components (T6), provider indicator+navigate (T7), customer track screen+entry (T8), admin live-location (T9), setup+privacy verification+backward-compat+rollback (T10 + sections). Static-map (not native), foreground-only, active-only sharing, stop-on-terminal, no payment/auth/chat — all covered.
- **Placeholder scan:** none; `GOOGLE_PLACES_API_KEY` reused (operator-set from Slice 20).
- **Type/name consistency:** `ProviderLocation`/`LatLng` (T4/T2) consumed by hook (T5) + components (T6) + screens (T7-9); RPC names `upsert_provider_location`/`clear_provider_location` consistent T1↔T4↔T10; `trackingLabel`/`haversineKm`/`getTrackingMapUrl`/`subscribeProviderLocation` consistent across T2/T4/T6/T8/T9; `tracking-map` fn name consistent T3↔T4↔T10.
