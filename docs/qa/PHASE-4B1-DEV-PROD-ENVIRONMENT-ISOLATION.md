# Phase 4B.1 — Development and Production Environment Isolation

> **Isolation defect: CONFIRMED. Fix: BLOCKED (not applied, not verified).** The fix requires
> creating a dedicated development Supabase project, and creating a 3rd active project in the
> organization requires a **paid-plan / billing decision** that only the account owner can make.
> Per the phase rule ("*if project creation requires a paid-plan decision, billing
> confirmation, or user interaction: stop before creating it, report the exact decision
> required, do not substitute another project*"), **no project was created, no existing project
> was modified or repurposed, no dev config was repointed, and no secret was exposed.** Full
> Platform Certification is NOT claimed.

## 1. Executive Summary

The Phase 4A finding is confirmed with direct evidence: **local development points at the
production Supabase project.** The remedy — a dedicated `quickserve-development` project — could
not be provisioned in this session because the Supabase organization **"Quick Serve"** already
runs **2 active projects** (Production + QA) and a third project would exceed the Free-plan
2-active-projects-per-org limit. Creating it requires the owner to **upgrade the org to a paid
plan (or explicitly confirm billing)**. This report documents the confirmed defect, the full
inventory, the exact blocking decision, and the isolation plan to execute once unblocked.
**The isolation defect remains OPEN.**

## 2. Starting State

- `main` HEAD `8e355d88061321167089dff4cbc777cc29203dc2` (== baseline); working tree clean;
  `local main == origin/main`.
- Protection: `enforce_admins=true`, required check `["PR CI"]`, 1 review. **PRs #2 and #3
  remain open and unmerged.**
- Supabase CLI authenticated; org **"Quick Serve"** (`kcjgusnprhngykflmizz`) — the only org.
- EAS authenticated (`@dalmarmudu/QuickServe`).

## 3. Confirmed Isolation Defect

**Development ↔ Production are NOT isolated.** The repository's root `.env` (used by local
development and every non-QA build) resolves to the project named **"Quick Serve Production"**
(`lkigkl…ffds`). QA is correctly isolated on `quickserve-qa` (`wjvjup…ozws`). There is **no
dedicated development project**; development uses production.

Status: **CONFIRMED — not fixed, not verified, still blocked.**

## 4. Existing Environment Inventory (read-only)

| Project | Ref (partially redacted) | Region | Status | Actual use |
|---|---|---|---|---|
| **Quick Serve Production** | `lkigkl…ffds` | `eu-central-1` | ACTIVE_HEALTHY (PG17) | root `.env` → **development + all non-QA builds** (defect) |
| quickserve-qa | `wjvjup…ozws` | `eu-central-1` | ACTIVE_HEALTHY (PG17) | `qa/.env` + GH `QA_*` secrets (isolated) |
| quickserve | `nkdmsu…zwhe` | `eu-west-1` | **INACTIVE** | old/paused (consistent with Free-plan 2-active limit) |

**Dedicated development project: does NOT exist** (confirmed).

## 5. Development Project Provisioning — BLOCKED (billing decision)

Intended: create `quickserve-development` in org `kcjgusnprhngykflmizz`, unique DB/auth/storage/
Edge/keys, strong generated DB password, region `eu-central-1` (match existing), size `micro`.

**Blocker (evidence-based):** the org has **2 ACTIVE projects** (Production + QA) and one
**INACTIVE** project. The Supabase **Free plan allows a maximum of 2 active projects per
organization**; the inactive third project is the tell-tale of that limit. A new active
`quickserve-development` project would be the **3rd active project → requires a paid (Pro) plan
or an explicit billing confirmation.**

**Exact decision required from the account owner (choose one):**
1. **Upgrade the "Quick Serve" org to Supabase Pro** (paid, ~US$25/mo base + compute), then
   authorize creating `quickserve-development`; **or**
2. **Explicitly confirm billing** for a new project on the current plan; **or**
3. Provide an alternative isolated development target you have authorized.

**Not done (deliberately):** no project created; **no speculative `projects create` attempted**
(it would create a billable resource without your confirmation); the old `quickserve`
(`nkdmsu…zwhe`) was **not** reactivated/substituted (forbidden by the phase rules and it too
counts toward the active limit); **no existing project modified.**

## 6. Migration Alignment — BLOCKED (depends on §5)

Target `supabase/migrations/0001–0034` (verified: sequential, no gaps). **Not applied** — there
is no development project to `link`/`db push` to. `db push`/`reset`/`repair` were **not** run
against any project. Production and QA were **not** touched beyond read-only `projects list`.

## 7. Local Environment Changes — BLOCKED (depends on §5)

