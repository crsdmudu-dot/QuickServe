# Slice 34 — Customer Experience: Verification, No-Workflow Proof & Rollback

Accurate as of migration `0029_customer_experience.sql` and commit range `d9a6741..HEAD`
on branch `feat/slice-34-customer-experience`.

**Related docs:** [provider-quality.md](./provider-quality.md) · [marketplace-discovery.md](./marketplace-discovery.md) · [ratings-v2.md](./ratings-v2.md) · [wallet.md](./wallet.md) · [promotions.md](./promotions.md) · [security-hardening.md](./security-hardening.md)

---

## 1. Overview

Slice 34 refines the customer journey across five surfaces. It is **additive and customer-facing only** — no existing booking/dispatch/payment/wallet/promotions/payout/auth/notifications/analytics/Operations workflow is touched.

| Surface | Route | What was added |
|---|---|---|
| Booking history | `/(customer)/bookings` | `BookingStatusCard` replaces inline cards; `BookingProgressTracker` for in-progress bookings |
| Booking detail | `/booking/[id]` | `BookingProgressTracker`, service summary, `PaymentBreakdownCard`, receipt link, review-edit affordance (display-only additions; all 4 existing handlers unchanged) |
| Receipt | `/booking/receipt` | New pushed route; `buildReceipt` (pure) → `ReceiptView`; NO mutation; download/share disabled |
| Profile | `/(customer)/profile` | `ProfileCompletionCard`; links to Preferences and Trust & Safety |
| Preferences | `/(customer)/preferences` | Favorite services toggle (owner-only write); default address read; future-ready prefs display-only |
| Trust & Safety | `/(customer)/trust` | Static guarantees, safety reminders, customer tips, illustrative trust signals |

**DB change:** `supabase/migrations/0029_customer_experience.sql` (the only migration in this slice):
- `reviews.updated_at` column (additive, nullable)
- `edit_review` RPC (owner + 24h guard, content-only)
- `favorite_services` table (owner-only RLS; 3 policies — select/insert/delete; no update)

No existing table, policy, function, trigger, or route was removed or altered.

---

## 2. Review Editing

### 2.1 Migration proof (`0029_customer_experience.sql`)

```sql
-- Line 11 — additive column
alter table public.reviews add column if not exists updated_at timestamptz;

-- Lines 20–54 — owner-only SECURITY DEFINER RPC
create or replace function public.edit_review(...)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.reviews
    where id = p_review_id
      and customer_id = auth.uid()          -- OWNER CHECK
      and created_at > now() - interval '24 hours'  -- 24h WINDOW
  ) then
    raise exception 'edit window closed or not owner';
  end if;

  update public.reviews set
    comment = p_comment, rating = p_rating,
    quality_rating = p_quality, punctuality_rating = p_punctuality,
    communication_rating = p_communication, professionalism_rating = p_professionalism,
    value_rating = p_value, would_recommend = p_would_recommend,
    tags = coalesce(p_tags, '{}'),
    updated_at = now()            -- updated_at stamped; rating content CAN change
  where id = p_review_id;
end; $$;
```

**Key guarantees (all verifiable from the migration):**

- `security definer set search_path = public` — bypasses the admin-only reviews UPDATE policy; the body applies its own owner + window guard.
- Guard: `customer_id = auth.uid() AND created_at > now() - interval '24 hours'` — non-owner or expired window → `raise exception`.
- Content-only UPDATE: fields updated are `comment`, `rating`, `quality_rating`, `punctuality_rating`, `communication_rating`, `professionalism_rating`, `value_rating`, `would_recommend`, `tags`, `updated_at`. **No provider_id, booking_id, customer_id, or status field is touched.**
- **No new reviews UPDATE policy** — `grep "policy.*reviews.*update\|UPDATE.*reviews" 0029_customer_experience.sql` returns nothing. The RPC is the sole owner-edit path.
- **trg_recompute_provider_rating is UNCHANGED** — the migration does not contain `alter trigger`, `drop trigger`, `create trigger`, or `create or replace function.*recompute`. The trigger fires automatically on the `UPDATE` above because it is defined `after insert or update or delete on reviews` — Ratings-2.0 scoring stays intact.
- **Check constraints unchanged** — `0029` contains no `alter table reviews add constraint` or `drop constraint`. The existing `rating between 1 and 5`, category-rating bounds, and tag-allowlist constraints remain in force.

### 2.2 Client-side library (`src/lib/reviews.ts`, lines 223–263)

