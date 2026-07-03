# Slice 25 — Ratings 2.0: Operator & Verification Guide

Accurate as of migration `0022_ratings_v2.sql` and commit range `11ab2f1..HEAD`.

---

## 1. Overview — Augment, Not Replace

Ratings v2 adds **optional** depth to reviews while leaving the foundation of Slice 10 untouched:

- The overall `rating` (1–5 int) is still **required** on every review.
- `recompute_provider_rating()`, the `trg_recompute_provider_rating` trigger, and `profiles.average_rating` / `profiles.review_count` are **UNCHANGED**.
- Seven new columns on `public.reviews` add optional category detail — customers who skip them produce a legacy-style review that renders and counts exactly as before.
- Private feedback lives in a separate `review_private_feedback` table with RLS that makes it completely **provider-invisible**.
- `get_provider_rating_breakdown` is a SECURITY DEFINER RPC for display purposes only — it does **not** affect ranking, dispatch, or assignment.

```
Customer submits review
    │
    ├─ overall rating (required) → INSERT into reviews
    │       │
    │       └─ trg_recompute_provider_rating fires
    │               → profiles.average_rating + review_count updated (UNCHANGED)
    │
    ├─ category ratings / would_recommend / tags (optional) → same INSERT row
    │
    ├─ private feedback (optional) → INSERT into review_private_feedback (best-effort)
    │       → no notification fired; provider cannot read it (RLS)
    │
    └─ tg_notify_review fires → review_received notification to provider (UNCHANGED)

Provider / Admin reads breakdown:
    get_provider_rating_breakdown(p_provider_id)
    → aggregates non-hidden reviews → category averages / recommend % / top tags
    → display-only: not consumed by dispatch, sort, or assignProvider
```

---

## 2. Overall Rating — Unchanged

`rating` on `public.reviews` is `int not null check (rating between 1 and 5)`. The `recompute_provider_rating()` function and its trigger compute `average_rating` / `review_count` on `public.profiles` over non-hidden reviews after every insert, update, or delete.

### Verify the trigger and function still exist

```sql
-- Confirm trigger is on public.reviews
select tgname, tgenabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relnamespace = 'public'::regnamespace
  and c.relname = 'reviews'
  and tgname = 'trg_recompute_provider_rating';
-- Expected: 1 row, tgenabled = 'O'

-- Confirm the function body still uses only is_hidden = false (UNCHANGED from 0008)
select prosrc
from pg_proc
where proname = 'recompute_provider_rating'
  and pronamespace = 'public'::regnamespace;
-- Expected: body selects avg(rating)…count(*) from reviews where is_hidden = false
-- No reference to quality_rating or any v2 column.
```

### Verify aggregates update on hide/unhide

```sql
-- Hiding a review decrements average_rating and review_count:
update public.reviews set is_hidden = true where id = '<review-uuid>';
-- Then check:
select average_rating, review_count from profiles where id = '<provider-uuid>';
-- review_count drops by 1; average_rating recomputes over remaining visible reviews.

-- Unhiding restores:
update public.reviews set is_hidden = false where id = '<review-uuid>';
select average_rating, review_count from profiles where id = '<provider-uuid>';
-- review_count restored; average_rating includes the review again.
```

---

## 3. Schema Check — New Review Columns

Seven columns were added to `public.reviews` by `0022_ratings_v2.sql`.

### Verify the 7 columns exist

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'reviews'
  and column_name in (
    'quality_rating', 'punctuality_rating', 'communication_rating',
    'professionalism_rating', 'value_rating',
    'would_recommend', 'tags'
  )
order by column_name;
-- Expected: 7 rows
--   communication_rating   | integer | YES | NULL  (nullable, no default)
--   professionalism_rating | integer | YES | NULL
--   punctuality_rating     | integer | YES | NULL
--   quality_rating         | integer | YES | NULL
--   value_rating           | integer | YES | NULL
--   would_recommend        | boolean | YES | NULL
--   tags                   | ARRAY   | NO  | '{}'  (NOT NULL, default empty array)
```

### Verify category CHECK constraints (reject 0 and 6; accept 1–5)

```sql
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.reviews'::regclass
  and conname in (
    'reviews_quality_rating_check',
    'reviews_punctuality_rating_check',
    'reviews_communication_rating_check',
    'reviews_professionalism_rating_check',
    'reviews_value_rating_check'
  )
