# Phase 4C — Production Migration Alignment

> **Status: PRODUCTION ALIGNMENT BLOCKED (execution not performed).** The read-only audit proves
> Production is **behind** the repository migrations (missing 19 schema objects, classification B),
> and the pending migrations are **non-destructive**. However, applying them is **blocked** on three
> items that must be resolved first: (1) the **Production database password** is not available to
> this session — the CLI cannot read the authoritative migration history or run `db push` without
> it; (2) a **recoverable backup must be confirmed** immediately before any schema change; (3)
> because Production contains data and the pending set replaces policies/triggers on existing
> tables, **explicit approval** is required. **No Production schema was modified. No data was read
> beyond aggregate counts. No secrets were printed. Full Platform Certification is NOT claimed.**

## 1. Executive Summary

Production (`Quick Serve Production`, `lkigkl…ffds`) exposes **11** public objects; the canonical
repository migrations `0001–0034` produce **30** (verified against the freshly-built Development
project). Production is therefore **behind by 19 objects** with **no untracked/extra objects** —
a clean "behind" state, not schema drift. Production holds only **~4 rows** of leftover test data.
The pending migrations (≈`0016–0034`) were analysed from the repository and are **non-destructive**
(no `DROP TABLE`/`DROP COLUMN`/`TRUNCATE`, no migration-scope `DELETE`; the only policy drops are
drop-and-recreate replacements). Alignment could not be executed this session because the CLI needs
the **Production DB password** (which is deliberately not held) to read migration history and run
`supabase db push`. The phase therefore stops at a **safe, evidence-complete blocker** and requests
the password, a backup confirmation, and approval.

## 2. Starting Baseline

- Repo `main` = `origin/main` = **`8e355d88061321167089dff4cbc777cc29203dc2`** (baseline); working tree clean.
- Migrations `0001–0034`: 34 files, contiguous, no gaps/dupes, unmodified, identical to `origin/main`.
- Supabase CLI **2.110.0**; org **"Quick Serve"** (`kcjgusnprhngykflmizz`, only org).
- CLI currently linked to **Development** only — all Production reads used explicit `--project-ref`.
- Branch protection unchanged (`["PR CI"]`, `enforce_admins=true`, 1 review). This phase does not merge.

## 3. Production Identity Verification

| Attribute | Value |
|---|---|
| Project | Quick Serve Production |
| Ref (redacted) | `lkigkl…ffds` — matches expected Production exactly |
| ≠ QA (`wjvjup…ozws`) / ≠ Development (`gzkvna…xwmc`) | ✅ both distinct |
| Region | `eu-central-1` |
| Status | ACTIVE_HEALTHY (Postgres 17) |
| Command context | no DB password / access token / QA / DEV credential active; no leftover temp creds |

Identity gate **PASS**. All reads used the Production service-role key fetched via the Management
API (stored to a local temp file, never printed; deleted at end of phase).

## 4. Backup Verification

- Supabase **Pro** includes automated **daily backups** by default; PITR is an add-on and was **not**
  purchased/enabled in this phase.
- The exact **latest-backup timestamp / retention** could **not be confirmed via the CLI** this
  session (no stable `backups` CLI command; the Management API backups endpoint requires the access
  token, which was not extracted). **This must be confirmed in the Supabase dashboard immediately
  before any `db push`.**
- **Rule applied:** because a fresh recoverable backup could not be positively verified here, and the
  DB password is missing, execution is **not** performed. Confirm a recent backup before applying.

## 5. Migration History Audit

- **Authoritative history NOT read.** CLI 2.110.0 `migration list` requires `--linked` (points at
  Development — wrong target), `--db-url`, or `--password`; `--project-ref` is not accepted. The
  **Production DB password is required** and is not held, so `supabase_migrations.schema_migrations`
  could not be inspected.
