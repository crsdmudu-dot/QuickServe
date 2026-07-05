# Slice 31 — Operations Portal (Design Spec)

**Date:** 2026-07-05
**Status:** Design → (user review, then implementation plan)
**Builds on (reuses):** the `(admin-web)` route group + `admin-shell`/`admin-sidebar`/`data-table`/`page-meta`, the `is_admin()` RLS pattern + SECURITY DEFINER RPC pattern, the Slice-29 pagination helpers (`usePaginatedList`/`.range`/`LoadMoreButton`), and the existing admin **wallet-adjustment** flow (`admin-wallet-panel.tsx`, migration 0023). No payment/auth/payout/dispatch/business-workflow layer is modified.

## 1. Goal & Decisions

Upgrade the admin panel into an **operations-ready** surface for support staff: support cases, disputes, internal notes, account safety flags, and auditable follow-up — all **admin-only**, read-blocked for customers/providers, and fully auditable.

**Confirmed decisions (brainstorm):**
- **Admin-only.** Operations data is gated by the existing `is_admin()`. "Assigned staff" = a FK to an `admin` profile. **No auth/role-model change** (role enum stays `customer|provider|admin`).
- **Disputes are unified into `support_cases`** via `case_type` (`support|dispute`) + a `resolution_outcome` enum — one timeline/notes/assignment/audit machinery.
- **Suspension is record-only + audit.** Flags/suspensions are an operational record + recommendation with a full audit trail; **nothing is wired into login/booking/dispatch/payout** (honors "no workflow/dispatch/auth changes"). Actual enforcement stays a human recommendation.

## 2. Scope & Constraints (hard rules)

**In scope:** support cases (with 6-state status, 4-level priority, assignment, internal + resolution notes, timeline), disputes (as cases with a resolution outcome + evidence links), standalone internal notes on booking/customer/provider/payment, account flag/suspend (record-only + audit), refund/wallet **recommendations** (no automation), and the admin-web Operations section.

**Out of scope / MUST NOT change:**
- No payment logic change. No provider payout change. No dispatch logic change. No customer/provider workflow change.
- No auth change (admin-only reuse of `is_admin()`). No user deletion. No automated refunds. No AI support. No live-chat widget / call-center / external helpdesk integration.
- Customers/providers/public **cannot read any operations data** (RLS admin-only, no public access). Internal notes are never visible to customers/providers.
- **Actual wallet credit uses the EXISTING admin wallet-adjustment flow** — this slice only records a *recommendation* and deep-links to that flow.

## 3. Data Model — migration `0026_operations_portal.sql`

Five new tables (all RLS admin-only, append-oriented for audit). All ids `uuid default gen_random_uuid()`, `created_at timestamptz default now()`.

### 3.1 `support_cases`
- `case_type text not null check (in 'support','dispute') default 'support'`
- `status text not null check (in 'open','in_review','waiting_on_customer','waiting_on_provider','resolved','closed') default 'open'`
- `priority text not null check (in 'low','medium','high','urgent') default 'medium'`
- `subject text not null`, `description text`
- `assigned_to uuid references profiles(id)` (null = unassigned), `created_by uuid not null references profiles(id)`
- **Context links (all nullable — a case links to any subset):** `booking_id references bookings(id)`, `customer_id references profiles(id)`, `provider_id references profiles(id)`, `payment_id references payments(id)`, `review_id references reviews(id)`
- **Dispute fields (nullable; used when `case_type='dispute'`):** `dispute_kind text check (in 'booking_dispute','payment_dispute','customer_complaint','provider_complaint')`, `resolution_outcome text check (in 'no_action','refund_recommended','wallet_credit_recommended','provider_warning','provider_suspension_recommended','customer_warning')`
- `resolution_notes text`, `resolved_at timestamptz`, `updated_at timestamptz default now()`
- Indexes: `status`, `priority`, `assigned_to`, `case_type`, and each context FK.