- `editReview(...)` calls `supabase.rpc('edit_review', {...})` — the RPC is the authority; no direct `update` statement.
- `canEditReview(review)` — pure: `Date.now() - Date.parse(review.created_at) < 24 * 3600 * 1000`. Display-only gate; server enforces independently.

### 2.3 UI component (`src/components/customer/review-edit-form.tsx`)

`ReviewEditForm` calls **only** `editReview` on submit (`await editReview({reviewId, ...})`). No other mutation function is imported or called.

### 2.4 As-role RLS spot-audit — `edit_review`

An operator can run the following SQL in the Supabase SQL Editor or `psql` to verify:

```sql
-- ── A. Confirm RPC exists with correct security model ────────────────────────
select routine_name, security_type
from information_schema.routines
where routine_schema = 'public' and routine_name = 'edit_review';
-- Expected: edit_review | DEFINER

-- ── B. Owner within 24h — should succeed (returns void / no exception) ───────
-- (run as the customer who owns the review, using their JWT)
select edit_review(
  '<review_id_owned_by_caller>',
  'Updated comment', 5, 5, 5, 5, 5, 5, true, ARRAY['great_service']
);
-- Expected: no exception raised

-- ── C. Non-owner — should raise exception ───────────────────────────────────
-- (run as a different customer's JWT)
select edit_review('<review_id_owned_by_someone_else>', 'Hack', 1, null, null, null, null, null, null, null);
-- Expected: ERROR — edit window closed or not owner

-- ── D. Owner after 24h — should raise exception ──────────────────────────────
-- (run as owner of a review created more than 24h ago)
select edit_review('<review_id_created_>24h_ago>', 'Late edit', 4, null, null, null, null, null, null, null);
-- Expected: ERROR — edit window closed or not owner

-- ── E. Recompute trigger fires on edit ───────────────────────────────────────
-- Record the provider's average_rating before calling edit_review,
-- then call it (valid owner + window), then re-check — aggregate should update.
select average_rating from profiles where id = '<provider_id>';
-- … call edit_review with a different rating …
select average_rating from profiles where id = '<provider_id>';
-- Expected: average_rating reflects the new value (trg_recompute_provider_rating fired)

-- ── F. No direct reviews UPDATE policy exists for customers ──────────────────
select policyname, cmd from pg_policies
where tablename = 'reviews' and cmd = 'UPDATE';
-- Expected: only the admin-only update policy (e.g. "reviews_update_admin") —
-- no "customer" or "owner" UPDATE policy row (edit_review RPC is the sole path).
```

---

## 3. Favorite Services

### 3.1 Migration proof (`0029_customer_experience.sql`, lines 60–84)

```sql
create table if not exists public.favorite_services (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.profiles(id) on delete cascade,
  service_id   text not null,
  created_at   timestamptz not null default now(),
  unique (customer_id, service_id)          -- prevents duplicates
);

create index if not exists favorite_services_customer_idx
  on public.favorite_services (customer_id, created_at desc);

alter table public.favorite_services enable row level security;

-- SELECT — owner only
create policy "favorite_services_select" on public.favorite_services
  for select using (customer_id = auth.uid());

-- INSERT — owner only
create policy "favorite_services_insert" on public.favorite_services
  for insert with check (customer_id = auth.uid());

-- DELETE — owner only
create policy "favorite_services_delete" on public.favorite_services
  for delete using (customer_id = auth.uid());
```

**Key guarantees:**
- RLS enabled immediately; 3 policies, all `customer_id = auth.uid()`.
- **NO UPDATE policy** — the table has no mutation path that changes a row.
- **NO provider, admin, or public policy** — unauthenticated requests and provider/admin roles cannot read or modify any row.
- `unique(customer_id, service_id)` — duplicate insert is rejected at the DB level (client handles 23505 as idempotent success).
- `service_id` is a plain `text` — no FK to a services table (SERVICES codes are app-defined constants).

### 3.2 Client-side library (`src/lib/favorite-services.ts`)

- `getMyFavoriteServices` / `getFavoriteServiceIds` — rely on RLS; no manual `eq('customer_id', ...)` filter needed (owner is implicit via `auth.uid()`).
- `addFavoriteService(serviceId)` — calls `supabase.auth.getUser()` client-side first; inserts with explicit `customer_id: u.user.id`.
- `removeFavoriteService(serviceId)` — deletes with `.eq('customer_id', u.user.id).eq('service_id', serviceId)`.
- Neither function accepts a `customerId` parameter from callers — identity is always resolved from the auth session.

