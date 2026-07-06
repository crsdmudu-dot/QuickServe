# Slice 33 — Provider Experience & Quality Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give providers transparency + coaching (a quality dashboard, completeness checklist, derived achievements, code of conduct) and admins a record-only quality/coaching surface — with no dispatch/booking/payout/workflow change.

**Architecture:** Migration 0028 adds 2 additive tables (`provider_quality_actions` with a `provider_visible` privacy gate; `provider_conduct_acceptances`) + 2 SECURITY DEFINER RPCs. Provider-side reads reuse existing rating-breakdown/profile/reviews data; achievements + completeness are pure derivations (no writes). Admin-side reuses Operations reads (flags summary) + records quality actions. New provider screens are additive pushed routes; the admin page mounts under `(admin-web)`.

**Tech Stack:** Supabase (one additive migration + RPCs + RLS), Expo Router (provider app + `(admin-web)`), TypeScript, Jest + RNTL.

**Spec:** `docs/superpowers/specs/2026-07-06-slice-33-provider-experience-quality-design.md`

## Global Constraints (bind every task)

- **Quality actions are record-only** — recording one has NO side effect (no suspension, no dispatch/ranking/payout effect). Admin can read/create ALL; **a provider can read ONLY their own rows where `provider_visible = true`**; customers/public cannot read any.
- **Provider dashboard/libs MUST NOT import or query** `support_cases`, `internal_notes`, `review_private_feedback`, `account_flags`, or any private Operations data. Provider surfaces read only: own profile, own rating breakdown/reviews, own `provider_visible` quality actions, own conduct acceptance, derived achievements. Account status shown to providers = `approval_status` only.
- **Achievements are computed/derived + display-only** (no table, no writes, no triggers).
- **No** dispatch / booking / provider-request booking / ranking / payout / payment / auth / notification / analytics change. **No** Operations Portal workflow change (admin side reuses Operations READS only). No AI scoring/coaching. Everything additive.
- Migration file is `supabase/migrations/0028_provider_quality.sql` (next after 0027). Reuse patterns: `is_admin()` + owner (`= auth.uid()`) RLS; SECURITY DEFINER `language plpgsql set search_path = public` RPCs (Operations 0026 idiom); `get_provider_rating_breakdown` (0022); `getProviderProfile`/`updateMyProviderProfile` (providers.ts); `getProviderReviews` (reviews.ts); admin screens like `providers/[id].tsx`; lib idioms (reads → `[]`/null, mutations → `{ ok, error? }`).
- **Gate every task:** `npm test` green, `npx tsc --noEmit` clean, `npx expo export --platform web` + `--platform android` succeed.

---

## File Structure

**Create**
- `supabase/migrations/0028_provider_quality.sql` — 2 tables + RLS + 2 RPCs.
- `src/constants/provider-quality.ts` (+ test) — action types, achievements, tag partition, completeness items, conduct content/version.
- `src/lib/provider-completeness.ts`, `src/lib/provider-achievements.ts` (pure, + tests).
- `src/lib/provider-quality.ts` (provider self), `src/lib/provider-quality-admin.ts` (admin) (+ tests).
- `src/components/provider/*` and/or `src/components/admin-web/*` — `quality-action-badge`, `achievement-grid`, `profile-completeness-card`, `strength-improvement-tags`, `rating-breakdown-card`, `conduct-acceptance-card`, `record-quality-action-form` (admin) (+ tests).
- `src/app/provider/quality.tsx`, `src/app/provider/code-of-conduct.tsx` (+ screen tests).
- `src/app/(admin-web)/provider-quality/[id].tsx` (+ screen test).
- `docs/pilot/provider-quality.md` — verification doc.

**Modify (additive)**
- `src/app/provider/(tabs)/profile.tsx` — add entry links to the Quality Dashboard + Code of Conduct.
- `src/app/(admin-web)/providers/[id].tsx` — add a "Provider Quality" link (→ `provider-quality/[id]`).
- (Optional) `src/components/admin-web/admin-sidebar.tsx` — no new top-level entry needed if reached from providers/[id]; skip unless useful.

**Reuse (do not change behavior):** `get_provider_rating_breakdown`, `getProviderProfile`/`updateMyProviderProfile`, `getProviderReviews`, the Operations `account_flags` read (admin flags summary only), UI primitives.

---

## Task Order (dependency-ordered)

