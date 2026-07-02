# QuickServe — Places & Address Intelligence Setup

**Purpose:** Operator guide for Slice 20 (Maps & Address Intelligence).
Deploy the two Google Places Edge Functions, set the secret, and understand the manual-address
fallback that keeps the booking flow working with zero Places configuration.

---

## 1. Google Cloud Setup

### 1.1 Enable APIs

In the [Google Cloud Console](https://console.cloud.google.com/) for your project:

1. **APIs & Services → Library**
2. Enable **Places API** (for autocomplete and place details).
3. Enable **Maps Static API** (for the static map image returned by `place-details`).

### 1.2 Create an API Key

**APIs & Services → Credentials → Create Credentials → API key**

Copy the generated key (`AIza…`). This key will only ever be stored in Supabase Secrets
and used inside the Edge Functions — it is **never placed in the app or committed to git**.

### 1.3 Restrict the Key (Required for Production)

In the key's **Edit** view:

**Application restrictions** — choose one that fits your infrastructure:

| Scenario | Restriction |
|----------|-------------|
| Supabase hosted functions (static IPs unavailable by default) | Leave as **None** and rely on API restrictions alone, OR set up Supabase outbound IP restriction if your plan provides static egress IPs |
| Self-hosted / known egress IP | **IP addresses** → add your server's IP(s) |

> The key is consumed exclusively by Deno Edge Functions running server-side.
> It is **never** sent to the mobile app or browser.
> There is no HTTP referrer to restrict; do not add referrer restrictions.

**API restrictions → Restrict key → Select APIs:**

- Places API
- Maps Static API

Save the key.

---

## 2. Supabase Secret

Store the key as a Supabase secret — **never commit it to git**.

```bash
supabase secrets set GOOGLE_PLACES_API_KEY=AIza...your-key-here
```

Verify it is set (value is hidden):

```bash
supabase secrets list
# GOOGLE_PLACES_API_KEY  (set)
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by
Supabase and must NOT be set manually.

---

## 3. Deploy the Edge Functions

Both functions are in `supabase/functions/` and registered in `supabase/config.toml`.

```bash
supabase functions deploy places-autocomplete place-details
```

### JWT Verification (`config.toml`)

| Function | `verify_jwt` | Reason |
|----------|:------------:|--------|
| `places-autocomplete` | `true` | Requires a valid Supabase user JWT; anonymous callers are rejected |
| `place-details` | `true` | Same — resolves a place only for authenticated users |

Both entries are already present in `supabase/config.toml`:

```toml
[functions.places-autocomplete]
verify_jwt = true

[functions.place-details]
verify_jwt = true
```

Verify after deploy: Supabase Dashboard → **Edge Functions** → confirm both appear with
`verify_jwt: true`.

---

## 4. How It Works (Code References)

| Layer | File | Role |
|-------|------|------|
| App client | `src/lib/places.ts` | `searchPlaces()` and `getPlaceDetails()` — call Edge Functions via `supabase.functions.invoke`; never touch Google directly |
| Shared helpers | `supabase/functions/_shared/places.ts` | Pure URL builders (`buildAutocompleteRequest`, `buildDetailsRequest`, `staticMapUrl`) and response parsers — no API key literals |
| Autocomplete function | `supabase/functions/places-autocomplete/index.ts` | Reads `GOOGLE_PLACES_API_KEY` from `Deno.env`; calls Google; returns `{ suggestions: [] }` on any failure |
| Details function | `supabase/functions/place-details/index.ts` | Same pattern; builds `mapUrl` server-side and returns it as an opaque string; key never leaves the server |
| Address formatter | `src/lib/address-format.ts` | `formatDestination()` — pure, fallback-aware; used by `DestinationSummary` in all three user roles |
| Display component | `src/components/ui/destination-summary.tsx` | Renders `primary` heading + optional detail lines; works for old and new bookings |

The base URL used by the Edge Functions is `https://maps.googleapis.com/maps/api`.

---

## 5. Manual-Address Fallback

The Places API is **optional**. The booking flow works without any Places configuration.

When Places is not configured (key unset, functions not deployed, or search returns nothing):

1. The address search field calls `searchPlaces()` → Edge Function returns
   `{ suggestions: [] }` (200) → the UI shows no suggestions.
2. The user taps **"Enter address manually"** → types a free-text address.
3. The booking is created with `address` (the existing `text not null` column) populated
   and all structured fields (`address_label`, `latitude`, `longitude`, `building_name`,
   `floor`, `door_number`, `landmark`, `access_notes`) left null.
4. `formatDestination()` in `src/lib/address-format.ts` falls back:
   `primary = address; lines = []` — the booking renders correctly everywhere.
5. No map image is shown (no `mapUrl`); the card degrades gracefully with no image.

Migration `0017_booking_address_fields.sql` adds all structured columns as **nullable** with
`ADD COLUMN IF NOT EXISTS` — `bookings.address` remains `text not null` and is unchanged.

---

## 6. Key-Missing Behavior

When `GOOGLE_PLACES_API_KEY` is unset or empty:

- `places-autocomplete` returns `{ ok: true, suggestions: [] }` with HTTP 200.
- `place-details` returns `{ ok: true, details: null }` with HTTP 200.
- The app receives these and falls back to manual address entry automatically.
- No errors are shown to the user; no 5xx responses are emitted.

This means the functions can be deployed before the key is set — safe to deploy early.

---

## 7. Static Map

`place-details` builds the static map URL server-side using `staticMapUrl()` from
`_shared/places.ts` (zoom 16, 600×300 px). The URL embeds the API key as a query parameter,
but it is assembled inside the Edge Function and returned to the app as an opaque string.

The app renders it with a React Native `<Image>` component in `SelectedAddressCard`. If
`mapUrl` is absent or the image fails to load, the card displays without an image — no crash,
no error state shown to the user.

The API key is never present in the app bundle. See the key-safety verification below.

---

## 8. Key Restriction Guidance

| Do | Do not |
|----|--------|
| Set **API restrictions** to `Places API` + `Maps Static API` | Add HTTP referrer restrictions (no browser origin) |
| Restrict to your server's egress IP(s) if available | Put the key in `.env`, app config, or any client-side file |
| Rotate the key immediately if it appears in git history | Use the same key for client-side Maps SDK (create a separate, referrer-restricted key for that) |
| Set a Google Cloud budget alert on the key | Grant the key permissions beyond Places API + Static Maps |

---

## 9. Testing Checklist

### Pre-deploy (key absent)

- [ ] `searchPlaces('Nairobi')` returns `[]` — no crash, no error toast.
- [ ] Manual address entry creates a booking with `address` populated and structured fields null.
- [ ] Booking renders in customer history, provider job view, and admin booking detail with only
  the `address` text shown (no structured lines).
- [ ] No map image is shown; the card displays gracefully.

### Post-deploy (key set)

- [ ] `supabase secrets list` shows `GOOGLE_PLACES_API_KEY` as set.
- [ ] Both functions appear in the Supabase Dashboard under **Edge Functions**.
- [ ] `verify_jwt: true` shown for both `places-autocomplete` and `place-details`.
- [ ] Typing a Kenya address in the booking address screen shows autocomplete suggestions.
- [ ] Selecting a suggestion resolves to a formatted address, lat/lng, and a static map image.
- [ ] The structured address fields (`address_label`, `latitude`, `longitude`) are persisted
  to `bookings`.
- [ ] Booking detail shows the structured address via `DestinationSummary`.

### Key-safety verification

```bash
# After `npx expo export --platform web` and `npx expo export --platform android`:
grep -r "GOOGLE_PLACES_API_KEY\|AIza" dist/
# Expected: no output (empty) — key is absent from all bundles.
```

---

## 10. Rollback / Kill Switch

### Instant: unset the secret (no redeploy required)

```bash
supabase secrets unset GOOGLE_PLACES_API_KEY
```

The functions continue to run and return empty/null results — the manual address path
immediately takes over for all new requests. No migration rollback needed; no data is lost.

### Disable the functions

```bash
supabase functions delete places-autocomplete place-details
```

`searchPlaces()` and `getPlaceDetails()` in `src/lib/places.ts` catch the resulting error
and return `[]` / `null` — manual address entry remains fully functional.

### Drop the address columns (migration rollback)

The structured address columns added by `0017_booking_address_fields.sql` are all nullable
and additive. They can be dropped without affecting the existing `address text not null`
column or any pre-Slice-20 bookings.

```sql
-- New file: supabase/migrations/0018_drop_address_fields.sql
alter table public.bookings
  drop column if exists address_label,
  drop column if exists latitude,
  drop column if exists longitude,
  drop column if exists building_name,
  drop column if exists floor,
  drop column if exists door_number,
  drop column if exists landmark,
  drop column if exists access_notes;
```

Apply with:

```bash
supabase db push
```

After dropping the columns, bookings continue to work using only `address`; the
`DestinationSummary` component renders the fallback path (`primary = address; lines = []`).

---

## 11. Rotate the Key

If `GOOGLE_PLACES_API_KEY` is ever exposed:

1. **Immediately delete the compromised key** in Google Cloud Console → APIs & Services → Credentials.
2. Create a new API key and apply the same restrictions (Places API + Static Maps API, IP restriction if applicable).
3. Set the new key in Supabase:
   ```bash
   supabase secrets set GOOGLE_PLACES_API_KEY=AIza...new-key
   ```
4. Redeploy the functions to pick up the new secret:
   ```bash
   supabase functions deploy places-autocomplete place-details
   ```
5. Verify the old key no longer works by calling `places-autocomplete` and confirming
   suggestions are returned (proves the new key is active).

The app bundle never contained the key, so no app update is required.
