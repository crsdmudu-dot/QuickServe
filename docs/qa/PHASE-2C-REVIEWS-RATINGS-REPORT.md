# Phase 2C — Reviews & Ratings Connected Coverage Report

> Connected certification of the **existing** reviews & ratings domain against the
> dedicated, non-production QA project. No new feature, no product-behavior change, no
> migration. Results observed 2026-07-28. Env vars referenced by name only; no secrets.

## 1. Executive Summary

**13 new connected tests** were added for reviews & ratings, raising the connected
certification suite **65 → 78**, all passing serially with deterministic cleanup
(**0 residual** reviews/bookings; provider aggregates restored to empty). The tests drive
the **real** reviews RLS, RPCs, and aggregation of the QA project — eligibility,
booking/participant integrity, one-review-per-booking, rating + tag integrity, RLS
visibility, the author-only `edit_review` window, admin hide/unhide, the absence of a
delete path, provider-rating aggregation, and private-feedback isolation. **No product
defect was found**; no migration or feature was added.

**This certifies connected database/RLS behavior only** — not the UI review flow,
moderation UX, push notifications, public review display, or native review behavior.
**Full Platform Certification is not claimed.**

## 2. Starting Baseline

| Item | Value |
|---|---|
| Branch | `qa/phase-2c-reviews-ratings` |
| Pre-work main | `924794a701c1fc0af9e56be40f55144597a96cf0` |
| Node / npm | v24.14.1 / 11.11.0 |
| Playwright / supabase-js | 1.61.1 / 2.108.2 |
| Connected certification (before) | 65 |
| Review/rating env vars | none (reviews need no dedicated env vars) |

## 3. Existing Reviews Architecture

Verified from migrations `0008` (reviews + aggregation), `0009` (pin review_count),
`0022` (ratings v2 + private feedback), `0029` (`edit_review`), `0005` (provider aggregate
columns):

- **`reviews`** — `booking_id UNIQUE` (one per booking, cascade), `customer_id`,
  `provider_id`, `rating int CHECK 1–5`, `comment`, `is_hidden` (default false),
  dimension ratings (`quality/punctuality/communication/professionalism/value`, nullable,
  1–5), `would_recommend`, `tags text[]` with a 9-tag allowlist (`reviews_tags_allowed`).
- **RLS** — **insert** (`reviews_insert_own`): `customer_id = auth.uid()` AND rating 1–5 AND
  `is_hidden=false` AND the booking is the caller's, **completed**, with
  `assigned_provider_id = provider_id`. **select** (`reviews_select`): customer own /
  provider (non-hidden) / admin. **update** (`reviews_update_admin`): **admin only**
  (hide/unhide). **No delete policy** (cascade-only).
- **`edit_review`** (RPC, `0029`) — author-only (`customer_id = auth.uid()`) within a
  **24-hour** window; else "edit window closed or not owner".
- **Aggregation** — `recompute_provider_rating` (AFTER insert/update/delete) sets
  `profiles.average_rating` + `review_count` over **non-hidden** reviews;
  `get_provider_rating_breakdown` (SECURITY DEFINER) reads averages/count/tags over
  non-hidden reviews.
- **`review_private_feedback`** — `review_id PK`, `feedback`; insert = authoring customer;
  select = customer own **or admin** — **no provider access, no update/delete**.
- **App path:** `submitReview` inserts directly into `reviews` (RLS); `edit_review` RPC for
  edits; `get_provider_rating_breakdown` for display.

### Internal coverage matrix (implemented → covered)

