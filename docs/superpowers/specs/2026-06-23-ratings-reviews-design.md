# QuickServe Slice 10 — Ratings & Reviews (Design)

**Goal:** Let customers rate completed jobs and give admin a quality-control signal on providers.

**Invariants:**
- Reviews exist ONLY for the customer's own **completed** booking that has an **in-app** `assigned_provider_id` (a real QuickServe professional). Manual/off-platform providers cannot be reviewed yet.
- One review per booking; rating 1–5; comment optional.
- Customers cannot edit or delete reviews. Providers cannot create, edit, delete, hide, or otherwise manipulate reviews. Only admin can hide/unhide.
- `average_rating` / `review_count` are computed by a trigger over non-hidden reviews — never client-writable.

**Out of scope:** payments, chat, tracking, public provider browsing, customer editing of reviews, disputes.

---

## Database (migration `0008`)

`public.reviews`:
- `id uuid primary key default gen_random_uuid()`
- `booking_id uuid not null references public.bookings(id) on delete cascade` — `unique` (one review per booking)
- `customer_id uuid not null references public.profiles(id)`
- `provider_id uuid not null references public.profiles(id)`
- `rating int not null check (rating between 1 and 5)`
- `comment text`
- `is_hidden boolean not null default false`
- `created_at timestamptz not null default now()`

Also: `alter table public.profiles add column if not exists review_count int not null default 0;` (`average_rating numeric` already exists from `0005`).

**RLS:**
- `INSERT` (`with check`): `customer_id = auth.uid()` AND `rating between 1 and 5` AND `is_hidden = false` AND `exists (select 1 from public.bookings b where b.id = booking_id and b.customer_id = auth.uid() and b.status = 'completed' and b.assigned_provider_id is not null and b.assigned_provider_id = provider_id)`. The `unique(booking_id)` blocks a second review.
- `SELECT`: own review (`customer_id = auth.uid()`) OR provider's own non-hidden (`provider_id = auth.uid() and is_hidden = false`) OR `is_admin()`.
- `UPDATE`: `is_admin()` only (`using`/`with check` both `is_admin()`) — for hide/unhide. No customer/provider update.
- No `DELETE` policy (no one deletes; admin hides).

**Trigger (`security definer`, `set search_path = public` — same pattern as `bump_completed_jobs`):** `recompute_provider_rating()` on `reviews` AFTER INSERT/UPDATE/DELETE recomputes for the affected `provider_id` (use `coalesce(new.provider_id, old.provider_id)`): `average_rating = avg(rating)` and `review_count = count(*)` over that provider's `is_hidden = false` reviews; when none, set `average_rating = null`, `review_count = 0`. (Hiding/unhiding a review re-runs the recompute via the UPDATE path.)

## Data layer — `src/lib/reviews.ts`

- `Review = { id; booking_id; customer_id; provider_id; rating: number; comment: string|null; is_hidden: boolean; created_at: string }`.
- `submitReview(input: { bookingId: string; providerId: string; rating: number; comment?: string }): Promise<{ ok; error? }>` — resolves the signed-in user, inserts `{ booking_id, customer_id: uid, provider_id, rating, comment: comment ?? null }`. Friendly error (incl. the unique-violation → "You've already reviewed this booking.").
- `getMyReviewForBooking(bookingId: string): Promise<Review | null>` — the caller's review for a booking, or null.
- `getProviderReviews(providerId: string): Promise<Review[]>` — RLS-scoped (provider sees own non-hidden; admin sees all), newest first.
- `setReviewHidden(id: string, hidden: boolean): Promise<{ ok; error? }>` — admin update of `is_hidden`.

## UI

**Components (`src/components/ui/`):**
- `RatingStars` — props `{ value: number|null; count?: number }`; renders 5 stars filled to `Math.round(value)` (muted "Not yet rated" when null), optional `(count)` suffix.
- `StarInput` — props `{ value: number; onChange: (n: number) => void }`; five tappable stars (1–5).
- `ReviewCard` — props `{ review: Review }`; `RatingStars` for `rating` + `comment` + formatted `created_at`.

**Customer** — `src/app/booking/[id].tsx`, only when `booking.status === 'completed'` AND `booking.assigned_provider_id`:
- Load `getMyReviewForBooking(id)`. If none → a "Rate this job" section: `StarInput` + a comment `Input` + Submit → `submitReview({ bookingId: id, providerId: booking.assigned_provider_id, rating, comment })`; on ok reload the review. If a review exists → render it read-only via `ReviewCard`. Inline error on failure.

**Provider** — `src/app/provider/(tabs)/profile.tsx`: show `RatingStars`(`average_rating`, `review_count`) and a list of `getProviderReviews(session.user.id)` (non-hidden, via RLS) as `ReviewCard`s. Read-only.

**Admin** — `src/app/admin/provider/[id].tsx`: a Reviews section — avg/count + `getProviderReviews(id)` (all, incl. hidden) each rendered with a **Hide**/**Unhide** `Button` → `setReviewHidden(review.id, !review.is_hidden)` then reload.

## Testing

Mock Supabase; no network. Screen/route tests in `src/__tests__/`, never `src/app/`; component tests co-located.
- lib: `submitReview` (insert payload + customer from auth + unique-violation message), `getMyReviewForBooking` (row/null), `getProviderReviews` (order), `setReviewHidden` (payload).
- components: `RatingStars` (filled count / null), `StarInput` (tap calls onChange with the star value), `ReviewCard` (rating + comment render).
- customer: completed+assigned → form submit calls `submitReview`; existing review → read-only card; not-completed or manual provider → no rating UI.
- provider: profile shows average + count + own reviews.
- admin: provider detail lists reviews; Hide calls `setReviewHidden(id, true)`.

## Tasks (for the implementation plan)

1. **T1** — migration `0008` (reviews table + RLS + `review_count` column + recompute trigger) + `src/lib/reviews.ts` (+tests).
2. **T2** — components `RatingStars`, `StarInput`, `ReviewCard` (+tests).
3. **T3** — customer rate/view on booking detail (gated to completed + in-app provider) (+tests).
4. **T4** — provider My Profile rating + review_count + reviews list (+tests).
5. **T5** — admin provider detail reviews list + hide/unhide (+tests).
6. **Verify + merge** — `npm test`, `npx tsc --noEmit`, Android bundle smoke; merge to `main`.

## Constraints

- Reuse Slice 1 tokens; preserve premium feel. Route groups strip from URL — keep literal admin/provider paths.
- Supabase mocked in tests; PLAIN `router.push/replace` (no casts). One commit per task; after each: `npm test` + `npx tsc --noEmit`.

## Rollback

Branch `feat/slice-10-ratings-reviews`; one commit per task; `git revert <sha>`. Additive: new `reviews` table + RLS + trigger, new `review_count` column, new lib + components, additive screen sections. Migration `0008` forward-only; to undo in DB drop the trigger + function, the `reviews` table, and the `review_count` column.
