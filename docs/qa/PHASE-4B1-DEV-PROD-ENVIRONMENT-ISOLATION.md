# Phase 4B.1 — Development and Production Environment Isolation

> **Isolation defect: RESOLVED — fix APPLIED and VERIFIED.** A dedicated `quickserve-development`
> Supabase project was provisioned (after the owner upgraded the "Quick Serve" org to **Pro**),
> migrations `0001–0034` applied to it, local development + the EAS `development` environment
> repointed to it, and three-environment isolation proven with a live cross-environment test.
> **Production was not modified. QA was read-only. No secret values were printed, logged, or
> committed. No builds, deploys, store submissions, or OTA updates were performed. No customer
> data was copied and no production traffic/payments/push were generated. Full Platform
> Certification is NOT claimed.**

## 1. Executive Summary

The Phase 4A finding — **local development pointed at the production Supabase project** — is now
**remediated**. The blocker recorded in the previous revision of this document (Free-plan
2-active-projects-per-org limit) was cleared by the account owner upgrading the org to **Pro**,
which was confirmed operationally by a successful project creation. A dedicated
**`quickserve-development`** project now backs local development and the EAS `development`
environment; QA remains isolated on `quickserve-qa`; Production remains on its own project and was
untouched. **The dev↔prod isolation defect is CLOSED.**

## 2. Starting State

