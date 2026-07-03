# Slice 25 — Ratings 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade reviews into a richer provider-quality signal — 5 category ratings, would-recommend, tags, private admin feedback, and a provider-profile breakdown — while the existing overall rating + trigger stay unchanged.

**Architecture:** `reviews` gains nullable category ratings + `would_recommend` + `tags text[]`; `rating` stays the required overall (its `recompute_provider_rating()` trigger untouched). Private feedback lives in a separate provider-invisible RLS table. The profile breakdown is an on-read SECURITY DEFINER RPC (display-only, never for ranking).

**Tech Stack:** Supabase (Postgres, additive migration, RLS, RPC), Expo RN + TS, Expo Router, Jest + RNTL.

## Global Constraints

- **Overall `rating` stays required; the `recompute_provider_rating()` trigger + `profiles.average_rating`/`review_count` are UNCHANGED.** Category ratings, `would_recommend`, `tags`, comment, and private feedback are all **optional/nullable**.
- **Private feedback is NOT provider-readable** — it lives in `review_private_feedback` (RLS: authoring customer + `is_admin()` only, NO provider policy). Never add a private column to `reviews`.
- **Breakdown RPC is display-only** — `get_provider_rating_breakdown` is never used for ranking, sorting-for-dispatch, or auto-assign. **No provider ranking this slice.**
- **Old reviews must display correctly** — NULL categories / `tags='{}'` / NULL `would_recommend` → legacy fallback (overall + comment as today); they still count in the overall average.
- **Preserve the existing review notification** (`tg_notify_review`) — no notification-pipeline change. No payment/auth/booking-lifecycle/dispatch/tracking change.
- Tag vocabulary (exact): `on_time, friendly, clean_work, good_communication, fair_price, late, messy, poor_communication, overpriced`.
- Gate every task: `npm test` green, `npx tsc --noEmit` clean, `expo export --platform web` AND `--platform android` succeed.

---

## File Structure

**Create**
- `supabase/migrations/0022_ratings_v2.sql` — reviews columns + tag guard, `review_private_feedback` + RLS, breakdown RPC.
- `docs/pilot/ratings-v2.md` — verification doc.

**Modify**
- `src/lib/reviews.ts` (+ `reviews.test.ts`) — `REVIEW_TAGS`, extended `Review`/`submitReview`, `getProviderRatingBreakdown`, `getReviewPrivateFeedback`.
- `src/components/ui/review-card.tsx` (+ test) — categories/tags/recommend display + legacy fallback.
- `src/components/ui/rating-breakdown.tsx` (NEW, + test) — breakdown bars/recommend %/strength tags.
- `src/app/booking/[id].tsx` — customer review form (category stars, recommend, tags, private feedback).
- `src/app/provider/(tabs)/profile.tsx` — provider's own breakdown.
- `src/app/admin/provider/[id].tsx` — admin provider breakdown.
- `src/app/(admin-web)/providers/[id].tsx` — web-admin provider breakdown.
- `src/app/(admin-web)/reviews/index.tsx` — admin moderation: private feedback + categories/tags + low-rated filter.

**Reuse (do not modify):** `star-input.tsx`, `rating-stars.tsx`, `recompute_provider_rating()` trigger, `setReviewHidden`, `tg_notify_review`.

---

## Task Order (dependency-ordered)

1. **T1** — Migration `0022` (reviews columns + tag guard; `review_private_feedback` + RLS; breakdown RPC).
2. **T2** — `reviews.ts`: `REVIEW_TAGS`, `Review`/`submitReview`, `getProviderRatingBreakdown`, `getReviewPrivateFeedback` (+ tests).
3. **T3** — `RatingBreakdown` component + `review-card` enrichment (+ tests).
4. **T4** — Customer review form (categories/recommend/tags/private) in `booking/[id].tsx` (+ tests).
5. **T5** — Provider profile breakdown (provider + admin mobile + web-admin provider views) (+ tests).
6. **T6** — Admin review moderation: private feedback + categories/tags + low-rated filter (+ tests).
7. **T7** — Verification `docs/pilot/ratings-v2.md` + backward-compat + isolation + final gate.

Each task ends green (tests / tsc / both exports).

---

### Task 1: Migration `0022_ratings_v2.sql`

**Files:** Create `supabase/migrations/0022_ratings_v2.sql`

