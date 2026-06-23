# Slice 10 — Ratings & Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Customers rate their completed jobs (1–5 + optional comment); providers/admin see ratings; admin hides inappropriate reviews; provider aggregates are trigger-computed.

**Architecture:** Migration `0008` adds a `reviews` table (RLS: customer insert on own completed in-app-provider booking, one per booking; provider reads own non-hidden; admin reads all + hides) + a `review_count` column + a security-definer trigger recomputing `average_rating`/`review_count` over non-hidden reviews. `src/lib/reviews.ts` wraps it. Star components + review card are reused across customer booking detail, provider profile, and admin provider detail.

**Tech Stack:** Expo Router, TypeScript, Supabase (Postgres trigger + RLS), jest-expo + @testing-library/react-native.

## Global Constraints
- Reviews ONLY for the caller's own `completed` booking with an in-app `assigned_provider_id`; one per booking; rating 1–5; comment optional. Customers can't edit/delete; providers can't create/edit/delete/hide; admin-only hide/unhide. `average_rating`/`review_count` are trigger-computed (never client-written).
- Reuse Slice 1 tokens. Route groups strip from URL — keep literal admin/provider paths.
- Supabase mocked in tests; no network. Screen/route tests in `src/__tests__/`, NEVER `src/app/`. Component tests co-located in `src/components/ui/`.
- PLAIN `router.push/replace` (no casts). One commit per task; after each: `npm test` + `npx tsc --noEmit`.
- OUT: payments, chat, tracking, public browsing, customer editing, disputes.

## File Structure
- `supabase/migrations/0008_reviews.sql` — table + RLS + review_count + trigger (T1).
- `src/lib/reviews.ts` (T1); `src/lib/providers.ts` — add `review_count` to `ProviderProfile` (T1).
- `src/components/ui/{rating-stars,star-input,review-card}.tsx` (T2).
- `src/app/booking/[id].tsx` (T3); `src/app/provider/(tabs)/profile.tsx` (T4); `src/app/admin/provider/[id].tsx` (T5).
- Tests in `src/__tests__/`, `src/lib/*.test.ts`, `src/components/ui/*.test.tsx`.

---

## Task 1 — Reviews table + RLS + aggregate trigger + data layer

**Files:**
- Create: `supabase/migrations/0008_reviews.sql`, `src/lib/reviews.ts`, `src/lib/reviews.test.ts`
- Modify: `src/lib/providers.ts` (add `review_count: number` to `ProviderProfile`)
- Test: `src/lib/reviews.test.ts`

**Interfaces — Produces:**
- `Review = { id; booking_id; customer_id; provider_id; rating: number; comment: string|null; is_hidden: boolean; created_at: string }`
- `submitReview(input: { bookingId: string; providerId: string; rating: number; comment?: string }): Promise<{ ok; error? }>`
- `getMyReviewForBooking(bookingId: string): Promise<Review | null>`
- `getProviderReviews(providerId: string): Promise<Review[]>`
- `setReviewHidden(id: string, hidden: boolean): Promise<{ ok; error? }>`
- `ProviderProfile` gains `review_count: number`.

