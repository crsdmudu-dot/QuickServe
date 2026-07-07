# S36 Task 6 Report — Verification Doc + Final Gate

**Status:** COMPLETE WITH CONCERN (tsc FAIL — see below)

**Branch:** `feat/slice-36-communication-center`  
**Base:** `5f23d66` · **Head:** `b5a2727`  
**Deliverable:** `docs/pilot/communication-center.md`

---

## Gate Results (one line each)

| Check | Result |
|---|---|
| `npm test` | PASS — 210 suites, 2852 tests, 0 failures |
| `npx tsc --noEmit` | FAIL — 1 error: `src/__tests__/admin-web-notifications.test.tsx(36,97): TS2554 Expected 1 arguments, but got 2` |
| `npx expo export --platform android` | PASS — exported to `dist/` |
| `npx expo export --platform web` | PASS — exported to `dist/` |
| `git status` | On branch `feat/slice-36-communication-center`; only `supabase/.temp/` untracked; working tree clean |

---

## What Changed

- Created `docs/pilot/communication-center.md` (10 sections, all real `file:line` citations).
- Created `.superpowers/sdd/s36-task-6-report.md` (this file).
- No migration, lib, component, or screen code was modified.

---

## Why It Matters

Establishes the authoritative verified reference for the Slice-36 Communication Center before the branch is merged. Each section was verified against real code (files read, not inferred). Rollback plan, RLS audit, and preference model are documented with citations.

---

## Checks Run

1. Read all 5 task source files: migration `0031`, `src/lib/notifications.ts`, `src/constants/notifications.ts`, all 6 notification components, 3 notification center screens, broadcast composer, notification-settings, admin-shell, admin-sidebar.
2. Verified additive-only nature of `0031`: no DROP, no alter…drop column, no RLS policy change — all statements use `ADD COLUMN IF NOT EXISTS` or `CREATE OR REPLACE FUNCTION` for the two new RPCs.
3. Verified `emit_notification` makes no preference read before insert (lines 55–68 of `0031`).
4. Verified `broadcast_announcement` is admin-only guard (line 86 of `0031`).
5. Verified `markNotificationRead` and `markAllNotificationsRead` update `is_read` AND `read_at` (`src/lib/notifications.ts:116`, `129`).
6. Confirmed no `.delete()` on notifications table anywhere in `src/`.
7. Confirmed `FUTURE_ROWS` in notification-settings are disabled switches with no-op handlers (`notification-settings.tsx:194–202`).
8. Confirmed "Everyone" broadcast = two separate RPC calls summed (`broadcast.tsx:87–111`).
9. Confirmed NotificationBell appears on customer home, provider home, and admin shell.
10. Ran full gate: npm test (2852 pass), tsc (1 error), expo export android (pass), expo export web (pass), git status (clean except supabase/.temp/).

---

## Risks / Concerns

### CONCERN 1 (tsc FAIL) — type annotation bug in test file

**File:** `src/__tests__/admin-web-notifications.test.tsx:36`  
**Error:** `TS2554: Expected 1 arguments, but got 2`

**Root cause:** `mockFilterNotifications` is defined as `jest.fn((ns: any[]) => ns)` (one-parameter function signature), but at line 36 it is called inside the mock factory with two arguments: `mockFilterNotifications(ns as any[], filter as any)`. TypeScript flags this mismatch.

**Impact:** Test runtime is unaffected — Jest executes JavaScript, not TypeScript, so all 2852 tests pass. The production app bundle is also unaffected (test-only file). However, `npx tsc --noEmit` exits with error code 1.

**Action required:** This is a pre-existing defect introduced in T5 (commit `b5a2727`). Per task guardrails, this task does NOT fix it. The controller must decide: either fix the mock definition (change to `jest.fn((ns: any[], _filter?: any) => ns)`) or add `@ts-ignore` on line 36. Fix is trivial; it is in a test file only.

**This concern is flagged in `docs/pilot/communication-center.md` Section 10.**

### Note on tsc run order

Running `npx tsc --noEmit` before `npx expo export --platform android` will also fail due to route type drift. The correct gate order is: android export first (regenerates `.expo/types/router.d.ts`), then tsc. Even after the android export, the test file error at line 36 persists — confirming it is a genuine type defect, not a route drift artifact.

---

## No False Claims

All 10 doc sections were verified against code. No claim was found to be false. The only discrepancy discovered was the tsc error (type annotation in a test file), which is flagged as a concern above rather than silently fixed.
