# Slice 33 — Provider Experience & Quality Controls: Privacy & Verification Guide

Accurate as of migration `0028_provider_quality.sql` and commit range `f77e69d..c0d3bc2` on branch `feat/slice-33-provider-quality`.

**Related docs:** [operations-portal.md](./operations-portal.md) · [ratings-v2.md](./ratings-v2.md) · [security-hardening.md](./security-hardening.md) · [web-admin-deploy.md](./web-admin-deploy.md)

---

## 1. Overview

Slice 33 adds a **provider-transparency and admin record-only coaching layer** to QuickServe. It is entirely additive — no existing table, policy, function, or route is removed or altered; no enforcement, suspension, dispatch, payout, or payment logic changes.

**What is added:**

| Surface | Route | What it shows |
|---|---|---|
| Provider Quality Dashboard | `/provider/quality` | Profile completeness, achievements (computed), rating breakdown, feedback tags, recent reviews, completed jobs, coaching recommendations (own `provider_visible=true` actions only), approval\_status |
| Provider Code of Conduct | `/provider/code-of-conduct` | Static CoC text; accept button (record-only) |
| Admin Provider Quality page | `/(admin-web)/provider-quality/[id]` | Full quality picture for a provider: all quality actions, conduct acceptance, flags summary (read-only), record-quality-action form |
| Entry point — provider profile | `/provider/(tabs)/profile` | Added: "Quality Dashboard" and "Code of Conduct" buttons (additive) |
| Entry point — admin provider detail | `/(admin-web)/providers/[id]` | Added: "View provider quality" button (additive) |

**Guarantees:**

- Provider sees **only** their own `provider_visible=true` quality actions — never internal admin notes.
- Account status shown to providers = `approval_status` **only** — never `account_flags`, `support_cases`, `internal_notes`, or `review_private_feedback`.
- Achievements are **computed/display-only** — no writes, no table, no rewards, no ranking.
- Quality actions are **record-only** — no side effect on approval\_status, dispatch, payout, or login.
- Both tables are **append-only** — no UPDATE or DELETE policy exists.

---

## 2. Data Model & RLS

Migration: `supabase/migrations/0028_provider_quality.sql`

### Tables

| Table | Mutable | Policies | Notes |
|---|---|---|---|
| `provider_quality_actions` | **Immutable** (append-only) | 3 policies only — see below | Admin read/create; provider reads own `provider_visible=true` rows; no customer/public policy; no update/delete |
| `provider_conduct_acceptances` | **Immutable** (append-only) | 3 policies — see below | Owner insert/select; admin select; unique(provider\_id, version); no update/delete |

### provider\_quality\_actions RLS (migration lines 39–46)

```sql
-- Admin select — admin reads ALL rows (including provider_visible=false)
create policy "pqa_admin_select" on public.provider_quality_actions
  for select using (public.is_admin());

-- Admin insert — admin creates rows; RPC enforces this programmatically too
create policy "pqa_admin_insert" on public.provider_quality_actions
  for insert with check (public.is_admin());

-- Provider select — provider reads ONLY own rows AND provider_visible = true
-- This is the privacy gate: provider_visible=false rows are NEVER returned.
create policy "pqa_provider_select" on public.provider_quality_actions
  for select using (provider_id = auth.uid() and provider_visible = true);
```

**Access matrix:**

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Admin | ALL rows | Via RPC (is\_admin guard) | Not allowed | Not allowed |
| Provider | Own `provider_visible=true` only | Not allowed | Not allowed | Not allowed |
| Customer | None | Not allowed | Not allowed | Not allowed |
| Public (anon) | None | Not allowed | Not allowed | Not allowed |

### provider\_conduct\_acceptances RLS (migration lines 67–74)

```sql
create policy "pca_owner_insert" on public.provider_conduct_acceptances
  for insert with check (provider_id = auth.uid());

create policy "pca_owner_select" on public.provider_conduct_acceptances
  for select using (provider_id = auth.uid());

create policy "pca_admin_select" on public.provider_conduct_acceptances
  for select using (public.is_admin());
```