### 3.2 `support_case_notes` (case timeline notes)
- `case_id not null references support_cases(id)`, `author_id not null references profiles(id)`
- `body text not null`, `note_type text not null check (in 'internal','resolution') default 'internal'`
- **Immutable:** insert-only (no update/delete policy).

### 3.3 `support_case_events` (case audit / timeline)
- `case_id not null references support_cases(id)`, `actor_id not null references profiles(id)`
- `event_type text not null` (`created`, `status_changed`, `priority_changed`, `assigned`, `unassigned`, `outcome_set`, `note_added`, `resolved`, `reopened`)
- `from_value text`, `to_value text`
- **Immutable:** insert-only. Written by the mutation RPCs so every change is recorded.

### 3.4 `internal_notes` (standalone private notes on an entity)
- `subject_type text not null check (in 'booking','customer','provider','payment')`, `subject_id uuid not null`
- `author_id not null references profiles(id)`, `body text not null`
- **Immutable:** insert-only. (Polymorphic subject → no FK constraint; indexed on `(subject_type, subject_id)`.) Never visible to customers/providers.

### 3.5 `account_flags` (safety actions — record-only)
- `subject_id not null references profiles(id)`, `subject_role text not null check (in 'customer','provider')`
- `kind text not null check (in 'flag','suspension')`, `reason text not null`
- `active boolean not null default true`, `created_by not null references profiles(id)`
- `lifted_by references profiles(id)`, `lifted_at timestamptz`
- **Append-only:** rows are never deleted; lifting a flag sets `active=false` + `lifted_by/at` (the full history stays as the audit trail). **No enforcement** — purely operational record. Index `(subject_id, active)`.

## 4. RLS & RPCs

**RLS (every table):** `select`/`insert`/`update` require `is_admin()`; **no** `delete` policy anywhere (append-only). Notes/events/internal_notes have **no update** policy (immutable). No public/anon/customer/provider access — the existing `is_admin()` helper is the sole gate. Mirrors the established admin-only pattern; a spot-audit (as-role) is part of verification.

**SECURITY DEFINER RPCs (all start with an `is_admin()` guard; each mutation also writes the matching `support_case_events` row in the same transaction for auditability):**
- `create_support_case(p_case_type, p_priority, p_subject, p_description, p_booking_id, p_customer_id, p_provider_id, p_payment_id, p_review_id, p_dispute_kind)` → inserts case + a `created` event; returns the new id.
- `update_support_case_status(p_case_id, p_status)` → updates + `status_changed` event (sets `resolved_at` when → `resolved`; clears on `reopened`).
- `update_support_case_priority(p_case_id, p_priority)` → `priority_changed` event.
- `assign_support_case(p_case_id, p_assignee)` → `assigned`/`unassigned` event (assignee must be an admin profile).
- `set_dispute_outcome(p_case_id, p_outcome, p_resolution_notes)` → sets `resolution_outcome`/`resolution_notes` + `outcome_set` event.
- `add_support_case_note(p_case_id, p_body, p_note_type)` → inserts note + `note_added` event.
- `add_internal_note(p_subject_type, p_subject_id, p_body)` → inserts an `internal_notes` row.
- `flag_account(p_subject_id, p_subject_role, p_kind, p_reason)` → inserts an `account_flags` row.
- `lift_account_flag(p_flag_id)` → sets `active=false` + `lifted_by/at`.

**Reads:** direct RLS-guarded selects from the admin-web client (with `.range` pagination + filters), mirroring existing admin lists. No new read RPCs needed.

## 5. Frontend — admin-web Operations section

