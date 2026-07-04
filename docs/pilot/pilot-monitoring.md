# Pilot Monitoring — QuickServe

**Purpose:** What to watch during the pilot, alert thresholds, escalation path, and the
Slice-29 reliability additions that affect what operators should monitor. Extends
[crash-logging.md](./crash-logging.md) — do not duplicate the Sentry setup, PII scrubbing,
or incident-response sections already covered there.

---

## 1. Monitoring prerequisites

Before the pilot opens to users, confirm:

- [ ] `EXPO_PUBLIC_SENTRY_DSN` set via `eas secret:create` — monitoring is **OFF** when absent.
  See [environment-secrets.md](./environment-secrets.md) Section 6.
- [ ] Supabase Edge Function logs enabled (Dashboard → Edge Functions → Logs).
- [ ] Supabase Database logs enabled (Dashboard → Database → Logs / pg_audit or Postgres logs).
- [ ] Alert rule in Sentry: > 5 new errors / minute → notify on-call channel.

---

## 2. Sentry error monitoring

Reference: [crash-logging.md](./crash-logging.md) — Section 3 (what to log), Section 4 (what
NOT to log), Section 5 (privacy / PII scrubbing).

### Dashboard to watch

| Signal | Alert threshold | Action |
|---|---|---|
| New error rate | > 5/min | Investigate immediately; check screen + stack trace |
| New issue volume | Any new issue in first 48 h | Triage within 2 h (see crash-logging.md Section 6) |
| `ErrorBoundary` events | Any render crash | P0 if on booking/payment screen; P1 otherwise |
| Unhandled promise rejections | Any spike | Check network/Supabase calls on the failing screen |

### Sentry breadcrumbs to configure

- Navigation events (Expo Router `usePathname()` or Sentry React Native navigation integration)
- User role tag (`customer` / `provider` / `admin`) — anonymized via UUID, no PII

### Source maps

For stack traces to resolve to TypeScript lines, ensure the Sentry Expo plugin in `app.json`
has the correct `organization` and `project` fields, and that EAS builds upload source maps
automatically via the `@sentry/react-native/expo` plugin.

---

## 3. Push notification health

### Failed pushes

Watch in `send-push` Edge Function logs (Dashboard → Edge Functions → `send-push` → Logs):

```
DeviceNotRegistered   ← dead token; pruning triggered automatically
InvalidToken          ← malformed token; pruning triggered
ExpoError             ← transient Expo push service error
```

**Alert threshold:** > 10 `DeviceNotRegistered` in 1 hour → run dead-token audit.

### Dead-token pruning

The `send-push` function removes device tokens that return `DeviceNotRegistered` from
`public.device_tokens` automatically. Verify the pruning is working:

```sql
-- Monitor total token count; a sudden drop after sends = pruning active
select count(*) from public.device_tokens;
```

### Kill switch (instant, no redeploy)

```sql
update private.push_config set send_push_url = null where id = 1;
```

Re-enable:
```sql
update private.push_config
set send_push_url = 'https://<ref>.supabase.co/functions/v1/send-push'
where id = 1;
```

Full push verification: see [backend-readiness.md](./backend-readiness.md) Section 7.

---

## 4. Payment / M-Pesa health

### Failed payment attempts

```sql
-- Failed attempt rate
select
  count(*) filter (where status = 'failed')  as failed,
  count(*) filter (where status = 'pending') as pending,
  count(*) filter (where status = 'successful') as successful
from public.payment_attempts
where created_at > now() - interval '1 hour';
```

**Alert threshold:** > 20 % failed attempts in any 1-hour window → investigate Daraja status
or set `MPESA_MODE=mock` as a kill switch.

### Stale pending attempts

```sql
-- Attempts pending > 5 minutes (STK push timeout)
select id, booking_id, created_at
from public.payment_attempts
where status = 'pending'
  and created_at < now() - interval '5 minutes';
```

These may indicate a missed callback. Manually confirm and cancel if needed.

### M-Pesa kill switch

```bash
supabase secrets set MPESA_MODE=mock
supabase functions deploy mpesa-stk-push
```

---

## 5. Edge Function logs

Check each function in Dashboard → Edge Functions → Logs during and after pilot day 1:

| Function | What to look for |
|---|---|
| `send-push` | `DeviceNotRegistered` / `ExpoError` rate |
| `mpesa-stk-push` | 4xx (auth failures), 5xx (Daraja connectivity) |
| `mpesa-callback` | 401 (wrong token — potential attack), 500 (unexpected) |
| `places-autocomplete` | `GOOGLE_PLACES_API_KEY not set` warns (graceful) or quota errors |
| `place-details` | Same as places-autocomplete |
| `tracking-map` | Quota or key errors from Google |
| `register-device` | Any 5xx on token registration |

---

## 6. Database error rate

Watch Supabase Dashboard → Database → Logs for:

- `RLS policy violation` — any unexpected row denials; investigate immediately
- `Function raise_exception` from RPCs — expected for invalid inputs; spike = bug
- `Replication lag` — if using read replicas
- `pg_net errors` — failed HTTP calls from push triggers

