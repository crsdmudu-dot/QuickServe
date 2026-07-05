# Slice 31 — Operations Portal: Operator & Verification Guide

Accurate as of migration `0026_operations_portal.sql` and commit range `77b1196..HEAD` on branch `feat/slice-31-operations`.

**Related docs:** [security-hardening.md](./security-hardening.md) · [web-admin-deploy.md](./web-admin-deploy.md) · [production-readiness.md](./production-readiness.md) · [wallet.md](./wallet.md) · [promotions.md](./promotions.md)

---

## 1. Overview

The Operations Portal is an **admin-only** support, dispute, notes, and account-safety layer added to the existing `(admin-web)` panel. It gives admin staff a structured way to:

- Open, triage, and resolve **support cases** and **disputes** against bookings, customers, providers, payments, and reviews.
- Write **immutable case notes** (internal or resolution) and view a full **audit timeline** of every case mutation.
- Attach **internal notes** to any booking, customer, provider, or payment — notes never visible to customers or providers.
- Record **account flags and suspension recommendations** against customer or provider accounts (record-only — no enforcement).

**Relation to the existing admin panel and mobile apps:**

- The Operations Portal is a new section inside the protected `(admin-web)` route group — same deployment, no new host.
- Mobile apps (`(customer)` and `(provider)` route groups) are **completely unaffected**. No customer or provider screen changed. No mobile-app file is in the Slice 31 diff.
- No payment, payout, dispatch, booking-workflow, or auth logic changed. The existing admin wallet-adjustment flow (`AdminWalletPanel`) is **reused by link** — not replaced.
- Suspension is **record-only**: recording a suspension flag does not block login, booking acceptance, dispatch, or payout. Enforcement is a future operational step outside this slice.

---

## 2. Data Model & RLS

Migration: `supabase/migrations/0026_operations_portal.sql` (lines 1–173).

### Tables

| Table | Mutable | Policies | Notes |
|---|---|---|---|
| `support_cases` | Yes (update allowed) | SELECT + INSERT + UPDATE, all `is_admin()` | Core entity; status/priority/assignment/outcome updated via RPCs |
| `support_case_notes` | **Immutable** | SELECT + INSERT only, both `is_admin()` | No UPDATE policy; append-only case notes |
| `support_case_events` | **Immutable** | SELECT + INSERT only, both `is_admin()` | No UPDATE policy; written exclusively by RPCs |
| `internal_notes` | **Immutable** | SELECT + INSERT only, both `is_admin()` | No UPDATE policy; polymorphic (booking/customer/provider/payment) |
| `account_flags` | Yes (lift = `active=false`) | SELECT + INSERT + UPDATE, all `is_admin()` | Append-only: never deleted; lift writes `lifted_by/at` via RPC |

**Total policies: 13.** Every policy on every table uses `public.is_admin()` as its entire predicate — no customer clause, no provider clause, no public access. There is **no `FOR DELETE` policy on any table**.

### Per-table policy detail

**`support_cases`** (migration lines 53–58):
```sql
create policy "support_cases_select" on public.support_cases
  for select using (public.is_admin());
create policy "support_cases_insert" on public.support_cases
  for insert with check (public.is_admin());
create policy "support_cases_update" on public.support_cases
  for update using (public.is_admin()) with check (public.is_admin());
```

**`support_case_notes`** (migration lines 88–91) — immutable, insert+select only:
```sql
create policy "support_case_notes_select" on public.support_case_notes
  for select using (public.is_admin());
create policy "support_case_notes_insert" on public.support_case_notes
  for insert with check (public.is_admin());
```

**`support_case_events`** (migration lines 111–114) — immutable, insert+select only:
```sql
create policy "support_case_events_select" on public.support_case_events
  for select using (public.is_admin());
create policy "support_case_events_insert" on public.support_case_events
  for insert with check (public.is_admin());
```

**`internal_notes`** (migration lines 134–137) — immutable, insert+select only:
```sql
create policy "internal_notes_select" on public.internal_notes
  for select using (public.is_admin());
create policy "internal_notes_insert" on public.internal_notes
  for insert with check (public.is_admin());
```

