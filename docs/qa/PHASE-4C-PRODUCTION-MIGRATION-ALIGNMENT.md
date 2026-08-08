# Phase 4C — Production Migration Alignment

> **Status: PRODUCTION ALIGNED.** Migrations **0017–0034** were applied to `Quick Serve Production`
> after an explicit user backup confirmation and approval. Production migration history is now
> **34/34 aligned (0 pending, 0 remote-only)** and its schema matches the repository canonical state
> (30 public objects). Existing data was **preserved** (`profiles=2, bookings=1, booking_activity=1`,
> unchanged); the canonical service catalogue seed from `0030` populated **4 categories / 19 services
> (19 active)**. **No records were deleted, no QA/DEV data copied, no Edge Functions modified, no
> payment/push/app/site/OTA/store actions, no secrets exposed. Full Platform Certification is NOT
> claimed.**

## 1. Executive Summary

Production was **behind** by 18 migrations (history stopped at `0016`). The pending set `0017–0034`
was proven **non-destructive** (no `DROP TABLE/COLUMN`, `TRUNCATE`, or migration-scope `DELETE`; all
`DROP POLICY` are drop+recreate), the migration history was **clean and contiguous** (no
remote-only/mismatch/gap), and Production held only ~4 rows of residual test data. After user backup
confirmation and approval, `supabase db push` applied `0017–0034` cleanly (exit 0, ~62s). Production
is now schema-aligned with the repository; existing data preserved; service catalogue seeded.

## 2. Starting Baseline

- Repo `main` = `origin/main` = `8e355d8` (unchanged); branch `infra/phase-4c-production-migration-alignment` (from `8e355d8`).
- Migrations `0001–0034`: 34 files, contiguous, unmodified, identical to `origin/main`.
- Supabase CLI **2.110.0**; org **"Quick Serve"** (`kcjgusnprhngykflmizz`).
- Branch protection unchanged (`["PR CI"]`, `enforce_admins=true`, 1 review). This phase does not merge.

## 3. Production Identity Verification

`Quick Serve Production`, ref `lkigkl…ffds` (matches exactly; ≠ QA `wjvjup…ozws`, ≠ DEV `gzkvna…xwmc`),
`eu-central-1`, ACTIVE_HEALTHY, Postgres 17. The active linked target was verified = Production
immediately before every Production database command. The Production DB password was supplied via a
hidden local prompt into a temp file (never printed/echoed/committed) and read per-command through
`SUPABASE_DB_PASSWORD`; the temp file was securely deleted at phase end. The CLI link was cleared
after the push (local dev app uses `.env` → Development, not the CLI link).

## 4. Backup Verification

- User **explicitly confirmed** a recent, successful, recoverable Production backup with an acceptable
  timestamp (Supabase Pro daily backup) **before** any write. No PITR purchased; no add-on enabled.

## 5. Migration History Audit (pre-apply)

| | Migrations |
|---|---|
| Applied on Production (16) | 0001–0016 |
| Pending (18) | 0017–0034 |
| Remote-only | none |
| Mismatch / gap / repaired | none |

Clean, contiguous "behind" state. No `migration repair` was needed or used.

## 6. Schema Drift Audit (pre-apply)

Production exposed **11 of 30** canonical public objects; **19 missing**; **no extra/untracked
objects**. Classification **B (Behind)** — no drift.

## 7. Production Data Presence (before → after)

| Table | Before | After |
|---|---|---|
| profiles | 2 | 2 |
| bookings | 1 | 1 |
| booking_activity | 1 | 1 |
| service_categories | (table absent) | 4 (canonical seed) |
| services | (table absent) | 19 (canonical seed; 19 active) |
| payments / reviews / notifications / … | 0 | 0 |

**No existing records were deleted or transformed.** The only new rows are the canonical `0030`
service-catalogue seed defined by the migration itself.

## 8. Pending Migration Analysis (0017–0034)

- Dry-run (`db push --dry-run`) confirmed exactly 18 migrations, no extra seeds/roles.
- **No destructive operations**: no `DROP TABLE`/`DROP COLUMN`/`TRUNCATE`/migration-scope `DELETE`;
  5 `DROP POLICY` are all drop+recreate replacements (RLS not weakened); no `NOT NULL`-without-default
  column adds.
- **Populated-table impact** (only `bookings` is altered): `0017` adds nullable address columns;
  `0021` adds columns **with defaults** (`scheduling_type='datetime'`, `recurrence='one_time'`) so the
  existing row auto-populates validly; `0033` adds a **partial unique index** (safe — 1 booking, no
  duplicates); `0034` **tightens** the `bookings_update_provider` RLS policy (drop+recreate; does not
  touch stored rows). `profiles`/`booking_activity` have no ALTERs.