- [ ] **1. SQL `supabase/migrations/0008_reviews.sql`**
```sql
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.profiles(id),
  provider_id uuid not null references public.profiles(id),
  rating int not null check (rating between 1 and 5),
  comment text,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists review_count int not null default 0;
alter table public.reviews enable row level security;

-- Customer may review only their own completed booking with an in-app provider
create policy "reviews_insert_own" on public.reviews for insert with check (
  customer_id = auth.uid()
  and rating between 1 and 5
  and is_hidden = false
  and exists (select 1 from public.bookings b where b.id = booking_id
    and b.customer_id = auth.uid()
    and b.status = 'completed'
    and b.assigned_provider_id is not null
    and b.assigned_provider_id = provider_id)
);
create policy "reviews_select" on public.reviews for select using (
  customer_id = auth.uid()
  or (provider_id = auth.uid() and is_hidden = false)
  or public.is_admin()
);
-- Only admin may hide/unhide; no customer/provider update, no delete
create policy "reviews_update_admin" on public.reviews for update
  using (public.is_admin()) with check (public.is_admin());

-- Recompute provider aggregates over non-hidden reviews
create or replace function public.recompute_provider_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pid uuid; v_avg numeric; v_cnt int;
begin
  v_pid := coalesce(new.provider_id, old.provider_id);
  select avg(rating), count(*) into v_avg, v_cnt
    from public.reviews where provider_id = v_pid and is_hidden = false;
  update public.profiles
    set average_rating = v_avg, review_count = coalesce(v_cnt, 0)
    where id = v_pid;
  return null;
end; $$;
drop trigger if exists trg_recompute_provider_rating on public.reviews;
create trigger trg_recompute_provider_rating
  after insert or update or delete on public.reviews
  for each row execute function public.recompute_provider_rating();
```
- [ ] **2. Failing tests `src/lib/reviews.test.ts`** (mock `@/lib/supabase`: `auth.getUser`, `from('reviews')` `insert`, `select().eq().maybeSingle()`, `select().eq().order()`, `update().eq()`):
```ts
it('submitReview inserts with customer_id from auth', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  insert.mockResolvedValue({ error: null });
  const res = await submitReview({ bookingId: 'bk1', providerId: 'p1', rating: 5, comment: 'Great' });
  expect(res).toEqual({ ok: true });
  expect(insert).toHaveBeenCalledWith({
    booking_id: 'bk1', customer_id: 'u1', provider_id: 'p1', rating: 5, comment: 'Great',
  });
});
it('submitReview maps the unique-violation to a friendly message', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } });
  expect(await submitReview({ bookingId: 'bk1', providerId: 'p1', rating: 4 })).toEqual({
    ok: false, error: "You've already reviewed this booking.",
  });
});
it('getMyReviewForBooking returns the row or null', async () => {
  maybeSingle.mockResolvedValue({ data: { id: 'r1', rating: 5 }, error: null });
  expect(await getMyReviewForBooking('bk1')).toEqual({ id: 'r1', rating: 5 });
  maybeSingle.mockResolvedValue({ data: null, error: null });
  expect(await getMyReviewForBooking('bk1')).toBeNull();
});
it('getProviderReviews returns rows newest-first', async () => {
  order.mockResolvedValue({ data: [{ id: 'r1' }], error: null });
  expect(await getProviderReviews('p1')).toEqual([{ id: 'r1' }]);
  expect(eq).toHaveBeenCalledWith('provider_id', 'p1');
});
it('setReviewHidden updates is_hidden', async () => {
  update.mockReturnValue({ eq: (...a:unknown[]) => updateEq(...a) });
  updateEq.mockResolvedValue({ error: null });
  expect(await setReviewHidden('r1', true)).toEqual({ ok: true });
  expect(update).toHaveBeenCalledWith({ is_hidden: true });
});
```
- [ ] **3. Run → FAIL** `npm test -- reviews.test`
- [ ] **4. Implement:**
  - `reviews.ts`: `submitReview` = get user (signed-out → friendly); `from('reviews').insert({ booking_id, customer_id: user.id, provider_id, rating, comment: comment ?? null })`; if `error?.code === '23505'` return `{ ok:false, error:"You've already reviewed this booking." }`; other error → generic friendly; else `{ ok:true }`. `getMyReviewForBooking` = `select('*').eq('booking_id', id).maybeSingle()` → `data ?? null`. `getProviderReviews` = `select('*').eq('provider_id', id).order('created_at',{ascending:false})` → `data ?? []`. `setReviewHidden` = `update({ is_hidden: hidden }).eq('id', id)`.
  - `providers.ts`: add `review_count: number` to `ProviderProfile`.
- [ ] **5. Run → PASS** `npm test`; `npx tsc --noEmit`
- [ ] **6. Commit** `git add supabase/migrations/0008_reviews.sql src/lib/reviews.ts src/lib/reviews.test.ts src/lib/providers.ts && git commit -m "feat: slice10 reviews table + RLS + rating trigger + data layer"`

---

## Task 2 — RatingStars + StarInput + ReviewCard

**Files:**
- Create: `src/components/ui/rating-stars.tsx`, `src/components/ui/star-input.tsx`, `src/components/ui/review-card.tsx`
- Test: co-located `*.test.tsx`

**Interfaces:**
- Consumes: `Review` (`@/lib/reviews`); `Card`/`Text`; `useTheme`/tokens.
- Produces:
  - `<RatingStars value={number|null} count?={number} />`
  - `<StarInput value={number} onChange={(n: number) => void} />`
  - `<ReviewCard review={Review} />`

- [ ] **1. Failing component tests:**
  - `rating-stars.test.tsx`: `<RatingStars value={4} count={3} />` → shows 4 filled stars (filled char `★` appears 4×) and "(3)"; `<RatingStars value={null} />` → "Not yet rated".
  - `star-input.test.tsx`: `<StarInput value={0} onChange={fn} />` → 5 pressable stars (testID `star-1`..`star-5`); pressing `star-4` calls `onChange(4)`.
  - `review-card.test.tsx`: `<ReviewCard review={{ id:'r1', rating:5, comment:'Great work', created_at:'2026-07-01T10:00:00Z', booking_id:'bk1', customer_id:'c1', provider_id:'p1', is_hidden:false }} />` → 5 filled stars + "Great work" shown.