**Build (mirror `0008_reviews.sql` / `0019` RLS style):**
- **Extend `reviews`** (additive, all nullable except `tags`):
  ```sql
  alter table public.reviews
    add column if not exists rating_quality         int check (rating_quality between 1 and 5),
    add column if not exists rating_punctuality     int check (rating_punctuality between 1 and 5),
    add column if not exists rating_communication   int check (rating_communication between 1 and 5),
    add column if not exists rating_professionalism int check (rating_professionalism between 1 and 5),
    add column if not exists rating_value           int check (rating_value between 1 and 5),
    add column if not exists would_recommend        boolean,
    add column if not exists tags                   text[] not null default '{}';
  ```
  - **Tag vocabulary guard** (idempotent — only add if absent):
    ```sql
    do $$ begin
      if not exists (select 1 from pg_constraint where conname = 'reviews_tags_allowed') then
        alter table public.reviews add constraint reviews_tags_allowed
          check (tags <@ array['on_time','friendly','clean_work','good_communication','fair_price','late','messy','poor_communication','overpriced']::text[]);
      end if;
    end $$;
    ```
  - Do NOT touch `rating`, `recompute_provider_rating()`, its trigger, or `reviews_insert_own`/`reviews_select`/`reviews_update_admin`.
- **`review_private_feedback`** table (spec §3b) + `enable row level security`:
  - `rpf_insert`: `with check (customer_id = auth.uid() and exists (select 1 from public.reviews r where r.id = review_id and r.customer_id = auth.uid()))`.
  - `rpf_select`: `using (customer_id = auth.uid() or public.is_admin())`. **NO provider policy.** No update/delete policy (immutable to non-admin).
- **RPC `get_provider_rating_breakdown(p_provider_id uuid)`** `returns table(overall_avg numeric, review_count int, recommend_pct numeric, quality_avg numeric, punctuality_avg numeric, communication_avg numeric, professionalism_avg numeric, value_avg numeric, top_tags text[])` `language sql security definer set search_path = public`:
  - Aggregate `from public.reviews where provider_id = p_provider_id and is_hidden = false`:
    `avg(rating)`, `count(*)`, `100.0 * avg((would_recommend)::int)` (NULLs ignored), `avg(rating_quality)` … `avg(rating_value)`, and `top_tags` = a subquery `select array_agg(tag order by cnt desc) from (select unnest(tags) tag, count(*) cnt from public.reviews where provider_id = p_provider_id and is_hidden = false group by 1 order by cnt desc limit 6) t`. Returns a single row (0/NULLs when none).

**Checks:** SQL well-formed; `npm test` (~925), `tsc`, both exports. Commit `feat: slice25 ratings v2 schema + private feedback + breakdown RPC (0022)`.
> DB not applied locally — behavioral RLS/RPC verify in T7.

---

### Task 2: `reviews.ts` extensions

**Files:** Modify `src/lib/reviews.ts`; Test `src/lib/reviews.test.ts`

**Build:**
- **`REVIEW_TAGS`**: `export const REVIEW_TAGS: { key: string; label: string; sentiment: 'positive'|'negative' }[]` — the 9 tags (positive: on_time/friendly/clean_work/good_communication/fair_price; negative: late/messy/poor_communication/overpriced). Labels: "On time", "Friendly", "Clean work", "Good communication", "Fair price", "Late", "Messy", "Poor communication", "Overpriced".
- Extend **`Review`** with `rating_quality`/`rating_punctuality`/`rating_communication`/`rating_professionalism`/`rating_value` (`number|null`), `would_recommend: boolean|null`, `tags: string[]`.
- **`ProviderRatingBreakdown`** type mirroring the RPC row (all `number|null` + `top_tags: string[]`).
- **`submitReview`** — extend input (overall `rating` required; new optional): `qualityRating?`, `punctualityRating?`, `communicationRating?`, `professionalismRating?`, `valueRating?`, `wouldRecommend?: boolean`, `tags?: string[]`, `privateFeedback?: string`. Insert reviews with the new fields (`?? null`, `tags ?? []`), `.select('id').single()`; if `privateFeedback?.trim()`, insert a `review_private_feedback` row `{ review_id, customer_id: user.id, provider_id: input.providerId, feedback }`. Keep the 23505 "already reviewed" mapping. Old callers (rating+comment only) unaffected.
- **`getProviderRatingBreakdown(providerId)`** → `rpc('get_provider_rating_breakdown', { p_provider_id })`; return the row or a safe zero/empty breakdown on error/none.
- **`getReviewPrivateFeedback(reviewId)`** → `from('review_private_feedback').select('*').eq('review_id', id).maybeSingle()`; null on none/error (RLS gates to admin/author).