| Operation | Eligible actor | Booking precondition | Persisted | Authorization | Constraint | New coverage |
|---|---|---|---|---|---|---|
| create review | customer (own) | completed + provider match | reviews row | RLS insert_own | rating 1–5, tags allowlist, one-per-booking | ✅ + all negatives |
| read review | customer/provider/admin | — | — | RLS select (hidden hides from provider) | — | ✅ |
| edit review | author | within 24h | reviews row | edit_review ownership | — | ✅ owner + non-owner + direct-write |
| hide/unhide | admin | — | is_hidden | reviews_update_admin | — | ✅ (+ aggregate recompute) |
| delete review | (none) | — | — | no policy | cascade-only | ✅ (proven absent) |
| aggregate | trigger | — | profiles avg/count | — | non-hidden only, no inflation | ✅ delta + hide/unhide |
| private feedback | customer/admin read | — | rpf row | rpf_select (no provider) | — | ✅ |

## 4. Review Lifecycle Verified

`booking → assign provider → provider completes → customer submits review (rating + tags +
comment) → provider aggregate recomputed → author may edit within 24h → admin may hide/unhide
(aggregate recomputed) → (no delete; cascade on booking removal)`. All exercised connected.

## 5. Connected Coverage Added

13 tests in `qa/playwright/certification/reviews.spec.ts` (helper
`qa/playwright/support/connected/qa-reviews.ts`): eligibility (happy + non-completed +
provider-authored + anon), participant integrity, one-per-booking, rating integrity
(0/6/4.5/null rejected; 1/5 accepted), tag allowlist, RLS visibility (+ hide), update
(author + non-author + direct-write), delete-absence, aggregate (delta + hide/unhide), and
private-feedback isolation. Existing helpers reused; no existing test modified.

## 6. Eligibility and Booking Integrity

- Only the **customer of a completed booking** whose `assigned_provider_id` equals the review
  `provider_id` can insert (asserted: correct booking/customer/provider persisted).
- A **non-completed** booking cannot be reviewed (RLS denies).
- A **provider** cannot author a customer review; an **anonymous** caller is denied (401/403).
- A **mismatched `provider_id`** (not the assigned provider) is denied.

## 7. Authorization and RLS Coverage

- **Visibility:** customer sees their own review (even when hidden); the provider sees it only
  while **non-hidden**; admin always; another provider and anon see **none**. After admin
  hides, the provider can no longer read it; customer + admin still can.
- **Update:** only the author (via `edit_review`, within window); a non-author is denied; a
  direct customer table `UPDATE` changes nothing (only `reviews_update_admin` exists).
- **Private feedback:** readable only by the authoring customer and admin — **never** the
  provider (or any other user).

## 8. Rating and Content Integrity

- **Ratings:** `0`, `6`, `4.5` (fractional), and `null` are **rejected**; `1` (min) and `5`
  (max) are **accepted** — matching the `rating int CHECK 1–5` schema.
- **Tags:** an allowed set (`on_time`, `friendly`) persists; a disallowed tag (`bogus_tag`) is
  rejected by the `reviews_tags_allowed` constraint.
- **Content:** `comment` persists as given; it is optional (no length constraint exists — no
  oversize rejection is claimed, and no moderation behavior was invented).

## 9. Duplicate and Idempotency Behavior

- The first review for a booking succeeds; a **second** review for the same booking is rejected
  with **409** (`booking_id UNIQUE`); exactly one review row remains.

## 10. Update and Delete Behavior

- **Update:** author edit within the window succeeds (rating/comment updated); non-author edit
  denied; direct customer table update denied. (The 24-hour **expiry** is implemented but not
  deterministically testable without time manipulation — see Limitations.)
- **Delete:** there is **no delete path** — neither the customer nor an admin can delete a
  review row (no delete RLS policy); rows are removed only by booking cascade. Verified: both
  delete attempts remove 0 rows and the review persists.

## 11. Aggregate Rating Behavior

- Creating a review increments the provider's `review_count` by exactly one and updates
  `average_rating` (asserted via `get_provider_rating_breakdown` **deltas** and the provider's
  own profile read — robust to shared-account state).
- **Hiding** a review recomputes the aggregate to exclude it; **unhiding** restores it with **no
  inflation** (count returns to the same value). After cleanup, both QA provider aggregates are
  `review_count = 0`, `average_rating = null` (verified).

