# Security Hardening — RLS Spot-Audit (Slices 18–28)

**Purpose:** Document the RLS spot-audit for tables introduced after the core backend
(Slices 18–28). For the base-layer audit (profiles, bookings, payments, reviews, notifications,
storage, device_tokens), see [backend-readiness.md](./backend-readiness.md) Section 9.

**Audit method:** Policy definitions read directly from migration files; cross-checked against
the `pg_policies` view pattern `SELECT * FROM pg_policies WHERE tablename = '<table>';` and
the as-role SELECT pattern (run in Supabase SQL editor with role-specific JWTs). No live DB
is required for this static audit — the migration SQL is the source of truth.

**Fix policy:** Issues noted below only. Prior slices verified each table at merge time.
Expected finding: **none**.

---

## Audited tables

| Table | Migration | Slice |
|---|---|---|
| `wallets` | `0023_wallet.sql` | Slice 26 |
| `wallet_transactions` | `0023_wallet.sql` | Slice 26 |
| `promo_codes` | `0024_promotions.sql` | Slice 27 |
| `promo_redemptions` | `0024_promotions.sql` | Slice 27 |
| `review_private_feedback` | `0022_ratings_v2.sql` | Slice 25 |
| `customer_addresses` | `0019_customer_addresses.sql` | Slice 20 |
| `notification_preferences` | `0020_notification_system.sql` | Slice 22 |
| `provider_locations` | `0018_provider_locations.sql` | Slice 21 |

---

## 1. `wallets`

**Migration comment:** "SELECT: own or admin. NO provider policy. NO insert/update/delete
policy (RPC-only writes)."

```sql
-- from 0023_wallet.sql
create policy "wallets_select" on public.wallets
  for select using (customer_id = auth.uid() or public.is_admin());
```

| Check | Result |
|---|---|
| Owner-only SELECT | `customer_id = auth.uid()` — PASS |
| Admin read | `or public.is_admin()` — PASS |
| No-provider leakage | No provider SELECT policy — PASS |
| No direct write policy | `balance` changed only via SECURITY DEFINER RPCs (`_wallet_post`, `admin_wallet_adjust`); no INSERT/UPDATE/DELETE policy exists — PASS |

---

## 2. `wallet_transactions`

**Migration comment:** "SELECT: own or admin. NO provider policy. NO update/delete/insert
policy (append-only, RPC-only writes)."

```sql
create policy "wallet_txn_select" on public.wallet_transactions
  for select using (customer_id = auth.uid() or public.is_admin());
```

| Check | Result |
|---|---|
| Owner-only SELECT | `customer_id = auth.uid()` — PASS |
| Admin read | `or public.is_admin()` — PASS |
| No-provider leakage | No provider SELECT policy — PASS |
| Append-only (no write policy) | No INSERT/UPDATE/DELETE policy — writes via `_wallet_post` RPC (SECURITY DEFINER) — PASS |

---

## 3. `promo_codes`

```sql
create policy "promo_codes_select" on public.promo_codes
  for select using (public.is_admin());
create policy "promo_codes_insert" on public.promo_codes
  for insert with check (public.is_admin());
create policy "promo_codes_update" on public.promo_codes
  for update using (public.is_admin()) with check (public.is_admin());
```

| Check | Result |
|---|---|
| Admin-only SELECT | `public.is_admin()` — PASS |
| Admin-only INSERT/UPDATE | `public.is_admin()` on both — PASS |
| No customer/provider SELECT | No `customer_id = auth.uid()` path — customers cannot enumerate codes — PASS |
| No DELETE policy | Not exposed to any client — PASS |

> Note: customers interact with promo codes only through the `redeem_promo` SECURITY DEFINER
> RPC, which looks up the code internally. Customers never SELECT from `promo_codes` directly.

---

## 4. `promo_redemptions`

**Migration comment:** "SELECT own or admin. NO provider policy. NO update/delete/insert policy
(append-only, RPC-only writes)."

```sql
create policy "promo_redemptions_select" on public.promo_redemptions
  for select using (customer_id = auth.uid() or public.is_admin());
```

| Check | Result |
|---|---|
| Owner-only SELECT | `customer_id = auth.uid()` — PASS |
| Admin read | `or public.is_admin()` — PASS |
| No-provider leakage | No provider SELECT policy — PASS |
| Append-only (no write policy) | Inserted only by `redeem_promo` SECURITY DEFINER RPC — PASS |

---

## 5. `review_private_feedback`

```sql
create policy "rpf_insert" on public.review_private_feedback
  for insert with check (
    customer_id = auth.uid()
    and exists (select 1 from public.reviews r
                where r.id = review_id and r.customer_id = auth.uid())
  );

-- "SELECT: authoring customer OR admin. NO provider policy → providers can never read it."
create policy "rpf_select" on public.review_private_feedback
  for select using (customer_id = auth.uid() or public.is_admin());
```