**`account_flags`** (migration lines 165–170) — append-only, lift via RPC:
```sql
create policy "account_flags_select" on public.account_flags
  for select using (public.is_admin());
create policy "account_flags_insert" on public.account_flags
  for insert with check (public.is_admin());
create policy "account_flags_update" on public.account_flags
  for update using (public.is_admin()) with check (public.is_admin());
```

### Enum constraints

All check constraints are defined in the migration and verified in `src/__tests__/operations-schema.test.ts`.

| Field | Allowed values |
|---|---|
| `case_type` | `support`, `dispute` |
| `status` | `open`, `in_review`, `waiting_on_customer`, `waiting_on_provider`, `resolved`, `closed` |
| `priority` | `low`, `medium`, `high`, `urgent` |
| `dispute_kind` | `booking_dispute`, `payment_dispute`, `customer_complaint`, `provider_complaint` |
| `resolution_outcome` | `no_action`, `refund_recommended`, `wallet_credit_recommended`, `provider_warning`, `provider_suspension_recommended`, `customer_warning` |
| `note_type` | `internal`, `resolution` |
| `subject_type` (internal_notes) | `booking`, `customer`, `provider`, `payment` |
| `subject_role` (account_flags) | `customer`, `provider` |
| `kind` (account_flags) | `flag`, `suspension` |

---

## 3. RPCs & Auditability

Migration: `supabase/migrations/0026_operations_portal.sql` (lines 179–423).

All 9 RPCs share the same security header:

```sql
returns <type> language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  ...
```

`SECURITY DEFINER` means the function runs as its definer (the DB owner), bypassing row-level security internally — but the `is_admin()` guard as the **first statement** means only admin callers can proceed. `set search_path = public` prevents search-path injection.

### RPC list

| # | Function | Event written | `updated_at` bump | Returns |
|---|---|---|---|---|
| 1 | `create_support_case(...)` | `created` | — (new row) | `uuid` |
| 2 | `update_support_case_status(p_case_id, p_status)` | `status_changed` (from/to) | Yes | `void` |
| 3 | `update_support_case_priority(p_case_id, p_priority)` | `priority_changed` (from/to) | Yes | `void` |
| 4 | `assign_support_case(p_case_id, p_assignee)` | `assigned` or `unassigned` | Yes | `void` |
| 5 | `set_dispute_outcome(p_case_id, p_outcome, p_resolution_notes)` | `outcome_set` | Yes | `void` |
| 6 | `add_support_case_note(p_case_id, p_body, p_note_type)` | `note_added` | Yes | `uuid` |
| 7 | `add_internal_note(p_subject_type, p_subject_id, p_body)` | — (not a case mutation) | — | `uuid` |
| 8 | `flag_account(p_subject_id, p_subject_role, p_kind, p_reason)` | — (not a case mutation) | — | `uuid` |
| 9 | `lift_account_flag(p_flag_id)` | — (not a case mutation) | — | `void` |

### Audit coverage

- **Every case mutation** (RPCs 1–6) inserts into `support_case_events` in the same transaction. There is no code path to mutate `support_cases` outside of these RPCs (RLS `UPDATE` policy is `is_admin()` but UI does not call raw `UPDATE` — the lib wrappers call `.rpc(...)`).
- **Event types recorded:** `created`, `status_changed`, `priority_changed`, `assigned`, `unassigned`, `outcome_set`, `note_added`.
- **`resolved_at`** is set to `now()` when status becomes `'resolved'`; it retains its value when status becomes `'closed'`; it is set to `null` for any other transition (migration lines 240–244).
- **`support_case_notes`**, **`support_case_events`**, and **`internal_notes`** have no UPDATE policy and no DELETE policy — rows are permanent once written.
- **`account_flags`** rows are never deleted. Lifting a flag sets `active=false`, `lifted_by=auth.uid()`, `lifted_at=now()` (migration lines 418–421).

### `add_support_case_note` transaction order (migration lines 349–360)

```
1. INSERT support_case_notes → v_id
2. UPDATE support_cases SET updated_at = now()
3. INSERT support_case_events (event_type = 'note_added')
4. RETURN v_id
```

All three writes are in one plpgsql block — no partial commits.

---

## 4. Safety Guarantees

These guarantees are enforced at the database level, not just by convention:

