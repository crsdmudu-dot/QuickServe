# QuickServe — QA Findings (Slice 17 Pilot Readiness)

**Review date:** 2026-06-27
**Reviewer:** Claude Sonnet 4.6 (automated code-level review; no device run available)
**Branch:** `feat/slice-17-pilot`
**Test suite baseline:** 456 tests, 80 suites — all green

---

## Summary Verdict

**No Critical blockers found.** One Important security finding (storage policy overly
broad — low exploitability, deferred). One Minor UX wart (known, deferred). All gate
commands pass clean.

| Severity | Count | Action |
|----------|-------|--------|
| Critical | 0 | — |
| Important | 1 | Deferred (low exploitability; logged below) |
| Minor | 1 | Deferred (server-side blocked; logged below) |

---

## Critical Findings

_None._

---

## Important Findings

### IMP-01 — Storage SELECT policy allows any authenticated user to resolve a signed URL for any booking photo by path

**Issue:**
`supabase/migrations/0006_booking_photos.sql` creates the following Storage object
policy for the private `booking-photos` bucket:

```sql
create policy "booking_photos_obj_select" on storage.objects
  for select to authenticated using (bucket_id = 'booking-photos');
```

This grants SELECT on every object in the bucket to every authenticated user, regardless
of whether they are a participant in the related booking. The metadata policy
(`booking_photos_select` on `public.booking_photos`) correctly restricts access to
booking participants and admins, but the storage-layer policy is decoupled from it.

Any authenticated user who calls `supabase.storage.from('booking-photos').createSignedUrl(path, n)`
will succeed if they supply a valid path, because the Storage engine checks only the object
policy — not the metadata table.

**Reproduction:**
1. Authenticated user A uploads a photo for booking X. Path is `{bookingId-X}/{uuid}.jpg`.
2. Authenticated user B (not a participant in booking X) calls
   `supabase.storage.from('booking-photos').createSignedUrl('{bookingId-X}/{uuid}.jpg', 3600)`.
3. Supabase Storage returns a valid signed URL that user B can use to download the photo.

**Root cause:**
The Supabase Storage RLS policy and the `booking_photos` metadata table RLS are two
independent layers. The object policy was written with only bucket-level isolation, not
booking-level isolation.

**Exploitability assessment (Important, not Critical):**
- The `booking-photos` bucket is private (no public URLs).
- Object paths are `{bookingId-UUID}/{random-UUID}.ext` — neither component is
  guessable from outside the booking detail.
- A participant in booking X can see that booking's `bookingId`, but they would need to
  also enumerate specific object-UUID names within the booking folder, which are also
  random UUIDs unknown to them unless the `booking_photos` metadata table leaks them.
  The metadata table policy correctly restricts access to participants and admins.
- In practice: a participant in one booking cannot access photos of a booking they are
  not part of because they cannot learn the object-UUID filenames.
- Cross-booking leakage is therefore theoretical (requires prior knowledge of the exact
  storage path), not practical with current path construction.

**Fix (deferred to post-pilot):**
Tighten the storage object SELECT policy to join against `booking_photos` metadata:

```sql
drop policy if exists "booking_photos_obj_select" on storage.objects;
create policy "booking_photos_obj_select" on storage.objects
  for select to authenticated using (
    bucket_id = 'booking-photos'
    and (
      public.is_admin()
      or exists (
        select 1 from public.booking_photos bp
        join public.bookings b on b.id = bp.booking_id
        where bp.photo_url = storage.objects.name
          and (b.customer_id = auth.uid()
               or b.assigned_provider_id = auth.uid())
      )
    )
  );
```

This requires a migration and testing in Supabase Storage sandbox. Deferred until
post-pilot given low exploitability risk.

**Test (deferred):** Integration test: authenticated non-participant cannot obtain a
signed URL for a photo they do not own. To be added in slice-18 security hardening.

---

## Minor Findings

### MIN-01 — Role-select screen shows "Admin" card, but server downgrades self-signup to customer

**Issue:**
`src/constants/roles.ts` exports `ROLES` with three entries: `customer`, `provider`,
and `admin`. The `role-select.tsx` screen renders all three cards. If a user selects
"Admin" and completes registration, `handle_new_user()` (migration `0001_profiles.sql`)
silently downgrades the role to `customer` because only `provider` maps to itself; all
other values fall through to `customer`:

```sql
v_role := case
  when (new.raw_user_meta_data ->> 'role') = 'provider' then 'provider'
  else 'customer'
end;
```

**Reproduction:**
1. Open app, tap "Get Started".
2. Tap "Admin" role card.
3. Complete registration.
4. Resulting profile has `role = 'customer'`, not `role = 'admin'`.

**Root cause:**
UX wart: the Admin card is shown but the trigger always produces `customer` for any
non-provider selection. Admin accounts are created manually in Supabase Studio.

**Security impact:** None — this is server-side blocked. There is no privilege escalation
path. A user who selects "Admin" on the client gets a `customer` row, not an `admin` row.

**Fix (deferred):**
Remove the `admin` entry from the `ROLES` array in `src/constants/roles.ts`, or add a
UI gate that hides the Admin card entirely. Deferred to post-pilot to avoid scope creep.

**Test:** No regression test needed (server-side already blocked; existing role-select
test covers the render).

---

## Gate Results

| Gate | Command | Result |
|------|---------|--------|
| Android export | `npx expo export --platform android` | PASS — 4.7 MB HBC bundle, no errors |
| TypeScript | `npx tsc --noEmit` | PASS — zero errors |
| Test suite | `npm test` | PASS — 456 tests, 80 suites, all green |
| Git status | `git status` | Clean (only new docs + this file) |
| eas.json | `node -e "JSON.parse(...)"` | PASS — valid JSON |
| Bundle ID | `npx expo config --type public` | PASS — `com.quickserve.app` on both platforms |

---

## RLS & Auth Review Notes

- `profiles_update_own`: correctly pins `role`, `approval_status`, `is_verified`,
  `completed_jobs_count`, `review_count`, and `average_rating` (patched in 0009).
- `bookings_update_provider`: forward-only status guard; all other columns pinned via
  sub-select. No bypass identified.
- `reviews_insert_own`: requires `customer_id = auth.uid()`, completed booking with
  non-null `assigned_provider_id`, and `is_hidden = false`. No self-review path found.
- `apply_mpesa_callback`: restricted to `service_role` only
  (`revoke execute … from anon, authenticated`). Idempotent on terminal states.
- `mpesa-callback` edge function: URL token gated with constant-time comparison;
  rejects when `MPESA_CALLBACK_SECRET` is unset. Correct.
- `send-push` edge function: webhook-secret gated with constant-time comparison;
  rejects when `PUSH_WEBHOOK_SECRET` is unset. Always returns 200 to prevent pg_net
  retry storms. Correct.
- `handle_new_user()`: admin self-signup is blocked server-side (MIN-01 above).
- Payment flow: `pay_payment` was retired in 0011; payment is now confirmed only by
  admin via `confirm_payment_attempt` or Daraja callback via service role. No customer
  self-pay bypass found.
- `set_quote`, `confirm_payment_attempt`, `cancel_payment_attempt`,
  `override_payment_status`, `mark_payout_paid`: all gate on `is_admin()`. Correct.
- `accept_quote` / `decline_quote`: verify `customer_id = auth.uid()` and
  `quote_status = 'sent'`. No escalation path found.