order by conname;
-- Expected: 5 rows; each definition: CHECK ((<col> >= 1) AND (<col> <= 5))

-- Proof: reject out-of-range values
insert into public.reviews (booking_id, customer_id, provider_id, rating, quality_rating)
values ('<uuid>', auth.uid(), '<provider-uuid>', 4, 0);
-- Expected: ERROR 23514 (check violation on quality_rating)

insert into public.reviews (booking_id, customer_id, provider_id, rating, quality_rating)
values ('<uuid>', auth.uid(), '<provider-uuid>', 4, 6);
-- Expected: ERROR 23514 (check violation on quality_rating)

-- Proof: accept valid values
insert into public.reviews (booking_id, customer_id, provider_id, rating, quality_rating)
values ('<completed-booking-uuid>', auth.uid(), '<provider-uuid>', 4, 5)
returning id, rating, quality_rating;
-- Expected: 1 row; quality_rating = 5
```

### Verify tag vocabulary guard (`reviews_tags_allowed`)

The constraint `tags <@ array['on_time','friendly','clean_work','good_communication',
'fair_price','late','messy','poor_communication','overpriced']` rejects any unknown tag.

```sql
-- Confirm the constraint exists
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.reviews'::regclass
  and conname = 'reviews_tags_allowed';
-- Expected: 1 row; definition shows the 9-element allowlist

-- Proof: reject unknown tag
insert into public.reviews (booking_id, customer_id, provider_id, rating, tags)
values ('<uuid>', auth.uid(), '<provider-uuid>', 5, array['amazing']);
-- Expected: ERROR 23514 (check violation on reviews_tags_allowed)

-- Proof: accept a valid tag
insert into public.reviews (booking_id, customer_id, provider_id, rating, tags)
values ('<completed-booking-uuid>', auth.uid(), '<provider-uuid>', 5, array['on_time'])
returning id, tags;
-- Expected: 1 row; tags = {on_time}

-- Proof: accept the empty array (default)
insert into public.reviews (booking_id, customer_id, provider_id, rating, tags)
values ('<completed-booking-uuid-2>', auth.uid(), '<provider-uuid>', 4, '{}')
returning id, tags;
-- Expected: 1 row; tags = {}
```

The full allowed tag vocabulary is:

| Key | Sentiment |
|---|---|
| `on_time` | positive |
| `friendly` | positive |
| `clean_work` | positive |
| `good_communication` | positive |
| `fair_price` | positive |
| `late` | negative |
| `messy` | negative |
| `poor_communication` | negative |
| `overpriced` | negative |

---

## 4. `review_private_feedback` RLS — The Key Privacy Test

Private feedback is stored in a separate table. There is **no provider policy** — providers can never read it.

### Verify RLS is enabled and only the correct policies exist

```sql
-- Confirm table has RLS enabled
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname = 'review_private_feedback';
-- Expected: relrowsecurity = true

-- Confirm exactly 2 policies; no provider policy
select policyname, cmd, qual
from pg_policies
where tablename = 'review_private_feedback'
order by policyname;
-- Expected: exactly 2 rows:
--   rpf_insert | INSERT | customer_id = auth.uid() AND exists(review belongs to auth.uid())
--   rpf_select | SELECT | customer_id = auth.uid() OR is_admin()
-- NO update, NO delete, NO provider policy.
```

### Prove the privacy guarantee — per-role SQL

**Authoring customer can INSERT:**
```sql
-- As the customer who submitted the review (customer_id = auth.uid()):
insert into public.review_private_feedback (review_id, customer_id, provider_id, feedback)
values ('<review-uuid>', auth.uid(), '<provider-uuid>', 'Left the work area messy.')
returning review_id;
-- Expected: 1 row (INSERT succeeds)
```

**Authoring customer can SELECT their own row:**
```sql
-- As the authoring customer:
select feedback from public.review_private_feedback
where review_id = '<review-uuid>';
-- Expected: 1 row — 'Left the work area messy.'
```

**Admin can SELECT it:**
```sql
-- As a user where is_admin() = true:
select feedback from public.review_private_feedback
where review_id = '<review-uuid>';
-- Expected: 1 row — 'Left the work area messy.'
```

**Provider (even the reviewed provider) returns 0 rows — no provider policy:**
```sql
-- As the provider whose provider_id matches the review:
select * from public.review_private_feedback
where review_id = '<review-uuid>';
-- Expected: 0 rows (RLS filters the row; no provider SELECT policy exists)
```

**Another customer returns 0 rows:**
```sql
-- As a different customer (customer_id != review author):
select * from public.review_private_feedback
where review_id = '<review-uuid>';
-- Expected: 0 rows (RLS: customer_id != auth.uid() and not admin)
```

---

## 5. `get_provider_rating_breakdown` RPC — Display-Only

This SECURITY DEFINER function aggregates non-hidden reviews for a provider. It is called only from UI components (`RatingBreakdown`, provider profile screens, admin provider detail) and is **never consumed by dispatch, sort, or `assignProvider`**.

### Verify the function exists and its body

```sql
select prosrc
from pg_proc
where proname = 'get_provider_rating_breakdown'
  and pronamespace = 'public'::regnamespace;
