# Phase 4A — Production Deployment Readiness Audit

> **Read-only, evidence-driven audit. Nothing was deployed, provisioned, migrated, or
> configured. No source, config, migrations, or secrets were changed. No production system
> was touched.** This report distinguishes **implemented / tested / certified / configured /
> production-ready / deployed** as separate states and does **not** treat them as synonyms.
> **Full Platform Certification is NOT claimed.**

## 1. Executive Summary

QuickServe has a **well-engineered, honestly-documented codebase** with a **certified backend
booking spine, certified Android and iOS-Simulator native journeys, a certified admin-web
journey, and an enforced PR CI gate**. However, it is **NOT production-ready**. The gap is not
primarily code — it is **environment provisioning, external-integration certification, and
operational readiness**:

- **No dedicated production Supabase project exists.** QA (`wjvju…`) is correctly separated
  from the app project (`lkigk…`), but every EAS profile (including `production`) resolves the
  same `EXPO_PUBLIC_*` values, so a production build today would point at the non-hardened
  app/dev project unless production env vars are set in the EAS dashboard.
- **All external integrations are mock/placeholder/off:** M-Pesa `MPESA_MODE=mock` (no live
  Daraja credentials, no sandbox/live certification), Sentry unconfigured (empty
  org/project/DSN, no source-map upload), Google Places key blank, push credentials
  unverified on a real device.
- **No operational layer:** no monitoring/alerting/dashboards, no documented backup/restore
  or incident-response runbook, no automated rollback (migrations are forward-only), and no
  CI/CD deploy pipeline (PR CI validates but does not deploy).
- **Legal/compliance is undrafted** (Terms/Privacy carry "pending legal review"; no app-store
  privacy labels; Kenya DPA obligations not addressed).

**Recommended posture:** the platform supports **internal QA use today** and can reach a
**controlled internal (non-payment) pilot** after a short provisioning phase. External pilot,
payment-taking pilot, and public launch are **not ready** and are gated on the phases in §19.

## 2. Starting Baseline

- **`main` HEAD:** `8e355d88061321167089dff4cbc777cc29203dc2` (verified == expected).
- Working tree clean; `local main == origin/main`; `main` is the sole local and remote branch;
  0 open PRs.
- **Protection (verified):** `main` protected · PR required · **1** approving review ·
  dismiss-stale · required check **`PR CI`** · strict/up-to-date · force-push disabled ·
  deletion disabled · **`enforce_admins=true`** (admins cannot bypass).
- **Environment:** Windows (MINGW64) · Node `v24.14.1` · npm `11.11.0` · Expo `56.1.16` ·
  EAS CLI `18.7.0` · Supabase CLI `2.110.0`.
- **Workflows:** `PR CI` (active, `pull_request`→`main` + `workflow_dispatch`, no secrets),
  `iOS Native Journeys` (active, `workflow_dispatch`-only).

## 3. Audit Scope and Method

Read-only inspection of the repository at `8e355d8`: documentation, `app.json`/`eas.json`/
`package.json`/`vercel.json`, `.env.example` templates, `src/lib/*`, `supabase/migrations/*`
(0001–0034), `supabase/functions/*`, and GitHub API state (protection, workflows, PRs,
rulesets, tags/releases). Four parallel read-only investigation passes (documentation,
build/env-separation, database/migrations, integrations/security) plus the non-destructive
gates in §14. No remote database, payment, push, or deploy action was taken. Secret **values**
were never printed.

## 4. Current Certification Baseline

