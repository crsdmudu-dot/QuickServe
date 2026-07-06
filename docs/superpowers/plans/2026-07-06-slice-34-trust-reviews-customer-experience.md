# Slice 34 — Trust, Reviews & Customer Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the customer journey — booking timeline, booking details, reviews (with edit-in-window), profile/preferences, receipts, and trust — increasing confidence & transparency with NO booking/dispatch/payment/provider workflow change.

**Architecture:** One additive migration (`reviews.updated_at` + a 24h owner-only `edit_review` RPC; a new owner-only `favorite_services` table). Pure client helpers (`editReview`/`canEditReview`, favorite-services, `buildReceipt`, trust + profile constants). New/enhanced customer components + screens that compose EXISTING booking/payment/wallet/promo/review data. Receipts are display-only; review edit is content-only within 24h (the existing recompute trigger re-runs — no scoring change).

**Tech Stack:** Supabase (one additive migration + RPC + RLS), Expo Router (customer app), TypeScript, Jest + RNTL.

**Spec:** `docs/superpowers/specs/2026-07-06-slice-34-trust-reviews-customer-experience-design.md`

## Global Constraints (bind every task)

- **Additive only.** DB changes are exactly: `reviews.updated_at` column + `edit_review` RPC + the new `favorite_services` table (owner-only RLS). No other schema/policy change.
- **No booking workflow / dispatch / provider-request booking / provider-ranking / payment / wallet / promotions / provider-payout / auth / Operations-workflow / analytics / notification change. No AI.**
- **Review edit is content-only within 24h** — `edit_review` updates only the caller's own review's comment/ratings/tags/`updated_at`, guarded by owner + `created_at > now() - interval '24 hours'`; the existing check constraints + recompute trigger are unchanged (NO Ratings 2.0 scoring change; NO new reviews UPDATE policy).
- **Receipts/invoices are display-only** compositions of EXISTING payment/wallet/promo data — no new financial data, no payment/wallet/promo mutation. Download/share are placeholders.
- **Future-ready preferences (language/communication/notification) are display-only** — no storage, no notification-system change. Favorite services + default address are the only real prefs (default address reuses `customer_addresses.is_default`).
- Migration file is `supabase/migrations/0029_customer_experience.sql` (next after 0028). Reuse: `favorite_providers` (0027) for the `favorite_services` table/RLS shape; owner RLS (`= auth.uid()`); SECURITY DEFINER RPC idiom; `Payment` fields (`amount`/`wallet_applied?`/`promo_discount?`); existing `ReviewCard`/`RatingBreakdown`/`ActivityTimeline`/`VerifiedBadge`/`MarketplaceProviderCard`/`Card`/`Skeleton`/`EmptyState`. NativeTabs (`app-tabs.tsx`) unchanged — new screens are pushed routes.
- **Gate every task:** `npm test` green, `npx tsc --noEmit` clean, `npx expo export --platform web` + `--platform android` succeed (run android export before tsc when new routes are added).

---

## File Structure

**Create**
- `supabase/migrations/0029_customer_experience.sql` — reviews column + `edit_review` RPC + `favorite_services` + RLS.
- `src/lib/favorite-services.ts`, `src/lib/receipts.ts` (+ tests). Extend `src/lib/reviews.ts` (editReview/canEditReview).
- `src/constants/trust.ts`, `src/constants/customer-profile.ts` (+ tests).
- `src/components/ui/` (or `src/components/customer/`): `booking-progress-tracker.tsx`, `booking-status-card.tsx`, `payment-breakdown-card.tsx`, `receipt-view.tsx`, `review-edit-form.tsx`, `review-summary.tsx`, `profile-completion-card.tsx`, `favorite-service-toggle.tsx`, `trust-badges-row.tsx`, `safety-reminders.tsx`, `service-guarantees.tsx`, `customer-tips.tsx` (+ tests).
- `src/app/booking/receipt.tsx`, `src/app/(customer)/preferences.tsx`, `src/app/(customer)/trust.tsx` (+ screen tests).
- `docs/pilot/customer-experience.md` — verification doc.

