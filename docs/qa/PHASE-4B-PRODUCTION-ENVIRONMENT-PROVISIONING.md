# Phase 4B — Production Environment Provisioning

> **CRITICAL DISCLOSURE — nothing was provisioned in this phase.** The executing environment
> has **no account access** to create or configure production infrastructure (no DNS/registrar
> access for `qs.co.ke`; no Vercel/GCP/Firebase/Sentry/Apple/Daraja accounts). Per the phase's
> own rule ("*if any required credential is unavailable, stop that section and report exactly
> what is missing*"), each provisioning section below is reported as **verified state +
> BLOCKED with the exact missing credential**. **No resource was created, linked, mutated,
> deployed, or exposed. No production traffic, payments, push, or data migration occurred. No
> secret values were printed. Full Platform Certification is NOT claimed.**
>
> **Notable read-only finding:** a Supabase project *named* "Quick Serve Production" already
> **exists** — but it is the same project the **development/default `.env` points at** (a
> critical dev↔prod isolation defect). See §5 and §16.

## 1. Executive Summary

Phase 4B was scoped to *provision* every production environment. In this environment that is
**not possible**: provisioning production cloud infrastructure requires account credentials
that are not present (DNS registrar, Vercel, Sentry, Google Cloud, Firebase, Apple, Safaricom
Daraja). What **is** verifiable was verified read-only:

- **Supabase:** three projects exist under one org. A production project **"Quick Serve
  Production"** (`lkigkltvstlxfdztffds`, `eu-central-1`, ACTIVE_HEALTHY, PG17) is **live** — but
  it doubles as the **development/default** backend (root `.env`), so there is **no dev↔prod
  isolation**. QA (`wjvjuplooidctlxxozws`) is properly separate. An old `quickserve`
  (`nkdmsubgucpnxggmzwhe`) is INACTIVE.
- **Expo/EAS:** project `@dalmarmudu/QuickServe` verified; a `production` build profile exists.
- **Everything else — DNS, Vercel, production GitHub secrets, Sentry, Maps, M-Pesa,
  storage/auth/backups production configuration — is NOT provisioned and BLOCKED** on missing
  account access.

**Provisioning progress ≈ 15%.** The single largest issue is not a missing production
project — it is that **development uses the production database**. This must be resolved before
any provisioning proceeds.

## 2. Production Architecture (target)

| Surface | URL |
|---|---|
| Root website | `https://qs.co.ke` |
| API | `https://api.qs.co.ke` |
| Admin Portal | `https://admin.qs.co.ke` |
| Documentation (future) | `https://docs.qs.co.ke` |
| Status page (future) | `https://status.qs.co.ke` |
| CDN (future) | `https://cdn.qs.co.ke` |

*(Note: the repository still hard-codes the marketing domain `quickserve.co.ke` and
`app.json` `associatedDomains` references `quickserve.app`. Neither matches the `qs.co.ke`
production architecture — a domain-consistency fix is required, see §16.)*

## 3. Method & Capability (evidence)

Read-only verification against: local repo (`main @ 8e355d8`), the GitHub API (secrets/branch
protection), the authenticated **Expo/EAS** CLI, the authenticated **Supabase** CLI
(`projects list` only — no link, no `db push`, no `api-keys`), and public DNS lookups.

| Capability | Status |
|---|---|
| Supabase CLI auth | ✅ authenticated (org `kcjgusnprhngykflmizz`) — used read-only |
| Expo/EAS CLI auth | ✅ authenticated (`@dalmarmudu`) |
| Vercel CLI | ❌ not installed / no account |
| Google Cloud / Firebase / Sentry CLI | ❌ not installed / no account |
| DNS registrar access (`qs.co.ke`) | ❌ none |
| Apple Developer / Play Console | ❌ none |
| Safaricom Daraja merchant | ❌ none |

## 4. Repository Verification (Step 1)

`main` HEAD `8e355d88061321167089dff4cbc777cc29203dc2` (== baseline) · working tree clean ·
`local main == origin/main` · protection: `enforce_admins=true`, required check `["PR CI"]`,
1 review · PR CI active · Phase 4A doc present. **No baseline drift.**

## 5. Production Supabase (Step 3) — EXISTS, but not isolated

**Projects (read-only `supabase projects list`; org `kcjgusnprhngykflmizz`):**

| Project | Ref/ID | Region | Status | Role (evidence) |
|---|---|---|---|---|
| **Quick Serve Production** | `lkigkltvstlxfdztffds` | `eu-central-1` | ACTIVE_HEALTHY (PG17) | **used by root `.env`** (dev/default + all non-QA EAS builds) |
| quickserve-qa | `wjvjuplooidctlxxozws` | `eu-central-1` | ACTIVE_HEALTHY (PG17) | QA (`qa/.env`, CLI-linked) |
| quickserve | `nkdmsubgucpnxggmzwhe` | `eu-west-1` | **INACTIVE** | old/paused |

| Verify item | Result |
|---|---|
| Project ID / region | ✅ `lkigkltvstlxfdztffds` / `eu-central-1` |
| Status / health | ✅ ACTIVE_HEALTHY, Postgres 17 |
| Anon / service-role / JWT secret exist | ✅ (exist by definition; **not printed / not fetched**) |
| Migration readiness | ✅ 0001–0034 in repo, ready for `db push` |
| Migrations actually applied to prod | ⚠️ **Not verified** — requires linking/DB access; not performed (avoid mutating/contacting prod) |
| Storage / Auth / Realtime / Edge Functions / RLS / policies configured on prod | ⚠️ **Not verified** — dashboard/linked-CLI access; not performed |
| Scheduled backups / PITR | ⚠️ **Not verified** — plan/dashboard access required |

**Provisioning outcome:** a dedicated production project already exists → this Step is
**PARTIAL** (exists) but its production configuration is **unverified** and its **isolation is
broken** (§6). No new project was created; no configuration was changed.

## 6. Environment Separation (Step 4)

| Dimension | Development | QA | Production |
|---|---|---|---|
| Supabase project | **⚠ shares Production** (`lkigk…`) | `wjvjuplooidctlxxozws` | `lkigkltvstlxfdztffds` |
| Database / Storage / Auth users / Realtime | **shared with prod** | isolated | prod |
| Edge Functions | not deployed separately | per QA | not verified |
| Secrets / env vars | root `.env` → **prod** | `qa/.env` + 7 GH `QA_*` secrets | **none** |
| URLs | root `.env` (prod URL) | QA URL | prod URL |

**Isolation verdict: FAILED for dev↔prod.** Only **two** active projects exist (QA +
Production); **development has no dedicated project and uses Production.** The three-way
isolation this phase requires does **not** exist.

**Risks:** production data reachable from local dev (P1); local/dev writes hit the production
DB (P1); a "production" EAS build and a "development" build both resolve the same root `.env` →
same prod project (P1). QA↔prod are correctly isolated (good). **Recommended fix:** reactivate
/ create a dedicated **development** Supabase project and repoint root `.env`; treat `lkigk…`
as production-only. (Not performed here — requires account owner action.)

## 7. GitHub Secrets Matrix (Step 5) — existence only, values never read

| Secret (category) | Development | QA | Production |
|---|---|---|---|
| Supabase URL / anon | local `.env` (untracked) | `QA_SUPABASE_URL`, `QA_SUPABASE_ANON_KEY` ✅ | **MISSING** |
| Supabase service-role | — | `QA_SERVICE_ROLE_KEY` ✅ | **MISSING** |
| Expo token | — | `EXPO_TOKEN` ✅ (shared) | **MISSING** (or reuse) |
| Google Places/Maps | local `.env` | — | **MISSING** |
| Apple / Firebase | — | — | **MISSING** |
| Vercel | — | — | **MISSING** |
| M-Pesa / Daraja | local `.env` (mock) | — | **MISSING** |
| Sentry (DSN/auth token) | local `.env` (empty) | — | **MISSING** |
| Email / SMTP | — | — | **MISSING** |
| Webhook secrets (`MPESA_CALLBACK_SECRET`, `PUSH_WEBHOOK_SECRET`) | local `.env` | — | **MISSING** |
| QA test accounts | — | `QA_CUSTOMER_*`, `QA_PROVIDER1_*` ✅ | n/a |

**GitHub Actions secrets present: 8 (all QA/Expo). Production secrets present: 0.** Every
production secret is **MISSING** and must be provisioned once the underlying resources exist.

## 8. DNS (Step 6) — not resolvable to production hosting

Public lookups from this environment (bounded):

| Host | Resolves to |
|---|---|
| `qs.co.ke` | `192.168.0.1` (LAN gateway) |
| `api.qs.co.ke` | `192.168.0.1` |
| `admin.qs.co.ke` | `192.168.0.1` |
| `www.qs.co.ke` / `docs.qs.co.ke` | `192.168.0.1` |
| CAA record | none observed |

All hostnames return a **private LAN address**, i.e. the domain is **not pointed at any real
production host** from here (and public/authoritative DNS cannot be trusted from this network).
**BLOCKED — missing:** registrar/DNS-zone access for `qs.co.ke`, target host records
(A/AAAA/CNAME to Vercel/API), TLS/HTTPS issuance, CAA, and security-header configuration.

## 9. Vercel (Step 7) — BLOCKED

No Vercel CLI/account available. `vercel.json` exists (builds `expo export --platform web` →
`dist`, SPA rewrites) but **no project is linked**, no production env vars, no domain, no
preview/rollback wiring. **BLOCKED — missing:** Vercel account + token, project creation,
env-var configuration, domain attachment. *(No deploy attempted — per rules.)*

## 10. Expo / Mobile (Steps 8–9) — verified config; store-not-ready

| Item | Value / status |
|---|---|
| Owner / project ID | `@dalmarmudu` / `587f8663-a722-4882-ab56-9007413003ee` ✅ |
| Android package / iOS bundle | `com.quickserve.app` (both) ✅ |
| Version / iOS build / Android versionCode | `1.0.0` / `1` / `1` ✅ |
| Build profiles | `development, preview, ios-simulator, production` ✅ |
| `production` profile | `channel: production, environment: production, autoIncrement: true` ✅ |
| Submit profile | `submit.production` present but **empty** (no store creds) ❌ |
| Runtime version / OTA | `policy: appVersion` set, **no `updates` block → OTA not wired** ❌ |
| Release/OTA channel delivery | channel names only; no EAS Update URL ❌ |
| Associated Domains / App Links / Universal Links | `["applinks:REPLACE_ME.quickserve.app"]` **placeholder** (and wrong domain vs `qs.co.ke`) ❌ |
| Deep links / URL scheme | scheme `quickserve` ✅; universal links inert ❌ |
| Encryption declaration | `ITSAppUsesNonExemptEncryption` **absent** ❌ |
| Push readiness | Expo push wired; APNs/FCM prod creds **unverified** ❌ |
| Store readiness | **NOT ready** (no signing/submit/metadata/privacy labels) ❌ |

**BLOCKED for store/OTA — missing:** Apple Developer + Play Console accounts, signing creds,
real `associatedDomains` domain (`qs.co.ke`), encryption declaration, EAS Update URL,
store metadata/privacy labels. *(No build/submit attempted.)*

## 11. Storage / Authentication / Edge Functions / Payments / Monitoring / Backups (Steps 10–15)

All of these live on (or feed) the production Supabase project + external accounts. **Their
production configuration cannot be provisioned or verified without dashboard/linked access
and the missing external accounts.**

| Area | Repo evidence | Production status |
|---|---|---|
| **Storage** | private bucket `booking-photos`, policies (tightened `0016`) in migrations | ⚠ not verified on prod; **BLOCKED** (needs prod DB/dashboard) |
| **Authentication** | signup/signin; **no password-reset in app**; redirect URLs unset | **BLOCKED** — prod redirect URLs (`qs.co.ke`), templates, SMTP, rate limits require dashboard |
| **Edge Functions** | `mpesa-stk-push`, `mpesa-callback`, `send-push`, `register-device`, `places-autocomplete`, `place-details`, `tracking-map` (+`_shared`); `config.toml` sets `verify_jwt=false` for webhooks | **BLOCKED** — deployment target = prod project; secrets not set; not deployed (per rules) |
| **Payments (M-Pesa)** | `MPESA_MODE=mock`; callback secret-gated; no refunds/reconciliation | **BLOCKED** — Daraja merchant/shortcode/passkey, prod callback `https://api.qs.co.ke/...`, sandbox→live cert all missing |
| **Monitoring (Sentry)** | wired, `EXPO_PUBLIC_SENTRY_DSN` empty; `app.json` plugin org/project empty | **BLOCKED** — Sentry account, DSN, auth token (source maps), alerts, health/uptime |
| **Backups / DR** | Supabase platform default only | **Not verified / BLOCKED** — plan/dashboard for scheduled backups + PITR; **no restore/DR runbook** |

## 12. Environment Matrix (consolidated)

| Attribute | Development | QA | Production |
|---|---|---|---|
| Exists | ⚠ **shares prod** | ✅ | ✅ (project only) |
| Supabase project | `lkigk…` (= prod) | `wjvju…` | `lkigk…` |
| Isolated DB/storage/auth | ❌ (shared w/ prod) | ✅ | ✅ vs QA / ❌ vs dev |
| Edge Functions deployed | — | QA | ❌ not verified |
| Secrets store | local `.env` | GH `QA_*` (7) + `EXPO_TOKEN` | ❌ none |
| Web deploy target | — | — | ❌ none (Vercel unprovisioned) |
| DNS/domain | — | — | ❌ not pointed |
| Monitoring | — | — | ❌ none |

## 13. Security Verification (Step 16)

- **RLS / policies:** enforced in migrations (0001–0034); production application unverified (§5).
- **Webhook secrets:** constant-time verified in Edge Functions; reject empty (good, code-level).
- **Environment isolation:** **QA↔prod isolated (good); dev↔prod NOT isolated (P1).**
- **No QA/dev secrets in production:** trivially true — **production has no secrets configured.**
- **No exposed service-role key:** ✅ service-role absent from the app bundle; not printed here;
  `supabase projects api-keys` was **not** run.
- **Committed-secret scan:** clean (only `.env.example` templates tracked; `.env`/`qa/.env`
  gitignored). `qa/.env` holds a live **QA** service-role JWT (QA-scoped hygiene item).

**Security summary:** code-level controls are strong; the production **posture is empty** (no
prod secrets, no monitoring) and the **dev↔prod isolation break is the top security concern.**

## 14. Production Readiness Matrix (Step 17)

| Area | Status | Evidence |
|---|---|---|
| Infrastructure (overall) | **BLOCKED** | no provisioning access |
| DNS | **BLOCKED** | `qs.co.ke` → `192.168.0.1`; no registrar access |
| Supabase | **PARTIAL** | prod project exists (ACTIVE_HEALTHY) but shared with dev + config unverified |
| Storage | **BLOCKED** | prod bucket/policies unverified; needs dashboard |
| Authentication | **BLOCKED** | prod redirect/SMTP/reset unconfigured |
| Payments | **BLOCKED** | mock only; no Daraja merchant |
| Push Notifications | **BLOCKED** | prod APNs/FCM creds unverified |
| Monitoring | **BLOCKED** | Sentry unconfigured; no account |
| Backups | **BLOCKED** | not verified; no DR runbook |
| Android | **PARTIAL** | EAS project + prod profile exist; not store-ready |
| iOS | **PARTIAL** | Simulator-certified; domains/encryption/signing missing |
| Admin Web | **BLOCKED** | no Vercel project / prod backend deploy |
| Website | **BLOCKED** | no Vercel project / DNS |
| API (`api.qs.co.ke`) | **BLOCKED** | no host / DNS / Edge Functions deployed |

**Provisioning readiness ≈ 15%** (2 of 14 areas PARTIAL — Supabase project + EAS project exist;
none fully READY).

## 15. Remaining Blockers (exact missing credentials/resources)

1. **DNS/registrar access for `qs.co.ke`** — to create A/AAAA/CNAME, CAA, TLS.
2. **Vercel account + token** — production project, env vars, domain, rollback.
3. **A dedicated development Supabase project** (+ repoint root `.env`) to fix dev↔prod isolation.
4. **Production secrets** for GitHub Actions/EAS/Supabase (all currently MISSING).
5. **Sentry account** (DSN, org/project, auth token).
6. **Google Cloud** (restricted Maps/Places key, billing).
7. **Safaricom Daraja merchant** (shortcode, passkey, prod callback).
8. **Apple Developer + Google Play** accounts (signing, submit, TestFlight/internal).
9. **Firebase** (FCM) + APNs key for real push.
10. **Email/SMTP** provider for production auth emails.
11. **Supabase dashboard/plan** access to verify/enable scheduled backups + PITR.
12. **Domain consistency decision** — `qs.co.ke` vs repo's `quickserve.co.ke`/`quickserve.app`.

## 16. Recommendations

- **Do NOT proceed with any provisioning that writes to `lkigk…` until dev↔prod isolation is
  fixed** (dedicated dev project + repoint root `.env`). This is the top priority.
- Provide the owner-held credentials in §15 (ideally via a secrets manager), then re-run 4B
  section-by-section with verification after each resource.
- Standardize on the `qs.co.ke` architecture in `app.json`/website/`associatedDomains`.
- Keep QA fully isolated (it already is); never point production at QA or vice-versa.

## 17. Next Phase

**Phase 4B cannot complete provisioning in this environment.** Options:
- **4B-continued (owner-assisted):** the account owner provisions DNS/Vercel/Sentry/GCP/Daraja/
  Apple/Firebase and supplies credentials; I then verify each and populate the matrices.
- Once provisioned + isolated, proceed to **4C — Migration Alignment** (`db push` to the
  dedicated prod project after dev↔prod separation), then 4D (M-Pesa sandbox), 4E (push), 4F
  (monitoring), 4G (backups/DR).

## 18. Final Status

- **Resources provisioned this phase: NONE.**
- **Resources verified (read-only, pre-existing):** Supabase production project
  (`lkigkltvstlxfdztffds`, ACTIVE_HEALTHY), QA project (isolated), EAS project
  (`@dalmarmudu/QuickServe`), GitHub Actions secrets (8, QA/Expo), branch protection.
- **Top blocker:** development uses the production Supabase project — **no dev↔prod isolation.**
- **Distinctions:** production infra is *neither configured nor deployed*; a production
  Supabase project *exists* but is *not isolated* and its config is *unverified*.
- **Confirmations:** no production deployment; no production traffic; no customer data migrated;
  no payments processed; no push sent; no secrets exposed; **Full Platform Certification NOT
  claimed.**

This phase changed only this document.
