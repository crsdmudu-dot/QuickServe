# Slice 21 — Live Service Tracking + ETA (Design Spec)

**Date:** 2026-07-03
**Status:** Approved design → implementation plan
**Builds on:** booking lifecycle (`on_the_way`/`in_progress`/`completed`/`cancelled`), booking lat/lng (Slice 20), Edge-Function + static-map pattern (Slices 13/15/20), push infra (Slice 15).

---

## 1. Goal & Non-Goals

Real-time provider tracking from job acceptance through completion: customers see the provider's live position, ETA, distance, and status on a map; providers auto-share location only while travelling/servicing; admin gets read-only oversight.

**Non-goals (out of scope):** fleet dispatch optimisation, historical route playback, heat maps, multi-provider dispatch, traffic prediction, interactive/native maps, background location. **No** payment/auth/chat changes; reuse the existing booking lifecycle; preserve existing mobile/web functionality.

---

## 2. Architecture

- **Transport:** a `provider_locations` table (one row per booking) that the assigned provider **upserts** every ~8s while `on_the_way`/`in_progress`. Customer + admin **subscribe via Supabase Realtime** (Postgres changes). The table gives durable **last-known-location** and clean reconnect; **RLS** restricts reads to the booking's customer/provider/admin.
- **Provider capture:** `expo-location` **foreground-only** — `watchPositionAsync` while the provider's active-job screen is focused AND the booking status is `on_the_way`/`in_progress`; auto-stops on blur / `completed` / `cancelled`. Balanced accuracy + distance/time interval throttling for battery.
- **Map:** **static-map refresh** (no native SDK) — a `tracking-map` Edge Function builds a Google Static Maps URL (key server-side) with a **provider marker + customer marker + straight path**; the app renders it as an `<Image>`, refreshed on a throttled cadence (~10s). Marker text/ETA update on every Realtime tick.
- **ETA/distance:** pure **haversine** (`src/lib/geo.ts`) — straight-line distance + a simple ETA (`distance / assumed speed`). Route/Directions deferred.
- **Notifications:** reuse the Slice-15 booking-status pushes (`on_the_way`→"on the way", `in_progress`→"work started", `completed`) for started-travelling/work-started/completed. **"Nearby"/"Arrived" are client-derived display labels** this slice (proximity from live location); a server-side proximity *push* is documented as a follow-up (needs a proximity trigger).

---

## 3. Database — migration `0018_provider_locations.sql`

```sql
create table if not exists public.provider_locations (
  booking_id   uuid primary key references public.bookings(id) on delete cascade,
  provider_id  uuid not null references public.profiles(id),
  latitude     double precision not null,
  longitude    double precision not null,
  heading      double precision,
  speed        double precision,
  updated_at   timestamptz not null default now()
);
alter table public.provider_locations enable row level security;
```
- **SELECT** `provider_locations_select`: the booking's customer, its assigned provider, or admin:
  `exists (select 1 from public.bookings b where b.id = booking_id and (b.customer_id = auth.uid() or b.assigned_provider_id = auth.uid() or public.is_admin()))`.
- **Writes via a SECURITY DEFINER RPC** `upsert_provider_location(p_booking_id, lat, lng, heading, speed)`:
  asserts caller is the booking's `assigned_provider_id` AND booking `status in ('on_the_way','in_progress')`; upserts the row (`provider_id = auth.uid()`, `updated_at = now()`). No direct INSERT/UPDATE policy (all writes go through the RPC) → sharing is impossible outside an active assigned job.
- Enable the table for **Realtime** (`supabase_realtime` publication). No other schema/RLS change.
- Optional cleanup RPC `clear_provider_location(p_booking_id)` (assigned provider or admin) called on completion/cancellation.

---

## 4. Client Data Layer

- **`src/lib/tracking.ts`** (+ test): `type ProviderLocation = { booking_id; provider_id; latitude; longitude; heading; speed; updated_at }`.
  - `upsertProviderLocation(bookingId, coords)` → `upsert_provider_location` RPC.
  - `getProviderLocation(bookingId): Promise<ProviderLocation | null>` (last known).
  - `subscribeProviderLocation(bookingId, cb): () => void` — Supabase Realtime channel on `provider_locations` filtered by `booking_id`; returns unsubscribe. Handles reconnect (re-fetch last known on (re)subscribe).
  - `clearProviderLocation(bookingId)` → RPC.
  - `getTrackingMapUrl(providerLatLng, customerLatLng): Promise<string | null>` → `functions.invoke('tracking-map')` (server builds the URL; null on error → no-image fallback).
- **`src/lib/geo.ts`** (+ test, pure): `haversineKm(a, b)`, `formatDistanceKm(km)`, `etaMinutes(km, speedKmh?=22)`, `formatEta(min)`.
- **`src/lib/tracking-status.ts`** (+ test, pure): `trackingLabel(bookingStatus, distanceKm?)` → "Heading to you" (`on_the_way`), "Arrived" / "Nearby" (`on_the_way` + distance < ~0.1/0.5 km), "Work started" (`in_progress`), "Work completed" (`completed`); else null (no tracking).