**Access matrix:**

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Admin | ALL rows | Not allowed | Not allowed | Not allowed |
| Provider (owner) | Own rows only | Own rows only | Not allowed | Not allowed |
| Other provider | None | Not allowed | Not allowed | Not allowed |
| Customer / anon | None | Not allowed | Not allowed | Not allowed |

### RPCs (migration lines 85–116)

Both functions are `SECURITY DEFINER set search_path = public` (same idiom as Slice 31 / 0026).

| RPC | Guard | Effect |
|---|---|---|
| `record_provider_quality_action(p_provider_id, p_action_type, p_note, p_provider_visible)` | `is_admin()` — raises `not authorized` if not admin | INSERT into `provider_quality_actions` only; no profile/approval\_status/dispatch/payout write |
| `accept_provider_conduct(p_version)` | `auth.uid()` (SECURITY DEFINER; idempotent) | INSERT into `provider_conduct_acceptances`; on conflict do nothing |

### As-role RLS spot-audit

The following SQL queries document the expected RLS behavior an operator can run directly against the DB to verify policies. Run each in the Supabase SQL editor with the corresponding role's JWT set.

```sql
-- 1. Provider reads own provider_visible=true rows only
-- Set role to provider A's JWT (auth.uid() = provider_A_id)
select id, provider_id, action_type, provider_visible
from provider_quality_actions;
-- Expected: only rows where provider_id = provider_A_id AND provider_visible = true
-- provider_visible=false rows for provider A are NOT returned.
-- Rows for provider B are NOT returned.

-- 2. Provider cannot read provider_visible=false rows even with explicit filter
-- Set role to provider A's JWT
select id from provider_quality_actions
where provider_id = '<provider_A_id>'
  and provider_visible = false;
-- Expected: 0 rows (RLS pqa_provider_select requires provider_visible = true)

-- 3. Provider cannot read another provider's rows
-- Set role to provider A's JWT
select id from provider_quality_actions
where provider_id = '<provider_B_id>';
-- Expected: 0 rows (RLS: provider_id must equal auth.uid())

-- 4. Customer reads nothing
-- Set role to any customer JWT
select count(*) from provider_quality_actions;
-- Expected: 0 (no customer/public SELECT policy on this table)

-- 5. Admin reads ALL rows (including provider_visible=false)
-- Set role to admin JWT (is_admin() = true)
select id, provider_id, provider_visible from provider_quality_actions;
-- Expected: all rows including provider_visible=false internal records

-- 6. Non-admin cannot call the record RPC directly
-- Set role to any non-admin JWT
select record_provider_quality_action(
  '<provider_id>', 'coaching_needed', 'test', false
);
-- Expected: ERROR — "not authorized"

-- 7. Provider conduct acceptance — owner-only select
-- Set role to provider A's JWT
select * from provider_conduct_acceptances;
-- Expected: only provider A's own rows

-- 8. Provider conduct acceptance — owner insert; idempotent
-- Set role to provider A's JWT
select accept_provider_conduct('v1');
-- First call: inserts row. Second call: on conflict do nothing (no error).

-- 9. Admin reads all conduct acceptances
-- Set role to admin JWT
select count(*) from provider_conduct_acceptances;
-- Expected: all rows from all providers
```

---

## 3. Provider Privacy / No-Exposure

The provider dashboard, libs, and components are **completely isolated** from Operations / internal admin data. This was verified by grep against all provider-facing source files.

### Grep 1 — No `@/lib/operations` import in provider surfaces

Command: `grep -r "@/lib/operations" src/lib/provider-quality.ts src/app/provider/quality.tsx src/app/provider/code-of-conduct.tsx src/components/provider/`

**Result:** Zero matches (imports absent). The files contain guard comments noting the exclusion; those comment lines are not imports.

- `src/lib/provider-quality.ts` — header comment: `// It has no operations-lib import and touches no private admin tables.`
- `src/app/provider/quality.tsx` — header comment: `// This file does NOT import @/lib/operations and does NOT reference ...`
- `src/app/provider/code-of-conduct.tsx` — no mention
- `src/components/provider/*.tsx` — guard comments in each component: `// NO import of @/lib/operations or any private admin tables.`

