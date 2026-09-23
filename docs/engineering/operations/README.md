# QuickServe Operations

## 1. Purpose

The authoritative operations engineering reference for QuickServe, describing **only the
operational capabilities that exist in the repository today** — provisioning, health
verification, logging/audit, error handling, and the admin operations tooling — each
traceable to source. Where an operational practice (monitoring, alerting, backups, incident
response, on-call, SRE) is not implemented or documented, it is marked **Not verified** /
**Not documented** rather than invented.

Deploy mechanics are in [deployment/](../deployment/README.md); release records in
[releases/](../releases/README.md); the security posture in [security/](../security/README.md).

## 2. Current Operational Status

| Badge | Meaning |
|---|---|
| **Implemented** | Present in code/scripts/SQL. |
| **Partial** | Present but incomplete / off by default. |
| **Planned** | Referenced but not built. |
| **QA-only** | Certification/test infrastructure. |
| **Not verified** | The repository does not prove this exists. |

**Summary:** provisioning (QA accounts + schema migrations), **health verification** scripts
(QA/dev), an in-app **admin operations portal** (support/disputes/flags), DB **audit**
(`booking_activity`), and **gated crash reporting** (Sentry) are **Implemented/Partial**.
Continuous production monitoring, alerting/dashboards, backup/recovery procedures, incident
response, and on-call are **Not documented / Not verified** in the repository.

## 3. Operational Architecture

QuickServe runs on managed platforms (Supabase + Vercel + EAS builds), so operations is
mostly **platform-managed plus repository-supported scripts and in-app admin tooling**:

- **Operators** run CLI utilities (provisioning, migrations, health/certification) and use the
  **admin web panel** for runtime operational actions.
- **Supabase** hosts the database/Auth/Storage/Realtime/Edge Functions and provides
  platform-level logs (not configured in-repo).
- **Clients** optionally report crashes to **Sentry** (off unless a DSN is set).

```mermaid
flowchart TD
    OP["Operator (CLI)"] -->|db push / functions deploy| SUP["Supabase project"]
    OP -->|provision-accounts.mjs| SUP
    OP -->|qa:health / certification / migration list| QA["QA verification (dedicated QA project)"]
    ADM["Admin (web panel)"] -->|ops portal RPCs (0026)| SUP
    APP["Mobile / web clients"] -->|anon key + RLS| SUP
    APP -.->|crash reports (if DSN set)| SEN["Sentry (gated)"]
    SUP --> EF["Edge Functions"] --> EXT["Daraja · Expo Push · Google"]
    SUP -.->|platform logs / backups| PLAT["Supabase platform (not configured in-repo)"]
```

## 4. Runtime Responsibilities

- **Mobile application** — authenticates via the anon key; persists/refreshes sessions;
  registers a push token (`register-device`); reports crashes to Sentry **only if**
  `EXPO_PUBLIC_SENTRY_DSN` is set (`src/lib/monitoring.ts`).
- **Web application** — the Vercel-served Expo web build; hosts the **admin operations panel**
  (`src/app/(admin-web)/operations/*`) for runtime operational actions.
- **Supabase** — enforces access (RLS), runs triggers/RPCs, stores data/objects, and serves
  Realtime; provides platform logs/backups (platform-managed, not configured in-repo).
- **Edge Functions** — payments (`mpesa-stk-push`/`mpesa-callback`), push (`send-push`),
  device registration, and maps; secret-gated where webhook-style; the push path has a
  **kill-switch** (`send_push_url` NULL in `private.push_config`, `supabase/migrations/0015`).
- **Database** — the source of truth; enforces integrity + writes the `booking_activity` audit
  trail (`supabase/migrations/0007`, `0020`).
- **Storage** — the private `booking-photos` bucket (`supabase/migrations/0006`, `0016`).
- **External integrations** — M-Pesa Daraja, Expo Push, Google Places/Maps (reached from Edge
  Functions).

## 5. Operational Processes

Verified, repository-supported activities only:

- **Schema deployment** — apply migrations via `supabase db push`; verify alignment with
  `supabase migration list` (see [deployment/](../deployment/README.md), [database/](../database/README.md)).
- **Account provisioning** — `qa/scripts/provision-accounts.mjs` (QA accounts; §6).
- **Health / certification runs** — `npm run qa:health`, `qa:test:certification`,
  `qa:test:stability` (`qa/package.json`); the root `qa:release` gate.