| Layer | State | Evidence |
|---|---|---|
| Connected backend certification | **Certified** 116/116 | prior QA phases; RLS/booking spine |
| Admin-web connected journey | **Certified** 8/8 | Phase 3A |
| Android customer/provider native journey | **Certified** | Phase 3F/3G |
| iOS **Simulator** customer/provider native journey | **Certified** | Phase 3H (run #14/#15, iPhone SE / iOS 18.1, EAS `281fd93b`) |
| PR CI automated gate | **Active + required** on `main` | this phase |
| `qa:release` | **Historically green** (unit + type + export layer) | prior + PR CI |
| Physical iOS device / real payments / real push / storage / performance / accessibility / production deploy | **NOT certified** | — |
| **Full Platform Certification** | **NOT claimed** | consistent across all phase reports |

## 5. Production Environment Inventory

| Item | Classification | Evidence / note |
|---|---|---|
| Supabase **QA** project (`wjvju…`) | **Exists & verified (QA-only)** | `qa/.env`; guarded by `assertNotProduction` |
| Supabase **app/dev** project (`lkigk…`) | **Exists (dev/app, not hardened)** | root `.env`; used by all EAS builds |
| Supabase **production** project | **Not configured** | no dedicated prod project/ref in repo or docs (placeholders only) |
| EAS project | **Exists & verified** | `587f8663-a722-4882-ab56-9007413003ee`, owner `dalmarmudu` |
| Android production build profile | **Exists (config)** | `eas.json` `production` → aab, channel/env `production`, `autoIncrement` |
| iOS production build profile | **Exists but incomplete** | `production` profile present; `associatedDomains` placeholder; missing `ITSAppUsesNonExemptEncryption`; no signing/submit config |
| Vercel production project | **Not verifiable / not documented** | `vercel.json` builds `expo export --platform web`; no project name/env inventory |
| Google Maps / Places | **Placeholder** | `GOOGLE_PLACES_API_KEY` blank; server-side proxy only (not in app bundle) |
| Sentry | **Not configured** | `app.json` plugin org/project = `""`; `EXPO_PUBLIC_SENTRY_DSN` unset → monitoring is a no-op |
| Expo Push | **Implemented; credentials not verified** | Expo push wired; EAS-managed APNs/FCM unverified; no real-device evidence |
| Daraja / M-Pesa | **QA-only / mock** | `MPESA_MODE=mock` default; Daraja creds blank; no live merchant agreement |
| Production domains | **Partial** | `quickserve.co.ke` real (marketing site); `app./admin.` reserved, not deployed; `associatedDomains = REPLACE_ME.quickserve.app` placeholder |
| Email / auth configuration | **QA/default** | default Supabase email sender; no custom SMTP/templates; password-reset not implemented in-app |
| GitHub repo settings & secrets | **Exists & verified (QA/CI scope)** | `main` protected, PR CI required; 8 QA/Expo Actions secrets (for iOS workflow); **no production secrets** |

## 6. Environment Separation

**QA is genuinely separated from the app project** (`wjvju…` ≠ `lkigk…`, distinct hosts), and
the **service-role key is never in the client bundle** (only Deno Edge Functions and QA
tooling reference it) — both strong positives.

| Dimension | QA | Preview | Production | Risk |
|---|---|---|---|---|
| Supabase URL / anon key | dedicated QA (`wjvju…`) | app `.env` | **none dedicated** | **P1** — prod build → app/dev project unless EAS dashboard prod vars set |
| service-role key | QA project, server/QA-only | n/a | n/a | none in client (good); committed in `qa/.env` (**P2** hygiene) |
| Database / storage / auth users | QA project | app project | none | shared app/preview; no prod isolation |
| Edge Functions | per-project deploy | per-project | not deployed | prod functions + secrets not provisioned |
| M-Pesa / Google APIs / Sentry / push | mock/blank/off | mock/blank/off | not configured | no prod credentials anywhere |
| Web deployment | n/a | Vercel (same `.env`) | not configured | prod web would inherit app `.env` |
| EAS build profiles | — | preview | production (config only) | env-var set is dashboard-side, unverified |

**Separation risks:** (a) **production build points at QA/dev project** — P1 until prod env
vars are provisioned; (b) **QA scripts reaching production** — mitigated by `assertNotProduction`
and separate projects (low, but re-verify once a prod project exists); (c) **shared secrets** —
none across the app/QA boundary (good); (d) **service-role exposure** — none client-side (good);
`qa/.env` commits a live **QA** service-role JWT + test passwords (P2, QA-scoped); (e)
**accidental production cleanup / production data in tests** — currently impossible (no prod
project); becomes a P1 control to enforce the moment prod exists.

## 7. Database and Migration Readiness

- **Migrations 0001–0034: sequential, no gaps, no duplicates** (verified). Consistent
  `NNNN_snake_case.sql` naming.
- **RLS:** ~30 `public.*` tables have `enable row level security` with explicit policies —
  including `provider_earnings` (`0010_payments.sql:47`, select policy line 58; an earlier
  audit false-positive was corrected here). `private.push_config` is intentionally in the
  non-exposed `private` schema.
- **SECURITY DEFINER:** ~70+ functions (the core write-authorization pattern), essentially all
  pinning `set search_path` (mitigates search-path escalation). `is_admin()` is the admin
  linchpin.
- **Storage:** single **private** bucket `booking-photos`; policies tightened in `0016`
  (users read only photos tied to visible bookings; admin-only delete). QA notes suggest the
  deployed policy may be stricter than `0006` — **reconcile so prod derives fully from
  migrations**.
- **Edge Functions:** `mpesa-stk-push`, `mpesa-callback`, `send-push`, `register-device`,
  `places-autocomplete`, `place-details`, `tracking-map` (+ `_shared`). `mpesa-callback` and
  `send-push` run `verify_jwt=false` and are gated by shared secrets (`MPESA_CALLBACK_SECRET`,
  `PUSH_WEBHOOK_SECRET`), verified constant-time and rejecting empty secrets.
- **Remote-provisioning dependencies not captured by `db push`:** `pg_net` extension
  (`0015`), the `private` schema, and the `private.push_config` row (webhook URL + secret)
  must be provisioned/seeded on the target project.
- **Seed data:** none (no `seed.sql`; only the idempotent storage-bucket row). No demo/test
  data would leak to production.
- **Destructive ops / rollback:** all `DROP`s are `if exists` + recreate (re-run safe); no
  unscoped `DELETE`/`TRUNCATE`. **Forward-only — no down-migrations / rollback tooling**;
  recovery relies on a corrective migration or PITR.
- **Tooling:** `supabase db push` (CLI 2.110.0 in devDeps). **No migration-order verification
  test** and no migration step in `qa:release`.
- **Remote alignment:** **Blocked / not provable** — no production (or dedicated staging)
  Supabase project exists to diff against. `db push`/repair/reset were **not** run (per scope).

## 8. Build and Release Readiness

Distinct states (not collapsed):

| State | Android | iOS | Web |
|---|---|---|---|
| **Builds successfully** | ✅ (EAS APK/preview + aab profile) | ✅ (EAS simulator build `281fd93b`/`8deeff19`) | ✅ (`expo export --platform web`) |
| **Installable** | ✅ (emulator/internal APK) | ✅ (iOS Simulator) | ✅ (static export) |
| **Store-submittable** | ❌ no signing/`submit.production`/Play metadata | ❌ no Apple signing, `submit.production` empty, `associatedDomains` placeholder, missing encryption flag | n/a |
| **Store-ready** | ❌ | ❌ | n/a |
| **Production-release-ready** | ❌ | ❌ | ❌ (no prod env/host) |

- `app.json`: version `1.0.0`, iOS `buildNumber "1"`, Android `versionCode 1`, bundle/package
  `com.quickserve.app`, owner `dalmarmudu`, projectId set. `runtimeVersion.policy: appVersion`
  is set **but there is no `updates` block** → **OTA/EAS Update not wired** (channels exist in
  `eas.json` without an update URL).
- **iOS blockers:** `associatedDomains` = `REPLACE_ME.quickserve.app`; missing
  `ITSAppUsesNonExemptEncryption`; verify the `ios.icon` asset path.
- **Signing/credentials:** not configured. **TestFlight / Play internal-testing: not ready**
  (needs Apple Developer + Play Console + signing + store metadata + privacy labels).

## 9. External Integrations

| Integration | Implemented | Configured | Tested | Certified | Production-ready | Blocker |
|---|---|---|---|---|---|---|
| **M-Pesa / Daraja** | ✅ (mock+sandbox+live coded) | mock only | unit only | ❌ | ❌ | live Daraja creds + sandbox/live STK cycle; **no refunds/reversals**; **no stale-`pending` reconciliation sweep** |
| **Push (Expo)** | ✅ end-to-end | Expo/EAS-managed (unverified) | unit + QA scaffolding | ❌ | ❌ | real-device APNs+FCM delivery; no delivery-receipt polling; no global kill switch |
| **Google Maps / Places** | ✅ (server-side proxy) | placeholder key | — | ❌ | ❌ | GCP key restriction + billing + quotas |
| **Sentry** | ✅ (wired) | ❌ empty org/project/DSN | ❌ | ❌ | ❌ | fill org/project, `SENTRY_AUTH_TOKEN` for source maps, `environment`/`release` tags, verified event |
| **Auth / email** | ✅ signup/signin | default | — | ❌ | ❌ | password-reset not in app; default email sender; redirect/templates unset |

## 10. Security Readiness

- **P0 — none found.** Service-role key absent from the app bundle; no secrets committed
  (only `.env.example` templates tracked; `.env`/`qa/.env` gitignored); no `EXPO_PUBLIC_`-
  prefixed secret; webhook endpoints verify shared secrets constant-time; admin access
  enforced server-side by RLS/`is_admin()` (the web overlay is defense-in-depth only).
- **P1** — Sentry source-maps unconfigured → production crash reports unreadable/uploaded;
  production env separation (prod build could point at the app/dev Supabase project).
- **P2** — password-reset flow not implemented; M-Pesa refund/reconciliation gaps; Google
  Places key restriction unverified; **no app-level rate limiting / abuse prevention**
  (relies on RLS + JWT + platform limits); `qa/.env` commits a QA service-role JWT + test
  passwords; **dependency vulnerabilities: 4 high / 13 moderate / 0 critical** (`npm audit`).
- **P3** — `__DEV__`-gated connection log (public URL only; no PII/token logging found);
  secret-rotation process not documented.
- Branch protection & release permissions: **strong** (`enforce_admins=true`, PR + review +
  `PR CI` required, no force-push/deletion).

## 11. Operations and Observability

| Capability | Status |
|---|---|
| Sentry / crash reporting | **Not configured** (no-op until DSN/org/project set) |
| Platform logs (Supabase/Vercel/EAS) | **Manual only** (dashboards, not aggregated) |
| Dashboards / SLOs | **Not configured** |
| Alerts (error-rate, payment, push, DB) | **Not configured** |
| Uptime checks | **Not configured** |
| Database health / Edge Function health | **Manual only** (docs describe health checks) |
| Backups | **Manual only** — Supabase platform default; **restore procedure Not documented** |
| Incident response / on-call / runbooks | **Not documented** |
| Support case workflow | **Partial** (operations portal RPCs exist; process not documented) |
| Audit logs / retention | **Partial** (booking/case activity tables) / retention **Not documented** |
| Kill switches / feature flags | **Partial** (push kill-switch via `send_push_url` NULL; M-Pesa mock switch; no general flag system) |
| Rollback process | **Manual only** (forward-only corrective migration) |
| CI/CD deploy pipeline | **Not configured** (PR CI validates, does not deploy) |

## 12. Performance and Reliability

- **No load/concurrency/soak testing evidence.** Recommend a **dedicated staging/load
  environment** — do **not** load-test shared QA or (future) production.
- **Duplicate protection:** ✅ active-booking dedup (`0033`); terminal-state guards (`0034`).
- **Optimistic concurrency:** ❌ **none** — booking mutations are last-write-wins (P2 for
  scale/contention).
- **Rate limits:** none app-level (P2). **Index coverage / slow-query analysis:** not audited.
- App startup, web/native performance, memory, offline/degraded-network, retry, crash
  recovery, background behavior: **no formal evidence** (unit tests only).

## 13. Accessibility and Compliance

- **Accessibility:** partial — e.g. the Phase 3H `welcome` "Log in" was made a proper button
  (`accessibilityRole`/label) + testIDs for automation; **no WCAG audit**, no screen-reader /
  contrast / dynamic-type / focus-order evidence. **Accessibility remediation phase required.**
- **Legal/privacy:** ❌ **not done** — Terms of Service and Privacy Policy undrafted/unhosted
  ("pending legal review" banners); no app-store privacy labels; **data/account deletion** and
  **consent/retention disclosures** not evidenced; **Kenya Data Protection Act (2019)**
  obligations not addressed. **Legal review is REQUIRED** — this audit does not assert any
  legal compliance.

## 14. Safe Validation Results

Non-destructive gates run this phase (no remote mutation):

| Gate | Result |
|---|---|
| Root TypeScript (`tsc --noEmit`) | ✅ PASS (0 errors) |
| QA TypeScript (`qa run qa:typecheck`) | ✅ PASS (0 errors) |
| Root Jest | ✅ **222 suites / 2951 tests passed** |
| Website Vitest | ✅ PASS (102) |
| Lint (`expo lint`) | ⚠️ exit 1 — **59 errors / 443 warnings, pre-existing** (non-blocking in PR CI by design) |
| Expo config resolution | ✅ OK |
| Expo web export | ✅ (PR CI run #4 + local, Node 22) |
| Expo Android export | ✅ (PR CI run #4) |
| Migration-order integrity | ✅ 0001–0034 sequential, no gaps |
| Secret scan (tracked files) | ✅ clean (no real secrets; `.env`/`qa/.env` gitignored) |
| Dependency audit (`npm audit`) | ⚠️ 0 critical / **4 high** / 13 moderate |
| Documentation-path validation | ✅ all authoritative docs exist |
| PR CI (automated, `main`) | ✅ active + required; latest run success |
| Connected certification 116/116 · admin-web 8/8 · health 19/19 · `qa:release` e2e | **Not re-run this phase** — require the QA backend + Playwright browsers and are the established certification suites (historically green; the unit/type/export layer is re-validated by PR CI on every PR). |

## 15. Risk Register

| ID | Area | Finding | Evidence | Sev | Likelihood | Impact | Blocker | Mitigation | Owner | Target |
|---|---|---|---|---|---|---|---|---|---|---|
| R1 | Env separation | No dedicated production Supabase project; prod EAS build may point at app/dev project | §5/§6; single root `.env` | **P1** | High | High | External pilot / launch | Provision prod project; set prod env vars in EAS dashboard; verify build target | Platform | 4B |
| R2 | Payments | M-Pesa mock-only; no sandbox/live certification, no refunds/reconciliation | §9; `MPESA_MODE=mock` | **P1** | High | High | Payment pilot / launch | Daraja creds → sandbox STK cert → reconciliation sweep + refund policy → live cert | Backend/Payments | 4D |
| R3 | Observability | Sentry unconfigured; no source maps/tags; no alerting/dashboards/uptime | §10/§11 | **P1** | High | High | External pilot / launch | Configure Sentry (org/project/DSN/auth token/tags) + alerts + uptime | Ops | 4F |
| R4 | Ops resilience | No documented backup/restore, incident response, on-call, runbooks; forward-only rollback | §11 | **P1** | Med | High | Launch | Backup/restore drill + runbooks + on-call | Ops | 4G |
| R5 | Legal/privacy | ToS/Privacy undrafted; no app-store privacy labels; Kenya DPA unaddressed | §13 | **P1** | High | High | Any external/public | Legal review; publish policies; privacy labels; data/account deletion | Legal/Product | 4M |
| R6 | iOS release | `associatedDomains` placeholder; missing encryption flag; no signing/submit | §8 | **P1** | High | Med | iOS TestFlight/launch | Set real domain; add encryption declaration; configure signing/submit | Mobile | 4J |
| R7 | Push | Real-device APNs/FCM delivery unverified; no receipts/global kill switch | §9 | **P2** | Med | Med | External pilot | Real-device delivery cert; receipt polling; kill switch | Mobile/Backend | 4E |
| R8 | Security | No app-level rate limiting/abuse prevention (STK spam, auth) | §10 | **P2** | Med | Med | Scale | Add rate limits (Edge/RLS/gateway) | Backend | 4F/4L |
| R9 | Security | 4 high npm vulnerabilities (0 critical) | §14 | **P2** | Med | Med | Hardening | Triage/upgrade; add audit to CI | Backend | 4F |
| R10 | DB provisioning | pg_net + `private.push_config` not captured by `db push`; storage policy drift vs `0016` | §7 | **P2** | Med | Med | Prod migration | Provisioning runbook; reconcile storage policy to migrations | Backend | 4C |
| R11 | Auth | Password-reset not implemented in-app; default email sender | §9 | **P2** | Med | Med | External pilot | Implement reset; custom SMTP/templates | Backend | 4C/4M |
| R12 | Reliability | No optimistic concurrency (last-write-wins); no load testing; no rate limits | §12 | **P2** | Med | Med | Scale | Add version guards; load test on staging | Backend | 4L |
| R13 | Accessibility | No WCAG/screen-reader/contrast evidence | §13 | **P2** | Med | Med | Public launch | Accessibility audit + remediation | Mobile/Web | 4K |
| R14 | Hygiene | `qa/.env` commits a QA service-role JWT + test passwords | §6 | **P2** | Low | Med | — | Move to Actions secrets / rotate QA project | QA | 4B |
| R15 | Docs | Stale claims: "EAS projectId empty" (now set), "15 migrations" (now 34), earlier "iOS blocked" (now Simulator-certified) | §17 note | **P3** | — | Low | — | Doc-refresh pass (separate phase; not edited here) | Docs | 4B+ |
| R16 | Process | No migration-order verification in CI; no automated rollback | §7 | **P3** | Low | Low | — | Add order check to PR CI; document rollback | Backend | 4C |

*(No P0 items: no production system exists to break, and no critical security leak was found.)*

## 16. Deployment Gate Matrix

| Gate | Current status | Evidence | Blocker | Required action | Target |
|---|---|---|---|---|---|
| Backend | **Certified (QA)** | 116/116 | prod project | Provision + `db push` to prod | 4B/4C |
| Database | **Ready (schema); remote alignment blocked** | 0001–0034 seq | no prod/staging | Prod project + provisioning runbook | 4C |
| Admin Web | **Certified journey; not deployed** | 8/8 | prod host/backend | Vercel prod + prod backend + smoke | 4B/4H |
| Android | **Builds + installable; not store-ready** | EAS aab profile | signing/metadata | Signing + Play internal + metadata | 4I |
| iOS | **Simulator-certified; not device/store-ready** | Phase 3H | signing, domains, encryption flag | Apple signing + fix `app.json` + TestFlight | 4J |
| Payments | **Implemented (mock); not certified** | mock mode | live Daraja | Sandbox → reconciliation/refunds → live | 4D |
| Push | **Implemented; not certified** | Expo wiring | real-device creds | Device delivery cert | 4E |
| Maps | **Implemented (proxy); placeholder key** | server-side | GCP key/restrictions | Restricted key + billing | 4F |
| Auth/email | **Implemented; default config** | signup/signin | reset + prod email | Reset flow + SMTP/templates | 4C/4M |
| Security | **Strong core; hardening gaps** | no P0 | rate limits, vulns | Rate limiting + vuln triage | 4F |
| Monitoring | **Not configured** | Sentry off | full setup | Sentry + alerts + uptime | 4F |
| Backups | **Manual only** | platform default | restore proof | Backup/restore drill | 4G |
| Rollback | **Manual (forward-only)** | migrations | none automated | Documented rollback | 4C/4G |
| Performance | **No evidence** | unit only | staging env | Load/perf testing | 4L |
| Accessibility | **Partial** | testIDs/a11y button | WCAG audit | Remediation | 4K |
| Legal/privacy | **Not done** | placeholders | legal review | Policies + labels + DPA | 4M |
| Support/operations | **Partial/undocumented** | ops RPCs | runbooks | Runbooks + on-call | 4G |

## 17. Pilot Readiness by Deployment Type

| Deployment type | Verdict | Exact conditions |
|---|---|---|
| Internal QA use | **Ready** | current QA env + CI |
| Controlled internal pilot (no payments) | **Conditionally ready** | provision prod (or accept app/dev) project + verify build target (R1); monitoring on (R3); one real-device smoke per platform (R7); Android internal distribution (4I) |
| Invite-only external pilot | **Not ready** | R1, R3, R4, R5, R7 + at least M-Pesa **sandbox** cert (R2) |
| Payment-taking pilot | **Blocked** | R2 (live Daraja + reconciliation + refunds) on top of external-pilot conditions |
| Public launch — Android | **Not ready** | store signing/metadata/privacy (4I) + all P1 |
| Public launch — iOS | **Not ready** | R6 (signing/domains/encryption/TestFlight) + physical-device cert + all P1 |
| Public launch — Web/Admin | **Conditionally ready (journey); not deployed** | prod backend + Vercel prod + monitoring + legal |
| Admin web launch | **Conditionally ready** | prod backend (R1) + Vercel prod deploy + monitoring (R3) |

## 18. Production Launch Readiness

**Decision: NOT production-ready.** No production environment exists; all external integrations
are mock/placeholder/off; there is no monitoring, documented backup/restore, or automated
rollback; and legal/privacy is undrafted. The certified layers (backend spine, Android/iOS-Sim
journeys, admin-web journey) are **necessary but not sufficient**. The nearest reachable
milestone is a **controlled internal, non-payment pilot** after phase 4B–4C (+4F monitoring).

## 19. Recommended Phase Sequence

Strict order; each phase narrow; **do not start any without approval**:

1. **4B — Production environment provisioning:** dedicated prod Supabase project; EAS dashboard
   production env vars; Vercel prod project; production secrets (Daraja/push/Maps/Sentry
   placeholders provisioned securely); move `qa/.env` credentials to secrets. Refresh stale
   docs (R15).
2. **4C — Migration alignment:** `db push` to prod/staging; verify RLS parity; provision
   `pg_net` + seed `private.push_config`; reconcile storage policy to migrations; add
   migration-order check.
3. **4D — Real M-Pesa sandbox certification:** live sandbox STK cycle + callback + reconciliation
   sweep + refund policy.
4. **4E — Real push delivery certification:** real-device APNs + FCM delivery; receipts; kill switch.
5. **4F — Sentry / monitoring verification:** source maps, tags, alerts, uptime, rate limiting,
   dependency-vuln triage.
6. **4G — Backup/restore validation + runbooks:** restore drill; incident response; on-call.
7. **4H — Production web deployment smoke.**
8. **4I — Android internal-distribution release** (signing + Play internal + metadata + privacy labels).
9. **4J — iOS TestFlight readiness** (signing, `associatedDomains`, encryption flag, privacy manifest).
10. **4K — Accessibility remediation.**
11. **4L — Performance / load testing** (dedicated env).
12. **4M — Legal / privacy completion** (ToS/Privacy, app-store labels, Kenya DPA).
13. **4N — Final go-live gate.**

## 20. Decisions Required (from the user)

1. **Provision a dedicated production Supabase project** now, or accept the app/dev project for an internal pilot?
2. **Production web/admin hosting** — confirm the Vercel production project + domains (`app./admin.quickserve.co.ke`?).
3. **M-Pesa go-live timeline** — is a Safaricom Daraja merchant/short-code available for sandbox → live?
4. **Real domain** for `associatedDomains` / universal links (`quickserve.co.ke` vs `quickserve.app` — docs are inconsistent).
5. **Apple Developer + Google Play** accounts for signing/submission?
6. **Legal counsel** for ToS/Privacy/DPA and app-store privacy labels?
7. **Pilot scope** — payment-taking or non-payment for the first controlled pilot?

## 21. Final Status

- **Implemented:** backend, payments (mock+modes), push, maps proxy, auth, admin web, native apps.
- **Tested:** unit (2951) + type + web/native export + QA-connected certification suites.
- **Certified:** backend spine (116/116), admin-web (8/8), Android journeys, iOS-**Simulator** journeys.
- **Configured (production):** **none** — all external integrations placeholder/mock/off; no prod project.
- **Production-ready:** **No.**
- **Deployed (production):** **No** — nothing is deployed to production.
- **Full Platform Certification: NOT claimed.**

This phase changed only this document. No production systems, infrastructure, secrets, source,
config, or migrations were altered. Await approval before any provisioning or deployment.