**Modify (additive)**
- `src/app/(customer)/bookings.tsx` (richer cards/tracker/states), `src/app/booking/[id].tsx` (breakdown + receipt link + review-edit + summaries), `src/app/booking/review.tsx` (edit UI), `src/app/(customer)/profile.tsx` (completion + preferences link). Register new pushed routes in the relevant `_layout` (additive Stack.Screen).

**Reuse (do not change behavior):** payments/wallet/promotions/attempts/photos/reviews reads; booking flow; `favorite_providers`; Slice 33 `VerifiedBadge`.

---

## Task Order (dependency-ordered)

1. **T1** — Migration 0029: `reviews.updated_at` + `edit_review` RPC (24h owner-only) + `favorite_services` + owner-only RLS + schema/RLS tests.
2. **T2** — Libs + constants: `reviews.ts` editReview/canEditReview, `favorite-services.ts`, pure `receipts.ts` buildReceipt, `constants/trust.ts`, `constants/customer-profile.ts` + tests.
3. **T3** — Components (progress tracker, status card, payment-breakdown, receipt view, review-edit-form/summary, profile-completion, favorite-service toggle, trust/safety/guarantees/tips) + tests.
4. **T4** — Booking screens: bookings-list polish + booking-detail polish + receipt screen + review-edit UI + tests.
5. **T5** — Profile/preferences/trust screens + entry points + a consistent-visual-language pass across customer cards + tests.
6. **T6** — Verification doc + isolation + no-workflow-change proof + final gate.

Each task ends green (`npm test` / `tsc` / both exports).

---

### Task 1: Migration 0029 — reviews edit + favorite_services

**Files:** Create `supabase/migrations/0029_customer_experience.sql`; Test `src/__tests__/customer-experience-schema.test.ts`

**Build (SQL):**
- `alter table public.reviews add column if not exists updated_at timestamptz;`
- `edit_review(p_review_id uuid, p_comment text, p_rating int, p_quality int, p_punctuality int, p_communication int, p_professionalism int, p_value int, p_would_recommend boolean, p_tags text[]) returns void` — `language plpgsql security definer set search_path = public`. Body:
  ```
  if not exists (select 1 from public.reviews
                 where id = p_review_id and customer_id = auth.uid()
                   and created_at > now() - interval '24 hours')
  then raise exception 'edit window closed or not owner'; end if;
  update public.reviews set comment = p_comment, rating = p_rating,
    quality_rating = p_quality, punctuality_rating = p_punctuality,
    communication_rating = p_communication, professionalism_rating = p_professionalism,
    value_rating = p_value, would_recommend = p_would_recommend, tags = p_tags,
    updated_at = now()
  where id = p_review_id;
  ```
  (The existing ratings 1–5 + tag-allowlist check constraints enforce validity; the `trg_recompute_provider_rating` trigger [after insert/update/delete] re-runs automatically. NO scoring logic change, NO new UPDATE policy.)
- `favorite_services` (mirror `favorite_providers`): `id uuid pk default gen_random_uuid()`, `customer_id uuid not null references profiles(id) on delete cascade`, `service_id text not null`, `created_at timestamptz not null default now()`, `unique (customer_id, service_id)`, index `(customer_id, created_at desc)`. `enable row level security`. Owner-only RLS: `favorite_services_select`/`_insert`/`_delete` `using/with check (customer_id = auth.uid())`. No update policy.
- SQL comments: "additive; review edit = content-only, owner + 24h window, no scoring change; favorite_services owner-only; no existing policy/data altered".

**Test (`customer-experience-schema.test.ts`, static fs-read):** `reviews` gains `updated_at` (add column, not a rewrite); `edit_review` present, `security definer` + `set search_path = public`, contains the owner + `24 hours` window guard + `updated_at = now()`; NO new `create policy ... reviews ... for update` (edit is via the RPC only); `favorite_services` table + 3 owner-only policies (select/insert/delete `customer_id = auth.uid()`) + unique + NO update/delete-other/customer... (no admin/provider policy); additive (no `drop`, no alter of existing policies/triggers, recompute trigger untouched).

**Steps:** SQL → static test → `npm test` → `tsc` → both exports → commit `feat: slice34 migration 0029 review edit + favorite_services`.

---

### Task 2: Libs + constants

**Files:** Extend `src/lib/reviews.ts`; Create `src/lib/favorite-services.ts`, `src/lib/receipts.ts`, `src/constants/trust.ts`, `src/constants/customer-profile.ts`; Tests alongside