- **Admin operational actions (in-app)** — support cases, disputes, account flags, and internal
  notes via the operations portal RPCs (`supabase/migrations/0026_operations_portal.sql`:
  `create_support_case`, `add_support_case_note`, `assign_support_case`,
  `update_support_case_status/priority`, `set_dispute_outcome`, `flag_account`,
  `lift_account_flag`, `add_internal_note`); documented in `docs/pilot/operations-portal.md`.
- **Edge Function operations** — deploy via the Supabase CLI, set secrets
  (`supabase secrets set ...`), and use the push kill-switch; reference `docs/pilot/edge-function-health.md`.
- **Deterministic QA cleanup** — certification teardown deletes created rows + sweeps by marker
  (`qa/docs/LAUNCH-CERTIFICATION.md`).

### Account deletion — never delete an Auth user directly

**Rule: do not delete a row from `auth.users` (Supabase dashboard, admin API or SQL) as a way of
removing an account.** Since migration `0056_account_deletion.sql`, `profiles.id` no longer
references `auth.users`, so the profile does not cascade when the login is removed. A raw Auth
deletion therefore leaves an **active, un-scrubbed profile** behind: the person's name, phone,
photo and other personal fields stay in the database, the row is not marked deleted, and nothing
downstream treats the account as gone.

The profile is deliberately retained as a **tombstone** so that financial, dispute and audit rows
keep a referent. Deleting it outright is blocked anyway: roughly thirty tables reference
`profiles(id)`, and `provider_payouts.earning_id` is `ON DELETE RESTRICT`.

**Correct operator sequence**

1. **Scrub and tombstone first.** Call `public.delete_account(<user id>)` as `service_role`. This
   runs in one transaction: it refuses the request if a blocker is present, otherwise deletes the
   disposable rows, anonymises the retained ones, and sets the profile to a tombstone with
   `deletion_status = 'pending_auth_delete'`. From this point restrictive RLS denies the identity,
   so the account has already lost data access.
2. **Then remove the Auth user.** Only after step 1 reports success.
3. **If the Auth deletion fails, leave it pending and retry.** `pending_auth_delete` is the
   designed retryable state, not an error to clean up by hand. The data layer has already locked
   the account out, and re-running the `delete-account` Edge Function (or repeating step 2)
   completes the job idempotently. Do not hand-edit `deletion_status` and do not delete the
   profile row to "finish" it.

**Admins are out of scope for self-service deletion.** Administrator and support accounts cannot
be deleted from the app; the screen refuses them. They are removed by operations using the same
two-step sequence above.

QA fixture teardown follows the same rule: the helpers remove fixture profiles explicitly rather
than relying on a cascade that no longer exists.

Public-facing wording for this behaviour lives in `docs/pilot/legal-support.md` §8, the
`/delete-account` website page and the in-app delete screen. They must stay consistent.

Retention of the records deletion leaves behind has **no** implemented review or purge. A proposed
manual procedure, its dependency constraints and the code and schema work it needs are drafted in
`docs/pilot/data-retention-review.md`, awaiting owner approval.

#### Outstanding before the account-deletion release

The `delete-account` Edge Function was restructured (decision flow moved to `handler.ts`, profile
lookup now fails closed). **It is NOT certified against QA in that form.** Open items:

1. **Validate the Deno boundary — DONE.** `deno check` now passes on the real `index.ts` against
   the real `jsr:@supabase/supabase-js@2`, with the entry point free of casts. Removing the
   `as unknown as` casts exposed a genuine incompatibility they had been hiding: PostgREST returns
   an awaitable builder, not a `Promise`, so `maybeSingle()` and `rpc()` are typed `PromiseLike`.
   The client is given an explicit schema and the `from` signature is pinned to the one table read,
   both to keep TypeScript inside its instantiation-depth limit. Reproduce with:
   `npx deno@2 check supabase/functions/delete-account/index.ts` from a directory whose
   `deno.json` sets `"nodeModulesDir": "auto"`, outside the repository's own `node_modules`.
