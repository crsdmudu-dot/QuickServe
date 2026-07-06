# Slice 33 — Provider Experience & Quality Controls (Design Spec)

**Date:** 2026-07-06
**Status:** Design → (user review, then implementation plan)
**Builds on (reuses):** Ratings 2.0 (`get_provider_rating_breakdown()` — overall_avg/review_count/recommend_pct/5 category avgs/top_tags, display-only, migration 0022; the 9-tag allowlist), provider profile fields on `profiles` (`profile_photo_url`, `bio`, `years_experience`, `skills[]`, `is_verified`, `completed_jobs_count`, `average_rating`, `review_count`, `availability_status`, `approval_status`), `src/lib/providers.ts` (`getProviderProfile`/`updateMyProviderProfile`), reviews reads, the provider app (`src/app/provider/*`), the Operations Portal (admin-only, Slice 31) for the ADMIN side. Nothing in dispatch/booking/payout/payment/auth/notifications/analytics is touched.

## 1. Goal & Decisions

Give providers **transparency + coaching** into how they're performing and how to improve, and give admins a **record-only** quality/coaching surface — **without** changing dispatch, payouts, booking, or any workflow. Transparency & quality, not enforcement.

**Confirmed decisions (brainstorm):**
- **Quality actions → a new `provider_quality_actions` table** (admin-recorded; `action_type` + `note` + a **`provider_visible`** boolean). Admin-only write; providers read only their OWN rows where `provider_visible = true`.
- **Achievements are computed/derived (NO table)** — display-only, from existing data (`completed_jobs_count`, `is_verified`, `average_rating`, the breakdown, profile completeness). No triggers/writes → zero workflow risk.
- **Code-of-conduct acceptance → a small `provider_conduct_acceptances` table** (provider_id, version, accepted_at). Owner writes/reads own; admin reads.

**Two new tables total. Everything additive.**

## 2. Scope & Constraints (hard rules)

**In scope:** a provider-only Quality Dashboard (profile health + service quality + account), a dynamic profile-completeness checklist, derived achievements, a static Code of Conduct page with optional acceptance, admin-only quality/coaching action recording, and an admin Provider Quality page.

**Out of scope / MUST NOT change (additive only):**
- No dispatch / booking / provider-request booking / ranking / payout / payment / auth / notification / analytics change. No change to Operations Portal workflow or customer workflow. No AI scoring/coaching/moderation. No auto-suspension, auto-rewards, gamification rewards, scheduling, pricing, bidding, certifications, training videos.
- **Quality actions are informational/record-only** — recording one does nothing automatic (no suspension, no dispatch/ranking effect).
- **Providers MUST NOT see** Operations Portal notes, internal support notes, private customer reports, internal investigations, `review_private_feedback`, `account_flags`, `support_cases`, or `provider_visible = false` quality actions. The provider dashboard reads only: own profile, own rating breakdown/reviews, own `provider_visible` quality actions, own conduct acceptance, derived achievements.

## 3. Data model — migration `0028_provider_quality.sql` (2 additive tables)

### 3.1 `provider_quality_actions` (admin-recorded coaching/quality; record-only, append-only)
- `id uuid pk default gen_random_uuid()`
- `provider_id uuid not null references profiles(id) on delete cascade`
- `action_type text not null check (in 'coaching_needed','coaching_completed','warning_given','improvement_observed','temporarily_paused_recommended','no_action')`
- `note text`
- `provider_visible boolean not null default false`
- `created_by uuid not null references profiles(id)` (the admin)
- `created_at timestamptz not null default now()`
- Index `(provider_id, created_at desc)`.
- **RLS:** `_admin_select`/`_admin_insert` using `public.is_admin()`; `_provider_select` using `provider_id = auth.uid() AND provider_visible = true`. **NO update/delete policy** (immutable/append-only). The provider RLS row filter is the hard visibility gate — a provider can NEVER read a `provider_visible=false` row.

### 3.2 `provider_conduct_acceptances` (optional acceptance record)
- `id uuid pk default gen_random_uuid()`
- `provider_id uuid not null references profiles(id) on delete cascade`
- `version text not null`
- `accepted_at timestamptz not null default now()`
- `unique (provider_id, version)`; index `(provider_id)`.
- **RLS:** `_owner_insert`/`_owner_select` using `provider_id = auth.uid()`; `_admin_select` using `public.is_admin()`. **NO update/delete.** Owner records acceptance; admin can view it.

## 4. RPCs (additive; SECURITY DEFINER, `set search_path = public`)

- `record_provider_quality_action(p_provider_id uuid, p_action_type text, p_note text, p_provider_visible boolean) returns uuid` — **starts with `if not public.is_admin() then raise ...`**; inserts with `created_by = auth.uid()`. Record-only — no side effects (no suspension/dispatch/ranking).
- `accept_provider_conduct(p_version text) returns void` — provider self; insert `(provider_id = auth.uid(), version = p_version)` `on conflict (provider_id, version) do nothing` (idempotent).
- (Reads are direct RLS-guarded selects + the existing `get_provider_rating_breakdown`. No new read RPC needed unless an admin cross-provider read requires SECURITY DEFINER — if so, add `get_provider_quality_summary(p_provider_id)` admin-guarded returning curated summary; else compose client-side from RLS reads.)

## 5. Client libs & constants

