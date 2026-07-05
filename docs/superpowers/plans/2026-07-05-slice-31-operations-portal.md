# Slice 31 — Operations Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only Operations Portal — support cases, disputes, internal notes, account safety flags, and a full audit trail — to the existing `(admin-web)` panel, changing no payment/payout/dispatch/auth/workflow logic.

**Architecture:** One migration (`0026`) adds 5 append-oriented tables (RLS `is_admin()`-only) + 9 SECURITY DEFINER RPCs (each `is_admin()`-guarded; each case mutation also writes an immutable audit event). A typed `operations.ts` lib wraps them; a new `operations/` route section + reusable components render the UI, reusing `admin-shell`/`data-table`/`usePaginatedList`. Disputes are `support_cases` with `case_type='dispute'` + a `resolution_outcome`.

**Tech Stack:** Supabase Postgres (migrations, RLS, plpgsql RPCs), Expo Router `(admin-web)` (react-native-web), TypeScript, Jest + RNTL.

**Spec:** `docs/superpowers/specs/2026-07-05-slice-31-operations-portal-design.md`

## Global Constraints (bind every task)

- **Admin-only via existing `public.is_admin()`** (`select exists(... profiles where id=auth.uid() and role='admin')`). NO new auth role; role enum stays `customer|provider|admin`.
- **Customers/providers/public MUST NOT read or write any operations data** — every table's `select/insert/update` requires `is_admin()`; **NO delete policy anywhere**; notes/events/internal_notes have **NO update policy** (immutable).
- **No payment/payout/dispatch/business-workflow change. No user deletion. No automated refunds** (wallet credit only via the EXISTING admin wallet-adjustment flow — this slice records a *recommendation* + deep-links). **Suspension is record-only** (no enforcement wired into login/booking/dispatch/payout). **No AI support.**
- **Fully auditable:** every case mutation writes a `support_case_events` row in the same transaction; notes/events/internal_notes insert-only; `account_flags` append-only (lift = `active=false` + `lifted_by/at`, never deleted).
- Migration file is `supabase/migrations/0026_operations_portal.sql` (next after 0025). Reuse the established patterns: `is_admin()` RLS policies (migration 0024), SECURITY DEFINER `language plpgsql ... set search_path = public` RPCs, lib helpers shaped like `src/lib/promotions.ts`, admin screens like `(admin-web)/bookings/{index,[id]}.tsx`, pagination via `usePaginatedList`/`.range`/`LoadMoreButton`.
- **Gate every task:** `npm test` green, `npx tsc --noEmit` clean, `npx expo export --platform web` + `--platform android` succeed.

---

## File Structure

**Create**
- `supabase/migrations/0026_operations_portal.sql` — 5 tables + RLS + 9 RPCs.
- `src/constants/operations.ts` — status/priority/case_type/dispute_kind/resolution_outcome enums + labels + badge colors (+ test).
- `src/lib/operations.ts` — typed helpers wrapping the RPCs + list selects (+ test).
- `src/components/admin-web/operations/` — `case-status-badge.tsx`, `case-priority-badge.tsx`, `case-timeline.tsx`, `internal-notes-panel.tsx`, `account-flag-panel.tsx`, `create-case-form.tsx`, `evidence-links.tsx` (+ tests).
- `src/app/(admin-web)/operations/index.tsx` (list), `new.tsx` (create), `[id].tsx` (detail) (+ screen tests).

**Modify**
- `src/components/admin-web/admin-sidebar.tsx` — add the **Operations** entry.
- Existing admin-web surfaces (`bookings/[id].tsx`, `providers/*`, `customers/*`, `payments/*`) — add the `InternalNotesPanel` + "Create support case" (and, for customer/provider, `AccountFlagPanel`) affordances **where a detail context exists** (additive, admin-only).

**Reuse (do not modify):** `public.is_admin()`, `admin-shell`, `data-table`, `page-meta`, `usePaginatedList`/`load-more-button`, the wallet-adjustment flow.

---

## Task Order (dependency-ordered)