- Branch `infra/phase-4b1-dev-prod-isolation` (doc-only PR #4), based on `main`.
- Protection unchanged: `enforce_admins=true`, required check `["PR CI"]`, 1 review. **PR #4 is
  NOT merged by this phase.**
- Supabase CLI authenticated; org **"Quick Serve"** (`kcjgusnprhngykflmizz`) — now on **Pro**.
- EAS authenticated (`@dalmarmudu/QuickServe`).

## 3. Resolved Isolation Defect

Previously, the repository root `.env` (local development + every non-QA build) resolved to
**"Quick Serve Production"** (`lkigkl…ffds`). It now resolves to the dedicated
**`quickserve-development`** project (`gzkvna…xwmc`). QA stays on `quickserve-qa` (`wjvjup…ozws`).

Status: **RESOLVED — fix applied and verified.**

## 4. Development Project Provisioning — DONE

Exactly one new project was created; no add-ons, no larger compute, no PITR, no custom domain, no
dedicated IPv4, no log drains.

| Attribute | Value |
|---|---|
| Name | `quickserve-development` |
| Ref (partially redacted) | `gzkvna…xwmc` |
| Region | `eu-central-1` (matches Production + QA) |
| Compute | **Micro** |
| Health | **ACTIVE_HEALTHY** (Postgres 17) |
| DB password | strong, generated locally; **never printed, logged, committed, or documented** |

**Pro confirmation (operational):** creating a 3rd active project succeeded (the org previously
capped at 2 active projects on Free), confirming the plan change without reading any
billing/payment/card/invoice detail.

## 5. Safety Gate (pre-migration) — PASS

- Target ref `gzkvna…xwmc` **≠ Production** `lkigkltvstlxfdztffds` ✅ and **≠ QA**
  `wjvjuplooidctlxxozws` ✅.
- Development contained **no customer data** (0 rows in `bookings`/`profiles`/`payments`/`reviews`;
  0 auth users) before and after (aside from a transient synthetic probe, deleted — see §9).
- The CLI was linked **only** to Development for migration work; no `db reset`/`repair` was run
  against any project; Production/QA were never a `db push`/write target.

## 6. Migration Alignment — DONE

- `supabase link --project-ref gzkvna…xwmc` → `supabase db push` applied **all 34 migrations
  `0001–0034`** cleanly (each `Applying migration …` succeeded; `Finished supabase db push`).
- `supabase migration list`: **local == remote, 34/34, none missing** ✅.
- Post-push verification against Development (service-role, read-only introspection):
  - **30 public objects** exposed (all expected), including `profiles`, `bookings`,
    `provider_locations`/`provider_earnings`, `reviews`/`review_private_feedback`,
    `payments`/`payment_attempts`, `wallets`/`wallet_transactions`, `promo_codes`/
    `promo_redemptions`, `services`/`service_categories`, `booking_messages`, `device_tokens`,
    `customer_addresses`, `favorite_providers`/`favorite_services`, support/notification tables.
  - **RLS active**: anonymous read of `bookings` returns `200` with **0 rows** (policies enforced).
  - **Storage**: `booking-photos` bucket present and **private**.
  - Extensions, SECURITY DEFINER functions, triggers, and the private schema are created by the
    migrations; the clean, error-free application of every migration is the proof they applied.
- **Edge Functions were NOT deployed** this phase (`supabase functions list` on Development → `[]`).

## 7. Local Environment Repoint — DONE (names only)

- Root `.env` (gitignored) repointed to Development. Variable **names** changed (values never
  shown): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- The `.env` key was verified to carry the **`anon`** role claim for ref `gzkvna…` — **not** a
  service-role key (no service-role key is present in any Expo/client variable).
- `qa/.env` continues to point at QA; **`.env.backup` was left unchanged and inactive** (still
  Production `lkigkl…`) and was **not** restored over `.env`.
- **Gitignore hardening (applied):** `.gitignore` now ignores `.env.backup`, `.env.development`,
  and `.env.development.local` (in addition to `.env` / `.env*.local`). Verified: all these plus
  `qa/.env` are ignored and absent from `git status`.

## 8. EAS Environment Mapping — AUDITED + CONFIGURED (no builds)

| Profile (`eas.json`) | EAS environment / channel | Backend after this phase |
|---|---|---|
| development | `development` / `development` | **Development** `gzkvna…` ✅ (configured this phase) |
| preview | `preview` / `preview` | **QA** `wjvjup…` (unchanged) |
| ios-simulator | extends `preview` | **QA** (certification stays on QA) ✅ |
| production | `production` / `production` | no EAS Supabase vars — **left untouched** (Production cutover is a later phase) |

- Added two **plaintext** public variables to the EAS `development` environment only —
  `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Development values; not printed).
- The `preview`/certification environment was **not repointed off QA**. The `production`
  environment was **not modified**. No EAS build, submit, or update was triggered. EAS values were
  not exposed.

## 9. GitHub Secrets — AUDITED (no `DEV_*` created)

- Workflow secret consumption (authoritative): only `ios-native-journeys.yml` reads secrets —
  `EXPO_TOKEN` + `QA_*` (QA-scoped). **PR CI reads no secrets** (uses non-secret placeholders).
- **No `DEV_*` secrets were created.** Rationale: no CI/CD workflow targets a Development backend
  (local development uses the gitignored local `.env`), so `DEV_SUPABASE_URL` /
  `DEV_SUPABASE_ANON_KEY` / `DEV_SERVICE_ROLE_KEY` are **not genuinely needed** yet; creating
  unused secrets would only enlarge the secret surface. They can be added if/when a workflow
  consumes Development.
- **QA secrets unchanged** (no secret was created/updated/deleted). **No production secrets** exist
  or were created. No secret value appears in any log or commit.

## 10. Three-Environment Isolation Proof — PASS

| Attribute | Development | QA | Production |
|---|---|---|---|
| Project | quickserve-development | quickserve-qa | Quick Serve Production |
| Ref (redacted) | `gzkvna…xwmc` | `wjvjup…ozws` | `lkigkl…ffds` |
| Region | eu-central-1 | eu-central-1 | eu-central-1 |
| Local env mapping | root `.env` ✅ | `qa/.env` | `.env.backup` (inactive) |
| EAS mapping | `development` env | `preview`/certification | `production` (untouched) |

- **Distinct identities:** 3 unique project refs/URLs; 5 unique anon/service keys across the two
  projects whose keys are held locally (SHA-256 prefixes all differ; Production anon is a distinct
  newer-format publishable key). DEV/QA anon keys carry `role=anon`; DEV/QA service keys carry
  `role=service_role`, each bound to its own ref.
- **Live cross-environment write isolation (synthetic, cleaned up):** a synthetic auth user was
  created in **Development** → present in DEV, **absent in QA** (read-only check) → then **deleted**
  from Development. DEV auth users returned to **0**. **No write to QA or Production.**
- **Separate DB / Auth / Storage / Edge:** DEV data 0 rows; DEV Storage `booking-photos`
  independent; DEV Edge Functions `[]`.

## 11. Validation Results (safe, repo-only + Development connectivity)

| Gate | Result |
|---|---|
| Development health | ✅ ACTIVE_HEALTHY (PG17) |
| Migration alignment (Development) | ✅ 34/34, local == remote |
| Development connectivity smoke (PostgREST + Auth) | ✅ |
| Local app init against Development (Expo web + Android export) | ✅ exit 0 (client constructs vs DEV `.env`) |
| Root TypeScript (`tsc --noEmit`) | ✅ PASS |
| QA TypeScript | ✅ PASS |
| Root Jest | ✅ 222 suites / 2951 tests |
| Website Vitest | ✅ 7 files / 102 tests |
| Lint | ⚠ 502 pre-existing problems (non-gating; no product code changed this phase) |
| Expo config resolution | ✅ |
| Expo web export | ✅ |
| Expo Android export | ✅ |
| Secret scan (tracked files) | ✅ clean (only benign prose mentions; no key values) |
| Gitignored-file verification | ✅ `.env`/`.env.backup`/`.env.development`/`.env.development.local`/`qa/.env` ignored |
| Connected QA certification (116/116) | **Not re-run**; remains QA-scoped; **not run against Development** |

No test was run against Production. Connected certification was **not** repointed away from QA.

## 12. Cleanup

- Synthetic Development probe user deleted; Development returned to 0 users / 0 rows.
- Local scratch credential files (Development DB password / ref / keys) are outside the repo and
  are removed at the end of the phase; none were committed.
- Working tree contains only intended changes (this document + `.gitignore`); env files remain
  gitignored and uncommitted.

## 13. Production Readiness Impact

The **dev↔prod isolation defect is CLOSED**: local development and the EAS `development`
environment now run against a dedicated Development project, eliminating the Phase 4A/4B P1 risk of
development operating on the production database. Production itself was not modified; its migration
alignment (Phase 4C) and any production cutover remain future, separately-gated work.

## 14. Final Status

- **Isolation defect: RESOLVED — applied and verified.**
- **Provisioned:** one `quickserve-development` project (Micro, eu-central-1), migrations
  `0001–0034` applied.
- **Production not modified; QA read-only only; historical inactive project not reused; no secrets
  created or exposed; DB password never revealed; no customer data copied; no production
  traffic/payments/push; no builds/deploys/store/OTA. Full Platform Certification is NOT claimed.**
- **Next:** await approval before Phase 4C (production migration alignment). PR #4 is left **open,
  not merged**, branch protection unchanged.