| Guarantee | Enforcement |
|---|---|
| Customers/providers cannot read any operations data | RLS: every table's SELECT policy is `is_admin()` only |
| Customers/providers cannot write any operations data | RLS: every table's INSERT (and UPDATE where present) is `is_admin()` only |
| No operations row can be deleted | No DELETE policy on any of the 5 tables |
| Case notes and events are permanent | No UPDATE or DELETE policy on `support_case_notes`, `support_case_events`, `internal_notes` |
| Account flags are permanent (lift = record, not delete) | No DELETE policy on `account_flags`; lift RPC sets `active=false` only |
| Suspension is record-only | `flag_account` writes only `account_flags`; no change to `profiles`, `approval_status`, dispatch, or login (migration line 387 comment; RPC body verified by grep) |
| No automated refund or wallet action | `set_dispute_outcome` records `resolution_outcome` only; no wallet RPC call; no payment row mutation other than outcome/notes fields (migration lines 325–332) |
| Wallet credit is recommendation + navigation only | `[id].tsx` shows wording + a `router.push` to the booking/customer that hosts `AdminWalletPanel`; no `adminAdjustWallet`, `applyWalletToPayment`, or `admin_wallet_adjust` call (verified by grep — see isolation section) |
| No user deletion | No delete path in any RPC, screen, or lib function |
| No payment/payout/dispatch/auth logic change | Confirmed by isolation diff (see section 6) |

**`flag_account` body verification** (migration lines 400–405): the function only inserts into `account_flags`. It does not reference `profiles`, `approval_status`, `bookings`, dispatch, or payout.

**`set_dispute_outcome` body verification** (migration lines 325–332): the function only updates `resolution_outcome`, `resolution_notes`, and `updated_at` on `support_cases`, then inserts into `support_case_events`. No wallet, payment, or refund function is called.

**`[id].tsx` wallet-credit block** (screen lines 522–542): the `walletRecommended` flag controls a UI banner with wording and a `Button` that calls `router.push(walletLink)`. The `walletLink` is a URL string pointing to `/(admin-web)/bookings/<id>` or `/(admin-web)/customers`. No wallet or payment function is invoked.

---

## 5. Access Control

### `public.is_admin()` function

Defined in migration `0024_promotions.sql` (Slice 27). Returns `true` iff:

```sql
select exists (
  select 1 from public.profiles
  where id = auth.uid() and role = 'admin'
)
```

No new auth role is introduced in Slice 31. The role enum (`customer | provider | admin`) is unchanged.

### As-role RLS spot-audit (operator verification procedure)

Run these queries in the Supabase SQL Editor using role-specific JWTs. The pattern follows the established methodology in [security-hardening.md](./security-hardening.md).

**Step 1 — Confirm policies exist and are admin-only**

```sql
select tablename, policyname, cmd
from pg_policies
where tablename in (
  'support_cases', 'support_case_notes', 'support_case_events',
  'internal_notes', 'account_flags'
)
order by tablename, policyname;
-- Expected: exactly 13 rows.
-- support_cases: 3 (insert/select/update)
-- support_case_notes: 2 (insert/select)
-- support_case_events: 2 (insert/select)
-- internal_notes: 2 (insert/select)
-- account_flags: 3 (insert/select/update)
-- NO cmd = 'DELETE' anywhere.
```

**Step 2 — Confirm no delete policy**

```sql
select tablename, policyname, cmd
from pg_policies
where tablename in (
  'support_cases', 'support_case_notes', 'support_case_events',
  'internal_notes', 'account_flags'
)
and cmd = 'DELETE';
-- Expected: 0 rows.
```

**Step 3 — Confirm immutable tables have no update policy**

```sql
select tablename, policyname, cmd
from pg_policies
where tablename in (
  'support_case_notes', 'support_case_events', 'internal_notes'
)
and cmd = 'UPDATE';
-- Expected: 0 rows.
```

**Step 4 — Customer gets zero rows on all 5 tables**

Run the following in a Supabase SQL editor session authenticated as a customer JWT (role = 'customer' in profiles):

```sql
-- As customer (is_admin() = false):
select count(*) from public.support_cases;
-- Expected: 0 (SELECT policy is_admin() = false → no row visible)

select count(*) from public.support_case_notes;
-- Expected: 0

select count(*) from public.support_case_events;
-- Expected: 0

select count(*) from public.internal_notes;
-- Expected: 0

select count(*) from public.account_flags;
-- Expected: 0
```

