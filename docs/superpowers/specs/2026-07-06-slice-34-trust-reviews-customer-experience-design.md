# Slice 34 — Trust, Reviews & Customer Experience (Design Spec)

**Date:** 2026-07-06
**Status:** Design → (user review, then implementation plan)
**Builds on (reuses):** the customer booking surfaces (`booking/[id].tsx` already composes photos/review/payment/wallet/promo/attempts/`ActivityTimeline`/`StatusBadge`), `(customer)/{bookings,profile,payments,favorites}.tsx`, reviews (0008 + Ratings 2.0 0022; recompute trigger fires `after insert or update or delete`), payments/wallet/promotions/attempts libs, `customer_addresses` (`is_default`), Slice 32 `favorite_providers`/`MarketplaceProviderCard`, Slice 33 derived achievements + `VerifiedBadge`, and existing UI primitives (`ReviewCard`/`RatingBreakdown`/`Card`/`Skeleton`/`EmptyState`/`SectionHeader`). Nothing in booking/dispatch/payment/wallet/promotions/payout/auth/analytics/Operations workflow is changed.

## 1. Goal & Decisions

Refine the whole customer journey — booking timeline, booking details, reviews, profile/preferences, receipts/invoices, and trust — to increase confidence, transparency and satisfaction, **without** changing booking/dispatch/payment/provider workflows.

**Confirmed decisions (brainstorm):**
- **Review editing IS added:** additive `reviews.updated_at` column + an owner-only SECURITY DEFINER `edit_review` RPC enforcing a **24h window** (from `created_at`). The existing recompute trigger re-runs automatically — **no Ratings 2.0 scoring-logic change**.
- **Review photos are DEFERRED** (future-ready) — no `review_photos` table, no new upload path. Reviews stay comment + ratings + tags; existing `booking_photos` still shown on the booking detail.
- **Customer preferences:** a new owner-only **`favorite_services`** table (mirrors `favorite_providers`). Language / communication / notification preferences are **future-ready display-only** (no storage — honors "no notification changes"). Default address reuses `customer_addresses.is_default`.

**Two additive DB changes total** (one column + RPC on `reviews`; one new `favorite_services` table). Everything else is display/UI reuse.

## 2. Scope & Constraints (hard rules)

**In scope:** booking timeline/progress + richer booking cards & history + empty/loading states; booking-detail composition (provider/service summary, timeline, photos, reviews, payment/wallet/promo breakdown, invoice/receipt links); review UI + edit-in-window + summary/breakdown + better cards; customer profile + preferences (favorite services, default address, future-ready language/comm/notification, profile completion); receipts/invoices display (breakdown, taxes/fees where applicable, download/share placeholders); trust (verified badges, derived provider achievements, better provider cards, trust messaging, safety reminders, static service guarantees, customer tips); broad UI polish.

**Out of scope / MUST NOT change (additive only):**
- No booking workflow / dispatch / provider-request booking / provider-ranking / payment / wallet / promotions / provider-payout / auth / Operations-Portal-workflow / analytics / notification-system change. No AI (recommendations or moderation). No scheduling / dynamic pricing / bidding / provider enforcement / maps / live tracking / video uploads.
- Editing a review changes only its own content within the window; it does NOT change Ratings 2.0 scoring (the recompute trigger is unchanged). Receipts/invoices are display-only compositions of EXISTING payment/wallet/promo data — no new financial data, no payment change. Download/share are placeholders.

## 3. Data model — migration `0029_customer_experience.sql` (additive)