1. **T1** — Migration `0026`: 5 tables + admin-only RLS + immutability (no delete / no update on notes/events).
2. **T2** — The 9 SECURITY DEFINER RPCs (case CRUD-with-events + notes + internal notes + flags), in the same migration file, with DB/RLS/RPC-guard tests.
3. **T3** — `constants/operations.ts` + `lib/operations.ts` (helpers wrapping RPCs + list selects/filters/pagination) + tests.
4. **T4** — Operations components (badges, timeline, internal-notes panel, account-flag panel, create-case form, evidence links) + tests.
5. **T5** — Operations screens (list + filters, create, detail) + sidebar entry + context links from existing surfaces + tests.
6. **T6** — Audit verification doc + isolation + final gate.

Each task ends green (`npm test` / `tsc` / both exports).

---

### Task 1: Migration 0026 — tables + admin-only RLS + immutability

**Files:** Create `supabase/migrations/0026_operations_portal.sql`; Test `src/__tests__/operations-schema.test.ts` (SQL static assertions — see below)

**Build (SQL):** `create table if not exists` for the 5 tables exactly per spec §3:
- `support_cases` (case_type/status/priority checks + defaults; subject not null; assigned_to→profiles, created_by not null→profiles; nullable context FKs booking_id/customer_id/provider_id/payment_id/review_id; nullable dispute_kind/resolution_outcome checks; resolution_notes, resolved_at, created_at, updated_at). Indexes on status, priority, assigned_to, case_type, and each context FK.
- `support_case_notes` (case_id→support_cases not null, author_id not null, body not null, note_type check default 'internal', created_at).
- `support_case_events` (case_id→support_cases not null, actor_id not null, event_type not null, from_value, to_value, created_at).
- `internal_notes` (subject_type check in booking/customer/provider/payment, subject_id uuid not null, author_id not null, body not null, created_at; index `(subject_type, subject_id)`).
- `account_flags` (subject_id→profiles not null, subject_role check customer/provider, kind check flag/suspension, reason not null, active bool default true, created_by not null, lifted_by, lifted_at, created_at; index `(subject_id, active)`).
- `alter table ... enable row level security` on all 5.
- **RLS policies** (mirror 0024): each table `<t>_select`/`<t>_insert`/`<t>_update` `using/with check (public.is_admin())`. **`support_cases` + `account_flags` get select+insert+update. `support_case_notes`, `support_case_events`, `internal_notes` get select+insert ONLY (no update → immutable).** **No delete policy on any table.**
- SQL comments documenting append-only/immutable intent + "admin-only, no enforcement" on account_flags.

**Test (`operations-schema.test.ts`):** read the migration file text and assert (static, no DB): all 5 `create table` present; RLS enabled on each; every policy uses `public.is_admin()`; there is **no** `for delete` policy; `support_case_notes`/`support_case_events`/`internal_notes` have **no** `for update` policy; the resolution_outcome + status + priority + dispute_kind check lists match the spec enums. (This mirrors how prior slices assert migration invariants in the test suite.)

**Steps:** write SQL → write the static assertions → `npm test` (new file green) → `tsc` → both exports → commit `feat: slice31 migration 0026 operations tables + admin-only RLS`.

---

### Task 2: The 9 SECURITY DEFINER RPCs (+ audit events)

**Files:** Modify `supabase/migrations/0026_operations_portal.sql` (append the functions); Test extend `src/__tests__/operations-schema.test.ts`