**Alert:** Any RLS violation not matching a known test scenario → P0 investigation.

---

## 7. Escalation path

| Severity | Response time | Owner | Action |
|---|---|---|---|
| P0 (payment/auth broken) | Immediate | Tech lead | Roll back or kill-switch; hot-fix branch |
| P1 (feature broken, workaround exists) | < 2 h | On-call dev | Fix or disable feature; notify testers |
| P2 (cosmetic / edge case) | < 24 h | Dev team | Log in [qa-findings.md](./qa-findings.md); fix post-pilot |

Communicate to pilot testers in the designated channel (WhatsApp / email) within 1 h of a P0/P1.

---

## 8. Slice-29 reliability additions — what they change for monitoring

Slice 29 added four reliability layers. Each changes what operators should watch:

### 8.1 Upload retry (`src/lib/photos.ts`)

**What it does:** `doUpload` (storage upload) is wrapped in `withRetry({ retries: 2 })`. The
DB `INSERT` into `booking_photos` is **outside** the retry block — single-shot. If the upload
succeeds but the DB insert fails, the stored object is orphaned (no metadata row). This is a
known, accepted edge case for the pilot.

**What to monitor:**
- In Sentry: errors with context `uploadBookingPhoto` — indicates a non-transient upload failure
  (user sees a friendly message; upload is not retried further).
- In Supabase Storage logs: orphaned objects (objects with no matching `booking_photos` row).
  Run periodically:
  ```sql
  -- Orphan check: storage objects with no booking_photos row
  -- (requires service role access to storage.objects)
  select name from storage.objects
  where bucket_id = 'booking-photos'
    and not exists (
      select 1 from public.booking_photos bp
      where bp.photo_url like '%' || split_part(name, '/', 2) || '%'
    );
  ```

**Alert threshold:** > 5 orphaned objects in a day → investigate DB insert failures.

### 8.2 Pagination / performance (`usePaginatedList`, `LoadMoreButton`)

**What it does:** Heavy lists (bookings, payments, notifications, jobs, wallet history, promo
redemptions) are now paginated with a default page size of 25. `usePaginatedList` wraps each
page fetch in `withRetry` + `friendlyError`.

**What to monitor:**
- FlatList performance on physical devices: no jank when scrolling (see
  [performance-checklist.md](./performance-checklist.md) Sections 3 and 6).
- `Load more` button visibility: testers should confirm it appears when lists exceed 25 rows.
- Any Sentry errors with context `usePaginatedList` — indicates a non-transient page-fetch
  failure (user sees a friendly error banner).

**Alert threshold:** Pilot lists unlikely to exceed 25 rows on day 1 — no immediate concern.
If page-fetch errors spike, check Supabase DB connectivity.

### 8.3 Offline / network (`OfflineBanner`, `withRetry`, `friendlyError`)

**What it does:**
- `OfflineBanner` appears app-wide when `NetInfo` reports `isConnected === false`.
- `withRetry` retries transient network/5xx errors (reads only) up to 3 times.
- `friendlyError` maps transient errors to "You appear to be offline. Check your connection
  and try again." and non-transient to "Something went wrong. Please try again."

**What to monitor:**
- Sentry errors from `friendlyError` non-transient path (non-network, non-5xx errors) —
  these indicate real bugs that `withRetry` couldn't recover from.
- Tester reports of the offline banner appearing incorrectly on good connections (NetInfo
  false-negative) — minor, expected on some Android device/carrier combinations.

**Alert threshold:** > 5 non-transient `friendlyError` events per hour → investigate the
failing screen.

### 8.4 Double-submit guards (`booking/[id].tsx`)

**What it does:** Four in-flight flags (`payingMpesa`, `applyingPromo`, `applyingWallet`,
`submittingReview`) disable the corresponding buttons while a request is in flight. Prevents
duplicate payment/wallet/promo/review requests from rapid taps.

**What to monitor:**
- Duplicate `payment_attempts` rows for the same payment (should be zero with guards active):
  ```sql
  select payment_id, count(*)
  from public.payment_attempts
  group by payment_id
  having count(*) > 1;
  ```
- Duplicate `reviews` rows for the same booking (unique constraint enforces at DB level, but
  should not be attempted with guards active):
  ```sql
  select booking_id, count(*)
  from public.reviews
  group by booking_id
  having count(*) > 1;
  ```

**Alert threshold:** Any duplicate payment attempt for the same `payment_id` with `status ≠ cancelled` → P1 investigation.

---

## 9. Daily pilot health check (5 minutes)

Run this quick check each pilot day:

1. **Sentry:** any new issues since last check? Triage by severity.
2. **Edge Function logs:** any unexpected 5xx on `mpesa-stk-push`, `send-push`?
3. **Failed payments:** `select count(*) from payment_attempts where status='failed' and created_at > now()-interval '24h';` — expectation: low.
4. **Push token count:** `select count(*) from device_tokens;` — should grow as users register.
5. **DB errors:** any RLS violations in Postgres logs?
6. **Tester channel:** any crash/error reports? Acknowledge within 2 h.