### 3.1 `reviews` — additive column + edit RPC (no scoring change)
- `alter table public.reviews add column if not exists updated_at timestamptz;` (null until first edit).
- `edit_review(p_review_id uuid, p_comment text, p_rating int, p_quality int, p_punctuality int, p_communication int, p_professionalism int, p_value int, p_would_recommend boolean, p_tags text[]) returns void` — SECURITY DEFINER, `set search_path = public`. Guard: the review must belong to the caller AND be within 24h: `if not exists (select 1 from reviews where id = p_review_id and customer_id = auth.uid() and created_at > now() - interval '24 hours') then raise exception 'edit window closed'; end if;` Then `update reviews set comment=…, rating=…, <category ratings>, would_recommend=…, tags=…, updated_at=now() where id=p_review_id`. The existing check constraints (ratings 1–5, tag allowlist) still apply; the recompute trigger re-runs on the UPDATE. No new reviews UPDATE policy (customers still can't directly update; the RPC is the sole owner+window path).

### 3.2 `favorite_services` (owner-only; mirrors `favorite_providers` from Slice 32)
- `id uuid pk default gen_random_uuid()`, `customer_id uuid not null references profiles(id) on delete cascade`, `service_id text not null` (a `SERVICES` id — no FK, it's a code constant), `created_at timestamptz not null default now()`, `unique (customer_id, service_id)`, index `(customer_id, created_at desc)`.
- **RLS owner-only:** `select`/`insert`/`delete` `using/with check (customer_id = auth.uid())`. No update. Customers see/modify only their own favorites.

## 4. Client libs & constants

- `src/lib/reviews.ts` (extend) — `editReview(input)` → `supabase.rpc('edit_review', { p_… })` (`{ ok, error? }`); `canEditReview(review): boolean` (pure — `created_at` within 24h). Keep existing `submitReview`/`getMyReviewForBooking` unchanged.
- `src/lib/favorite-services.ts` — `addFavoriteService(serviceId)`, `removeFavoriteService(serviceId)`, `getFavoriteServiceIds()`, `getMyFavoriteServices()` (resolve ids → `Service`). Owner via RLS (`customer_id = auth.uid()`; uid from `auth.getUser()` for inserts). Mirrors Slice 32 favorites idiom.
- `src/lib/receipts.ts` — pure `buildReceipt({ booking, payment, walletApplied?, promo? })` → a structured breakdown `{ lineItems, subtotal, walletApplied, promoDiscount, feesTaxes?, total, currency }` composed from EXISTING payment/wallet/promo fields (no new data, no writes). `canDownloadReceipt` = false placeholder (share/download are placeholders).
- `src/constants/trust.ts` — static `SERVICE_GUARANTEES`, `SAFETY_REMINDERS`, `CUSTOMER_TIPS`, `TRUST_MESSAGES`; `deriveCustomerTrustSignals(provider)` (pure, display-only — verified/jobs/rating → badges, reusing Slice 32/33 derivations; no new backend).
- `src/constants/customer-profile.ts` — `computeCustomerProfileCompletion(profile, addresses)` (pure — name/phone/default-address/…); `FUTURE_READY_PREFERENCES` (language, communication, notifications — display-only placeholders).

## 5. Screens (customer app; additive)

- **Bookings list** (`(customer)/bookings.tsx`) — richer status-specific cards (completed/cancelled/pending variants) via a new `BookingStatusCard`; a `BookingProgressTracker` (status → steps); empty states + `Skeleton` loading. No query/workflow change (same reads).
- **Booking detail** (`booking/[id].tsx`) — reorganized additively: provider summary (reuse verified/rating), service summary, timeline (reuse `ActivityTimeline`), photos (existing), reviews (with edit-in-window), **payment/wallet/promo breakdown**, and **Invoice / Receipt links** → the receipt screen. Existing pay/apply/promo handlers untouched.
- **Receipt** (`booking/receipt.tsx`, new pushed route) — `buildReceipt(...)` breakdown (subtotal, wallet, promo, fees/taxes where applicable, total) + download/share **placeholders**. Display-only from existing payment data.
- **Review** (`booking/review.tsx` / the detail's review section) — better UI; when a review exists and is within 24h, an **Edit** flow (`editReview`); a review summary + `RatingBreakdown`; better `ReviewCard`. Photo-on-review shown as future-ready.
- **Profile** (`(customer)/profile.tsx`) — personal details, saved-addresses improvements (reuse), **profile completion** bar, and a link to Preferences.
- **Preferences** (`(customer)/preferences.tsx`, new pushed route) — favorite services (add/remove via `favorite_services`), default address (reuse `is_default`), and future-ready language / communication / notification toggles (display-only, "coming soon").
- **Trust** — a trust/safety surface (safety reminders, static service guarantees, customer tips, trust messaging) reachable from booking/home; verified badges + derived provider trust signals on provider cards (reuse `MarketplaceProviderCard`/`VerifiedBadge`).

(New screens are additive pushed routes — NativeTabs unchanged.)

## 6. Components (new/reused)

`BookingProgressTracker`, `BookingStatusCard` (status variants), `PaymentBreakdownCard`, `ReceiptView`, `ReviewEditForm` (+ better `ReviewCard`/`ReviewSummary`), `ProfileCompletionCard`, `FavoriteServiceToggle`, `TrustBadgesRow`, `SafetyReminders`, `ServiceGuarantees`, `CustomerTips`, richer `EmptyState`/`Skeleton` usages. Reuse `RatingBreakdown`, `ActivityTimeline`, `VerifiedBadge`, `MarketplaceProviderCard`, `Card`.

## 7. Testing

- **DB/RLS:** as-role — `edit_review` succeeds for the owner within 24h, rejects non-owner and rejects after 24h; the recompute trigger re-runs (aggregates consistent). `favorite_services` owner-only (another customer/provider can't read/modify); unique prevents dupes.
- **Libs:** `editReview`/`canEditReview` (window boundary); favorite-services add/remove/list; `buildReceipt` breakdown math (subtotal/wallet/promo/total) from fixtures; `computeCustomerProfileCompletion`; `deriveCustomerTrustSignals`.
- **Components/screens:** booking cards per status + progress tracker + skeleton/empty; booking detail breakdown + receipt link; review edit within window (disabled after); receipt view breakdown; profile completion + preferences favorite-service toggle; trust content renders. **No-workflow test:** the receipt/breakdown reads existing data and performs no payment/wallet/promo mutation; editing a review calls only `edit_review`.
- Gate: `npm test` green, `npx tsc --noEmit` clean, `expo export` web + android green.

## 8. Guardrails restated (verification will prove)

Additive only (1 column + 1 RPC on reviews; 1 new `favorite_services` table); no booking/dispatch/provider-request/ranking/payment/wallet/promotions/payout/auth/notification/analytics/Operations-workflow change; review edit changes only content within a 24h window (no scoring change — recompute trigger untouched); receipts/invoices display-only from existing data (no financial change); no AI; future-ready prefs are display-only.

## 9. Open assumptions

- `edit_review` re-uses the existing ratings/tag check constraints + recompute trigger; it validates owner + 24h window only (no scoring logic).
- Receipts compose from existing payment/attempts/wallet/promo fields; if a fee/tax field doesn't exist it's simply omitted (shown only "where applicable"). Download/share are placeholders (no PDF/file generation this slice).
- Provider trust signals/achievements shown to customers are DERIVED from existing public curated provider fields (verified/jobs/rating) — no new provider data exposed.
- Favorite services store `SERVICES` code ids (no DB services table); unknown ids are ignored on read.
- New screens are additive pushed routes; NativeTabs (`app-tabs.tsx`) unchanged.