## 12. Cleanup and Residual Data

Every created booking is tracked and deleted in `afterAll`; `reviews`,
`review_private_feedback`, provider `earnings`/etc. cascade on booking delete, and the
aggregate trigger recomputes on cascade delete. Verified after the full certification run:
**0 residual QA-CERT bookings, 0 reviews project-wide, provider aggregates restored to empty.**

## 13. Files Changed

| File | Type |
|---|---|
| `qa/playwright/certification/reviews.spec.ts` | new — 13 connected tests |
| `qa/playwright/support/connected/qa-reviews.ts` | new — reviews RLS/RPC/aggregate helpers |
| `docs/qa/PHASE-2C-REVIEWS-RATINGS-REPORT.md` | new — this report |

No `src/`, `supabase/`, migrations, existing tests, QA scripts, configuration, or deployment
files changed. No new dependency.

## 14. Validation Matrix

| Command | Status | Exit | Result |
|---|---|---|---|
| Reviews spec alone (serial) | **Pass** | 0 | 13/13 (~57 s) |
| Full connected certification (serial) | **Pass** | 0 | **78/78** (65 + 13), ~2.4 m; 0 residual |
| Root Jest | **Pass** | 0 | 220/220, 2943/2943 |
| Website Vitest | **Pass** | 0 | 7 files, 102 tests |
| TypeScript (root) | **Pass** | 0 | 0 errors |
| TypeScript (qa) | **Pass** | 0 | 0 errors |
| Lint | **Deterministic; unchanged** | 1 | 489 pre-existing (qa/ ignored; no new findings) |
| Health | **Pass** | 0 | 19/19 |
| `qa:release` | **Pass** | 0 | 475s: jest 2943 → tsc 0 → web+android exports → serial cert **78/78** → non-cert browsers 130 passed / 56 skipped / 0 failed; 2 deterministic teardowns |
| Deterministic cleanup / residual | **Clean** | — | 0 bookings, 0 reviews; aggregates restored |

## 15. Defects or Limitations Found

**No product defect found.** Limitations (by design / environment, not defects):

- The **24-hour edit window expiry** in `edit_review` is not deterministically testable without
  time manipulation; only the in-window author edit + non-author denial are certified.
- **Reviews cannot be deleted** by any user (no delete policy) — verified and recorded as the
  implemented behavior, not a gap to "fix".
- Aggregate assertions use **deltas** (shared QA provider accounts) rather than absolute values.

## 16. Remaining Reviews Gaps

- UI review submission/edit flow, star widgets, and public review display (web/native).
- Review moderation UX (admin panel hide/unhide is covered at the DB layer only).
- Review notification delivery to the provider (`tg_notify_review` creates a notification —
  in-app creation is covered by the Phase 1B notification path; **push delivery** is not).
- The 24-hour edit-window **expiry** boundary.
- Dimension-rating averages in the breakdown (present; only overall count/average asserted).

## 17. Pilot-Readiness Impact

The reviews/ratings domain gains **connected DB/RLS certification** for a limited internal
pilot: eligibility, authorization, integrity, one-per-booking, and aggregation are proven.
UI/moderation/public-display/native review surfaces remain **uncertified** and are required for
external pilot / public launch. No public-display or moderation claim is made.

## 18. Recommended Phase 2D Scope

Per the Phase 2A sequence, **Phase 2D — Chat / messaging (connected)**: participant message
send/read, non-participant denial, cross-booking isolation, and the message→notification path
(`booking_messages` + `tg_notify_chat_message`); realtime delivery explicitly excluded.
(Provider-location authorization follows as 2E.)

## 19. Final Status

Connected certification **78/78** (reviews & ratings added), release gate green, **0 residual**,
provider aggregates restored. Connected DB/RLS review behavior is certified; **UI, moderation,
push, public display, and native review flows are not**. No migration or feature was introduced,
and **Full Platform Certification is not claimed**.