**Build (SQL, all `security definer language plpgsql set search_path = public`, each body starts with `if not public.is_admin() then raise exception 'not authorized'; end if;`):**
- `create_support_case(p_case_type, p_priority, p_subject, p_description, p_booking_id, p_customer_id, p_provider_id, p_payment_id, p_review_id, p_dispute_kind)` → insert case (created_by = auth.uid()); insert `support_case_events(case_id, actor_id, 'created')`; `returns uuid`.
- `update_support_case_status(p_case_id, p_status)` → capture old status; update (set `resolved_at=now()` when new='resolved'; `resolved_at=null` when moving out of resolved/closed i.e. 'reopened' path); insert event `status_changed` (from_value=old, to_value=new) — and `resolved`/`reopened` where applicable.
- `update_support_case_priority(p_case_id, p_priority)` → update + `priority_changed` event.
- `assign_support_case(p_case_id, p_assignee)` → validate `p_assignee` is null OR a profile with role='admin'; update; event `assigned`/`unassigned`.
- `set_dispute_outcome(p_case_id, p_outcome, p_resolution_notes)` → set resolution_outcome + resolution_notes; event `outcome_set` (to_value=p_outcome).
- `add_support_case_note(p_case_id, p_body, p_note_type)` → insert note (author_id=auth.uid()); event `note_added`.
- `add_internal_note(p_subject_type, p_subject_id, p_body)` → insert `internal_notes` (author_id=auth.uid()); `returns uuid`.
- `flag_account(p_subject_id, p_subject_role, p_kind, p_reason)` → insert `account_flags` (created_by=auth.uid(), active=true); `returns uuid`.
- `lift_account_flag(p_flag_id)` → update `active=false, lifted_by=auth.uid(), lifted_at=now()`.

**Test:** extend the static assertions — all 9 functions present, each `security definer`, each contains the `is_admin()` guard, each case-mutating fn references `support_case_events` insert. Assert `create_support_case`/`add_support_case_note` set actor from `auth.uid()`.

**Steps:** append SQL → extend assertions → `npm test` → `tsc` → both exports → commit `feat: slice31 operations RPCs with audit events`.

---

### Task 3: Constants + client lib

**Files:** Create `src/constants/operations.ts`, `src/lib/operations.ts`; Test `src/constants/operations.test.ts`, `src/lib/operations.test.ts`