### 3.3 As-role RLS spot-audit — `favorite_services`

```sql
-- ── A. Owner can select own rows ─────────────────────────────────────────────
-- (run as customer A's JWT)
select * from favorite_services;
-- Expected: only rows where customer_id = customer_A's uid

-- ── B. Another customer cannot see customer A's favorites ────────────────────
-- (run as customer B's JWT — who has no favorites)
select * from favorite_services;
-- Expected: 0 rows (even if customer A has favorites)

-- ── C. Owner can insert ───────────────────────────────────────────────────────
-- (run as customer A's JWT)
insert into favorite_services (customer_id, service_id)
values (auth.uid(), 'house_cleaning');
-- Expected: success (1 row inserted)

-- ── D. Duplicate insert is blocked by unique constraint ───────────────────────
insert into favorite_services (customer_id, service_id)
values (auth.uid(), 'house_cleaning');
-- Expected: ERROR 23505 — duplicate key value violates unique constraint

-- ── E. Cross-customer insert is blocked by RLS ────────────────────────────────
-- (run as customer B's JWT, attempting to insert for customer A)
insert into favorite_services (customer_id, service_id)
values ('<customer_A_id>', 'plumbing');
-- Expected: ERROR — new row violates row-level security policy

-- ── F. Provider/admin role cannot read ───────────────────────────────────────
-- (run as a provider or admin JWT with no customer_id match)
select * from favorite_services;
-- Expected: 0 rows (no matching policy for their uid)

-- ── G. No UPDATE path ────────────────────────────────────────────────────────
select policyname, cmd from pg_policies
where tablename = 'favorite_services' and cmd = 'UPDATE';
-- Expected: 0 rows
```

---

## 4. Receipts (Display-Only)

### 4.1 `buildReceipt` is pure (`src/lib/receipts.ts`)

File header: `// No I/O, no network, no mutation, no Supabase import.`

- No `import { supabase }` — the file only imports `type Payment` from `@/lib/payments` and `amountDue` from `@/lib/wallet` (a pure math helper).
- `buildReceipt({ booking, payment })` — reads `payment.amount`, `payment.wallet_applied`, `payment.promo_discount`, `payment.status`, `payment.payment_method`, `payment.paid_at`, `payment.created_at`. **No write, no RPC, no INSERT/UPDATE.**
- `canDownloadReceipt = false` — the download/share affordance is a future-ready placeholder; always returns false.
- **No financial recalculation** — `total = payment.amount` (the raw stored value). The function composes lines from what the DB already recorded; it does not recompute what the customer owes.

### 4.2 Receipt screen (`src/app/booking/receipt.tsx`)

- Imports: `getBookingById`, `getPaymentForBooking` (read-only), `buildReceipt` (pure), `ReceiptView` (display).
- `Promise.all([getBookingById(id), getPaymentForBooking(id)])` — two reads; no mutation.
- Renders `<ReceiptView receipt={buildReceipt({ booking, payment })} />`.
- `applyWalletToPayment`, `redeemPromo`, `initiateMpesaPayment`, `admin_wallet_adjust`, `.rpc(...)`, `.insert(...)`, `.update(...)` are **not imported** and **not called** in this file.

### 4.3 Component (`src/components/customer/payment-breakdown-card.tsx`, `receipt-view.tsx`)

- `PaymentBreakdownCard` renders `receipt.lines`, `receipt.total`, `receipt.walletApplied`, `receipt.promoDiscount`, `receipt.amountDue` — display only.
- `ReceiptView` renders meta fields + `<PaymentBreakdownCard>` + disabled download/share buttons guarded by `!canDownloadReceipt`.
- No payment mutation function is imported in either component.

---

## 5. Customer Profile

### 5.1 `computeCustomerProfileCompletion` (`src/constants/customer-profile.ts`)

Pure function: accepts `{ profile: { full_name, phone } | null; hasDefaultAddress: boolean }`, returns `{ percent, items, missing }`. No network, no DB call, no side effects, never throws.

### 5.2 Profile screen (`src/app/(customer)/profile.tsx`)

- Reads `profiles` via `supabase.from('profiles').select('full_name, phone').eq('id', ...).maybeSingle()` — **SELECT only, no UPDATE**.
- Reads `getMySavedAddresses()` — existing read helper.
- Existing entries preserved: Wallet / Saved addresses / Notification settings / Sign out.
- New entries added: `ProfileCompletionCard`, link to `/preferences`, link to `/trust`.