Repointing local development requires the new project's URL + keys, which do not exist. Current
state (unchanged): root `.env` (gitignored) → production project; `qa/.env` (gitignored) → QA.
**No `.env` was modified or committed.** Intended change once unblocked (variable **names**
only, never values): set `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the
local `.env` to the new development project.

**Hardening note:** `.env`, `.env.local`, and `qa/.env` are gitignored, but **`.env.development`
is NOT currently gitignored** — add `.env.development` (or `.env.*`) to `.gitignore` **before**
any development env file is created, to prevent committing dev secrets. (Not changed here.)

## 8. EAS Environment Mapping (audit; no change)

| Profile | `eas.json` environment/channel | Resolves to (today) | Target once isolated |
|---|---|---|---|
| development | `development` | root `.env` → **production** (defect) | development project |
| preview | `preview` | root `.env` → production | preview/staging |
| production | `production`, autoIncrement | root `.env` → production | production project |
| ios-simulator | extends preview | (build), journeys via QA | **stay QA** |
| iOS Native Journeys / Android certification | — | **QA** (`QA_*` GH secrets) | **stay QA (unchanged)** |

Certification workflows already read **QA** secrets and were **not** repointed. No EAS
dashboard variables were created/changed (would require the dev project to exist).

## 9. GitHub Secrets and Workflow Mapping (audit; no change)

- Actions secrets present (names only): `EXPO_TOKEN`, `QA_SUPABASE_URL`, `QA_SUPABASE_ANON_KEY`,
  `QA_SERVICE_ROLE_KEY`, `QA_CUSTOMER_*`, `QA_PROVIDER1_*` (8 total). **No production secrets.**
- **No `DEV_*` secrets created** (no dev project yet). Intended names once unblocked:
  `DEV_SUPABASE_URL`, `DEV_SUPABASE_ANON_KEY`, `DEV_SERVICE_ROLE_KEY`.
- Verified unchanged: QA workflow reads `QA_*`; **PR CI requires no secrets**; iOS Native
  Journeys reads `QA_*`; no workflow reads production values (none exist). No secret in logs/commits.

## 10. Development Connectivity Validation — BLOCKED (depends on §5)

Cannot connect to a development project that does not exist. **No connectivity test was run
against production or QA for this purpose** (no dev data created; nothing to clean up).

## 11. Three-Environment Isolation Matrix

| Attribute | Development | QA | Production |
|---|---|---|---|
| Project name | **NOT PROVISIONED** | quickserve-qa | Quick Serve Production |
| Ref (redacted) | — | `wjvjup…ozws` | `lkigkl…ffds` |
| Region | — | eu-central-1 | eu-central-1 |
| DB / auth / storage / Edge identity | — | isolated | isolated vs QA |
| Local env mapping | **currently → production (defect)** | `qa/.env` | root `.env` |
| EAS mapping | dev profile → production (defect) | certification workflows | production profile |
| GH secrets | none (`DEV_*` planned) | `QA_*` (7) + `EXPO_TOKEN` | none |

**Proof status:** QA ref ≠ Production ref ✅ (isolated). **Development ≠ Production: NOT provable
— they are currently the same project ❌.** The dev/prod isolation the phase requires **cannot
be proven until a development project exists.**

## 12. Security Verification

- No secret values printed; `supabase projects api-keys` **not** run; project refs (not secrets)
  partially redacted.
- Committed-secret scan: **clean** (only `.env.example` templates tracked; `.env`/`.env.local`/
  `qa/.env` gitignored — verified).
- Production project: **not modified.** QA project: **read-only verification only.**
- Top security concern unchanged: **dev↔prod not isolated** (this phase is the intended fix,
  now blocked on billing).

## 13. Validation Results (safe, repo-only)

| Gate | Result |
|---|---|
| Root TypeScript | ✅ PASS |
| QA TypeScript | ✅ PASS |
| Root Jest / Website Vitest / lint / Expo web+Android export | ✅ green via PR CI #2 & #3 (full suite on trees from `main@8e355d8`) + Phase 4A run this session |
| Expo config resolution | ✅ (Phase 4A) |
| Secret scan (tracked files) | ✅ clean |
| Gitignored-file verification | ✅ `.env`/`.env.local`/`qa/.env` ignored (⚠ `.env.development` not yet ignored) |
| Migration list integrity | ✅ 0001–0034 sequential |
| Connected QA certification (116/116) | **Not re-run** — remains targeted at QA; **not run against development** (no dev project exists) |
| Dev connectivity / migration alignment against development | **BLOCKED** (no dev project) |

No test was run against production. Connected certification was **not** repointed away from QA.

## 14. Cleanup

No resources were created; **nothing to clean up.** No disposable data was written to any
project. Working tree clean.

## 15. Remaining Blockers

1. **Billing/plan decision (primary):** authorize a paid plan (or billing) to create a 3rd
   active Supabase project (`quickserve-development`).
2. Dependent-and-blocked until (1): dev project provisioning, migration `db push` to dev, dev
   `.env` repoint, `DEV_*` secrets, dev EAS variables, connectivity/isolation proof.
3. Add `.env.development` to `.gitignore` before creating dev env files.

## 16. Production Readiness Impact

The **dev↔prod isolation defect remains OPEN** — production readiness is **unchanged** by this
phase. Until fixed, local development and any non-QA build operate against the production
database (a P1 risk from Phase 4A/4B). No provisioning progressed.

## 17. Recommended Next Step

**Owner decision then re-run 4B.1:** the owner confirms the Supabase billing/plan; I then create
`quickserve-development` (unique DB/auth/storage/keys, generated password), `link` + `db push`
migrations 0001–0034 to it, repoint the local `.env` (names only), add `DEV_*` secrets and
`.gitignore` entry, and produce the full isolation proof — **without touching Production or QA.**
Only after isolation is verified should Phase 4C (migration alignment on the isolated prod
project) proceed.

## 18. Final Status

- **Isolation defect: CONFIRMED.**
- **Isolation fix: NOT applied, NOT verified — BLOCKED** on a Supabase paid-plan/billing decision.
- **Resources provisioned: NONE.** Production **not modified**; QA **read-only** only; no dev
  config repointed; **no secrets created or exposed**; no customer data copied; no production
  traffic/payments/push. **Full Platform Certification is NOT claimed.**

This phase changed only this document (provisioning is externally blocked).