**Tests:** `submitReview` inserts categories/recommend/tags; writes private feedback only when provided (assert the second insert); overall-only submit still works + no private insert; 23505 mapping intact; `getProviderRatingBreakdown` maps the RPC row + empty on error; `getReviewPrivateFeedback` returns row/null; `REVIEW_TAGS` has 9 entries with sentiments.

**Steps:** TDD → `tsc` → commit `feat: slice25 reviews lib (tags, category ratings, private feedback, breakdown)`.

---

### Task 3: RatingBreakdown component + ReviewCard enrichment

**Files:** Create `src/components/ui/rating-breakdown.tsx` (+ test); Modify `src/components/ui/review-card.tsx` (+ test)

**Build:**
- **`RatingBreakdown`** props `{ breakdown: ProviderRatingBreakdown }`: renders **Overall** (RatingStars/number), **review count**, **would-recommend %** (when `recommend_pct != null`), **category bars** (Quality/Punctuality/Communication/Professionalism/Value — a simple token bar + number per non-null average), and **strength tags** (positive `top_tags` mapped via `REVIEW_TAGS` labels). Graceful empty state when `review_count = 0`. Display-only; token-driven.
- **`review-card.tsx`**: when the review has category ratings, render a compact category line; when `tags?.length`, render tag chips (labels via `REVIEW_TAGS`); when `would_recommend != null`, a "👍 Would recommend" / "👎 Would not recommend" indicator. **Legacy fallback:** a review with no categories/tags/would_recommend renders exactly as today (overall + comment). Keep existing props/rendering.

**Tests:** `RatingBreakdown` (bars + recommend % + strength tags from a mock breakdown; empty state at count 0); `review-card` (enriched row shows categories/tags/recommend; legacy row unchanged — keep existing assertions green).

**Steps:** TDD → `tsc` → commit `feat: slice25 rating breakdown + review card enrichment`.

---

### Task 4: Customer review form

**Files:** Modify `src/app/booking/[id].tsx`; Test its review test(s)

**Build:** In the review-submit section (where `submitReview` is called), add: 5 category `StarInput`s (Quality/Punctuality/Communication/Professionalism/Value), a **would-recommend** yes/no toggle, multi-select **tag chips** (from `REVIEW_TAGS`), and a **private feedback** `Input` — alongside the existing overall stars + public comment. **Overall required** (existing gating), the rest optional. On submit, pass the collected optional fields to `submitReview`. Keep everything else on the screen (booking detail, scheduling display from Slice 24, chat/track entries) unchanged.

**Tests:** overall-only submit still works (calls `submitReview` with just rating/comment-shaped payload); filling categories/recommend/tags/private passes them to `submitReview`; overall still required to submit. Keep existing `booking-detail`/review tests green (mock `@/lib/reviews`).

**Steps:** `tsc` → `npm test` → both exports → commit `feat: slice25 customer review form (categories/recommend/tags/private)`.

---

### Task 5: Provider profile breakdown

**Files:** Modify `src/app/provider/(tabs)/profile.tsx`, `src/app/admin/provider/[id].tsx`, `src/app/(admin-web)/providers/[id].tsx`; Test their tests

**Build:** On each provider view, load `getProviderRatingBreakdown(providerId)` and render `<RatingBreakdown>` (overall + category bars + recommend % + strength tags) alongside the existing rating summary + recent reviews (`getProviderReviews`). Provider's own profile uses the signed-in provider id; admin views use the route's provider id. Display-only — no ranking, no sorting-for-dispatch.

**Tests:** each screen renders the breakdown from a mocked `getProviderRatingBreakdown` (bars/recommend %/strength tags); recent reviews still render. Keep existing provider-profile/admin-provider tests green (mock the new lib fns).

**Steps:** `tsc` → `npm test` → both exports → commit `feat: slice25 provider profile rating breakdown`.

---

### Task 6: Admin review moderation

**Files:** Modify `src/app/(admin-web)/reviews/index.tsx` (+ mobile admin review view if present); Test `admin-web-customers-reviews.test.tsx`