2. **Re-certify against QA once access is restored — PREPARED, NOT RUN.** The run sheet is
   `docs/qa/ACCOUNT-DELETION-REVISED-FUNCTION-QA-RUN.md`: deploy ONLY `delete-account`, do not
   reapply `0056`, run the full certification (which already covers the `pending_auth_delete` retry
   and idempotent repeat), and confirm the delta-zero baseline and disposable-user cleanup. The
   only missing credential is a Supabase CLI personal access token, for `functions deploy` alone;
   every QA fixture key is already in `qa/.env`. Do not carry the previous version's certification
   forward.
3. **Cover the two new refusal paths — DONE locally.** Profile-read failure and missing profile are
   covered by dependency injection in `src/__tests__/delete-account-handler.test.ts`: four causes
   for the read failure, each proving no password verification, no data mutation, no ban and no
   auth deletion. Reverting the gate fails twelve of those tests. **No fault-injection hook was
   added to the deployed function, and none may be**: anything that can force a failure in QA can
   be reached in production. No shared QA policy is touched.
4. **Booking-photo storage scope: FINDING WITHDRAWN, guard added.** An earlier review claimed the
   `booking-photos` object-read policy was open to any authenticated user. That described the
   superseded `0006` policy; `0016_tighten_booking_photos_storage.sql` drops it and scopes object
   reads to the booking's customer, its assigned provider, or an admin.
   `src/__tests__/booking-photo-storage-scope.test.ts` now replays every migration in version order
   and asserts on the definition left standing, rather than on `0016`'s wording — so a later
   migration that dropped or re-broadened the policy would fail it. Verified by temporarily adding
   such a migration, which failed four cases. No storage policy is changed.
5. **The retention procedure remains unapproved.** `docs/pilot/data-retention-review.md` is a draft.
   Its owner and cadence are proposals. The deletion-or-anonymisation sentence stays out of the
   public pages until the gate in its §9 is met.

### Migration numbering — `0055` is reserved, not free

Operational record, current as of this note:

- **Account deletion owns `0056`** (`0056_account_deletion.sql`). It is merged in PR #27 and is the
  highest migration QA has applied.
- There is **no `0055` file in this branch**, and nothing in it references one. The gap is
  intentional.
- An **unmerged** hardening migration (internal notification helper privileges) currently sits on
  its own branch named `0055`. It **must be renamed to `0057` before that branch merges**, together
  with the two filename constants in its own tests.
- **Production must never receive a `0055` after `0056`.** The Supabase CLI keys history on the
  four-digit version prefix and refuses a local migration that sorts before the last applied remote
  version, failing closed with `LegacyDbPushMissingRemoteError`. Renumbering forward keeps every
  push in order.
- **`--include-all` is not the planned production procedure.** It is not a remedy for this and must
  not be used to force an out-of-order migration through. See
  `supabase/migrations/archive/README.md` for the earlier `0034` collision that established this.
- **No change to the unmerged branch is authorised by this note.** It records the agreed target
  only; the rename happens on that branch, by its own owner, before it merges.

### Automatic deployment inventory

What a merge to `main` actually deploys, and what it does not. Verified from the repository on
2026-09-23; dashboard-held state is marked UNKNOWN rather than assumed.

| Surface | Trigger | State |
|---|---|---|
| Cloudflare Workers Builds -> Worker `quickserve` (admin web) | Push to `main` | **ACTIVE.** Build `npm run build:admin`; deploy `npm run check:admin-artifact && npx wrangler deploy -c apps/admin/wrangler.jsonc` |
| Vercel -> consumer Expo web export | Push to `main`, IF a git integration exists | **UNKNOWN.** `vercel.json` at the repository root is configuration evidence only. It is not proof of a live connection, and repository contents cannot establish one. **An operator must confirm.** |
| GitHub Actions | — | **NONE deploy.** `pr-ci.yml` runs on `pull_request` to `main` and manual dispatch; the three iOS workflows are `workflow_dispatch` only. No workflow has a `push:` trigger. |
| Supabase Edge Functions | — | **Hand-deployed only.** No workflow runs `supabase functions deploy`. |
| Worker `quickserve-auth-qa` (QA auth bridge) | — | **Hand-deployed only** via `wrangler.qa-auth.jsonc`. Never touched by Workers Builds. |

The Cloudflare deploy command above is the agreed one and must be preserved verbatim; changing it,
or any other Workers Builds setting, is a production change needing explicit authorisation
(`docs/pilot/web-admin-deploy.md`).