- [ ] **2. Run → FAIL** `npm test -- rating-stars star-input review-card`
- [ ] **3. Implement** (reuse `useTheme`/tokens):
  - `rating-stars.tsx`: if `value == null` → muted `Text` "Not yet rated". Else a row of 5 `Text` stars where index `< Math.round(value)` renders `★` (color `warning`) else `☆` (textSecondary); when `count != null` append a `Text` `(\`(${count})\`)`.
  - `star-input.tsx`: a `Row` of 5 `Pressable`s, each `testID={\`star-${n}\`}` (n=1..5) rendering `★`/`☆` relative to `value`, `onPress={() => onChange(n)}`.
  - `review-card.tsx`: `Card` with `<RatingStars value={review.rating} />`, `comment` (`Text body`, omit when null), and `new Date(review.created_at).toLocaleDateString()` caption.
- [ ] **4. Run → PASS**; `npx tsc --noEmit`
- [ ] **5. Commit** `git add src/components/ui/rating-stars.tsx src/components/ui/rating-stars.test.tsx src/components/ui/star-input.tsx src/components/ui/star-input.test.tsx src/components/ui/review-card.tsx src/components/ui/review-card.test.tsx && git commit -m "feat: slice10 rating + review components"`

---

## Task 3 — Customer rate / view review on booking detail

**Files:**
- Modify: `src/app/booking/[id].tsx`
- Test: `src/__tests__/booking-detail.test.tsx` (extend)

**Interfaces:** Consumes `submitReview`, `getMyReviewForBooking`; `StarInput`, `ReviewCard`, `Input`, `Button`, `Text`.

- [ ] **1. Add a "Your review" section** to `booking/[id].tsx`, shown ONLY when `booking.status === 'completed' && booking.assigned_provider_id`:
  - Load `getMyReviewForBooking(id)` into `review` state (in the existing effect, after booking loads, when eligible).
  - If `review` → render `<ReviewCard review={review} />` (read-only) under a "Your review" heading.
  - Else → a rate form: `StarInput` (local `rating` state, default 0) + a comment `Input` + a "Submit review" `Button` (disabled when `rating === 0`) → `submitReview({ bookingId: id, providerId: booking.assigned_provider_id, rating, comment })`; on ok re-fetch `getMyReviewForBooking(id)` into state; inline error on failure.
  - When not completed or no in-app provider → render nothing for reviews (existing sections unchanged).
- [ ] **2. Failing tests** — extend `booking-detail.test.tsx`: mock `@/lib/reviews` (`getMyReviewForBooking`, `submitReview`). Cases:
  - completed + `assigned_provider_id:'p1'` + no existing review (`getMyReviewForBooking`→null): tapping `star-5` then "Submit review" calls `submitReview({ bookingId:'b1', providerId:'p1', rating:5, comment:'' })`.
  - existing review (`getMyReviewForBooking`→`{rating:4, comment:'Good', ...}`): the comment "Good" renders and NO "Submit review" button.
  - not completed (status e.g. `provider_assigned`): no `star-1` input present.
  Keep existing booking-detail cases passing (their bookings/photos/activity mocks remain; add a default `getMyReviewForBooking`→null mock).
- [ ] **3. Run → FAIL** then implement → **PASS** `npm test -- booking-detail`; `npm test`; `npx tsc --noEmit`
- [ ] **4. Commit** `git add src/app/booking/[id].tsx src/__tests__/booking-detail.test.tsx && git commit -m "feat: slice10 customer rate + view review"`

---

## Task 4 — Provider profile ratings + reviews

**Files:**
- Modify: `src/app/provider/(tabs)/profile.tsx`
- Test: `src/__tests__/provider-profile.test.tsx` (extend)

**Interfaces:** Consumes `getProviderReviews`; `RatingStars`, `ReviewCard`; `getProviderProfile` (already loaded; now has `average_rating`, `review_count`).

- [ ] **1. Add a "Ratings" section** to the approved-provider view of `profile.tsx`: `<RatingStars value={profile.average_rating} count={profile.review_count} />`, then load `getProviderReviews(session.user.id)` into state and render each as a `<ReviewCard>` (RLS returns only non-hidden for a provider). Read-only. Keep the existing profile fields/availability/verified intact.
- [ ] **2. Failing test** — extend `provider-profile.test.tsx`: the `@/lib/providers` `getProviderProfile` mock returns `average_rating: 4.5, review_count: 2`; add `@/lib/reviews` mock (`getProviderReviews`→`[{id:'r1',rating:5,comment:'Great',created_at:'2026-07-01T10:00:00Z',booking_id:'bk1',customer_id:'c1',provider_id:'p1',is_hidden:false}]`). Assert (async): "(2)" (or the count) renders and the review comment "Great" renders. Keep existing profile cases passing.
- [ ] **3. Run → FAIL** then implement → **PASS** `npm test -- provider-profile`; `npm test`; `npx tsc --noEmit`
- [ ] **4. Commit** `git add "src/app/provider/(tabs)/profile.tsx" src/__tests__/provider-profile.test.tsx && git commit -m "feat: slice10 provider profile ratings + reviews"`