1. **T1** — Migration 0028: 2 tables + RLS (`provider_visible` privacy) + 2 RPCs + schema/RLS tests.
2. **T2** — `constants/provider-quality.ts` + pure `provider-completeness.ts` + `provider-achievements.ts` + tests.
3. **T3** — `lib/provider-quality.ts` (provider self) + `lib/provider-quality-admin.ts` (admin) + tests.
4. **T4** — Components (badges, achievement grid, completeness card, tags, breakdown card, conduct card, admin record-action form) + tests.
5. **T5** — Screens (provider quality dashboard + code of conduct + admin provider-quality page) + entry points + tests.
6. **T6** — Privacy/no-exposure verification doc + isolation + final gate.

Each task ends green (`npm test` / `tsc` / both exports).

---

### Task 1: Migration 0028 — tables + provider_visible RLS + RPCs

**Files:** Create `supabase/migrations/0028_provider_quality.sql`; Test `src/__tests__/provider-quality-schema.test.ts`

**Build (SQL):**
- `provider_quality_actions` per spec §3.1: columns + `action_type` check (6 values) + `provider_visible boolean not null default false` + `created_by` + index `(provider_id, created_at desc)`. RLS:
  - `pqa_admin_select` `for select using (public.is_admin())`
  - `pqa_admin_insert` `for insert with check (public.is_admin())`
  - `pqa_provider_select` `for select using (provider_id = auth.uid() and provider_visible = true)`
  - **NO update/delete policy** (append-only). **NO customer/public policy.**
- `provider_conduct_acceptances` per spec §3.2: columns + `unique (provider_id, version)` + index. RLS:
  - `pca_owner_insert` `for insert with check (provider_id = auth.uid())`
  - `pca_owner_select` `for select using (provider_id = auth.uid())`
  - `pca_admin_select` `for select using (public.is_admin())`
  - **NO update/delete.**
- `enable row level security` on both.
- **RPCs** (SECURITY DEFINER, `language plpgsql set search_path = public`):
  - `record_provider_quality_action(p_provider_id uuid, p_action_type text, p_note text, p_provider_visible boolean) returns uuid` — first line `if not public.is_admin() then raise exception 'not authorized'; end if;`; insert with `created_by = auth.uid()`; return id. NO side effects.
  - `accept_provider_conduct(p_version text) returns void` — insert `(provider_id = auth.uid(), version = p_version)` `on conflict (provider_id, version) do nothing`.
- SQL comments: "record-only, no enforcement"; "provider_visible gate — providers never read false rows"; "additive; no existing object altered".

**Test (`provider-quality-schema.test.ts`, static fs-read):** both tables + RLS enabled; `provider_quality_actions` has the 3 policies (admin select/insert + provider select with `provider_visible = true`) and NO update/delete/customer policy; `provider_conduct_acceptances` owner insert/select + admin select, unique(provider,version), no update/delete; both RPCs `security definer` + `set search_path = public`, `record_provider_quality_action` contains the `is_admin()` guard + `created_by`/`auth.uid()`, `accept_provider_conduct` uses `auth.uid()` + `on conflict ... do nothing`; the 6 action_type values present; additive (no `alter table public.profiles`/drop of existing objects).

**Steps:** SQL → static test → `npm test` → `tsc` → both exports → commit `feat: slice33 migration 0028 provider quality tables + RLS + RPCs`.

---

### Task 2: Constants + pure completeness + achievements

**Files:** Create `src/constants/provider-quality.ts`, `src/lib/provider-completeness.ts`, `src/lib/provider-achievements.ts`; Tests alongside

**Build:**
- `constants/provider-quality.ts`:
  - `QUALITY_ACTION_TYPES: { id: QualityActionType; label; color }[]` (the 6: coaching_needed/coaching_completed/warning_given/improvement_observed/temporarily_paused_recommended/no_action) + `QualityActionType` union.
  - `STRENGTH_TAGS` = `['on_time','friendly','clean_work','good_communication','fair_price']`; `IMPROVEMENT_TAGS` = `['late','messy','poor_communication','overpriced']` (partition the 9-tag allowlist; `partitionTags(tags)` helper → `{ strengths, improvements }`).
  - `ACHIEVEMENTS: { key; label; icon; kind: 'jobs'|'verified'|'rating'|'completeness'|'feedback'; threshold? }[]` — first_job(1), jobs_10/50/100, verified_provider, rating_4_8, profile_complete, five_star_streak, excellent_feedback. Types exported.
  - `PROFILE_COMPLETENESS_ITEMS: { key; label; futureReady?: boolean }[]` — photo, bio, experience, service categories (skills), contact details, availability; + future-ready: government_verification, payment_details.
  - `CONDUCT_VERSION = 'v1'`; `CODE_OF_CONDUCT: { heading; body }[]` (the 9 sections: professional behaviour, communication, arrival, work quality, clean-up, customer respect, safety, evidence/photo, dispute expectations).