**Build:**
- `reviews.ts` — `editReview(input: { reviewId; comment; rating; quality; punctuality; communication; professionalism; value; wouldRecommend; tags }): Promise<{ ok; error? }>` → `supabase.rpc('edit_review', { p_… })`. `canEditReview(review: Review): boolean` — pure: `Date.now() - Date.parse(review.created_at) < 24*3600*1000`. Do NOT alter `submitReview`.
- `favorite-services.ts` (mirror Slice 32 `favorites.ts`) — `addFavoriteService(serviceId)`/`removeFavoriteService(serviceId)` (`customer_id` from `auth.getUser()`; duplicate `23505` → `{ ok:true }`; `{ ok, error? }`), `getFavoriteServiceIds(): Promise<string[]>`, `getMyFavoriteServices(): Promise<Service[]>` (select → resolve ids to `SERVICES`, drop unknown). Reads → `[]`.
- `receipts.ts` — pure `buildReceipt(input: { booking; payment: Payment | null; }): Receipt` where `Receipt = { currency; lineItems: {label;amount}[]; subtotal; walletApplied; promoDiscount; feesTaxes?; total }`. Compose from EXISTING fields: `total = payment.amount ?? 0`; `walletApplied = payment.wallet_applied ?? 0`; `promoDiscount = payment.promo_discount ?? 0`; `subtotal = total + walletApplied + promoDiscount`; fees/taxes only if a field exists (else omit). No I/O, no mutation. `canDownloadReceipt = false` (placeholder).
- `constants/trust.ts` — static `SERVICE_GUARANTEES`, `SAFETY_REMINDERS`, `CUSTOMER_TIPS`, `TRUST_MESSAGES` (arrays of `{title/heading, body}` or strings); pure `deriveCustomerTrustSignals(p: { is_verified; completed_jobs_count; average_rating })` → `{ label; icon }[]` (verified / 100+ jobs / 4.8★ — display-only, reuse Slice 33 thresholds; no new data).
- `constants/customer-profile.ts` — pure `computeCustomerProfileCompletion(profile, addresses): { percent; items: {key;label;done;futureReady}[]; missing }` (name, phone, default address present, …; future-ready items excluded from %); `FUTURE_READY_PREFERENCES` (language, communication, notifications — display-only defs).

**Tests:** `editReview` calls rpc with p_ params; `canEditReview` boundary (23h true, 25h false); favorite-services add/remove/list + duplicate→ok; `buildReceipt` math (subtotal = total+wallet+promo; fees omitted when absent); `computeCustomerProfileCompletion` (each item, future-ready excluded); `deriveCustomerTrustSignals`.

**Steps:** TDD → `npm test` → `tsc` → both exports → commit `feat: slice34 review-edit + favorite-services + receipt + trust/profile constants`.

---

### Task 3: Components

**Files:** Create the components listed in File Structure; Tests alongside

**Build (presentational; consume T2 libs/constants + existing primitives; callbacks via props):**
- `booking-progress-tracker.tsx` `{ status }` — maps booking status (`pending→assigned→in_progress→completed`, or `cancelled`) to a step tracker (done/current/upcoming). Display-only.
- `booking-status-card.tsx` `{ booking, onPress }` — status-variant card (completed/cancelled/pending styling) with service title, status badge, date; reuse `Card`/`StatusBadge`.
- `payment-breakdown-card.tsx` `{ receipt }` — line items + subtotal/wallet/promo/fees/total from a `Receipt`.
- `receipt-view.tsx` `{ receipt, onDownload?, onShare? }` — full receipt layout + download/share **placeholder** buttons (disabled/"coming soon").
- `review-edit-form.tsx` `{ review, onSaved }` — pre-filled edit form (comment/rating/category ratings/tags), submit → `editReview`; disabled/hidden when `!canEditReview`. `review-summary.tsx` `{ breakdown }` — reuse `RatingBreakdown`.
- `profile-completion-card.tsx` `{ completion }` — % bar + checklist (future-ready muted).
- `favorite-service-toggle.tsx` `{ serviceId, active, onToggle }` — heart/star toggle (screen owns the lib call).
- `trust-badges-row.tsx` `{ signals }`, `safety-reminders.tsx`, `service-guarantees.tsx`, `customer-tips.tsx` — static/derived content rows.

