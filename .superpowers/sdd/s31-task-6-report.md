# Slice 31 Task 6 — Verification Report

**Status:** DONE
**Branch:** feat/slice-31-operations
**Date:** 2026-07-05

---

## Final Gate (5 checks)

| Check | Result |
|---|---|
| `npm test` | PASS — 139 suites, 1434 tests, 0 failures |
| `npx tsc --noEmit` | PASS — no errors (clean output) |
| `npx expo export --platform web` | PASS — exported to `dist/` |
| `npx expo export --platform android` | PASS — exported to `dist/` |
| `git status` | CLEAN — only `supabase/.temp/` untracked (expected, ignorable) |

---

## What Was Done

Created `docs/pilot/operations-portal.md` — the verification, audit, and rollback document for Slice 31. The document covers:

1. **Overview** — what the Operations Portal is, how it relates to the existing admin panel and mobile apps, scope of changes.
2. **Data model & RLS** — all 5 tables, 13 policies (all `is_admin()`), immutability guarantees, no-delete guarantees, enum constraints. Cites exact migration lines.
3. **RPCs & auditability** — all 9 SECURITY DEFINER RPCs, which write `support_case_events`, which bump `updated_at`, the full set of event types. Transaction order for `add_support_case_note` documented.
4. **Safety guarantees** — record-only flags/suspension, wallet credit = wording + navigation link only, no automated refund, no user deletion, no payment/payout/dispatch/auth logic change. Each claim backed by grep evidence.
5. **Access control** — as-role RLS spot-audit with 9 SQL procedures and expected results (customer gets 0 rows, provider gets 0 rows, admin can CRUD, direct DELETE silently blocked, immutable table UPDATE silently blocked).
6. **Isolation proof** — `git diff main..HEAD --stat` recorded (34 files, 5368 insertions, 3 deletions); mobile app surface check confirmed zero customer/provider screen changes; additive-only edits to existing admin surfaces documented; no payment/wallet/dispatch/auth file changed; no migration other than 0026.
7. **Deployment** — migration prerequisites, apply commands, post-deploy SQL verification queries, UI deploy note.
8. **Rollback** — pre-merge abandon, per-task git revert table, DB rollback forward-migration SQL.
9. **Release gate** — results table embedded.

---

## Evidence Gathered

### RLS admin-only: 13 policies, all `is_admin()`

From `supabase/migrations/0026_operations_portal.sql`:

| Table | Policies | Lines |
|---|---|---|
| `support_cases` | select + insert + update | 53–58 |
| `support_case_notes` | select + insert (immutable) | 88–91 |
| `support_case_events` | select + insert (immutable) | 111–114 |
| `internal_notes` | select + insert (immutable) | 134–137 |
| `account_flags` | select + insert + update | 165–170 |

Every policy uses `public.is_admin()` as the sole predicate.

### No FOR DELETE policy

Grep of migration for `for delete`: **zero matches**. Confirmed by static test (`operations-schema.test.ts`).

### 3 immutable tables — no UPDATE policy

`support_case_notes`, `support_case_events`, and `internal_notes` have only `select` and `insert` policies. No `for update` policy exists for these tables.

### 9 SECURITY DEFINER RPCs, each `is_admin()`-guarded

All 9 RPCs (migration lines 184–423) have:
- `security definer`
- `set search_path = public`
- `if not public.is_admin() then raise exception 'not authorized'; end if;` as first statement

### Case-mutating RPCs write `support_case_events` + bump `updated_at`

| RPC | Event type | `updated_at` bump |
|---|---|---|
| `create_support_case` (line 215) | `created` | No (new row) |
| `update_support_case_status` (line 247) | `status_changed` | Line 239 |
| `update_support_case_priority` (line 271) | `priority_changed` | Line 267 |
| `assign_support_case` (lines 304–309) | `assigned` or `unassigned` | Line 300 |
| `set_dispute_outcome` (line 331) | `outcome_set` | Line 327 |
| `add_support_case_note` (line 357) | `note_added` | Line 353 |

RPCs 7–9 (`add_internal_note`, `flag_account`, `lift_account_flag`) are not case mutations and do not write `support_case_events`.

### `flag_account` and `lift_account_flag` — record-only