### 5.3 Preferences screen (`src/app/(customer)/preferences.tsx`)

- **Favorite services**: calls `addFavoriteService` / `removeFavoriteService` (owner-only DB write, RLS-enforced). This is the only write in the entire Slice 34 customer UI.
- **Default address**: calls `getMySavedAddresses()` — READ only; `.find(a => a.is_default)` — no write.
- **Future-ready preferences** (language / communication / notification): rendered as plain `View` + "coming soon" badge. No `onPress`, no handler, no DB call, no state write. These sections do NOT touch the notifications system.

### 5.4 Trust & Safety screen (`src/app/(customer)/trust.tsx`)

Fully static/derived. `ILLUSTRATIVE_SIGNALS` is module-level constant derived from `deriveCustomerTrustSignals({ is_verified: true, completed_jobs_count: 120, average_rating: 4.9 })` — no DB call, no mutation. Renders `TrustSignalCard`, `ServiceGuaranteesCard`, `SafetyTipsCard`.

---

## 6. Trust Signals

### 6.1 `deriveCustomerTrustSignals` (`src/constants/trust.ts`, lines 96–127)

Pure function: accepts `{ is_verified?, completed_jobs_count?, average_rating? }`. Returns an array of `{ key, label, icon }` based on thresholds. No DB call, no network, no side effects.

Thresholds used: `is_verified === true`, `jobs >= 100/50/10/1`, `rating >= 4.8` — same as Slice 33.

### 6.2 Static content

`SERVICE_GUARANTEES`, `SAFETY_REMINDERS`, `CUSTOMER_TIPS`, `TRUST_MESSAGES` — all factual statements about QuickServe platform policies. **No hardcoded fake statistics** (no fabricated "97% satisfaction rate", "10,000 bookings completed", etc.). All copy describes process, commitment, and behavior rather than numbers.

---

## 7. Workflow Proof (Unchanged Systems)

The following systems are confirmed unchanged by `git diff main..HEAD --name-only`:

| System | Status | Evidence |
|---|---|---|
| Booking creation / submission workflow | Unchanged | No file under `src/lib/bookings.ts` modified (read-only usage in new screens) |
| Dispatch / provider assignment | Unchanged | No dispatch, assignment, or ranking file in the diff |
| Provider-request / quote workflow | Unchanged | `acceptQuote` / `declineQuote` handlers in `booking/[id].tsx` are EXISTING code; no new quote file |
| Provider ranking | Unchanged | No ranking file changed |
| Payment logic (`src/lib/payments.ts`) | Unchanged | Not in the diff |
| Wallet logic (`src/lib/wallet.ts`) | Unchanged | Not in the diff; `amountDue` import in `receipts.ts` is read-only (pure math) |
| Promotions logic (`src/lib/promotions.ts`) | Unchanged | Not in the diff |
| Provider payouts | Unchanged | Not in the diff |
| Auth (`src/auth/`, `src/lib/auth*.ts`) | Unchanged | Not in the diff |
| Push notifications system | Unchanged | Not in the diff; future-ready prefs in preferences screen have NO handler |
| Analytics | Unchanged | Not in the diff |
| Operations Portal | Unchanged | Not in the diff |
| `app-tabs.tsx` (NativeTabs) | Unchanged | Not in the diff |
| Existing reviews RLS policies | Unchanged | `0029` contains no `drop policy` / `alter policy` for `reviews` |
| `trg_recompute_provider_rating` trigger | Unchanged | `0029` contains no `create trigger` / `drop trigger` / `alter trigger` |
| Existing Ratings-2.0 check constraints | Unchanged | `0029` contains no `add constraint` / `drop constraint` on `reviews` |

**Booking detail handlers confirmed intact** (`src/app/booking/[id].tsx`): `handlePayMpesa` (calls `initiateMpesaPayment`), `handleApplyPromo` (calls `redeemPromo`), `handleApplyWallet` (calls `applyWalletToPayment`), `handleSubmitReview` (calls `submitReview`) — all present and unmodified. The Slice 34 additions are display-only: `BookingProgressTracker`, `PaymentBreakdownCard`, receipt link, review-edit affordance.

**`booking/review.tsx` confirmed unchanged** — the booking-creation flow review screen has no diff.

---

## 8. Isolation

### 8.1 `git diff main..HEAD --stat` summary

47 files changed, 5909 insertions(+), 42 deletions(-).

All changes are confined to:

