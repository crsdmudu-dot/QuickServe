# Slice 21 — Live Service Tracking: Operator Setup Guide

Accurate as of migration `0018_provider_locations.sql` and commit range `f09410e..HEAD`.

---

## 1. expo-location Setup — Foreground-Only Permission

Location sharing in QuickServe uses **foreground-only** GPS. No background location is requested or collected at any time.

**`app.json` plugin entry (already committed):**

```json
["expo-location", {
  "locationWhenInUsePermission": "QuickServe shares your live location with the customer only while you are travelling to and performing an active job."
}]
```

- Uses `locationWhenInUsePermission` — iOS will show this string in the system permission prompt.
- Android equivalent: `ACCESS_FINE_LOCATION` granted only while the app is foregrounded.
- `watchPositionAsync` is called with `Location.Accuracy.Balanced`, 8-second interval, 25-metre distance filter.
- The watcher is stopped and the subscription removed the moment the screen loses focus or the booking leaves `on_the_way`/`in_progress`.
- **No background location entitlement is declared.** Adding `locationAlwaysAndWhenInUsePermission` or `locationAlwaysUsageDescription` would require App Store/Play Store review justification and is intentionally absent.

---

## 2. tracking-map Edge Function Deploy

The `tracking-map` function builds a Google Static Maps URL **server-side** so the API key is never in the app bundle.

### Deploy command

```bash
supabase functions deploy tracking-map
```

### Required secret

The function reads `GOOGLE_PLACES_API_KEY` from the Deno environment:

```bash
supabase secrets set GOOGLE_PLACES_API_KEY=<your-key>
```

Ensure the **Static Maps API** (not just Places API) is enabled for this key in the Google Cloud Console.

### JWT verification

`verify_jwt = true` is set in `supabase/config.toml`:

```toml
[functions.tracking-map]
verify_jwt = true
```

Every request must carry a valid Supabase user JWT in the `Authorization: Bearer <token>` header. The Supabase client (`supabase.functions.invoke`) handles this automatically. Unauthenticated callers receive a 401.

### Graceful degradation

A missing `GOOGLE_PLACES_API_KEY`, invalid coordinates, or any server error returns:

```json
{ "ok": true, "mapUrl": null }
```

The app's `TrackingMap` component renders a "Live map unavailable" placeholder card — the tracking screen never crashes.

---

## 3. Realtime Requirement

`provider_locations` was added to the `supabase_realtime` publication in migration `0018`:

```sql
alter publication supabase_realtime add table public.provider_locations;
```

The migration is idempotent (wrapped in a `DO $$ ... IF NOT EXISTS` block).

### Dashboard verification

1. Go to **Database → Replication** in the Supabase Dashboard.
2. Confirm `provider_locations` appears under the `supabase_realtime` publication with **Insert**, **Update**, and **Delete** enabled.

### RLS applies to Realtime

Supabase Realtime respects Row Level Security for `postgres_changes` subscriptions. A customer subscribed to `booking_id=eq.<id>` will only receive events their SELECT policy permits — i.e., their own bookings only.

---

## 4. Privacy Model

### Who can write

No `INSERT`, `UPDATE`, or `DELETE` RLS policies exist on `provider_locations`. **All writes go through security-definer RPCs:**

| RPC | Who may call | Guard condition |
|-----|-------------|-----------------|
| `upsert_provider_location(p_booking_id, p_lat, p_lng, p_heading, p_speed)` | Authenticated user | Caller must be `bookings.assigned_provider_id` AND booking `status IN ('on_the_way','in_progress')` — raises exception otherwise |
| `clear_provider_location(p_booking_id)` | Authenticated user | Caller must be `bookings.assigned_provider_id` OR `is_admin()` — raises exception otherwise |

### Who can read

Single SELECT policy (`provider_locations_select`):

```sql
create policy "provider_locations_select" on public.provider_locations
  for select using (
    exists (select 1 from public.bookings b
            where b.id = booking_id
              and (b.customer_id = auth.uid()
                   or b.assigned_provider_id = auth.uid()
                   or public.is_admin()))
  );
```

Three parties can read a location row: the booking's **customer**, the booking's **assigned provider**, and any **admin**. No other user can see any row.

### When sharing stops

1. **Client-side:** `use-provider-location-sharing` detects a transition to `completed` or `cancelled` and calls `clearProviderLocation(booking.id)` immediately, then stops the `watchPositionAsync` subscription.
2. **Server-side:** Even if the client is slow or offline, `upsert_provider_location` raises `'Booking is not active for tracking'` for any status outside `on_the_way`/`in_progress` — so no stale location row can be written after terminal state.