---

## Task 5 — Admin reviews hide/unhide

**Files:**
- Modify: `src/app/admin/provider/[id].tsx`
- Test: `src/__tests__/admin-provider-detail.test.tsx` (extend)

**Interfaces:** Consumes `getProviderReviews`, `setReviewHidden`; `RatingStars`, `ReviewCard`, `Button`.

- [ ] **1. Add a "Reviews" section** to `admin/provider/[id].tsx`: `<RatingStars value={profile.average_rating} count={profile.review_count} />` + load `getProviderReviews(id)` into state (admin sees all, incl. hidden) + render each review with a `ReviewCard` and a `Button` labelled `review.is_hidden ? 'Unhide' : 'Hide'` → `setReviewHidden(review.id, !review.is_hidden)` then reload the reviews. Inline error on failure. Keep existing profile edit / verify / availability intact.
- [ ] **2. Failing test** — extend `admin-provider-detail.test.tsx`: add `@/lib/reviews` mock (`getProviderReviews`→`[{id:'r1',rating:2,comment:'Bad',is_hidden:false,created_at:'2026-07-01T10:00:00Z',booking_id:'bk1',customer_id:'c1',provider_id:'p1'}]`; `setReviewHidden`→`{ok:true}`). Assert (async): the comment "Bad" renders; pressing "Hide" calls `setReviewHidden('r1', true)`. Keep existing admin-provider cases passing.
- [ ] **3. Run → FAIL** then implement → **PASS** `npm test -- admin-provider-detail`; `npm test`; `npx tsc --noEmit`
- [ ] **4. Commit** `git add "src/app/admin/provider/[id].tsx" src/__tests__/admin-provider-detail.test.tsx && git commit -m "feat: slice10 admin reviews hide/unhide"`

---

## Verification (controller, after Task 5)
- `npm test` all pass; `npx tsc --noEmit` clean.
- Android bundle smoke: `npx expo start -c`, wait for Metro, fetch the manifest's `launchAsset.url` → HTTP 200, no errors.

### SQL + trigger verification (DB, before Expo Go)
1. Apply `supabase/migrations/0008_reviews.sql`. Confirm `reviews` table + 3 policies, `profiles.review_count` column, and `trg_recompute_provider_rating` + function exist.
2. As the customer of a `completed` booking with an in-app provider, insert a review (rating 5) → succeeds; the provider's `profiles.average_rating` becomes 5 and `review_count` 1. Insert a second review for the SAME booking → rejected by `unique(booking_id)`.
3. Add a second review (rating 1) for the same provider on another completed booking → `average_rating` = 3, `review_count` = 2.
4. As admin, set one review `is_hidden = true` → aggregates recompute over non-hidden only (e.g. back to the single visible rating; count 1).
5. As a NON-owner customer, insert a review for someone else's booking → rejected by RLS. As a provider, attempt to insert/update/hide a review about self → rejected (no provider insert/update policy). As a provider, `select` returns only your own non-hidden reviews.
6. Try a review on a booking that is NOT completed, or has no `assigned_provider_id` → rejected by the insert check.

### Expo Go end-to-end
1. **Customer**: open a completed booking assigned to an in-app provider → "Rate this job" → pick stars + comment → Submit → it now shows your review read-only; the form is gone; a second submit is impossible. A non-completed booking shows no rating UI.
2. **Provider**: My Profile shows the average rating + count and the (non-hidden) reviews.
3. **Admin**: open that provider's detail → Reviews section lists the review(s); press Hide → it disappears from the provider's view and the average updates; Unhide restores it.

## Rollback
Branch `feat/slice-10-ratings-reviews`; one commit per task → `git revert <sha>`. Additive: new `reviews` table + RLS + trigger, new `review_count` column, new lib + components, additive screen sections. Migration `0008` forward-only; to undo in DB drop trigger `trg_recompute_provider_rating` + function, the `reviews` table, and the `review_count` column.

## Self-review
- Table + RLS (customer insert own completed in-app-provider only, one-per-booking unique, provider read own non-hidden, admin all + hide) → T1 ✓. review_count + recompute trigger → T1 ✓. Data layer → T1 ✓. Components → T2 ✓. Customer rate/view (gated) → T3 ✓. Provider profile rating+reviews → T4 ✓. Admin hide/unhide → T5 ✓. Tests mock Supabase, in `src/__tests__/`/`src/lib/`/`src/components/ui/` ✓.
- Signatures consistent across tasks (`submitReview`, `getMyReviewForBooking`, `getProviderReviews`, `setReviewHidden`, `Review`, `ProviderProfile.review_count`). Invariants: trigger-computed aggregates; admin-only hide; no provider write path.
