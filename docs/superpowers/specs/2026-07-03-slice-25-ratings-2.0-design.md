# Slice 25 — Ratings 2.0 (Design Spec)

**Date:** 2026-07-03
**Status:** Approved design → (implementation plan pending approval)
**Builds on:** Slice 10 reviews — `reviews` table (`rating` 1–5, `comment`, `is_hidden`, unique per booking), `profiles.average_rating`/`review_count` via the `recompute_provider_rating()` trigger, `reviews.ts` helpers (`submitReview`/`setReviewHidden`/`getMyReviewForBooking`/`getProviderReviews`/`adminGetAllReviews`), the `rating-stars`/`star-input`/`review-card` components, and the Slice 23 `tg_notify_review` notification.

---

## 1. Goal & Non-Goals

Upgrade reviews into a richer provider-quality signal: 5 category ratings, would-recommend, review tags, and private admin feedback — plus a provider-profile breakdown (category averages, recommend %, strength tags, recent reviews). The existing overall rating keeps working unchanged.

**Non-goals / out of scope (rules):** NO provider ranking / auto-ranking / dispatch use of ratings; NO payment, auth, booking-lifecycle, dispatch, or tracking change; NO new notification pipeline (preserve the existing review notification). Backward-compatible: old reviews display correctly and the overall score/trigger are untouched.

---

## 2. Architecture — augment reviews, keep overall intact

- **`reviews`** gains **nullable** category ratings + `would_recommend` + a `tags text[]`; the existing `rating` stays the required **overall** score, and `recompute_provider_rating()` (overall `average_rating`/`review_count`) is **unchanged**.
- **Private feedback lives in its own table** `review_private_feedback` (RLS: authoring customer + admin only, **no provider policy**) — because Postgres RLS is row-level and providers share the `authenticated` role, a private *column* on `reviews` would be readable by the provider. The separate table makes it truly provider-invisible.
- **Provider breakdown is computed on-read** by a `get_provider_rating_breakdown(provider_id)` SECURITY DEFINER RPC over non-hidden reviews (category averages, recommend %, top tags) — no new `profiles` columns, always fresh. **Display-only; never used for ranking/dispatch.**
- **New-review validation:** overall rating **required** (backward-compatible); the 5 categories, would-recommend, tags, comment, and private feedback are all **optional**.

---

## 3. Database — migration `0022_ratings_v2.sql`

### 3a. Extend `reviews` (additive, nullable → old rows valid)
```sql
alter table public.reviews
  add column if not exists rating_quality         int check (rating_quality between 1 and 5),
  add column if not exists rating_punctuality     int check (rating_punctuality between 1 and 5),
  add column if not exists rating_communication   int check (rating_communication between 1 and 5),
  add column if not exists rating_professionalism int check (rating_professionalism between 1 and 5),
  add column if not exists rating_value           int check (rating_value between 1 and 5),
  add column if not exists would_recommend        boolean,
  add column if not exists tags                    text[] not null default '{}';
-- Tag vocabulary guard (idempotent add via DO/pg_constraint check):
--   allowed: on_time, friendly, clean_work, good_communication, fair_price,
--            late, messy, poor_communication, overpriced
-- constraint: tags <@ array[<allowed>]::text[]   (empty array on old rows passes)
```
- `rating` (overall) unchanged/required; `recompute_provider_rating()` + its trigger unchanged. The `reviews_insert_own` RLS stays (new columns validated by their CHECKs). Old reviews get `tags='{}'`, NULL categories/would_recommend → display fine.

### 3b. `review_private_feedback` (admin-only + authoring customer)
```sql
create table if not exists public.review_private_feedback (
  review_id   uuid primary key references public.reviews(id) on delete cascade,
  customer_id uuid not null references public.profiles(id),
  provider_id uuid not null references public.profiles(id),   -- for admin filtering by provider
  feedback    text not null,
  created_at  timestamptz not null default now()
);
alter table public.review_private_feedback enable row level security;
-- insert: authoring customer only, tied to their own review
-- select: customer_id = auth.uid() OR public.is_admin()   (NO provider policy)
-- no update/delete for non-admin
```

### 3c. RPC `get_provider_rating_breakdown(p_provider_id uuid)` (SECURITY DEFINER, non-hidden only)
`returns table(overall_avg numeric, review_count int, recommend_pct numeric, quality_avg numeric, punctuality_avg numeric, communication_avg numeric, professionalism_avg numeric, value_avg numeric, top_tags text[])`.
- `overall_avg`/`review_count` = same as the profile's; `recommend_pct = 100 * avg(would_recommend::int)` over non-null; each `*_avg` = `avg(rating_x)` ignoring nulls; `top_tags` = the most-frequent tags (`unnest` → count → order desc → limit ~6). All-null/0 when no reviews. Read-only; not used for ranking.

---

## 4. Client — `src/lib/reviews.ts`