### API key never in the app

`getTrackingMapUrl()` calls the `tracking-map` Edge Function. The function reads `GOOGLE_PLACES_API_KEY` from `Deno.env` and returns an opaque `mapUrl` string. The key itself is never sent to or stored in the client. The app bundle contains only the Supabase project URL and anon key.

---

## 5. Testing Checklist

### Provider

- [ ] Advance a booking to `on_the_way` — confirm the sharing indicator ("Sharing your live location with the customer.") appears on the Job Detail screen.
- [ ] Confirm `provider_locations` row appears in the database.
- [ ] Navigate away from the screen — confirm the watcher stops (no new `updated_at` changes in the DB).
- [ ] Advance to `in_progress` — sharing resumes when screen is focused.
- [ ] Advance to `completed` — sharing indicator disappears and the DB row is deleted.

### Customer

- [ ] Open the Booking Detail screen while provider is `on_the_way`/`in_progress` — confirm "Track your provider" button is visible.
- [ ] Open the tracking screen — confirm the live map image loads with P (provider) and C (customer) markers.
- [ ] Confirm ETA / distance text updates as the provider moves.
- [ ] If provider location is not yet available — confirm "Waiting for your provider's location…" placeholder is shown (no crash).
- [ ] If booking has no destination coordinates — confirm "Destination location unavailable." message is shown (no crash).
- [ ] After booking completes — confirm "Track your provider" button is gone from Booking Detail.

### Admin

- [ ] Open a booking detail screen (`/admin/booking/[id]` or `/(admin-web)/bookings/[id]`) for an `on_the_way` booking — confirm the `AdminLiveLocation` section appears with a live map.
- [ ] Confirm admin can read the location but cannot share their own (admin has no `use-provider-location-sharing` hook).
- [ ] For a `completed` booking — confirm the `AdminLiveLocation` section is hidden.

### Sharing stops on completion

- [ ] Advance provider to `completed` — the DB row is deleted within seconds.
- [ ] Attempt a manual `supabase.rpc('upsert_provider_location', ...)` call with the provider JWT on a completed booking — confirm a `'Booking is not active for tracking'` error is returned.

---

## 6. Expo Go Limitations

| Environment | GPS | Static map |
|-------------|-----|------------|
| Physical device (dev/EAS build) | Full foreground GPS | Works if `GOOGLE_PLACES_API_KEY` is set |
| Expo Go (Android/iOS) | Foreground GPS works | Works |
| Web (`expo start --web`) | Browser Geolocation API (different, not wired) | Works |

- `expo-location` foreground GPS works in Expo Go on a physical device — location permission prompt appears normally.
- Web does not use `expo-location`; the provider sharing hook is a no-op on web.
- The static map image is fetched via the Edge Function on all platforms; no native map SDK is required.

**Battery / throttle settings:** `Accuracy.Balanced`, 8-second minimum interval, 25-metre minimum distance. This prevents continuous high-drain GPS while still providing useful real-time updates.

---

## 7. Rollback / Kill-Switch

### Disable provider location writes immediately (privacy-safe)

This leaves the table and data in place but prevents any new location data from being written:

```sql
revoke execute on function public.upsert_provider_location(uuid, double precision, double precision, double precision, double precision) from authenticated;
```

Provider location sharing goes dark instantly. To re-enable:

```sql
grant execute on function public.upsert_provider_location(uuid, double precision, double precision, double precision, double precision) to authenticated;
```

### Remove the Edge Function

```bash
supabase functions delete tracking-map
```

The app degrades gracefully — `TrackingMap` shows "Live map unavailable" placeholder; the tracking screen otherwise works.

### Full rollback migration

A `0019` drop migration must:

1. Remove `provider_locations` from the Realtime publication:
   ```sql
   alter publication supabase_realtime drop table public.provider_locations;
   ```
2. Drop the RPCs:
   ```sql
   drop function if exists public.upsert_provider_location(uuid, double precision, double precision, double precision, double precision);
   drop function if exists public.clear_provider_location(uuid);
   ```
3. Drop the table (cascades RLS policies):
   ```sql
   drop table if exists public.provider_locations;
   ```

> Note: `MPESA_MODE`-style env-var feature flags are not applicable here — the tracking feature has no equivalent runtime toggle. Use the SQL revoke above for an instant kill-switch, or the full `0019` drop migration to remove everything.