- All other `insert into` statements are inside `SECURITY DEFINER` function bodies (runtime logic),
  except the top-level canonical `0030` catalogue seed.
- **Confidence: HIGH.**

## 9. Migration Execution

- Command: `supabase db push --linked` against `lkigkl…ffds` (target re-verified first).
- **Start:** `2026-08-07T15:38:46Z` → **End:** `2026-08-07T15:39:48Z` (~62s).
- **Applied (18):** `0017,0018,0019,0020,0021,0022,0023,0024,0025,0026,0027,0028,0029,0030,0031,0032,0033,0034`.
- **Exit code: 0.** No `db reset`, `migration repair`, manual SQL, or force flags. No failures.

## 10. Post-Migration Verification

- `migration list --linked`: **34/34 aligned, 0 pending, 0 remote-only** ✅.
- Public objects: **30 / 30 canonical present, none missing** ✅.
- Existing data preserved: `profiles=2, bookings=1, booking_activity=1` (unchanged) ✅.
- No unexpected records; no QA/DEV data copied.

## 11. RLS and Policy Verification

- RLS active: anonymous read of `bookings` returns `200` with **0 rows** (policies enforced) ✅.
- `services` customer SELECT (anon) returns only **active** services (19) — customer-visibility policy
  correct ✅. Admin write RPCs (`admin_create_service`/`admin_update_service`/`admin_set_service_status`
  etc.) are created by `0030`. Full policy-name inventory can be expanded in a later read-only pass.

## 12. Storage Verification

- `booking-photos` bucket present and **private** (unchanged) ✅.

## 13. Seed / Reference Data Verification (service catalogue)

- `service_categories` = **4**, `services` = **19** (all active), populated by the canonical `0030`
  seed. Production does **not** end with zero active services. **No manual inserts were performed.**

## 14. Environment Isolation Recheck

| Surface | Points at | State |
|---|---|---|
| local `.env` | Development `gzkvna…` (role=`anon`) | ✅ correct (app runtime; not Production) |
| `.env.backup` | Production `lkigk…` | ✅ inactive, unchanged |
| `qa/.env` | QA `wjvju…` | ✅ correct |
| CLI link | (cleared after push) | ✅ no ambient Production target |

No Production service-role key in any client-accessible config; no cross-environment data copied.

## 15. Validation Results

| Gate | Result |
|---|---|
| Production migration-list (34/34 aligned) | ✅ |
| Root TypeScript | ✅ PASS |
| QA TypeScript | ✅ PASS (run earlier this phase) |
| Secret scan (tracked files) | ✅ clean |
| Migration-order validation | ✅ 0001–0034 contiguous |
| Root Jest / Website Vitest / lint / Expo web+Android export | Run on **PR CI #7** (tree = `main` + this doc; code unchanged from `main`) |

No connected certification / Playwright / native journeys / payment / push / storage-mutation tests
were run against Production.

## 16. Edge Functions Preservation

The four pre-existing Production Edge Functions remain unchanged — `mpesa-stk-push`, `mpesa-callback`,
`register-device`, `send-push` (all **v2, ACTIVE**). Not redeployed, secrets not touched, not invoked.

## 17. Production Readiness Impact

Production schema is now **aligned** with the repository canonical migrations `0001–0034`, with the
service catalogue seeded and existing data preserved. This removes the schema-lag blocker. Application
code, Edge Function behaviour, M-Pesa enablement, and any public-launch readiness remain **out of
scope** and separately gated.

## 18. Remaining Blockers / Risks

- **P2 — Residual test data** (2 profiles, 1 booking, 1 activity) from the isolation-defect era remains
  in Production; decide separately (with approval) whether to retain or clean. Not touched here.
- **P3 — Full policy/trigger/index inventory** on Production was not exhaustively enumerated
  (migration-list + schema-object + RLS-behaviour checks passed); a deeper read-only audit can follow.
- **P3 — On `main`, `.env.backup` is not yet gitignored** (the Phase 4B.1 `.gitignore` fix is in
  unmerged PR #4); it was not committed here.

## 19. Recommended Next Phase

Phase 4D (separately gated): decide on residual-data cleanup and any application/Edge/M-Pesa work.
Do **not** deploy app code, Edge Functions, or enable M-Pesa without explicit approval.

## 20. Final Status

**PRODUCTION ALIGNED** — migrations `0017–0034` applied (history 34/34, 0 pending), schema matches
canonical, existing data preserved, service catalogue seeded (19 active services), Edge Functions
untouched, environment isolation intact, no secrets exposed. Full Platform Certification is NOT claimed.