**Step 5 — Customer INSERT is rejected on all 5 tables**

```sql
-- As customer (is_admin() = false):
insert into public.support_cases (case_type, status, priority, subject, created_by)
values ('support', 'open', 'medium', 'test', auth.uid());
-- Expected: ERROR 42501 new row violates row-level security policy for table "support_cases"

insert into public.internal_notes (subject_type, subject_id, author_id, body)
values ('booking', gen_random_uuid(), auth.uid(), 'test');
-- Expected: ERROR 42501 new row violates row-level security policy for table "internal_notes"

insert into public.account_flags (subject_id, subject_role, kind, reason, created_by)
values (auth.uid(), 'customer', 'flag', 'test', auth.uid());
-- Expected: ERROR 42501 new row violates row-level security policy for table "account_flags"
```

**Step 6 — Provider gets zero rows (same as customer)**

Run Step 4 and Step 5 queries as a provider JWT (role = 'provider' in profiles). Expected results are identical — no provider clause exists in any policy.

**Step 7 — Admin can select and mutate via RPCs**

```sql
-- As admin (is_admin() = true):
select count(*) from public.support_cases;
-- Expected: N rows (all cases visible)

-- Create a test case via RPC:
select public.create_support_case(
  'support', 'medium', 'Smoke test', 'Operator verification',
  null, null, null, null, null, null
);
-- Expected: returns a UUID

-- Confirm event was written:
select event_type from public.support_case_events
where case_id = '<returned-uuid>'
order by created_at;
-- Expected: 1 row, event_type = 'created'

-- Confirm case is visible:
select subject, status from public.support_cases where id = '<returned-uuid>';
-- Expected: subject = 'Smoke test', status = 'open'
```

**Step 8 — Direct DELETE by admin is silently blocked**

```sql
-- Even as admin, no delete policy exists:
delete from public.support_cases where id = '<returned-uuid>';
-- Expected: 0 rows affected (no DELETE policy → Postgres silently denies)

delete from public.internal_notes where id = '<any-uuid>';
-- Expected: 0 rows affected
```

**Step 9 — Direct UPDATE on immutable tables is silently blocked**

```sql
-- No UPDATE policy on support_case_events:
update public.support_case_events set event_type = 'tampered' where id = '<any-uuid>';
-- Expected: 0 rows affected (no UPDATE policy)

-- No UPDATE policy on support_case_notes:
update public.support_case_notes set body = 'tampered' where id = '<any-uuid>';
-- Expected: 0 rows affected

-- No UPDATE policy on internal_notes:
update public.internal_notes set body = 'tampered' where id = '<any-uuid>';
-- Expected: 0 rows affected
```

### Internal notes privacy

`internal_notes` rows are never exposed to customers or providers. There is no customer or provider SELECT policy. The `InternalNotesPanel` component (used on booking, customer, provider, and payment contexts in the admin-web) is an `(admin-web)` component only — it is not imported by any customer or provider screen.

---

## 6. Isolation Proof

### `git diff main..HEAD --stat` (run 2026-07-05)