-- Expected: 1 row; body filters r.is_hidden = false;
-- returns overall_avg, review_count, recommend_pct, 5 category avgs, top_tags (limit 6).
-- No update, no write, no side effect.
```

### Category averages and recommend %

```sql
-- Run the breakdown for a provider
select * from public.get_provider_rating_breakdown('<provider-uuid>');
-- Expected columns:
--   overall_avg         | numeric (NULL if no visible reviews)
--   review_count        | int    (0 if none)
--   recommend_pct       | numeric: 100 * avg(would_recommend::int) (NULL if all NULL)
--   quality_avg         | numeric (NULL if no visible review has quality_rating)
--   punctuality_avg     | numeric
--   communication_avg   | numeric
--   professionalism_avg | numeric
--   value_avg           | numeric
--   top_tags            | text[] (most frequent tags, max 6; '{}' if none)
```

### NULL / 0 when no visible reviews

```sql
-- Provider with no non-hidden reviews:
select * from public.get_provider_rating_breakdown('<provider-no-reviews-uuid>');
-- Expected: 1 row; overall_avg=NULL, review_count=0, recommend_pct=NULL,
-- all category avgs NULL, top_tags='{}'
```

### Hidden reviews excluded from breakdown

```sql
-- Before hiding: breakdown includes a quality_avg
select quality_avg, review_count from public.get_provider_rating_breakdown('<provider-uuid>');
-- quality_avg = some value; review_count = N

-- Hide the review
update public.reviews set is_hidden = true where provider_id = '<provider-uuid>';

-- After hiding: breakdown drops to 0 count, NULL avgs
select quality_avg, review_count from public.get_provider_rating_breakdown('<provider-uuid>');
-- Expected: quality_avg=NULL, review_count=0

-- Restore
update public.reviews set is_hidden = false where provider_id = '<provider-uuid>';
```

### No-ranking / no-dispatch audit

`get_provider_rating_breakdown` and `RatingBreakdown` component are referenced only in:

- `src/lib/reviews.ts` — `getProviderRatingBreakdown()` helper (display fetch)
- `src/app/provider/(tabs)/profile.tsx` — displays under "Rating breakdown" section header
- `src/app/admin/provider/[id].tsx` — displays under "Rating breakdown" section header
- `src/app/(admin-web)/providers/[id].tsx` — displays under "Rating breakdown" section header

None of these consumers sort providers, filter a list, or feed the result to `assignProvider`. The `assignProvider` function in `src/lib/bookings.ts` is **unchanged** and does not reference `average_rating`, `overall_avg`, or any breakdown field.

---

## 6. Old Reviews Still Render — Legacy Fallback

A review inserted before Slice 25 (NULL category ratings, `tags = '{}'`, NULL `would_recommend`) renders correctly via the legacy path in `ReviewCard` and still counts in `average_rating` / `review_count`.

### Verify old reviews get SQL defaults

```sql
-- A pre-Slice-25 review row will read:
select id, rating, comment, quality_rating, punctuality_rating,
       communication_rating, professionalism_rating, value_rating,
       would_recommend, tags