---

## 5. Provider (capture)

- Add `expo-location` (foreground permission + usage strings via its config plugin — only capability added).
- On the provider active-job screen (`src/app/provider/job/[id].tsx`): a `useProviderLocationSharing(booking)` hook — when focused AND `status in ('on_the_way','in_progress')` → request foreground permission (graceful decline), `watchPositionAsync` (balanced accuracy, ~8s / ~25m throttle) → `upsertProviderLocation`. Stop the watcher on blur, status change to terminal, or unmount; call `clearProviderLocation` on `completed`/`cancelled`. A small "Sharing your location" indicator + a **Navigate** button (`Linking` to `google.navigation:`/`maps://` with the booking lat/lng — opens the OS maps app). Privacy: never shares outside an active assigned job.

---

## 6. Customer (tracking)

- **Entry:** on `src/app/booking/[id].tsx`, a **"Track your provider"** button shown when `status in ('on_the_way','in_progress')` → `src/app/booking/track/[id].tsx`.
- **Tracking screen:** subscribes via `subscribeProviderLocation`; shows the **static map** (`getTrackingMapUrl`, throttled ~10s), a provider **status** (`trackingLabel`), **ETA** + **distance remaining** (haversine from live provider loc → booking loc), and a "last updated" time. Auto-refreshes on Realtime ticks; **offline/stale** handling (show last-known + "reconnecting…" if no update in ~30s). Chat stays reachable (existing chat entry unchanged). Read-only for the customer.

---

## 7. Admin (oversight, read-only)

- `src/app/admin/booking/[id].tsx` + `src/app/(admin-web)/bookings/[id].tsx`: a **Live location** section for active bookings — the static tracking map + last-known coords/time + the derived status; plus the existing status/activity timeline (already present). Read-only; no new actions/logic.

---

## 8. Maps — `tracking-map` Edge Function + helper

- Extend `supabase/functions/_shared/places.ts` `staticMapUrl` (pure) to accept **multiple markers** (labeled provider `P` / customer `C`) + an optional **path** (straight line between them). Jest-tested.
- `supabase/functions/tracking-map/index.ts` (`verify_jwt=true`): body `{ providerLat, providerLng, customerLat, customerLng }`; reads `GOOGLE_PLACES_API_KEY` (existing secret, Static Maps enabled); returns `{ ok:true, mapUrl }` (server-side key). Missing key/bad input → `{ ok:true, mapUrl:null }` (graceful). `config.toml` `verify_jwt=true`; tsconfig excludes it.

---

## 9. Privacy & Security

- Location visible only to the booking's customer/provider/admin (RLS on `provider_locations`; Realtime honors RLS).
- Sharing possible ONLY via the RPC, ONLY by the assigned provider, ONLY while `on_the_way`/`in_progress` — stops immediately on `completed`/`cancelled` (client stops + `clearProviderLocation`; reads are RLS-gated anyway).
- No key in the app (map URL built server-side, reusing the Slice-20 posture). No payment/auth/chat change.

---

## 10. Offline / Reconnect

- Provider: upsert failures are swallowed (best-effort); the watcher resumes when connectivity returns.
- Customer/admin: on (re)subscribe, `getProviderLocation` fetches the last known row; a stale-timeout (~30s no update) shows "reconnecting… (last seen …)". Realtime auto-reconnects; the unsubscribe cleanup prevents leaks.

---

## 11. Testing

- **Pure/Jest:** `geo.ts` (haversine known distances, ETA/format), `tracking-status.ts` (each status + proximity thresholds), `_shared/places.ts` multi-marker/path `staticMapUrl`.
- **Client:** `tracking.ts` (mocked supabase — `upsert`/`get`/`clear` RPCs, `subscribe` wires a channel + unsubscribe, `getTrackingMapUrl` invoke), `useProviderLocationSharing` (mock `expo-location` + focus/status gating: shares only when focused + active; stops otherwise), tracking screen (renders map/ETA/status from a mocked location; stale state), provider indicator/Navigate, admin live-location section.
- **No live location/maps in tests.** Edge glue + Realtime + real GPS verified manually on a dev build (documented).
- Gate: `npm test` green, `npx tsc --noEmit` clean, `expo export --platform web` + `--platform android` succeed.

---

## 12. Deliverables

1. `supabase/migrations/0018_provider_locations.sql` (table + RLS + `upsert_provider_location`/`clear_provider_location` RPCs + realtime publication).
2. `supabase/functions/tracking-map/index.ts` + `_shared/places.ts` multi-marker/path extension; `config.toml` + tsconfig exclude.
3. `src/lib/{tracking,geo,tracking-status}.ts` (+ tests); `expo-location` dep + `app.json` plugin/permission.
4. Provider: `useProviderLocationSharing` hook + sharing indicator + Navigate button on the job screen.
5. Customer: "Track your provider" entry + `booking/track/[id].tsx` (map/ETA/distance/status, reconnect).
6. Admin (mobile + web): read-only Live-location section.
7. `docs/pilot/tracking-setup.md` (Static Maps enable, Realtime enable, dev-build verification) + verification notes.