- Schema-object presence was used as a **proxy** for applied state (see §6). The proxy proves
  Production is behind, but the **exact set of recorded migrations must be read from history before
  `db push`**, because `db push` behaviour depends on what history records (risk of attempting to
  recreate already-existing early objects if history is incomplete).

## 6. Schema Drift Audit

- **Production public objects: 11** vs **Development canonical baseline: 30** (Development was built
  purely from `0001–0034`).
- **Present (11):** `booking_activity, booking_messages, booking_photos, bookings, device_tokens,
  notifications, payment_attempts, payments, profiles, provider_earnings, reviews`.
- **Missing (19):** `account_flags, customer_addresses, favorite_providers, favorite_services,
  internal_notes, notification_preferences, promo_codes, promo_redemptions,
  provider_conduct_acceptances, provider_locations, provider_quality_actions,
  review_private_feedback, service_categories, services, support_case_events, support_case_notes,
  support_cases, wallet_transactions, wallets`.
- **Extra/untracked objects: none.** No table-level drift.
- **Classification: B — Behind repository migrations** (clean; not "ahead", not drift).

## 7. Production Data Presence (aggregate counts only)

| Table | Rows |
|---|---|
| profiles | 2 |
| bookings | 1 |
| booking_activity | 1 |
| payments / payment_attempts / reviews / notifications / booking_messages / booking_photos / device_tokens / provider_earnings | 0 |

**~4 rows total** — minimal, consistent with leftover **test data from the isolation-defect era**
(when local development pointed at Production, pre-Phase 4B.1). No PII was read. Because data is
present at all, applying migrations to Production requires **approval** per the phase rules.

## 8. Pending Migration Analysis

Pending set ≈ **`0016–0034`** (the migrations that create the 19 missing objects plus in-place
alters). Full-repo destructive scan results:

- **No `DROP TABLE`, no `DROP COLUMN`, no `TRUNCATE`, no migration-scope `DELETE`.**
- **5 `drop policy if exists` statements — all drop-and-recreate replacements** (0005, 0009, 0020,
  0034 + storage 0016); none is a bare drop that would weaken RLS. Verified each is re-created in the
  same migration.
- Trigger/function drops are idempotent `drop … if exists` + recreate idioms.
- The single `delete from …` occurrence is inside a `SECURITY DEFINER` function body (application
  logic), not a migration-time data deletion.
- FK `on delete cascade` clauses appear only in **new-table definitions**.

**Per-migration risk classification: all Non-destructive.** Items that alter *existing* Production
tables (and so warrant explicit sign-off): `0016` (tighten `booking-photos` storage policies),
`0020` (re-wire notification triggers on `bookings`/`payments`/`booking_messages`/`reviews`/
`profiles`), `0034` (recreate `bookings_update_provider` policy). These are hardening/behaviour
updates that bring Production to the canonical repo state; none drops data.

> Caveat: the **exact** pending list is confirmable only after reading migration history (§5). The
> analysis above covers the full candidate range and found nothing destructive.

## 9. Migration Execution

**NOT PERFORMED.** `supabase db push` against `lkigkl…ffds` was **not** run. Blocked on: Production
DB password (missing), backup confirmation (pending), and explicit approval (Production holds data
and pending migrations replace existing-table policies/triggers). No `db reset`, no `migration
repair`, no manual SQL, no force options, no history squash were used or attempted.

## 10. Post-Migration Verification

N/A — no migration applied. To be completed after approved execution.

## 11. RLS and Policy Verification (read-only, partial)

- RLS is **active** on present tables: anonymous read of `bookings` returns `200` with **0 rows**
  (policies enforced).
- Full policy inventory (names, `SECURITY DEFINER` functions, admin/booking/provider/review/payment/
  notification/storage authorization) requires DB access and is **deferred** until history/DB
  password is available. The repository defines these policies canonically (verified non-weakening in §8).

## 12. Storage Verification