| Category | Files |
|---|---|
| Migration (only one) | `supabase/migrations/0029_customer_experience.sql` |
| Lib additions | `src/lib/reviews.ts` (+51 lines, append-only), `src/lib/favorite-services.ts` (new), `src/lib/receipts.ts` (new) |
| Constants | `src/constants/trust.ts` (new), `src/constants/customer-profile.ts` (new) |
| Components | 11 new files under `src/components/customer/` |
| Screens | `src/app/(customer)/bookings.tsx` (refactor), `src/app/(customer)/profile.tsx` (additive), `src/app/(customer)/preferences.tsx` (new), `src/app/(customer)/trust.tsx` (new), `src/app/booking/[id].tsx` (additive), `src/app/booking/receipt.tsx` (new) |
| Tests | 8 new test files + 3 extended test files (all in `src/__tests__/` and collocated) |

### 8.2 What is NOT in the diff

- No `supabase/migrations/` file other than `0029`.
- No `src/lib/payments.ts`, `wallet.ts`, `promotions.ts`, `bookings.ts`, `auth*.ts`, `notifications.ts`, `analytics.ts`, `payouts.ts`.
- No `src/app/(admin*)/`, `src/app/provider/`, `src/app/(tabs)/`.
- No `app-tabs.tsx`, no navigation config.
- The 42 deletions are cosmetic (inline Card → BookingStatusCard in `bookings.tsx`; Slice 34 component integrations in `booking/[id].tsx` and `profile.tsx`).

### 8.3 Only migration 0029

`git diff main..HEAD --name-only | grep supabase/migrations` returns exactly one result: `supabase/migrations/0029_customer_experience.sql`. No other migration was created or modified.

---

## 9. Rollback

**Pre-merge:** all work is on `feat/slice-34-customer-experience`. To abandon: `git checkout main` and delete the branch — main is unaffected.

**Per-task revert:** each task is an independent commit. `git revert <commit>` rolls back that task. Reverting T3–T5 removes the UI; the lib and table are harmless if unused. Reverting T1–T2 removes the DB layer and lib helpers.

**DB rollback** (run as a Supabase migration or directly):
```sql
drop function if exists public.edit_review(uuid, text, int, int, int, int, int, int, boolean, text[]);
drop table if exists public.favorite_services cascade;
alter table public.reviews drop column if exists updated_at;
```
These are safe:
- `edit_review` is new — dropping it has no effect on existing reviews.
- `favorite_services` is new — dropping it (with cascade on its RLS policies) loses only favorited-service records added in this slice.
- `reviews.updated_at` is new, nullable, and set only on edit — dropping it loses the edit-timestamp but no other review data.
- **The recompute trigger is unchanged throughout** — rollback does not affect it.
- **Existing reviews/payments/bookings are untouched** — no data migration to reverse.

---

## 10. Release Gate

All 5 checks run on branch `feat/slice-34-customer-experience` at HEAD (post-T5):

| Check | Result |
|---|---|
| `npm test` | PASS — 2258/2258 tests, 192 suites |
| `npx expo export --platform android` | PASS — dist/metadata.json, android bundle exported |
| `npx tsc --noEmit` | PASS — clean (no output; run after expo export android so new route types exist) |
| `npx expo export --platform web` | PASS — all web routes exported to dist/ |
| `git status` | CLEAN — only untracked `supabase/.temp/` (gitignored); no staged or modified files |

**Worker process force-exit warning in Jest output** — pre-existing, unrelated to Slice 34 (appeared in T1–T5 as well). All 192 suites and 2258 tests green.

---

## 11. No Critical/Important Defects Found

The review of all migration SQL, lib files, components, and screens found:

- No RLS gap — `edit_review` guard is owner + 24h (double-enforced: RPC body + RLS search_path). `favorite_services` is strictly owner-only.
- No mutation in the receipt/breakdown path — `buildReceipt` is pure; receipt screen only reads.
- No review scoring/trigger change — `trg_recompute_provider_rating` untouched; `edit_review` allows `rating` to change (as required by the spec — you can correct a star rating within 24h), which causes the trigger to fire and recompute the aggregate (correct behavior).
- No future-ready pref that writes — language/communication/notification prefs display "coming soon" with no handler.
- No out-of-scope change — isolation diff confirms only the Slice-34 layer changed.
- All 5 gate checks pass.

Minor note (non-blocking, from T2 code review): `receipts.ts` imports `amountDue` from `@/lib/wallet` — this is a pure math helper (`max(0, total - wallet - promo)`), not a mutation; the transitive Supabase load only occurs at module parse time (mocked in tests). Accepted.