**Build:** In the admin reviews table: show the **public comment** (existing) + **private feedback** (via `getReviewPrivateFeedback` per row, admin-visible) + category ratings + tags; keep **hide/unhide** (`setReviewHidden`); add a **low-rated filter** toggle (show only `rating <= 2`) to surface quality issues. Read/moderate only — no schema/RLS change.

**Tests:** private feedback renders for a review that has it; the low-rated filter partitions rows (`rating <= 2` only); hide/unhide still works. Keep existing admin reviews tests green.

**Steps:** `tsc` → `npm test` → both exports → commit `feat: slice25 admin review moderation (private feedback + low-rated filter)`.

---

### Task 7: Verification, backward-compat, isolation, final gate

**Files:** Create `docs/pilot/ratings-v2.md`

- **Verification (documented SQL + manual):** the 7 review columns + tag guard exist; an **old review** (pre-migration: NULL categories, `tags='{}'`, NULL would_recommend) still displays (legacy fallback) AND still counts in `average_rating`/`review_count` (trigger unchanged); category CHECKs reject 0/6; the tag guard rejects an unknown tag; `review_private_feedback` is **invisible to the provider** (RLS returns 0 rows as provider) but visible to admin + author; `get_provider_rating_breakdown` math (category averages over non-hidden, recommend %, top_tags); low-rated filter surfaces `rating <= 2`.
- **Backward-compat:** overall-only `submitReview` still works; existing review/provider displays unchanged for legacy rows; the overall trigger is untouched.
- **Isolation:** `git diff <base>..HEAD --stat` — only ratings files changed; NO payment/auth/tracking/dispatch/booking-lifecycle file; NO change to `recompute_provider_rating()` / `tg_notify_review`; NO provider-ranking/sorting code; only migration `0022`.
- **No-ranking audit:** confirm `get_provider_rating_breakdown` is used only for display (no dispatch/assign/sort-by-rating consumer).
- **Final gate:** `expo export` web + android, `tsc` clean, `npm test` green, `git status` clean.
- Commit `test: slice25 ratings v2 verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-25-ratings`. Abandon = `git checkout main` + delete branch.
- **Per-task revert:** independent commits — `git revert <commit>` rolls back one. Reverting T4–T6 (UI) leaves the columns/RPC dormant; the overall rating + trigger keep working; old + new reviews still display via overall.
- **Disable without schema revert:** revert the T3/T4 UI commits → the review form + cards show overall/comment only; the new columns stay dormant (nullable), harming nothing.
- **Schema rollback:** forward-only `0023_rollback_ratings_v2.sql` — `drop function get_provider_rating_breakdown; drop table review_private_feedback; alter table reviews drop constraint reviews_tags_allowed, drop column rating_quality, …, drop column would_recommend, drop column tags;`. `rating`/`comment`/`average_rating`/`review_count` + their trigger preserved → all existing reviews intact.
- **No payment/auth/tracking/dispatch/notification involvement** — rollback confined to review fields + private table + RPC + display.

---

## Self-Review

- **Spec coverage:** reviews columns + tag guard + private table + RLS + breakdown RPC (T1); `REVIEW_TAGS`/`Review`/`submitReview`/`getProviderRatingBreakdown`/`getReviewPrivateFeedback` (T2); breakdown component + card enrichment (T3); customer form (T4); provider/admin/web breakdown display (T5); admin moderation + private feedback + low-rated filter (T6); verification + backward-compat + isolation + no-ranking audit (T7). Overall required + trigger unchanged (T1 leaves them; T2 keeps rating required). Private feedback provider-invisible (T1 separate RLS table). No ranking (T5/T6 display-only; T7 audit). Old reviews display (T3 fallback; T7 verify).
- **Placeholder scan:** none; concrete SQL/signatures/tests per task.
- **Name consistency:** `get_provider_rating_breakdown` / `ProviderRatingBreakdown` (T1↔T2↔T3↔T5); `REVIEW_TAGS` (T2) consumed by T3/T4; `review_private_feedback` + `getReviewPrivateFeedback` (T1↔T2↔T6); the 7 review column names identical T1↔T2↔T3↔T7; `submitReview` optional fields consistent T2↔T4; `RatingBreakdown` (T3) used by T5; reuses `StarInput`/`RatingStars`/`setReviewHidden`/`getProviderReviews`.