**Not documented / Not verified:** automated backups, restore drills, incident response,
on-call, scheduled maintenance jobs.

## 6. Provisioning

- **QA accounts** — `qa/scripts/provision-accounts.mjs` (idempotent, service-role) creates the
  four persistent QA accounts (customer, admin, provider1, provider2) with correct
  role/approval in a **dedicated QA project**; guarded against production
  (`assertNotProduction`, `qa/playwright/support/connected/qa-accounts.ts`). It auto-loads
  `qa/.env` (`qa/scripts/lib/load-env.mjs`).
- **Schema** — provisioned by migrations via `supabase db push` (`0001`–`0034`).
- **Admin accounts** — created manually in Supabase (never self-registrable; `handle_new_user`
  downgrades attempted admin signups, `supabase/migrations/0001_profiles.sql`).
- No production end-user provisioning automation exists beyond normal app signup.

## 7. Health Monitoring

Distinguish **automated health verification** (implemented) from **continuous monitoring**
(largely not in-repo):

- **Health verification (Implemented, QA/dev):**
  - `qa:health` — framework + infra self-tests (`qa/playwright/tests/`, 19).
  - `qa:test:certification` — connected backend certification (21) against the QA project.
  - `supabase migration list` — local↔remote migration alignment.
  - `qa:release` — Jest + `tsc` + Expo web/android exports as a pre-release gate.
  - Backend-reachability smoke exists in the certification suite (`backend-smoke.spec.ts`).
- **Continuous monitoring (Partial / Not verified):**
  - **Sentry** crash reporting is integrated (`src/lib/monitoring.ts`) but **off unless
    `EXPO_PUBLIC_SENTRY_DSN` is set** (`tracesSampleRate: 0`); by default no external errors are
    sent (consistent with `docs/pilot/crash-logging.md`).
  - `docs/pilot/pilot-monitoring.md` is **operator guidance** (what to watch, escalation) — not
    an automated monitoring system.
  - **No automated alerting, dashboards, uptime checks, or SLOs are configured in the repository
    — Not verified.**

## 8. Logging and Audit

- **Database audit** — `booking_activity` records booking creation/status changes via triggers
  (`supabase/migrations/0007`, `0020`); ordering is certified
  (`qa/playwright/certification/golden-path.spec.ts`). **Implemented / Certified.**
- **Operational audit (admin)** — the operations portal records `support_case_events`,
  `internal_notes`, and `account_flags` (`supabase/migrations/0026`). **Implemented.**
- **Crash logs** — Sentry when a DSN is configured, else local `console` only
  (`src/lib/monitoring.ts`). **Partial (gated).**
- **Edge Function logs** — functions return/`console` errors; captured by Supabase platform
  logging (not configured in-repo).
- **Platform logs** — Supabase provides Auth/Postgres/Edge logs (platform-managed). **Not
  configured in-repo.**
- **Not present in-repo:** centralized logging, SIEM, log retention policy — **Not verified**.

## 9. Error Handling

- **App data wrappers** return safe results rather than throwing (e.g. `createBooking` maps any
  insert error — including the dedup 409 — to a generic message, `src/lib/bookings.ts`).
- **Auth errors** are mapped to friendly copy (`src/lib/auth-errors.ts`).
- **Monitoring hook** — `reportError`/`captureException` never throws (`src/lib/monitoring.ts`).
- **Graceful degradation** — analytics/backend wrappers convert backend errors into safe
  defaults (documented in the QA slices); UI keeps rendering.
- **Edge Functions** — validate input/secrets and return HTTP errors (401 on bad webhook
  secret); the push path is disabled when its config is unset (kill-switch).

## 10. Maintenance Activities

Repository-supported maintenance only:

- **Corrective migrations** — schema/policy fixes ship as new forward migrations
  (e.g. RC1 `0033`/`0034`); there is **no automated rollback** (see [deployment/](../deployment/README.md) §14).
- **QA data hygiene** — certification cleans up its own rows (per-test + marker sweep); the
  fixed provisioning-baseline notifications are documented and intentionally left
  (`qa/docs/LAUNCH-CERTIFICATION.md`).
- **Stability runs** — `qa/scripts/stability.mjs` (repeat cycles) for infra changes.
- **Dev scaffolding reset** — `scripts/reset-project.js` is a **one-time developer** utility
  (resets `src/` to a blank app); it is **not** an operational/production tool.