- `lib/provider-completeness.ts` — pure `computeProfileCompleteness(profile): { percent: number; items: { key; label; done; futureReady }[]; remaining: string[] }`. Active items count toward %, future-ready items shown but excluded from %. Map each item to a profile field (photo→profile_photo_url, bio→bio, experience→years_experience, categories→skills.length>0, contact→(phone/contact field present), availability→availability_status set).
- `lib/provider-achievements.ts` — pure `deriveAchievements(input: { profile; breakdown?; recentReviews? }): { key; label; icon; earned: boolean; progress?: { current; target } }[]`. jobs_* from `completed_jobs_count`; verified from `is_verified`; rating_4_8 from `average_rating >= 4.8` (with a min-reviews guard); profile_complete from completeness===100; five_star_streak/excellent_feedback from recentReviews/breakdown when present else `earned:false` (future-ready, never fabricated). Display-only.

**Tests:** completeness each item + % + remaining + future-ready excluded; `deriveAchievements` each milestone earned/threshold/progress + future-ready-when-absent; `partitionTags`; constants shape (6 action types, tag partition covers the 9 allowlist).

**Steps:** TDD → `npm test` → `tsc` → both exports → commit `feat: slice33 provider quality constants + completeness + achievements`.

---

### Task 3: Provider self lib + admin lib

**Files:** Create `src/lib/provider-quality.ts`, `src/lib/provider-quality-admin.ts`; Tests alongside

**Build:**
- `provider-quality.ts` (PROVIDER SELF — NEVER queries support_cases/internal_notes/account_flags/review_private_feedback):
  - `getMyVisibleQualityActions(): Promise<QualityAction[]>` — `supabase.from('provider_quality_actions').select('*')` (RLS returns only own `provider_visible=true` rows) `.order('created_at', desc)`; `[]` on error.
  - `getMyConductAcceptance(version): Promise<{ accepted: boolean; accepted_at?: string }>` — select from `provider_conduct_acceptances` for the version (RLS owner).
  - `acceptConduct(version): Promise<{ ok; error? }>` — `supabase.rpc('accept_provider_conduct', { p_version: version })`.
  - `getMyQualityDashboard(): Promise<QualityDashboard>` — compose: own profile (`getProviderProfile(uid)` via `auth.getUser`), breakdown (`get_provider_rating_breakdown` for uid), recent reviews (`getProviderReviews(uid)`), completeness (`computeProfileCompleteness`), achievements (`deriveAchievements`), visible actions, conduct status, `approval_status`. Null-safe.
- `provider-quality-admin.ts` (ADMIN):
  - `recordQualityAction(input: { providerId; actionType; note?; providerVisible }): Promise<{ ok; id?; error? }>` — rpc `record_provider_quality_action`.
  - `getProviderQualityActions(providerId): Promise<QualityAction[]>` — admin RLS select all rows for the provider.
  - `getProviderQualitySummary(providerId): Promise<AdminQualitySummary>` — compose breakdown + profile + completeness + actions + conduct acceptance + a **flags summary** from Operations `account_flags` (count + kinds only, admin read) — read-only reuse; no Operations workflow change.
- Export `QualityAction`/`QualityDashboard`/`AdminQualitySummary` types.

**Tests:** provider lib hits the right selects/rpc; `getMyVisibleQualityActions` selects `provider_quality_actions` only (assert it does NOT touch support_cases/internal_notes/account_flags/review_private_feedback — grep the module too in T6); admin `recordQualityAction` calls the rpc with the right params; `getProviderQualitySummary` composes (mock the reads incl account_flags count). Error paths.

**Steps:** TDD → `npm test` → `tsc` → both exports → commit `feat: slice33 provider quality libs (self + admin)`.

---

### Task 4: Components