**Build:**
- `constants/operations.ts` — exported const arrays + label/color maps: `CASE_STATUSES` (6), `CASE_PRIORITIES` (4), `CASE_TYPES` (support/dispute), `DISPUTE_KINDS` (4), `RESOLUTION_OUTCOMES` (6), each with `{ id, label, color }` (color = a theme token key). Plus `UNRESOLVED_STATUSES` = statuses minus resolved/closed. Types: `SupportCase`, `SupportCaseNote`, `SupportCaseEvent`, `InternalNote`, `AccountFlag`, `CaseFilter`.
- `lib/operations.ts` — helpers (shape after `promotions.ts`):
  - Mutations via `supabase.rpc(...)`: `createSupportCase(input)`, `updateCaseStatus(id,status)`, `updateCasePriority(id,priority)`, `assignCase(id,assignee|null)`, `setDisputeOutcome(id,outcome,notes)`, `addCaseNote(id,body,noteType)`, `addInternalNote(subjectType,subjectId,body)`, `flagAccount(subjectId,subjectRole,kind,reason)`, `liftAccountFlag(flagId)`.
  - Reads via RLS selects: `getSupportCases(filter?, page?, pageSize?)` — applies filter (`open`→status='open'; `urgent`→priority='urgent'; `assigned_to_me`→`assigned_to = (await auth uid)`; `unresolved`→`status in UNRESOLVED_STATUSES`; `disputes`→case_type='dispute'), `.order('created_at',desc)`, optional `.range` (Slice-29 pattern). `getSupportCase(id)`, `getCaseTimeline(id)` (notes + events, merged/sorted client-side), `getInternalNotes(subjectType,subjectId)`, `getAccountFlags(subjectId)`, `getCaseEvidence(caseId)` (reads booking_photos / chat messages / payment_attempts / reviews for the case's linked booking/payment — read-only reuse; returns link descriptors).

**Test:** each mutation calls the right rpc name with the right params (mock supabase); each read builds the right query (mock chain asserts `.eq`/`.in`/`.order`/`.range`); filter mapping correct; `getCaseTimeline` merges + sorts.

**Steps:** TDD → `npm test` → `tsc` → both exports → commit `feat: slice31 operations constants + client lib`.

---

### Task 4: Operations components

**Files:** Create the 7 files in `src/components/admin-web/operations/`; Tests alongside

**Build (react-native-web, admin-web styling; display + callback props, no direct data logic beyond the lib):**
- `case-status-badge.tsx` `{ status }` / `case-priority-badge.tsx` `{ priority }` — token-colored pills from the constants maps.
- `case-timeline.tsx` `{ items }` — renders merged notes+events chronologically (event: actor/type/from→to/time; note: author/body/type/time).
- `internal-notes-panel.tsx` `{ subjectType, subjectId }` — lists `getInternalNotes` + a composer calling `addInternalNote`; **labeled "Internal — staff only"**; append-only (no edit/delete UI).
- `account-flag-panel.tsx` `{ subjectId, subjectRole }` — lists `getAccountFlags`; a "Flag / Record suspension" form (kind + reason) → `flagAccount`; "Lift" → `liftAccountFlag`. Copy makes clear it is a **record/recommendation, not enforcement**.
- `create-case-form.tsx` `{ initial?, onCreated }` — type/priority/subject/description + optional context ids (accepts prefilled `initial`); calls `createSupportCase`.
- `evidence-links.tsx` `{ caseId }` — renders `getCaseEvidence` results as deep-links to existing photos/chat/payment-attempts/reviews (display-only).

**Test:** each renders its props; `internal-notes-panel` posts + re-lists (mock lib) and shows the "staff only" label; `account-flag-panel` records + lifts + shows the record-only wording; `create-case-form` submits with prefilled context; `evidence-links` renders links; badges show correct labels/colors.

**Steps:** TDD → `npm test` → `tsc` → both exports → commit `feat: slice31 operations components`.

---

### Task 5: Operations screens + sidebar + context links

**Files:** Create `src/app/(admin-web)/operations/{index,new,[id]}.tsx`; Modify `src/components/admin-web/admin-sidebar.tsx` + existing detail surfaces (`bookings/[id].tsx`, `providers/*`, `customers/*`, `payments/*`); Tests in `src/__tests__/`

**Build:**
- `operations/index.tsx` — `AdminShell` + `PageMeta` + a `DataTable` of cases via `usePaginatedList((p,s)=>getSupportCases(filter,p,s))` + `LoadMoreButton`; a **filter bar**: open · urgent · assigned to me · unresolved · disputes (default: unresolved). Columns: subject, type, status badge, priority badge, assignee, created; row → `operations/[id]`.
- `operations/new.tsx` — `AdminShell` + `CreateCaseForm` (reads `?booking_id=`/`?customer_id=`/etc. query params into `initial`); on create → navigate to the new `operations/[id]`.
- `operations/[id].tsx` — `AdminShell` + case header (subject, context-link chips deep-linking booking/customer/provider/payment/review), status/priority `Picker`s (→ `updateCaseStatus`/`updateCasePriority`), assignment control (→ `assignCase`), `CaseTimeline` (from `getCaseTimeline`), `InternalNotesPanel` (subjectType='case'... actually case notes use `addCaseNote` — render a case-note composer here), a **resolution-notes** field, and for `case_type='dispute'`: the `RESOLUTION_OUTCOMES` picker (→ `setDisputeOutcome`) + `EvidenceLinks`. For `refund_recommended`/`wallet_credit_recommended`, show a note + a **deep-link to the existing wallet-adjustment flow** (no automation).
- `admin-sidebar.tsx` — add `{ label: 'Operations', route: '/(admin-web)/operations', segment: 'operations' }` (place after Analytics or near the top — choose a sensible slot; keep the existing entries unchanged).
- **Context links (where a detail surface exists):** on `bookings/[id].tsx` add an `InternalNotesPanel subjectType='booking'` + a "Create support case" link (`operations/new?booking_id=…`). On customer/provider detail surfaces add `InternalNotesPanel` + `AccountFlagPanel` + "Create case". On payment surfaces add `InternalNotesPanel subjectType='payment'` + "Create case". If a given surface is list-only (no detail route), add the affordance to the row/context that makes sense or note it deferred in the report — do NOT invent new detail routes in this slice.

**Test:** list renders + a filter changes the query; create submits + routes; detail renders timeline + changes status (mock lib) + dispute outcome picker appears only for disputes + wallet-recommendation deep-link present; sidebar shows Operations; a context surface renders `InternalNotesPanel`. Keep existing admin-web tests green.

**Steps:** `expo export --platform android` (route types) → TDD screens → `npm test` → `tsc` → `expo export --platform web` → commit `feat: slice31 operations screens + sidebar + context links`.

---

### Task 6: Audit verification + isolation + final gate (FINAL)

**Files:** Create `docs/pilot/operations-portal.md`

- **Audit verification:** document that every case mutation RPC writes a `support_case_events` row (list each event_type); notes/events/internal_notes are insert-only (no update/delete policy); account_flags append-only (lift = active=false, never deleted). Include the intended as-role RLS spot-audit (customer + provider get 0 rows / cannot insert on all 5 tables; admin can) as a documented check.
- **Isolation:** `git diff <base>..HEAD --name-only` — confirm changes only under `supabase/migrations/0026*`, `src/constants/operations*`, `src/lib/operations*`, `src/components/admin-web/operations/*`, `src/app/(admin-web)/operations/*`, the sidebar, and the additive panels on existing admin surfaces + this doc. Confirm **NO** change to payments/wallet/payout/dispatch/auth/business-workflow logic, **NO** role-model change, **NO** user-deletion path, **NO** automated-refund path (wallet credit only via the existing flow). Grep to prove the operations tables are `is_admin()`-only.
- **Deployment note:** migration 0026 apply order + that it is additive (no data backfill, no changes to existing tables).
- **Final gate:** `npm test` green, `tsc` clean, `expo export` web + android green, `git status` clean.
- Commit `test: slice31 operations audit + verification doc`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-31-operations`. Abandon = `git checkout main` + delete branch.
- **Per-task revert:** independent commits — `git revert <commit>` rolls back one. Reverting T5/T4/T3 removes UI/lib (tables harmless if unused). 
- **DB rollback:** migration 0026 is **purely additive** (5 new tables + 9 new functions; no changes to existing tables/policies/data). To undo: a follow-up `drop function ...` (the 9) + `drop table ... cascade` (the 5) migration, or restore pre-0026 — no data migration to reverse, existing data untouched.
- **No payment/payout/dispatch/auth/business involvement** — rollback confined to the additive operations tables/RPCs + admin-only UI. Existing admin panel unaffected if Operations UI is reverted.

---

## Self-Review

- **Requirement coverage:** migration 0026 (T1) · support_cases/support_case_notes/support_case_events/internal_notes/account_flags tables (T1) · admin-only RLS + immutable notes/events + no-delete (T1) · support-case RPCs + account flag/suspension RPCs with audit events (T2) · operations.ts helpers (T3) · operations constants (T3) · list screen + filters (T5) · create case screen/form (T4 form, T5 screen) · case detail screen (T5) · internal notes panel (T4) · account flag panel (T4) · evidence links (T4) · sidebar/nav entry (T5) · context links from booking/provider/customer/payment (T5) · audit verification (T6) · rollback (this section). Every "Include" item mapped.
- **Constraint coverage:** admin-only `is_admin()` / no new role (Global Constraints, T1 RLS, T2 guards) · no payment/payout/dispatch change (T6 isolation) · no user deletion (no delete policy/path) · no automated refunds (recommendation + existing wallet flow, T5) · suspension record-only (T1/T2 account_flags, T4 wording) · customers/providers never read ops data (T1 RLS, T6 as-role audit) · fully auditable (T2 events, T6) · no AI support (absent).
- **Placeholder scan:** none.
- **Name consistency:** RPC names (`create_support_case`/`update_support_case_status`/`update_support_case_priority`/`assign_support_case`/`set_dispute_outcome`/`add_support_case_note`/`add_internal_note`/`flag_account`/`lift_account_flag`) identical in T2 (SQL) ↔ T3 (`supabase.rpc(...)`); table names identical T1↔T2↔T3; constant enum names (`CASE_STATUSES`/`CASE_PRIORITIES`/`CASE_TYPES`/`DISPUTE_KINDS`/`RESOLUTION_OUTCOMES`/`UNRESOLVED_STATUSES`) consistent T3↔T4↔T5; lib fn names consistent T3↔T4↔T5; component filenames consistent T4↔T5; route segment `operations` consistent T5 sidebar + routes.