**Tests:** each renders its props; progress tracker marks the right step per status (+ cancelled); status card variants; payment-breakdown shows the numbers; receipt-view placeholders disabled; review-edit-form submits via `editReview` + hidden when window closed; profile-completion %/remaining; favorite toggle fires; trust rows render.

**Steps:** TDD → `npm test` → `tsc` → both exports → commit `feat: slice34 customer experience components`.

---

### Task 4: Booking screens (list, detail, receipt, review edit)

**Files:** Modify `src/app/(customer)/bookings.tsx`, `src/app/booking/[id].tsx`, `src/app/booking/review.tsx`; Create `src/app/booking/receipt.tsx` + register route; Tests in `src/__tests__/`

**Build:**
- `bookings.tsx` — render `BookingStatusCard` per booking (status variants) + a compact `BookingProgressTracker`; keep the existing `usePaginatedList(getCustomerBookings)` read; polished empty + `Skeleton` states. No read/workflow change.
- `booking/[id].tsx` — additive reorg: provider summary (verified/rating), service summary, `ActivityTimeline`, existing photos, review section (with `ReviewEditForm` when `canEditReview`), a `PaymentBreakdownCard` (from `buildReceipt(booking,payment)`), and an **Invoice/Receipt link** → `/booking/receipt?id={id}`. Existing pay/apply-wallet/redeem-promo handlers UNCHANGED.
- `booking/receipt.tsx` — `useLocalSearchParams<{id}>`; load booking + `getPaymentForBooking(id)`; `buildReceipt(...)` → `ReceiptView` (+ breakdown). Download/share placeholders. Display-only (no mutation).
- `booking/review.tsx` — better review UI; when an existing review is within 24h, show `ReviewEditForm` (→ `editReview`); else the existing submit path. No change to submit logic.

**Tests:** bookings list renders status cards + tracker + empty/skeleton; detail renders breakdown + receipt link + review-edit when in-window + shows summaries; receipt screen renders the breakdown from mocked payment (no mutation call); review edit submits via `editReview` and hides after window. Keep existing booking/detail/review tests green.

**Steps:** `expo export --platform android` (route types) → TDD → `npm test` → `tsc` → `expo export --platform web` → commit `feat: slice34 booking list/detail/receipt/review-edit screens`.

---

### Task 5: Profile / preferences / trust screens + visual-consistency pass

**Files:** Modify `src/app/(customer)/profile.tsx`; Create `src/app/(customer)/preferences.tsx`, `src/app/(customer)/trust.tsx` + register routes; Tests in `src/__tests__/`

**Build:**
- `profile.tsx` — add `ProfileCompletionCard` (`computeCustomerProfileCompletion`) + a "Preferences" link → `/(customer)/preferences` + a "Trust & Safety" link → `/(customer)/trust`. Keep existing profile behavior.
- `preferences.tsx` — favorite services (list + `FavoriteServiceToggle` via `favorite-services` lib, optimistic), default address (reuse `customer_addresses` `is_default` — link to the existing saved-addresses flow; do NOT change address logic), and future-ready language/communication/notification toggles (display-only "coming soon", no writes).
- `trust.tsx` — `SafetyReminders`, `ServiceGuarantees` (static), `CustomerTips`, `TRUST_MESSAGES`, and `TrustBadgesRow` examples; verified/derived trust signals via `deriveCustomerTrustSignals`.
- **Consistent visual language pass:** apply the shared card/spacing/typography treatment across the customer cards touched in this slice (bookings, detail sections, receipt, profile, preferences, trust) using tokens — additive styling only, no behavior change; ensure `BookingStatusCard`/`MarketplaceProviderCard`/review cards share consistent radii/spacing/hierarchy.

**Tests:** profile renders completion + the two links; preferences renders favorite-service toggles (toggle calls the lib) + future-ready toggles shown disabled; trust screen renders guarantees/safety/tips; entry links route. Keep existing profile tests green.

**Steps:** `expo export --platform android` (route types) → TDD → `npm test` → `tsc` → `expo export --platform web` → commit `feat: slice34 profile/preferences/trust screens + visual consistency`.

---

### Task 6: Verification + isolation + no-workflow-change proof + final gate (FINAL)