**Files:** Create the components under `src/components/provider/` (provider-facing) + `src/components/admin-web/` (admin form); Tests alongside

**Build (presentational; consume T2/T3 libs; callbacks via props):**
- `quality-action-badge.tsx` `{ actionType }` — token-colored pill from `QUALITY_ACTION_TYPES`.
- `achievement-grid.tsx` / `achievement-badge.tsx` `{ achievements }` — earned vs locked + progress.
- `profile-completeness-card.tsx` `{ completeness }` — % bar + checklist (done/remaining; future-ready items shown muted).
- `strength-improvement-tags.tsx` `{ strengths; improvements }` — two tag groups.
- `rating-breakdown-card.tsx` `{ breakdown }` — overall + 5 categories + recommend % + review count (reuse existing breakdown UI if present).
- `conduct-acceptance-card.tsx` `{ accepted; acceptedAt?; onAccept }` — shows status + Accept button (fires `onAccept`).
- `record-quality-action-form.tsx` (admin) `{ providerId; onRecorded }` — `QUALITY_ACTION_TYPES` selector + note input + **provider_visible toggle** + submit → `recordQualityAction`.

**Tests:** each renders its props; completeness card shows % + remaining; achievement grid earned/locked; record-action form submits with providerVisible flag + fires onRecorded; conduct card Accept fires; badge labels/colors; strength/improvement groups.

**Steps:** TDD → `npm test` → `tsc` → both exports → commit `feat: slice33 provider quality components`.

---

### Task 5: Screens + entry points

**Files:** Create `src/app/provider/quality.tsx`, `src/app/provider/code-of-conduct.tsx`, `src/app/(admin-web)/provider-quality/[id].tsx`; Modify `src/app/provider/(tabs)/profile.tsx`, `src/app/(admin-web)/providers/[id].tsx`; Tests in `src/__tests__/`

**Build:**
- `provider/quality.tsx` — `getMyQualityDashboard()` (loading/empty states). **Profile Health** (`ProfileCompletenessCard`, verification status, `AchievementGrid`) · **Service Quality** (`RatingBreakdownCard`, total reviews, completed jobs, would-recommend %, `StrengthImprovementTags`, recent reviews, recent completed jobs) · **Account** (`approval_status` only; coaching recommendations + `QualityActionBadge` list from **visible** actions; conduct-acceptance status + link). NEVER render ops/internal/private data.
- `provider/code-of-conduct.tsx` — render `CODE_OF_CONDUCT` sections + `ConductAcceptanceCard` (status + Accept → `acceptConduct(CONDUCT_VERSION)`).
- `(admin-web)/provider-quality/[id].tsx` — `useLocalSearchParams<{id}>`, `getProviderQualitySummary(id)`: provider summary, quality history (`RatingBreakdownCard` + recent reviews), coaching history + `RecordQualityActionForm` + quality-actions list, **flags summary** (count/kind from account_flags), improvement notes, `ProfileCompletenessCard`, conduct acceptance. `PageMeta`.
- `provider/(tabs)/profile.tsx` — add links: "Quality Dashboard" → `/provider/quality`, "Code of Conduct" → `/provider/code-of-conduct` (additive; keep the existing editor working).
- `(admin-web)/providers/[id].tsx` — add a "Provider Quality" link → `/(admin-web)/provider-quality/{id}` (additive, near the existing Operations panels).

**Tests:** provider dashboard renders the 3 sections from mocked lib + shows ONLY visible actions (+ a test that the dashboard does not render/query internal data); code-of-conduct accept records; admin page records an action (form → recordQualityAction) + lists actions + flags summary; entry links present on provider profile + admin providers/[id]. Keep existing provider/admin tests green. Run `expo export --platform android` first to regen route types for the new routes.

**Steps:** `expo export --platform android` → TDD screens → `npm test` → `tsc` → `expo export --platform web` → commit `feat: slice33 provider quality screens + code of conduct + admin page`.

---

### Task 6: Privacy/no-exposure verification + isolation + final gate (FINAL)

**Files:** Create `docs/pilot/provider-quality.md`