```
 src/__tests__/admin-web-bookings.test.tsx          |  34 ++
 src/__tests__/admin-web-customers-reviews.test.tsx |  21 +
 src/__tests__/admin-web-operations.test.tsx        | 310 +++++++++++
 src/__tests__/admin-web-payments.test.tsx          |  20 +
 src/__tests__/admin-web-providers.test.tsx         |  40 ++
 src/__tests__/operations-schema.test.ts            | 343 ++++++++++++
 src/app/(admin-web)/bookings/[id].tsx              |  18 +-
 src/app/(admin-web)/customers/index.tsx            |  18 +
 src/app/(admin-web)/operations/[id].tsx            | 565 +++++++++++++++++++
 src/app/(admin-web)/operations/index.tsx           | 185 +++++++
 src/app/(admin-web)/operations/new.tsx             |  68 +++
 src/app/(admin-web)/payments/index.tsx             |  17 +
 src/app/(admin-web)/providers/[id].tsx             |  22 +-
 src/components/admin-web/admin-sidebar.tsx         |   1 +
 src/components/admin-web/operations/account-flag-panel.test.tsx         | 168 ++++++
 src/components/admin-web/operations/account-flag-panel.tsx              | 264 +++++++++
 src/components/admin-web/operations/case-priority-badge.test.tsx        |  31 ++
 src/components/admin-web/operations/case-priority-badge.tsx             |  56 ++
 src/components/admin-web/operations/case-status-badge.test.tsx          |  41 ++
 src/components/admin-web/operations/case-status-badge.tsx               |  56 ++
 src/components/admin-web/operations/case-timeline.test.tsx              |  89 +++
 src/components/admin-web/operations/case-timeline.tsx                   | 176 ++++++
 src/components/admin-web/operations/create-case-form.test.tsx           | 164 ++++++
 src/components/admin-web/operations/create-case-form.tsx                | 294 ++++++++++
 src/components/admin-web/operations/evidence-links.test.tsx             | 121 +++++
 src/components/admin-web/operations/evidence-links.tsx                  | 133 +++++
 src/components/admin-web/operations/internal-notes-panel.test.tsx       | 127 +++++
 src/components/admin-web/operations/internal-notes-panel.tsx            | 160 ++++++
 src/constants/operations.test.ts                   | 181 +++++++
 src/constants/operations.ts                        | 214 ++++++++
 src/lib/operations.test.ts                         | 597 +++++++++++++++++++++
 src/lib/operations.ts                              | 412 ++++++++++++++
 supabase/migrations/0026_operations_portal.sql     | 423 +++++++++++++++
 tsconfig.json                                      |   2 +-
 34 files changed, 5368 insertions(+), 3 deletions(-)
```

### Files changed — all in scope

| File | Task | Purpose |
|---|---|---|
| `supabase/migrations/0026_operations_portal.sql` | T1+T2 | 5 tables + 13 RLS policies + 9 SECURITY DEFINER RPCs |
| `src/constants/operations.ts` | T3 | Unions, option arrays, row types |
| `src/constants/operations.test.ts` | T3 | 50 assertions on constants |
| `src/lib/operations.ts` | T3 | Client lib wrapping RPCs + list selects |
| `src/lib/operations.test.ts` | T3 | 28 lib assertions |
| `src/components/admin-web/operations/*.tsx` (7 components + tests) | T4 | Badge, timeline, panels, form, evidence — admin-web only |
| `src/app/(admin-web)/operations/index.tsx` | T5 | Case list + filter chips |
| `src/app/(admin-web)/operations/new.tsx` | T5 | Create case screen |
| `src/app/(admin-web)/operations/[id].tsx` | T5 | Case detail screen |
| `src/components/admin-web/admin-sidebar.tsx` | T5 | +1 nav entry (additive) |
| `src/app/(admin-web)/bookings/[id].tsx` | T5 | +`InternalNotesPanel` + Create-case link (additive) |
| `src/app/(admin-web)/providers/[id].tsx` | T5 | +`InternalNotesPanel` + `AccountFlagPanel` + Create-case link (additive) |
| `src/app/(admin-web)/customers/index.tsx` | T5 | +per-row Create-case button (additive) |
| `src/app/(admin-web)/payments/index.tsx` | T5 | +per-row Create-case button (additive) |
| `tsconfig.json` | T1 | +`"node"` to `types` array (for `fs`/`path` in static test) |
| `src/__tests__/operations-schema.test.ts` | T1+T2 | 92 static SQL assertions |
| `src/__tests__/admin-web-*.test.tsx` (5 files) | T5 | Extended existing test files + new test file |
| `docs/pilot/operations-portal.md` | T6 | This document |

### No mobile customer/provider screen changed

```
git diff main..HEAD --name-only | grep -E 'src/app/\(customer\)|src/app/\(provider\)|src/app/provider/|src/app/customer'
```

Result: **no output** (confirmed: zero mobile app surface files in the diff).

### Additive-only changes to existing admin surfaces

The four existing admin-web files that changed (`bookings/[id]`, `providers/[id]`, `customers/index`, `payments/index`) received only additive edits:

- `bookings/[id].tsx`: added `InternalNotesPanel` import + component render + a "Create support case" `Button`. No existing logic removed or altered. Router import extended (`useLocalSearchParams, router, type Href` was `useLocalSearchParams` only).
- `providers/[id].tsx`: added `InternalNotesPanel` + `AccountFlagPanel` imports + component renders + a Create-case button. No existing logic removed.
- `customers/index.tsx`: added `router` + `Button` imports + a "Create case" column to the `DataTable`. No query, filter, or data logic changed.
- `payments/index.tsx`: added `router` + `Href` import + a "Create case" column to the `DataTable`. No payment-fetch or payment-logic changed.