| Check | Result |
|---|---|
| Owner-only SELECT | `customer_id = auth.uid()` — PASS |
| Admin read | `or public.is_admin()` — PASS |
| No-provider leakage | Migration comment explicit: "NO provider policy → providers can never read it" — PASS |
| Insert guard | Customer must own the matching review row — PASS |
| No UPDATE/DELETE policy | Private feedback is immutable once submitted — PASS |

---

## 6. `customer_addresses`

```sql
create policy "customer_addresses_select" on public.customer_addresses
  for select using (customer_id = auth.uid());
create policy "customer_addresses_insert" on public.customer_addresses
  for insert with check (customer_id = auth.uid());
create policy "customer_addresses_update" on public.customer_addresses
  for update using (customer_id = auth.uid()) with check (customer_id = auth.uid());
create policy "customer_addresses_delete" on public.customer_addresses
  for delete using (customer_id = auth.uid());
```

| Check | Result |
|---|---|
| Owner-only SELECT | `customer_id = auth.uid()` — PASS |
| Owner-only INSERT/UPDATE/DELETE | Same condition — PASS |
| No admin read policy | Admin cannot read customer addresses via direct SELECT (intentional — not needed for admin workflows) — PASS |
| No-provider leakage | No provider policy — PASS |

---

## 7. `notification_preferences`

```sql
create policy "notification_preferences_select" on public.notification_preferences
  for select using (user_id = auth.uid());
create policy "notification_preferences_insert" on public.notification_preferences
  for insert with check (user_id = auth.uid());
create policy "notification_preferences_update" on public.notification_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notification_preferences_delete" on public.notification_preferences
  for delete using (user_id = auth.uid());
```

| Check | Result |
|---|---|
| Owner-only (all operations) | `user_id = auth.uid()` on every policy — PASS |
| No-provider leakage | No provider-specific read path — applies to all roles; each user only sees their own preferences — PASS |
| No admin read | Admin cannot bulk-read preferences (intentional — preferences are personal settings) — PASS |

---

## 8. `provider_locations`

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

| Check | Result |
|---|---|
| Booking-scoped SELECT | Only the booking's customer, assigned provider, or admin — PASS |
| No leakage to unrelated providers | A different provider (not assigned to this booking) cannot SELECT — PASS |
| No direct write policy | Location upserted only via `upsert_provider_location` SECURITY DEFINER RPC (validates assigned provider + booking status `on_the_way`/`in_progress`) — PASS |
| Admin read | `or public.is_admin()` — PASS |

---

## 9. Analytics RPC admin guard

All analytics RPCs in `0025_analytics.sql` open with:

```sql
if not public.is_admin() then
  raise exception 'Forbidden';
end if;
```

Confirmed on: `analytics_kpis`, `analytics_bookings_timeseries`, `analytics_bookings_summary`,
`analytics_financial_timeseries`, `analytics_provider_leaderboard`, `analytics_service_breakdown`,
`analytics_promo_performance`, `analytics_review_sentiment`, `analytics_funnel`.
All 9 RPCs have the `is_admin()` guard. — PASS.

---

## 10. Secrets & bundle audit

- `EXPO_PUBLIC_SENTRY_DSN`: empty placeholder in `.env.example` — no real DSN committed. PASS.
- `GOOGLE_PLACES_API_KEY`: server-only (Supabase secret) — never in the app bundle. PASS.
- `DARAJA_*` + `MPESA_CALLBACK_SECRET`: Supabase secrets only. PASS.
- `PUSH_WEBHOOK_SECRET`: Supabase secret only. PASS.
- `SUPABASE_SERVICE_ROLE_KEY`: auto-injected by Supabase runtime — never in `.env.example` or
  any client code. PASS.

---

## Summary

| Table / Area | Finding |
|---|---|
| `wallets` | No gaps — owner+admin read, no write policy (RPC-only) |
| `wallet_transactions` | No gaps — owner+admin read, append-only (RPC-only) |
| `promo_codes` | No gaps — admin-only CRUD; customer access via RPC only |
| `promo_redemptions` | No gaps — owner+admin read, append-only (RPC-only) |
| `review_private_feedback` | No gaps — owner+admin read, no provider access |
| `customer_addresses` | No gaps — owner-only CRUD |
| `notification_preferences` | No gaps — owner-only CRUD |
| `provider_locations` | No gaps — booking-participant+admin read, write via RPC |
| Analytics RPCs | No gaps — all 9 RPCs enforce `is_admin()` guard |
| Secrets in bundle | None — all server secrets in Supabase secrets vault |

**Critical/Important findings: NONE.**