- **Not documented:** scheduled maintenance windows, data-retention/cleanup jobs in production,
  key rotation.

## 11. Operational Dependencies

- **Supabase project** (Auth/DB/Storage/Realtime/Edge) — the core runtime.
- **Supabase CLI** — migrations + Edge Function deploys.
- **Vercel** — web hosting; **EAS** — mobile builds.
- **External services** — M-Pesa Daraja, Expo Push, Google Places/Maps (per-environment config).
- **Environment variables/secrets** — client `EXPO_PUBLIC_*`, server/edge secrets, QA `QA_*`
  (see [security/](../security/README.md) §9; names in `.env.example`, `qa/.env.example`).
- **Optional:** Sentry (crash reporting when DSN set).

## 12. Operational Risks

Verified risks only:

- **No continuous monitoring/alerting in-repo** — crash reporting is off unless a DSN is set;
  no dashboards/SLOs are configured (**Not verified**).
- **No automated backup/restore procedure in-repo** — reliance on Supabase platform backups,
  undocumented here (**Not documented**).
- **No automated rollback** — recovery from a bad migration requires a corrective migration.
- **Manual, CLI-driven operations** — provisioning, deploys, and health runs are operator-driven
  (no CI/CD), so correctness depends on operator discipline.
- **Uncertified external paths** — M-Pesa settlement, push delivery, storage, maps are not
  E2E-certified; their operational behavior is unproven in-repo.

## 13. Operational Constraints

- Operations are **manual / CLI + admin-panel driven**; there is **no orchestration or
  automation layer** (no CI/CD, no scheduled jobs) in the repository.
- The **service-role** key is used only server-side/QA (never client) — operational scripts that
  need it (provisioning) run outside the app.
- The **QA environment is separate** from production and must never be conflated
  (`assertNotProduction`).
- Production operational tooling beyond the admin panel + CLI scripts is **not present in the
  repository**.

## 14. QA Operational Relationship

Operations relies on the QA program for pre-release verification without duplicating it:

- **`qa:release`** (root) chains Jest + `tsc` + Expo exports + the multi-browser QA suite.
- **Connected certification** (21/21) proves the backend spine against the dedicated QA project;
  **health** (19/19) verifies the framework/infra.
- **Deterministic cleanup** keeps the QA project clean across runs.
- The QA workspace is isolated from the shipped build and never ships.

Details in [qa/](../qa/README.md) and `qa/docs/LAUNCH-CERTIFICATION.md`.

## 15. Related Documentation

- [Architecture](../architecture/README.md) · [Backend](../backend/README.md) ·
  [Database](../database/README.md) · [API](../api/README.md) ·
  [Authentication](../authentication/README.md) · [Security](../security/README.md) ·
  [Deployment](../deployment/README.md) · [QA](../qa/README.md) · [Releases](../releases/README.md)
- Engineering index: [../README.md](../README.md)
- Operator guides (existing): [../../pilot/](../../pilot/) — `pilot-monitoring.md`,
  `crash-logging.md`, `edge-function-health.md`, `operations-portal.md`, `backend-readiness.md`,
  `production-readiness.md`, `environment-secrets.md`

---

### Operational lifecycle

```mermaid
sequenceDiagram
    participant Op as Operator
    participant CLI as Supabase / QA CLI
    participant SUP as Supabase project
    participant QAp as QA project
    participant Adm as Admin panel

    Op->>CLI: provision-accounts.mjs (QA accounts)
    Op->>CLI: supabase db push (migrations)
    CLI->>SUP: apply schema (0001..0034)
    Op->>CLI: qa:health / qa:test:certification
    CLI->>QAp: verify (21/21 · 19/19) + migration alignment
    Op->>CLI: eas build / vercel deploy / functions deploy
    Adm->>SUP: operate (support cases · disputes · flags)
    Note over SUP: booking_activity audit + gated Sentry
    Op->>CLI: corrective migration (no auto-rollback)
```

*Verified against:* `package.json`, `qa/package.json`, `qa/scripts/provision-accounts.mjs`,
`qa/scripts/stability.mjs`, `src/lib/monitoring.ts`, `supabase/migrations/0007`, `0015`,
`0020`, `0026`, `supabase/functions/`, `qa/docs/LAUNCH-CERTIFICATION.md`, and `docs/pilot/`.