- Production Storage bucket **`booking-photos` exists and is private** ✅.
- MIME/size-limit and storage-policy detail via the storage API is deferred to post-alignment; the
  `0016` migration (pending) tightens `booking-photos` object policies.

## 13. Seed / Reference Data Verification

- **Service catalogue is absent in Production:** `services` and `service_categories` tables do not
  exist yet (migration `0030_services_marketplace` not applied). Until applied and seeded, the
  customer app would fall back to its hardcoded 19-service list. **Do not insert seed data manually**
  — it should follow the canonical `0030` migration (+ any seed step) after alignment. Documented as
  a gap, not actioned.

## 14. Environment Isolation Recheck

| Surface | Points at | State |
|---|---|---|
| local `.env` | Development `gzkvna…` (role=`anon`) | ✅ correct |
| `.env.backup` | Production `lkigk…` | ✅ inactive, unchanged |
| `qa/.env` | QA `wjvju…` | ✅ correct |
| EAS `development` / `preview` / `production` | DEV / QA / (none) | ✅ from Phase 4B.1 |

No DEV/QA workflow points at Production; no Production service-role key in any client-accessible
config; `.env` is gitignored and anon-only.

## 15. Validation Results

| Gate | Result |
|---|---|
| Root TypeScript | ✅ PASS |
| QA TypeScript | ✅ PASS |
| Secret scan (tracked files) | ✅ clean (no JWT-shaped keys) |
| Gitignore verification | ✅ env files ignored |
| Migration-order validation | ✅ 0001–0034 contiguous |
| Root Jest / Website Vitest / lint / Expo web+Android export | Deferred to **PR CI** on this branch (tree = `main` + this doc only; unchanged code already green on the prior commit) |

No connected/mutation/payment/push/native tests were run against Production.

## 16. Findings and Risks

- **P1 — Production is ~19 migrations behind** and its **migration history is unread** (needs DB
  password). `db push` behaviour is not fully predictable until history is confirmed.
- **P2 — Execution blocked** on missing Production DB password + unverified fresh backup + required
  approval.
- **P2 — Leftover test data (~4 rows)** in Production from the isolation-defect era; decide whether to
  retain or clean (separately, with approval) — not touched here.
- **P2 — Service catalogue missing** in Production (0030 not applied); needs migration + seed after alignment.
- **P3 — Backup timestamp not CLI-verifiable**; confirm in dashboard before applying.
- Positive: pending migrations are **non-destructive**; no drift; Edge Functions already present and untouched; RLS active; storage bucket present.

## 17. Production Readiness Impact

Production is **not yet schema-aligned** with the repository. This phase advanced readiness by
proving the exact gap (19 objects), confirming the pending changes are non-destructive, and
identifying the precise unblock path — **without modifying Production**. Alignment remains a
prerequisite for any production cutover.

## 18. Remaining Blockers

1. **Production DB password** — required to read migration history and run `supabase db push`
   (provide securely, or run the push yourself).
2. **Confirm a fresh recoverable backup** (dashboard) immediately before applying.
3. **Explicit approval** to apply the non-destructive pending migrations to Production (data present;
   existing-table policies/triggers replaced).

## 19. Recommended Next Phase

On approval + password + backup confirmation: read Production migration history, produce the exact
pending list and a `db diff` preview, then `supabase db push` (canonical migrations only) against
`lkigkl…ffds`, followed by full post-migration verification (§10–§13), then decide on leftover-data
cleanup and service-catalogue seeding as separate, approved steps. Do **not** deploy app code, Edge
Functions, or enable M-Pesa in that phase.

## 20. Final Status

**PRODUCTION ALIGNMENT BLOCKED — Production is BEHIND (classification B), pending migrations are
non-destructive, execution deferred pending DB password + backup confirmation + approval.** No
Production schema or data was modified; no secrets exposed; no Edge Functions deployed; no payment/
push/app/site/OTA/store actions; Full Platform Certification is NOT claimed.