**Routes (new, under the protected `(admin-web)` group):**
- `operations/index.tsx` — **Support cases list** (`DataTable`), with the required filters: **open**, **urgent**, **assigned to me** (`assigned_to = auth uid`), **unresolved** (status ∉ resolved/closed), **disputes** (`case_type='dispute'`). Paginated (`usePaginatedList` + `LoadMoreButton`).
- `operations/new.tsx` — **Create case** form (type/priority/subject/description + optional context links; can be prefilled via query params, e.g. `?booking_id=…`).
- `operations/[id].tsx` — **Case detail:** header (status/priority/assignment controls), context-link chips (deep-link to the related booking/customer/provider/payment/review), a merged **timeline** (events + notes chronologically), **internal-note** composer, **resolution notes**, and for disputes the **resolution outcome** picker + **evidence links** panel. For `refund_recommended`/`wallet_credit_recommended`, a note + a deep-link to the existing wallet-adjustment flow (no automation).

**Reusable components (`src/components/admin-web/operations/`):** `case-status-badge`, `case-priority-badge`, `case-timeline`, `internal-notes-panel` (props: `subjectType`, `subjectId` — reused across contexts), `account-flag-panel`, `create-case-form`, `evidence-links` (reads existing booking photos / chat / payment attempts / reviews for the linked entity — display-only).

**Context linking (where useful, lightweight):** on the existing admin-web booking/provider/customer/payment surfaces, add an `InternalNotesPanel` + a "Create support case" affordance (prefilled context) and, for customer/provider, a "Flag / suspend (record)" action via `AccountFlagPanel`. Kept minimal to avoid workflow changes — these are additive admin-only panels.

**Sidebar:** add an **Operations** entry to `admin-sidebar` (with an open/urgent count is optional — omit for the pilot to avoid extra queries).

**Constants (`src/constants/operations.ts`):** the status/priority/case_type/dispute_kind/resolution_outcome enums + human labels + badge colors (tokens), shared by lib + components.

**Lib (`src/lib/operations.ts`):** typed helpers wrapping the RPCs + list selects: `createSupportCase`, `getSupportCases(filters,page,pageSize)`, `getSupportCase(id)`, `getCaseTimeline(caseId)`, `updateCaseStatus`, `updateCasePriority`, `assignCase`, `setDisputeOutcome`, `addCaseNote`, `addInternalNote`, `getInternalNotes(subjectType,subjectId)`, `flagAccount`, `liftAccountFlag`, `getAccountFlags(subjectId)`, `getCaseEvidence(caseId)`.

## 6. Auditability

Every case mutation writes an immutable `support_case_events` row (who/what/from→to/when); notes and internal notes are insert-only; account flags are append-only with lift metadata. Nothing is hard-deleted. This gives a complete, admin-only audit trail for support/dispute/safety actions.

## 7. Testing

- **DB/RLS:** as-role checks — a customer and a provider get **zero** rows and cannot insert/update on all 5 tables; admin can. RPC `is_admin()` guard rejects non-admins. Outcome/status/priority enum checks enforced.
- **Lib:** each helper hits the right RPC/select with the right args; filters map to the right query; pagination `.range`.
- **Components/screens:** case list renders + filters; case detail renders timeline/notes/outcome; `InternalNotesPanel` posts + lists; `AccountFlagPanel` records + lifts; evidence panel links to existing data.
- Gate: `npm test` green, `npx tsc --noEmit` clean, `expo export` web + android green.

## 8. Guardrails restated (verification will prove)

No payment/payout/dispatch/auth/business-workflow change; no user deletion; no automated refunds; wallet credit only via the existing admin adjustment flow; operations data admin-only (customers/providers/public blocked); internal notes never exposed to customers/providers; fully auditable (immutable events/notes + append-only flags).

## 9. Open assumptions

- "Assigned staff" is any `admin` profile (no separate support role this slice).
- Evidence links reuse existing tables (booking_photos, chat messages, payment_attempts, reviews) read-only — no new evidence storage.
- Sidebar badge counts deferred (avoid extra per-render queries) unless trivially cheap.
- A future slice can add a dedicated `support` role, enforcement of suspensions, and SLA/metrics — explicitly out of scope here.