**Conclusion:** Zero actual imports of `@/lib/operations` in any provider-facing file.

The admin lib (`src/lib/provider-quality-admin.ts`) **does** import `getAccountFlags` from `@/lib/operations` for the read-only flags summary. This is correct and expected — it is an **admin-only** file, not exposed to providers. See Section 4 for the record-only guarantee.

### Grep 2 — No internal table references in provider surfaces

Command: `grep -r "support_cases\|internal_notes\|review_private_feedback\|account_flags" src/lib/provider-quality.ts src/app/provider/quality.tsx src/app/provider/code-of-conduct.tsx src/components/provider/`

**Result:** Zero matches (no queries or references). The only references are comment lines in `quality.tsx` that explicitly note these tables are excluded:
```
// reference support_cases, internal_notes, review_private_feedback, or
// account_flags.
```

**Conclusion:** Zero actual queries or data references to internal admin tables in any provider-facing file.

### Account status and actions — provider surface

- **Account status:** `src/lib/provider-quality.ts` line 171: `const accountStatus = profile?.approval_status ?? null;` — only `approval_status` from the provider's own profile row.
- **Quality actions:** `src/lib/provider-quality.ts` function `getMyVisibleQualityActions()` — simple `.select('*')` with no manual filter; RLS `pqa_provider_select` enforces `provider_id = auth.uid() AND provider_visible = true` at the DB level.
- **Rendered actions:** `src/app/provider/quality.tsx` — renders `dashboard.visibleActions` (the RLS-scoped result) and `dashboard.accountStatus` (approval\_status only).

The dashboard type definition (`QualityDashboard`) documents this explicitly:
```ts
/**
 * Provider's approval_status ONLY — never flags or Operations data.
 * Null when profile not found.
 */
accountStatus: 'pending' | 'approved' | 'rejected' | null;
```

---

## 4. Record-Only & Display-Only Guarantees

### Quality actions — record-only

The `record_provider_quality_action` RPC (migration lines 85–104) inserts one row into `provider_quality_actions`. It does not:
- Update `profiles.approval_status`
- Write to `account_flags` or create a suspension
- Modify dispatch queue or booking assignments
- Touch payouts, payments, wallet balance, or any financial record
- Send notifications or trigger any async event

The admin lib (`src/lib/provider-quality-admin.ts`) calls this RPC and returns `{ ok, id }`. No further mutations are made.

The admin form component (`src/components/admin-web/admin-record-quality-action-form.tsx`) displays the copy: _"Record-only — this does not suspend, pause, or change dispatch/payouts. Informational coaching record."_

### Flags summary — read-only

`getProviderFlagsSummary` in `src/lib/provider-quality-admin.ts` calls `getAccountFlags(providerId)` (a READ from the Operations lib) and aggregates the result into `{ total, active, byKind }`. No write RPC is called; `account_flags` is not mutated.

### Achievements — computed/display-only

`src/lib/provider-achievements.ts` header: `// PURE logic only — no DB calls, no network, no writes, no ranking, no rewards.`

- Function `deriveProviderAchievements({ profile, breakdown, recentReviews, completenessPercent })` takes passed-in data and returns an array of derived `ProviderAchievement` objects.
- No `provider_achievements` table exists: grep of `supabase/migrations/` for `provider_achievements` returns zero matches.
- Future-ready achievements (`five_star_streak`, `excellent_feedback`) are `earned: false` when the required signal is absent — never fabricated.

---

## 5. Isolation

### git diff summary

`git diff main..HEAD --stat` (33 files, 6009 insertions, 2 deletions):