- **`REVIEW_TAGS`** constant: the 9 tags with `{ key, label, sentiment: 'positive'|'negative' }` (positive: on_time/friendly/clean_work/good_communication/fair_price; negative: late/messy/poor_communication/overpriced).
- Extend **`Review`**: `rating_quality`/`rating_punctuality`/`rating_communication`/`rating_professionalism`/`rating_value` (`number|null`), `would_recommend: boolean|null`, `tags: string[]`.
- **`submitReview`** extended input (all new fields optional; overall `rating` required): `categoryRatings?`, `wouldRecommend?`, `tags?: string[]`, `privateFeedback?`. Inserts the reviews row (`.select('id').single()`); when `privateFeedback` is non-empty, inserts a `review_private_feedback` row for that id. Old callers unaffected.
- **`getProviderRatingBreakdown(providerId)`** → the RPC (typed `ProviderRatingBreakdown`); returns a safe empty breakdown on error.
- **`getReviewPrivateFeedback(reviewId)`** → the private row (admin/authoring-customer via RLS), or null.
- Existing helpers unchanged; `Review` extra fields are additive.

---

## 5. UI

- **Customer review flow** (`src/app/booking/[id].tsx`, where `submitReview` is called): add 5 category `StarInput`s (Quality/Punctuality/Communication/Professionalism/Value), a would-recommend yes/no toggle, multi-select **tag chips** (from `REVIEW_TAGS`), a public comment (existing), and a **private feedback** input. Overall required; the rest optional. Reuse `StarInput`.
- **`review-card.tsx`**: when present, show the category ratings (compact), the tag chips, and a "Would recommend" indicator; old reviews (no categories/tags) fall back to overall + comment exactly as today.
- **Provider profile** (`src/app/provider/(tabs)/profile.tsx` — provider's own; and admin views `admin/provider/[id].tsx` + `(admin-web)/providers/[id].tsx`): show **Overall score** (existing) + **category breakdown bars** + **review count** + **would-recommend %** + **strength tags** (top positive `top_tags`) + **recent reviews** (existing `getProviderReviews`) — all from `getProviderRatingBreakdown`. Display-only.
- **Admin moderation** (`src/app/(admin-web)/reviews/index.tsx` + mobile admin review view): show **public comment + private feedback** (via `getReviewPrivateFeedback`) + category ratings + tags; **hide/unhide** (existing `setReviewHidden`); a **low-rated filter** (overall `rating <= 2`) to identify quality issues. Read/moderate only.

---

## 6. Backward Compatibility & Guardrails

- Old reviews (NULL categories, `tags='{}'`, NULL would_recommend) display via legacy fallback; the overall `rating`, `average_rating`/`review_count`, and their trigger are untouched → provider overall score keeps working.
- `submitReview` new fields optional → existing submit callers/tests unaffected. `Review` additions optional.
- Private feedback is provider-invisible (separate RLS table). Breakdown RPC is display-only — **no provider ranking, no dispatch/auto-rank use**. `tg_notify_review` notification preserved (no pipeline change).
- No payment/auth/booking-lifecycle/dispatch/tracking change.

---

## 7. Testing

- **Lib** (`reviews.test.ts`, mocked supabase): `submitReview` inserts the new fields + writes `review_private_feedback` only when private feedback provided; overall-only submit still works; `getProviderRatingBreakdown` maps the RPC row (+ empty on error); `getReviewPrivateFeedback`; `REVIEW_TAGS` shape.
- **Components (RNTL):** `review-card` shows categories/tags/recommend when present and falls back for legacy rows; the review form collects categories/recommend/tags/private (overall required gating).
- **Screens:** provider profile renders breakdown bars/recommend %/strength tags/recent reviews (mocked breakdown); admin moderation shows public+private feedback, hide/unhide, low-rated filter. Keep existing review/provider/admin tests green (additive; never weaken).
- **Verification (`docs/pilot/ratings-v2.md`):** old review still displays + counts in overall; category CHECK + tag vocabulary guard; `review_private_feedback` invisible to providers (RLS), visible to admin + author; breakdown RPC math; recommend %/strength tags; low-rated filter.
- **Gate:** `npm test`, `npx tsc --noEmit`, `expo export --platform web` + `--platform android`.

---

## 8. Deliverables

1. `supabase/migrations/0022_ratings_v2.sql` — reviews category/recommend/tags columns + tag guard; `review_private_feedback` + RLS; `get_provider_rating_breakdown` RPC.
2. `src/lib/reviews.ts` — `REVIEW_TAGS`, extended `Review` + `submitReview`, `getProviderRatingBreakdown`, `getReviewPrivateFeedback` (+ tests).
3. Customer review form — category stars, would-recommend, tag chips, private feedback (overall required).
4. `review-card` enrichment (categories/tags/recommend; legacy fallback).
5. Provider profile breakdown (bars, recommend %, strength tags, recent reviews) — provider + admin views.
6. Admin moderation — public + private feedback, hide/unhide, low-rated filter (web + mobile).
7. `docs/pilot/ratings-v2.md` — verification, backward-compat, isolation; green gate.