### No payment/wallet/dispatch/auth logic file changed

Files in scope for payment, wallet, dispatch, and auth (not changed):

- `supabase/migrations/0010_payments.sql` — **NOT in diff**
- `supabase/migrations/0023_wallet.sql` — **NOT in diff**
- `src/lib/wallet.ts` — **NOT in diff**
- `src/lib/payments.ts` — **NOT in diff**
- `src/auth/**` — **NOT in diff**
- `supabase/functions/mpesa-stk-push/**` — **NOT in diff**
- `supabase/functions/mpesa-callback/**` — **NOT in diff**
- Any dispatch / provider-assignment logic — **NOT in diff**

The grep for wallet/refund/payment function calls in `src/app/(admin-web)/operations/[id].tsx`:

```
grep -n 'adminAdjustWallet\|applyWalletToPayment\|admin_wallet_adjust\|refund' \
     src/app/(admin-web)/operations/[id].tsx
```

Result: only two matches — one is the file header comment explicitly stating "NO wallet/refund calls here" (line 9), and one is a conditional string in a UI banner (`refund_recommended` in display text, line 535). **No wallet or refund function is invoked.**

### No migration other than 0026

```
git diff main..HEAD --name-only | grep migrations
```

Result: `supabase/migrations/0026_operations_portal.sql` — only one migration file, the expected one.

### No existing table/policy/data altered

`0026_operations_portal.sql` contains only:
- `create table if not exists` (5 tables — new)
- `alter table ... enable row level security` (5 new tables — new)
- `create policy` (13 policies on 5 new tables — new)
- `create index if not exists` (11 indexes on new tables — new)
- `create or replace function public.<name>` (9 new functions — new)

No `alter table <existing-table>`, no `drop`, no `update` DML, no change to existing policies.

Isolation: **CLEAN**.

---

## 7. Deployment

### Prerequisites

Migration 0026 depends on the following tables existing (created in earlier slices):

| Dependency | Migration | Slice |
|---|---|---|
| `public.profiles` | `0001_profiles.sql` | Slice 1 |
| `public.bookings` | `0003_bookings.sql` | Slice 3 |
| `public.payments` | `0010_payments.sql` | Slice 10 |
| `public.reviews` | earlier slice | — |
| `public.is_admin()` function | `0024_promotions.sql` | Slice 27 |

Slice 27 (`0024_promotions.sql`) must be applied before 0026.

### Apply the migration

```bash
# Via Supabase CLI (recommended):
supabase db push

# Or via Supabase SQL Editor:
# Paste contents of supabase/migrations/0026_operations_portal.sql and run.
```

Migration is **purely additive**: 5 new tables, 9 new functions, no changes to existing tables or data. No backfill required. All existing data and behavior is unaffected.

### Post-deploy verification queries

```sql
-- 1. Confirm all 5 tables exist with RLS enabled:
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'support_cases', 'support_case_notes', 'support_case_events',
    'internal_notes', 'account_flags'
  )
order by relname;
-- Expected: 5 rows, all relrowsecurity = true

-- 2. Confirm exactly 13 policies, all is_admin():
select tablename, count(*) as policy_count
from pg_policies
where tablename in (
  'support_cases', 'support_case_notes', 'support_case_events',
  'internal_notes', 'account_flags'
)
group by tablename
order by tablename;
-- Expected: support_cases=3, support_case_notes=2, support_case_events=2,
--           internal_notes=2, account_flags=3 → total 13

-- 3. Confirm no delete policy:
select tablename, policyname from pg_policies
where tablename in (
  'support_cases', 'support_case_notes', 'support_case_events',
  'internal_notes', 'account_flags'
) and cmd = 'DELETE';
-- Expected: 0 rows

-- 4. Confirm all 9 RPCs exist:
select proname from pg_proc
where proname in (
  'create_support_case', 'update_support_case_status', 'update_support_case_priority',
  'assign_support_case', 'set_dispute_outcome', 'add_support_case_note',
  'add_internal_note', 'flag_account', 'lift_account_flag'
) and pronamespace = 'public'::regnamespace
order by proname;
-- Expected: 9 rows

-- 5. Smoke test — create a case as admin, confirm event written:
select public.create_support_case(
  'support', 'low', 'Deployment smoke test', 'Verify 0026 applied correctly',
  null, null, null, null, null, null
);
-- Expected: a UUID

-- Replace <uuid> with the returned value:
select event_type from public.support_case_events
where case_id = '<uuid>';
-- Expected: 1 row, event_type = 'created'

-- Cleanup smoke-test data:
-- (No DELETE policy — cannot delete. Mark closed via RPC.)
select public.update_support_case_status('<uuid>', 'closed');
```