from public.reviews
where id = '<pre-v2-review-uuid>';
-- Expected:
--   rating               | 4       (original, unchanged)
--   comment              | 'Great service'  (original, unchanged)
--   quality_rating       | NULL
--   punctuality_rating   | NULL
--   communication_rating | NULL
--   professionalism_rating | NULL
--   value_rating         | NULL
--   would_recommend      | NULL
--   tags                 | {}
```

**Legacy display fallback:** `ReviewCard` checks — if all five `*_rating` fields are NULL, `would_recommend` is NULL, and `tags.length === 0`, it renders only the overall star rating and comment (the pre-v2 appearance). No enriched sections appear.

### Legacy row still counts in overall average

```sql
-- The recompute_provider_rating() trigger uses only `rating` (not category fields).
-- A pre-v2 review (NULL categories) contributes its `rating` value to:
select average_rating, review_count
from public.profiles
where id = '<provider-uuid>';
-- Expected: review_count includes old reviews; average_rating blends all visible reviews.
```

### Backward-compat: `createBooking`-style old insert still works

A `reviews` INSERT that omits all 7 new columns will succeed — `tags` defaults to `'{}'`, the five `*_rating` columns default to NULL, and `would_recommend` defaults to NULL. The overall `rating` still drives `recompute_provider_rating()` exactly as before.

---

## 7. Review Notifications — Unchanged

`tg_notify_review` fires `review_received` to the provider whenever a row is inserted into `public.reviews`. Slice 25 does **not** change this trigger or any notification pipeline.

### Verify the trigger still exists

```sql
select tgname, tgenabled, relname as table_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relnamespace = 'public'::regnamespace
  and tgname = 'tg_notify_review';
-- Expected: 1 row; tgenabled = 'O'; table_name = 'reviews'
```

### Verify private-feedback insert does NOT notify

`review_private_feedback` has no trigger — inserting into it never calls `notify_user` or generates a notification row. The provider is not told that private feedback exists.

```sql
-- Confirm no trigger on review_private_feedback
select tgname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relnamespace = 'public'::regnamespace
  and c.relname = 'review_private_feedback';
-- Expected: 0 rows
```

### Verify `submitReview` still fires the notification

`submitReview` in `src/lib/reviews.ts` inserts into `public.reviews` exactly as before. `tg_notify_review` fires automatically via the DB trigger. Private feedback is then inserted into `review_private_feedback` as a best-effort follow-up — if it fails, the review (and its notification) are already committed.

---

## 8. Low-Rated Filter — Admin Moderation

The admin-web reviews screen (`src/app/(admin-web)/reviews/index.tsx`) includes a "Low-rated only" toggle (default off). When enabled, only reviews with `rating <= 2` are shown.

```sql
-- Reviews that appear under "Low-rated only" filter
select id, rating, customer_id, provider_id, comment, created_at
from public.reviews
where rating <= 2
order by created_at desc;
-- Expected: reviews rated 1 or 2 (surfaced for operator attention).
```

This is a **client-side filter** over the admin's already-fetched review list — no new DB query or index. Existing Hide/Unhide actions work on these rows unchanged.

---

## 9. Rollback Plan

### Option A — Per-task git revert (preserve schema, hide UI)

Revert commits from T6 → T1 (newest to oldest). The 7 columns and `review_private_feedback` table remain in the DB but are unused by the application. Existing reviews (with or without category data) continue to display via the pre-Slice-25 `ReviewCard` fallback. `average_rating` / `review_count` / `tg_notify_review` all keep working.

Order to revert (newest first):

1. `68fe8b8` — admin review moderation (private feedback + low-rated filter) (T6)
2. `4aad9db` — provider profile rating breakdown (T5)
3. `d976990` — customer review form (categories/recommend/tags/private) (T4)
4. `d4b88a1` — rating breakdown + review card enrichment (T3)
5. `84c94e0` — reviews lib (tags, categories, private feedback, breakdown) (T2)
6. `2f73989` — ratings v2 schema + private feedback + breakdown RPC (T1)

Reverting T2–T6 (UI + lib tasks) while leaving T1 (schema) applied is safe — the columns sit dormant with defaults.

### Option B — Forward rollback migration `0023_rollback_ratings_v2.sql`

Full schema rollback (run after reverting application code):

```sql
-- Drop the breakdown RPC
drop function if exists public.get_provider_rating_breakdown(uuid);