- `src/constants/provider-quality.ts` — `QUALITY_ACTION_TYPES` (the 6, labels/colors), `ACHIEVEMENTS` (keys/labels/icons/thresholds), `STRENGTH_TAGS` vs `IMPROVEMENT_TAGS` (partition the 9-tag allowlist: on_time/friendly/clean_work/good_communication/fair_price = strengths; late/messy/poor_communication/overpriced = improvements), `PROFILE_COMPLETENESS_ITEMS` (active + future-ready), `CONDUCT_VERSION`, `CODE_OF_CONDUCT` content sections.
- `src/lib/provider-completeness.ts` — pure `computeProfileCompleteness(profile)` → `{ percent, items: {key,label,done}[], remaining }` (future-ready items flagged, excluded from %).
- `src/lib/provider-achievements.ts` — pure `deriveAchievements(profile, breakdown, recentReviews?)` → `{ key, label, icon, earned, progress? }[]` (display-only; five-star-streak/excellent-feedback derived from breakdown/recent reviews, future-ready when data absent).
- `src/lib/provider-quality.ts` — provider self: `getMyQualityDashboard()` (compose profile + breakdown + completeness + achievements + visible actions + conduct status), `getMyVisibleQualityActions()`, `getMyConductAcceptance()`, `acceptConduct(version)`. Reads null-safe; the provider surface NEVER queries support_cases/internal_notes/account_flags/review_private_feedback.
- `src/lib/provider-quality-admin.ts` — admin: `recordQualityAction(...)` (rpc), `getProviderQualityActions(providerId)`, `getProviderQualitySummary(providerId)` (compose breakdown + profile + completeness + actions + conduct acceptance + a flags SUMMARY from the existing Operations `account_flags` — count/kind only, admin context). Reuses Operations reads on the admin side only.

## 6. Screens

### Provider (customer/provider app; additive pushed routes — NativeTabs unchanged)
- **`src/app/provider/quality.tsx` — Provider Quality Dashboard** (linked from the provider home/profile):
  - **Profile Health:** completeness % + remaining checklist, verification status, achievement progress (derived).
  - **Service Quality:** overall rating, Ratings-2.0 breakdown (5 categories), total reviews, completed jobs, would-recommend %, **strength tags** / **improvement areas** (partitioned top_tags), recent customer reviews, recent completed jobs.
  - **Account:** account status (`approval_status` only), coaching recommendations + recent quality actions (**provider_visible only**), conduct-acceptance status/link.
  - **Never renders** ops/internal/private data.
- **`src/app/provider/code-of-conduct.tsx` — Code of Conduct** (static `CODE_OF_CONDUCT` sections: professional behaviour, communication, arrival, work quality, clean-up, customer respect, safety, evidence/photo, dispute expectations) + an **Accept** button → `acceptConduct(CONDUCT_VERSION)` (record-only, no enforcement) + acceptance status.

### Admin (web-admin)
- **`src/app/(admin-web)/provider-quality/[id].tsx` (+ list or entry from `providers/[id]`) — Provider Quality page:** provider summary, quality history (breakdown + recent reviews), coaching history + **record quality action** form (`QUALITY_ACTION_TYPES` + note + provider_visible toggle → `recordQualityAction`), quality actions list, **flags summary** (count/kind from Operations `account_flags`), improvement notes, profile completeness, conduct acceptance. Reuse Operations components/links where appropriate. Entry: a "Quality" link on `providers/[id]` and/or a sidebar entry.

## 7. Components (new/reused)

`QualityActionBadge`, `AchievementBadge`/`AchievementGrid`, `ProfileCompletenessCard` (bar + checklist), `RatingBreakdownCard` (reuse any existing breakdown UI), `StrengthImprovementTags`, `RecordQualityActionForm` (admin), `ConductAcceptanceCard`. Reuse existing review/profile/card primitives + Operations admin components on the admin side.

## 8. Testing

- **DB/RLS:** as-role — a provider reads ONLY their own `provider_visible=true` quality actions (never `false`, never another provider's); admin reads all + inserts via the RPC (is_admin-guarded; non-admin rejected). Conduct acceptance owner-only + admin-read; unique(provider,version) idempotent. No update/delete on either table.
- **Libs:** completeness computation (each item + % + remaining + future-ready excluded); `deriveAchievements` for each milestone (earned/threshold/progress, future-ready when data absent); quality-action/conduct helpers hit the right rpc/select; strength/improvement tag partition.
- **Screens/components:** provider dashboard renders health/quality/account from mocked libs and shows ONLY provider_visible actions; conduct accept records; admin page records an action + lists history + flags summary. **Privacy test:** the provider dashboard/libs never import or query support_cases/internal_notes/account_flags/review_private_feedback.
- Gate: `npm test` green, `npx tsc --noEmit` clean, `expo export` web + android green.

## 9. Guardrails restated (verification will prove)

Additive only (2 new tables + RPCs + display-only derivations); no dispatch/booking/provider-request/ranking/payout/payment/auth/notification/analytics change; no Operations Portal workflow change (reads only on admin side); no customer workflow change; quality actions record-only (no auto-suspension/rewards); no AI; providers never see ops/internal/private data (RLS `provider_visible` gate + provider surfaces never query internal tables); achievements derived/display-only.

## 10. Open assumptions

- "Provider Quality Dashboard" and "Provider Dashboard" in the brief are the same screen (`provider/quality.tsx`) — one dashboard with Profile Health / Service Quality / Account sections.
- Provider dashboard is a pushed route (NativeTabs unchanged); linked from provider home/profile.
- Account status shown to providers = `approval_status` only; `account_flags`/suspension records stay admin-only (Operations).
- Five-star-streak & excellent-feedback achievements derive from the breakdown/recent reviews; where a signal has no data they render as future-ready (not earned), never fabricated.
- Admin flags "summary" reuses Operations `account_flags` read-only (count/kind) — no Operations workflow change.