`flag_account` (migration lines 400–405): inserts into `account_flags` only. No reference to `profiles`, `approval_status`, dispatch, or payout.

`set_dispute_outcome` (migration lines 325–332): updates `resolution_outcome`, `resolution_notes`, `updated_at` only. No wallet or refund function called.

### Wallet credit = link + wording only

Grep of `src/app/(admin-web)/operations/[id].tsx` for `adminAdjustWallet|applyWalletToPayment|admin_wallet_adjust|refund`:

- Line 9: comment "NO wallet/refund/payment calls here" (documentation)
- Line 249: `currentOutcome === 'refund_recommended'` — a string comparison for conditional rendering
- Line 535: display text `'A refund has been recommended...'`

**No wallet or refund function is invoked.** The wallet-credit path (lines 522–542) renders a text banner and a `Button` that calls `router.push(walletLink)` — navigation only.

---

## Isolation Diff Result

`git diff main..HEAD --name-only` — 34 files:

- `supabase/migrations/0026_operations_portal.sql` — only migration changed
- `src/constants/operations.ts` + test
- `src/lib/operations.ts` + test
- `src/components/admin-web/operations/*` (7 components + 7 tests)
- `src/app/(admin-web)/operations/index.tsx`, `new.tsx`, `[id].tsx`
- `src/components/admin-web/admin-sidebar.tsx` (+1 nav entry)
- `src/app/(admin-web)/bookings/[id].tsx` (additive: InternalNotesPanel + Create-case link)
- `src/app/(admin-web)/customers/index.tsx` (additive: Create-case column)
- `src/app/(admin-web)/payments/index.tsx` (additive: Create-case column)
- `src/app/(admin-web)/providers/[id].tsx` (additive: InternalNotesPanel + AccountFlagPanel + Create-case link)
- `tsconfig.json` (+`"node"` to types for static test)
- `src/__tests__/operations-schema.test.ts`, `admin-web-operations.test.tsx`, and 4 extended test files
- `docs/pilot/operations-portal.md` (this doc)

**Mobile app check:** `grep -E 'src/app/\(customer\)|src/app/\(provider\)'` → **zero results**.

**Payment/wallet/dispatch/auth check:** `src/lib/wallet.ts`, `src/lib/payments.ts`, `supabase/functions/mpesa-*`, `src/auth/**`, `supabase/migrations/0010_payments.sql`, `supabase/migrations/0023_wallet.sql` → **NOT in diff**.

**Migration check:** only `supabase/migrations/0026_operations_portal.sql` in diff.

---

## Issues Found

**None.** No Critical or Important defects found. No fix commits required.

Minor notes (non-blocking, documented only):
- The `add_support_case_note` RPC bumps `support_cases.updated_at` via a standalone `UPDATE` (not part of the INSERT statement). This is correct and intentional — documented in T2 progress as a forward-flag from T1.
- The `set_dispute_outcome` RPC uses `coalesce(p_resolution_notes, resolution_notes)` — this means passing `null` for `p_resolution_notes` retains the existing notes. This is conservative and correct behavior.
- `tsconfig.json` `"node"` types addition: benign. The `types` array is a compiler allowlist; Metro bundler ignores TypeScript types. Does not weaken any app type-check. Confirmed by T1 code-review record in progress.md.

---

## Merge-Readiness Verdict

**MERGE READY.**

- All 5 final-gate checks pass.
- Migration 0026 is additive (5 new tables, 9 new functions, no existing table/policy/data changed).
- All 13 RLS policies are `is_admin()` only. No delete policy anywhere. 3 immutable tables (no update policy).
- All 9 RPCs are SECURITY DEFINER + `is_admin()` guarded.
- All 6 case-mutating RPCs write `support_case_events` in-transaction.
- No mobile app change. No payment/wallet/dispatch/auth logic change. No user deletion. No automated refund.
- Wallet credit = recommendation + navigation link only — no automation.
- Isolation diff is clean: only operations files + additive admin-surface context links + tsconfig `"node"` + docs.
- 1434 tests pass. TypeScript clean. Both platform exports succeed.

---

## Commit

Files staged: `docs/pilot/operations-portal.md`, `.superpowers/sdd/s31-task-6-report.md`

Commit message:
```
test: slice31 operations portal verification + audit doc

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