-- Drop private feedback table (cascades its RLS policies)
drop table if exists public.review_private_feedback cascade;

-- Drop the tag vocabulary constraint and the 7 new review columns
alter table public.reviews
  drop constraint if exists reviews_tags_allowed,
  drop column if exists quality_rating,
  drop column if exists punctuality_rating,
  drop column if exists communication_rating,
  drop column if exists professionalism_rating,
  drop column if exists value_rating,
  drop column if exists would_recommend,
  drop column if exists tags;
```

This migration is safe at any time because:

- `rating`, `comment`, `is_hidden`, `created_at` on `reviews` are **not dropped**.
- `recompute_provider_rating()` / `trg_recompute_provider_rating` are **not dropped**.
- `profiles.average_rating` / `profiles.review_count` are **not dropped**.
- `tg_notify_review` is **not dropped**.
- Existing review rows retain all original data.

---

## 10. Isolation Diff

`git diff 11ab2f1..HEAD --stat` output (run 2026-07-03):

```
 src/__tests__/admin-provider-detail.test.tsx       |  34 +++
 src/__tests__/admin-web-customers-reviews.test.tsx | 170 ++++++++++-
 src/__tests__/admin-web-providers.test.tsx         |  34 +++
 src/__tests__/booking-detail.test.tsx              |  60 ++++
 src/__tests__/provider-profile.test.tsx            |  38 ++-
 src/app/(admin-web)/providers/[id].tsx             |  20 +-
 src/app/(admin-web)/reviews/index.tsx              | 108 ++++++-
 src/app/admin/provider/[id].tsx                    |  20 +-
 src/app/booking/[id].tsx                           | 144 +++++++++-
 src/app/provider/(tabs)/profile.tsx                |  19 +-
 src/components/ui/rating-breakdown.test.tsx        | 111 ++++++++
 src/components/ui/rating-breakdown.tsx             | 162 +++++++++++
 src/components/ui/review-card.test.tsx             |  97 ++++++-
 src/components/ui/review-card.tsx                  |  87 +++++-
 src/components/ui/star-input.tsx                   |  10 +-
 src/lib/reviews.test.ts                            | 310 +++++++++++++++++----
 src/lib/reviews.ts                                 | 142 +++++++++-
 supabase/migrations/0022_ratings_v2.sql            |  86 ++++++
 18 files changed, 1562 insertions(+), 90 deletions(-)