**Files:** Create `docs/pilot/customer-experience.md`

- **No-workflow-change / display-only proof:** grep the new/edited screens + libs — receipts/breakdown read existing payment/wallet/promo data and perform NO payment/wallet/promo mutation (no `initiateMpesaPayment`/`applyWalletToPayment`/`redeemPromo`/`admin_wallet_adjust` call added in the receipt path); review edit calls ONLY `edit_review` (content-only, 24h); no dispatch/booking-workflow/ranking/provider-request call in the new code; future-ready prefs write nothing. Document the greps.
- **as-role RLS spot-audit (documented):** `edit_review` succeeds for owner within 24h, rejects non-owner + after 24h; `favorite_services` owner-only (another customer/provider can't read/modify); unique prevents dupes; the recompute trigger stays consistent after an edit. SQL + expected results.
- **Isolation:** `git diff <base>..HEAD --name-only` — changes only under `supabase/migrations/0029*`, `src/lib/{favorite-services,receipts}*` + the `reviews.ts` edit additions, `src/constants/{trust,customer-profile}*`, the new/edited customer components + screens (`(customer)/{bookings,profile,preferences,trust}.tsx`, `booking/{[id],review,receipt}.tsx`), route `_layout` additions, docs, tests. Prove NO change to dispatch/booking-workflow/payment/wallet/promotions/payout/auth/notification/analytics/Operations files (beyond the additive `reviews.updated_at`/`edit_review` + `favorite_services`); NO migration other than 0029; NativeTabs unchanged; recompute trigger untouched.
- **Final gate:** `npm test` green, `tsc` clean (run `expo export --platform android` before tsc for new route types), `expo export` web + android green, `git status` clean.
- Commit `test: slice34 customer experience verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-34-customer-experience`. Abandon = `git checkout main` + delete branch.
- **Per-task revert:** independent commits — `git revert <commit>` rolls back one. Reverting T3–T5 removes UI (lib/table harmless if unused).
- **DB rollback:** migration 0029 is additive — undo = a follow-up `drop function edit_review; drop table favorite_services cascade; alter table public.reviews drop column updated_at;` (no data migration to reverse; existing reviews/payments untouched; recompute trigger unchanged throughout).
- **No booking/dispatch/payment/workflow involvement** — rollback confined to the additive review-edit + favorite_services + display-only UI; existing booking/payment/review behavior intact.

---

## Self-Review

- **Requirement coverage:** migration 0029 (T1) · reviews.updated_at (T1) · edit_review RPC 24h owner-only (T1) · favorite_services table + owner-only RLS (T1) · reviews.ts editReview/canEditReview (T2) · favorite-services.ts (T2) · receipt builder (T2) · trust constants (T2) · customer profile constants (T2) · booking list polish (T4) · booking detail polish (T4) · receipt screen (T4) · review edit UI (T3 form + T4 screen) · profile completion (T3 card + T5 screen) · customer preferences screen (T5) · favorite services UI (T3 toggle + T5 screen) · trust/safety UI (T3 + T5) · consistent visual language across customer cards (T5) · rollback (this section). Every "Include" item mapped.
- **Constraint coverage:** no booking/dispatch/provider-request/ranking/payment/wallet/promotions/payout/auth/Operations-workflow/analytics/notification change (Global + T6 isolation) · review edit content-only 24h (T1 RPC guard, Global) · receipts display-only from existing data (T2 pure buildReceipt, T4, T6 proof) · future-ready prefs display-only (T5) · no AI (absent).
- **Placeholder scan:** none (future-ready prefs/photos + download/share placeholders intentional).
- **Name consistency:** RPC `edit_review` + table `favorite_services` identical T1(SQL)↔T2(rpc/select); `editReview`/`canEditReview`/`buildReceipt`/`Receipt`/`addFavoriteService`/`getMyFavoriteServices`/`computeCustomerProfileCompletion`/`deriveCustomerTrustSignals` consistent T2↔T3↔T4↔T5; component filenames T3↔T4↔T5; routes `booking/receipt`, `(customer)/preferences`, `(customer)/trust` consistent T4/T5; `Payment` fields (`amount`/`wallet_applied`/`promo_discount`) used verbatim in `buildReceipt`.