| Category | Files |
|---|---|
| Migration | `supabase/migrations/0028_provider_quality.sql` (new) |
| Constants | `src/constants/provider-quality.ts` (new) |
| Lib — provider self | `src/lib/provider-quality.ts`, `provider-completeness.ts`, `provider-achievements.ts` (all new) |
| Lib — admin | `src/lib/provider-quality-admin.ts` (new) |
| Components — provider | 6 new files under `src/components/provider/` |
| Component — admin | `src/components/admin-web/admin-record-quality-action-form.tsx` (new) |
| Screens — new | `src/app/provider/quality.tsx`, `src/app/provider/code-of-conduct.tsx`, `src/app/(admin-web)/provider-quality/[id].tsx` (all new) |
| Entry points — additive | `src/app/provider/(tabs)/profile.tsx` (+14 lines: 2 buttons), `src/app/(admin-web)/providers/[id].tsx` (+12 lines: 1 button + header), `src/app/provider/_layout.tsx` (+4 lines: 2 Stack.Screen registrations) |
| Tests | `src/__tests__/provider-quality-schema.test.ts`, `src/__tests__/provider-quality-screens.test.tsx`, and per-module test files (all new) |

The 2 deletions are import additions to existing entry-point files (`profile.tsx` added `type Href` import; `_layout.tsx` updated comment line).

### Scope guarantees

The diff was verified against the following checks:

- **No dispatch/booking/payout/payment/auth/notification/analytics file changed:** `git diff main..HEAD --name-only | grep -E "dispatch|booking|payout|payment|auth|notification|analytics|app-tabs"` — **zero matches**.
- **Only migration 0028:** `git diff main..HEAD --name-only | grep migrations` — **one result only:** `supabase/migrations/0028_provider_quality.sql`.
- **NativeTabs unchanged:** `app-tabs.tsx` does not appear in the diff; confirmed by the grep above.
- **No existing table/policy altered:** The migration contains only `create table if not exists`, `create index if not exists`, `alter table ... enable row level security`, `create policy`, and `create or replace function` statements. No `alter table ... add column`, `drop`, or `alter policy` on existing tables.
- **No dispatch/assign/suspend/enforcement call in new code:** grep of `dispatch|assign|suspend|enforcement|payout` across `src/lib/provider-quality.ts` and `src/lib/provider-quality-admin.ts` — only comment lines referencing these terms as _excluded_ operations.
- **Operations Portal workflow unchanged:** The admin lib reads `getAccountFlags` (read-only). No Operations workflow RPC (`openSupportCase`, `recordAccountFlag`, `liftAccountFlag`, etc.) is called.

---

## 6. Rollback

### Pre-merge

If the branch has not been merged, abandon `feat/slice-33-provider-quality` and delete it. No production data is affected; no migration has run in production.

### Per-task code revert

Each task was committed atomically. To roll back individual tasks, use `git revert <commit-sha>` for the relevant task range (T1–T5 commits listed in `.superpowers/sdd/progress.md`). Reverting UI leaves all existing provider/admin/Operations behavior intact because no existing screen was modified — only new files added (plus small additive entry-point changes that can be manually reverted or deleted).

### DB rollback

The migration is additive (no data migration, no existing-table alteration). To roll back after the migration has run in production:

```sql
-- Drop RPCs first (they reference the tables)
drop function if exists public.record_provider_quality_action(uuid, text, text, boolean);
drop function if exists public.accept_provider_conduct(text);

-- Drop tables (cascade removes RLS policies + indexes automatically)
drop table if exists public.provider_quality_actions cascade;
drop table if exists public.provider_conduct_acceptances cascade;
```

**No data migration is needed to reverse:** the tables are new. Reverting the UI (or removing the branch) after running this SQL restores the app to its pre-Slice-33 state with no orphaned data.

---

## 7. Release Gate

| Check | Result |
|---|---|
| `npm test` | PASS — 171 suites, 2003 tests, 0 failures |
| `npx expo export --platform android` | PASS — bundle exported to `dist/` |
| `npx tsc --noEmit` | PASS — zero errors (run after android export for route types) |
| `npx expo export --platform web` | PASS — all routes rendered including `/(admin-web)/provider-quality/[id]` |
| `git status` | CLEAN — only untracked `supabase/.temp/` (expected) |