- **Privacy / no-exposure proof:** grep the provider surfaces (`src/lib/provider-quality.ts`, `src/lib/provider-completeness.ts`, `src/lib/provider-achievements.ts`, `src/app/provider/quality.tsx`, `code-of-conduct.tsx`, provider components) → confirm ZERO references to `support_cases`, `internal_notes`, `review_private_feedback`, `account_flags`, or Operations private tables. Document the grep. Confirm the provider RLS on `provider_quality_actions` (`provider_visible = true`) is the hard gate + the `flags summary` is ADMIN-only.
- **as-role RLS spot-audit (documented):** a provider reads only own `provider_visible=true` quality actions (never `false`, never another provider's); a customer reads none; admin reads all + records via the RPC (non-admin rejected); conduct acceptance owner-only + admin-read. SQL + expected results.
- **Record-only proof:** `record_provider_quality_action` has no side effects (no update to profiles/approval_status/dispatch/payout); recording never suspends. Cite.
- **Isolation:** `git diff <base>..HEAD --name-only` — changes only under `supabase/migrations/0028*`, `src/constants/provider-quality*`, `src/lib/provider-{quality,quality-admin,completeness,achievements}*`, provider/admin components, `src/app/provider/{quality,code-of-conduct}.tsx`, the additive `provider/(tabs)/profile.tsx` + `(admin-web)/providers/[id].tsx` + new `(admin-web)/provider-quality/[id].tsx`, docs, tests. Prove NO change to dispatch/booking/payout/payment/auth/notification/analytics/Operations-workflow/customer files; NO migration other than 0028; NO existing-table/policy alteration.
- **Final gate:** `npm test` green, `tsc` clean (run `expo export --platform android` before tsc to regen route types), `expo export` web + android green, `git status` clean.
- Commit `test: slice33 provider quality privacy + verification doc`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-33-provider-quality`. Abandon = `git checkout main` + delete branch.
- **Per-task revert:** independent commits — `git revert <commit>` rolls back one. Reverting T5/T4 removes UI (tables/libs harmless if unused).
- **DB rollback:** migration 0028 is purely additive (2 tables + 2 RPCs; no existing-table/policy/data change). Undo = a follow-up `drop function record_provider_quality_action, accept_provider_conduct; drop table provider_quality_actions, provider_conduct_acceptances cascade;` — no data migration to reverse; existing data untouched.
- **No dispatch/booking/payout/workflow involvement** — rollback confined to the additive provider-quality layer; existing provider/admin/Operations behavior untouched.

---

## Self-Review

- **Requirement coverage:** migration 0028 (T1) · provider_quality_actions + provider_conduct_acceptances tables + provider_visible privacy model (T1) · record_provider_quality_action + accept_provider_conduct RPCs (T1) · quality-actions constants (T2) · completeness helpers (T2) · achievements helpers (T2) · provider quality dashboard (T5) · code of conduct page (T5) · admin provider quality page (T5) · provider profile entry point + admin providers/[id] entry point (T5) · quality-action form (T4) · conduct-acceptance UI (T4/T5) · privacy verification + no-exposure verification (T6) · rollback (this section). Every "Include" item mapped.
- **Constraint coverage:** quality actions record-only (T1 RPC no side effect, Global) · provider reads only own provider_visible actions (T1 RLS) · admin read/create all (T1 RLS+RPC) · customers cannot read (T1 RLS no customer policy) · provider dashboard never queries support_cases/internal_notes/review_private_feedback/account_flags (Global + T6 grep proof) · achievements computed/display-only (T2) · no dispatch/booking/provider-request/ranking/payout/payment/auth/notification/analytics/Operations-workflow change (T6 isolation) · no AI (absent).
- **Placeholder scan:** none (future-ready achievements/completeness items intentional).
- **Name consistency:** table names + RPC names (`record_provider_quality_action`/`accept_provider_conduct`) identical T1(SQL)↔T3(rpc); `QualityActionType`/`QUALITY_ACTION_TYPES`/`ACHIEVEMENTS`/`STRENGTH_TAGS`/`IMPROVEMENT_TAGS`/`CONDUCT_VERSION`/`PROFILE_COMPLETENESS_ITEMS` consistent T2↔T3↔T4↔T5; lib fn names (`getMyQualityDashboard`/`getMyVisibleQualityActions`/`acceptConduct`/`recordQualityAction`/`getProviderQualitySummary`/`computeProfileCompleteness`/`deriveAchievements`) consistent T3↔T4↔T5; component filenames T4↔T5; routes `provider/quality`, `provider/code-of-conduct`, `(admin-web)/provider-quality/[id]` consistent T5.