### UI deployment

The Operations Portal ships inside the existing `(admin-web)` route group. No new build target, host, or deployment step is required beyond the standard web-admin deploy (see [web-admin-deploy.md](./web-admin-deploy.md)). The sidebar entry `Operations` routes to `/(admin-web)/operations`.

---

## 8. Rollback

### Pre-merge abandon

All Slice 31 work is on `feat/slice-31-operations`. To abandon before merging:

```bash
git checkout main
git branch -D feat/slice-31-operations
```

No DB change has been applied to production — safe, complete discard.

### Per-task git revert (post-merge, UI removal)

Each task was committed independently. Revert newest-first:

| Task | Commit range | Effect of revert |
|---|---|---|
| T6 (this doc) | `HEAD` | Removes verification doc only |
| T5 (screens + context links) | `bc36701..ff28783` | Removes Operations screens + sidebar entry + context links from existing surfaces |
| T4 (components) | `35646c4..bc36701` | Removes 7 Operations components (makes T5 non-functional) |
| T3 (lib + constants) | `a05f038..35646c4` | Removes client lib + constants (makes T4/T5 non-functional) |
| T2 (RPCs) | `ab8373d..a05f038` | Removes the 9 RPCs from migration text; tables remain harmless if unused |
| T1 (tables + RLS) | `77b1196..ab8373d` | Removes migration text; tables already applied to DB remain until DB rollback |

**Important:** reverting git commits does not reverse an already-applied migration. DB rollback must be done separately.

### DB rollback (after migration is applied)

Create a follow-up migration, e.g. `0027_rollback_operations.sql`:

```sql
-- Drop the 9 RPCs:
drop function if exists public.create_support_case(text,text,text,text,uuid,uuid,uuid,uuid,uuid,text);
drop function if exists public.update_support_case_status(uuid,text);
drop function if exists public.update_support_case_priority(uuid,text);
drop function if exists public.assign_support_case(uuid,uuid);
drop function if exists public.set_dispute_outcome(uuid,text,text);
drop function if exists public.add_support_case_note(uuid,text,text);
drop function if exists public.add_internal_note(text,uuid,text);
drop function if exists public.flag_account(uuid,text,text,text);
drop function if exists public.lift_account_flag(uuid);

-- Drop the 5 tables (cascade drops policies + indexes):
drop table if exists public.support_case_events cascade;
drop table if exists public.support_case_notes cascade;
drop table if exists public.account_flags cascade;
drop table if exists public.internal_notes cascade;
drop table if exists public.support_cases cascade;
```

**Safety notes:**
- No existing table is dropped (only the 5 new Slice 31 tables).
- `public.is_admin()` is defined in `0024_promotions.sql` and is **not dropped** here.
- `public.profiles`, `public.bookings`, `public.payments`, `public.reviews` are **not affected**.
- Any data written to operations tables before rollback is lost — this is expected (the tables are new and admin-only).

Reverting the UI (T5 revert) leaves the existing admin panel fully intact. The admin wallet-adjustment flow, booking management, provider management, customer management, and all mobile-app flows are unaffected.

---

## 9. Release Gate

| Check | Command | Result (2026-07-05) |
|---|---|---|
| Unit tests | `npm test` | PASS — 139 suites, 1434 tests, 0 failures |
| Type-check | `npx tsc --noEmit` | PASS — no errors |
| Web export | `npx expo export --platform web` | PASS — exported to `dist/` |
| Android export | `npx expo export --platform android` | PASS — exported to `dist/` |
| Clean working tree | `git status` | CLEAN — only `supabase/.temp/` untracked (ignorable) |