```

### Files changed — all in scope

| File | Task | Purpose |
|---|---|---|
| `supabase/migrations/0022_ratings_v2.sql` | T1 | 7 additive review columns + tag guard + `review_private_feedback` + `get_provider_rating_breakdown` RPC |
| `src/lib/reviews.ts` | T2 | `REVIEW_TAGS`, `Review`/`ProviderRatingBreakdown` types, `submitReview` (categories/tags/private), `getProviderRatingBreakdown`, `getReviewPrivateFeedback` |
| `src/lib/reviews.test.ts` | T2 | Tests for all reviews helpers |
| `src/components/ui/rating-breakdown.tsx` | T3 | `RatingBreakdown` component (category bars, recommend %, positive strength tags) |
| `src/components/ui/rating-breakdown.test.tsx` | T3 | 8 breakdown tests |
| `src/components/ui/review-card.tsx` | T3 | Enriched `ReviewCard` (category block, recommend, tag chips, legacy fallback) |
| `src/components/ui/review-card.test.tsx` | T3 | 7 card tests (legacy + enriched) |
| `src/components/ui/star-input.tsx` | T4 | +optional `idPrefix` prop for testID disambiguation |
| `src/app/booking/[id].tsx` | T4 | Customer review form: 5 category `StarInput`s + would-recommend toggle + tag chips + private feedback |
| `src/__tests__/booking-detail.test.tsx` | T4 | Case J: full categories/recommend/tags/private submit test |
| `src/app/provider/(tabs)/profile.tsx` | T5 | `RatingBreakdown` under "Rating breakdown" section (display-only) |
| `src/app/admin/provider/[id].tsx` | T5 | Same breakdown display in mobile admin provider detail |
| `src/app/(admin-web)/providers/[id].tsx` | T5 | Same breakdown display in web admin provider detail |
| `src/__tests__/provider-profile.test.tsx` | T5 | Breakdown display assertions |
| `src/__tests__/admin-provider-detail.test.tsx` | T5 | Breakdown display assertions |
| `src/__tests__/admin-web-providers.test.tsx` | T5 | Breakdown display assertions |
| `src/app/(admin-web)/reviews/index.tsx` | T6 | Private feedback prefetch + Categories/Recommend/Tags/Private columns + low-rated filter |
| `src/__tests__/admin-web-customers-reviews.test.tsx` | T6 | 8 admin review moderation tests |

### Out-of-scope files — confirmed absent from diff

- `src/lib/{payments,earnings,attempts,tracking,messages,push,notifications,bookings}.ts` — NOT in diff.
- `src/auth/**` — NOT in diff.
- Any chat / ChatThread / tracking file — NOT in diff.
- Any `assignProvider` / dispatch logic — NOT in diff.
- `recompute_provider_rating()` / `trg_recompute_provider_rating` — NOT in diff (function body in 0008 unchanged).
- `tg_notify_review` — NOT in diff (trigger body in 0020 unchanged).
- Any provider-ranking or sort-by-rating code — NOT in diff.
- Any migration other than `0022` — NOT in diff.

### No-ranking / no-dispatch audit

`get_provider_rating_breakdown` is consumed only by `getProviderRatingBreakdown()` (display fetch) and three view screens. The `assignProvider` function (`src/lib/bookings.ts:170`) is unchanged and receives no rating field. No file in the diff sorts a provider list by rating or feeds breakdown data to any dispatch path.

Isolation: **CLEAN**.

---

## 11. Final Gate Results (2026-07-03)

| Check | Result |
|---|---|
| `npm test` | PASS — 114 suites, 963 tests, 0 failures |
| `npx tsc --noEmit` | PASS — no errors |
| `npx expo export --platform web` | PASS — exported to `dist/` |
| `npx expo export --platform android` | PASS — exported to `dist/` |
| `git status` (after doc commit) | CLEAN — only `supabase/.temp/` untracked |

---

## 12. Operator Checklist — Deploying Slice 25

### Pre-deploy

- [ ] Apply migration `0022_ratings_v2.sql` via Supabase SQL Editor or `supabase db push`.

### Post-deploy verification

```sql
-- 1. Confirm 7 new review columns with correct nullability
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'reviews'
  and column_name in (
    'quality_rating', 'punctuality_rating', 'communication_rating',
    'professionalism_rating', 'value_rating',
    'would_recommend', 'tags'
  )
order by column_name;
-- Expected: 7 rows; tags default '{}' NOT NULL; others nullable.

-- 2. Confirm tag vocabulary constraint exists
select conname from pg_constraint
where conrelid = 'public.reviews'::regclass
  and conname = 'reviews_tags_allowed';
-- Expected: 1 row.

-- 3. Confirm review_private_feedback table with RLS
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace
  and relname = 'review_private_feedback';
-- Expected: 1 row; relrowsecurity = true.

-- 4. Confirm exactly 2 RLS policies on review_private_feedback
select policyname, cmd from pg_policies
where tablename = 'review_private_feedback'
order by policyname;
-- Expected: rpf_insert (INSERT) and rpf_select (SELECT) only.

-- 5. Confirm get_provider_rating_breakdown RPC exists
select proname from pg_proc
where proname = 'get_provider_rating_breakdown'
  and pronamespace = 'public'::regnamespace;
-- Expected: 1 row.

-- 6. Confirm recompute trigger is unchanged
select tgname, tgenabled from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relname = 'reviews'
  and tgname in ('trg_recompute_provider_rating', 'tg_notify_review');
-- Expected: 2 rows; both tgenabled = 'O'.

-- 7. Smoke-test: provider breakdown returns without error
select overall_avg, review_count, recommend_pct, top_tags
from public.get_provider_rating_breakdown('<any-provider-uuid>');
-- Expected: 1 row (may have NULL fields if no reviews yet).
```
