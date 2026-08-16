# Phase 5E — KwikServe Android Package Migration + FCM Push Certification

> **Status:** AUTHORITATIVE / CANONICAL record for the `com.quickserve.app` → `ke.co.hiredcorp.kwikserve`
> Android package migration and its physical push re-certification on the Samsung Galaxy S24 Ultra.
>
> **Scope:** QA backend only (`wjvjuplooidctlxxozws`). No Google Play, no production AAB, no iOS/APNs
> change, no Supabase production, no deploy, no merge.
>
> **Reconstruction note:** this report was rewritten from durable evidence on **2026-08-15** after a
> VS Code restart cleared the working session. Every claim below carries an explicit evidence class.

## 0. Evidence classes used in this report

| Label | Meaning |
|---|---|
| **VERIFIED NOW** | Re-checked read-only during this reconstruction session (git, `expo config`, Jest, EAS CLI, QA PostgREST, filesystem). |
| **VERIFIED IN DURABLE ARTIFACT** | Recovered from an on-disk artifact that survived the restart: the prior session transcript `~/.claude/projects/C--Users-ADMIN-QuickServe/113fae4e-667c-40a5-ba12-b196353b3a58.jsonl`, project memory `kwikserve-migration.md`, `.remember/today-2026-08-15.md`, or git history. |
| **USER-REPORTED PHYSICAL OBSERVATION** | An observation only the operator could make on the physical S24. Recovered verbatim from the durable transcript, but **not independently re-verifiable** by tooling. |
| **INFERRED** | A conclusion drawn from evidence, not directly observed. Always labelled as such. |
| **NOT RECOVERABLE** | Claimed in the cleared conversation with no durable backing. *(No Step 0–13 item falls into this class — the transcript recovered all of them.)* |
| **NOT TESTED / DEFERRED** | Never exercised in this phase. |

---

## 1. Executive certification verdict

**Android push notification delivery for the new package `ke.co.hiredcorp.kwikserve` is CERTIFIED on
the physical Samsung Galaxy S24 Ultra against the QA backend**, on preview build
`c59c7ac1-0a4d-44e3-9069-c9ee4f4d340e` (commit `444a9d9`).

Scope of that verdict, precisely:

- **14 certification gates (Steps 0–13) were executed. 13 are PASS; 1 (Step 11) is PASS WITH ANOMALY.
  0 FAIL, 0 DEFERRED, 0 NOT RECOVERABLE.**
- **Step 11 is NOT a clean pass.** A valid, authenticated customer-owned device token disappeared
  during the permission-denied test. It was restored cleanly on a cold launch, but **causation for the
  disappearance is not proven** (§8 Step 11, §10).
- The **first foreground attempt (FG1, notification `d958bc5b…`) is NOT the foreground certification.**
  The operator has stated the app was accidentally backgrounded. It is recorded as an accidental
  background-state observation. **FG2 (`16afe12d…`) is the Step 2 certification.**
- Two findings surfaced are **pre-existing** behaviours of the same code that served
  `com.quickserve.app` — they are **not introduced by the package migration**, and are logged as
  product considerations, not migration defects (§10).

**This verdict does NOT extend to:** Google Play readiness, production environment configuration,
production push, iOS/APNs on the new identity, or the release of anything. See §16.

---

## 2. Certified Android identity

| Attribute | Value | Evidence |
|---|---|---|
| Android package | `ke.co.hiredcorp.kwikserve` | **VERIFIED NOW** — `expo config --type public` resolves `android.package=ke.co.hiredcorp.kwikserve`; `app.json:32`; `src/__tests__/android-config.test.ts` |
| App display name | `KwikServe` | **VERIFIED NOW** — resolved `name: KwikServe` |
| Expo slug | `QuickServe` *(deliberately unchanged — cosmetic, deferred)* | **VERIFIED NOW** |
| iOS bundle identifier | `ke.co.hiredcorp.quickserve` — **UNCHANGED** | **VERIFIED NOW** — resolved config + `src/__tests__/ios-config.test.ts` |
| Deep-link scheme | `quickserve` — **UNCHANGED** | **VERIFIED NOW** |
| EAS project id | `587f8663-a722-4882-ab56-9007413003ee` — unchanged | **VERIFIED NOW** |
| EAS owner | `dalmarmudu` — unchanged | **VERIFIED NOW** |
| Firebase project | `quickserve-1bfa9` — unchanged | **VERIFIED NOW** — both local google-services files carry `project_id: quickserve-1bfa9` |
| appVersion / versionCode | `1.0.0` / `1` | **VERIFIED NOW** |
| Branch / HEAD | `chore/kwikserve-identity` @ `444a9d9` | **VERIFIED NOW** |

Config assertion suites re-run this session: **19/19 pass**
(`src/__tests__/android-config.test.ts`, `src/__tests__/ios-config.test.ts`) — **VERIFIED NOW**.

---

## 3. Migration timeline / phase summary

| Phase | Work | Anchor | Evidence |
|---|---|---|---|
| **2** | Public brand rename QuickServe → KwikServe, **user-visible copy only**; zero technical identifiers touched (60 files: app `src/`, admin-web, `apps/website/`, `app.json` name + permission strings, CLAUDE.md). | `c0b8987` | **VERIFIED NOW** (commit + message) |
| **3A** | Preflight: managed Expo workflow confirmed — **no `android/` directory**, so `app.json` is the sole package source. No test/env/Maestro reference to the Android package. | — | **VERIFIED IN DURABLE ARTIFACT** (memory) |
| **3B** | **Android package migration**: `android.package` `com.quickserve.app` → `ke.co.hiredcorp.kwikserve` (one line). Added `src/__tests__/android-config.test.ts` cross-asserting that iOS bundle / scheme / projectId / owner / name are untouched. Gates: jest 3062, root+qa tsc, `expo export --platform android` succeeded without google-services. | `294e402` | **VERIFIED NOW** (commit + tests re-run) |
| **4** | **Firebase registration**: new Android app `ke.co.hiredcorp.kwikserve` registered inside the **existing** project `quickserve-1bfa9`. Old `com.quickserve.app` Firebase app **kept as rollback**. Downloaded config is a **superset with both Android clients**; old single-client config preserved as `google-services.quickserve.bak.json`. | — | **VERIFIED NOW** (both files inspected structurally, §5) |
| **5B** | **Signing credentials**: new EAS remote credential record for the new identifier **reusing the exact existing certified keystore** (no keystore generated). FCM V1 service account reused. Temp `credentials.json` used as upload vehicle, then deleted; `.gitignore` hardened. | `444a9d9` | **VERIFIED NOW** (gitignore commit, credentials.json absent, never in history) + **VERIFIED IN DURABLE ARTIFACT** (transcript) |
| **5C** | **EAS environment configuration**: `GOOGLE_SERVICES_JSON` (file-type, SENSITIVE, PROJECT scope) updated **in place in `preview` only** to the superset. `development` and `production` **not changed**. | — | **VERIFIED NOW** (§6) |
| **5D** | **Preview APK build** `c59c7ac1-…` FINISHED for `ke.co.hiredcorp.kwikserve`. | `444a9d9` | **VERIFIED NOW** (§7) |
| **5E · Stage 1** | Physical S24 install + basic UI regression. | — | **USER-REPORTED PHYSICAL OBSERVATION** (§7) |
| **5E · Stage 2** | **Physical FCM push certification, Steps 0–13.** | — | §8 |

---

## 4. Android signing certificate

The KwikServe package **reuses the existing certified upload keystore**. **No keystore was generated
or replaced.**

| Field | Value |
|---|---|
| Key alias | `18b9ee26ad3a63438cbafe7d4918002f` |
| SHA-1 | `7E:11:3F:4A:45:A9:9E:8D:B6:88:F1:8B:9D:E0:F3:D9:04:75:78:CF` |
| SHA-256 | `0B:51:80:C2:44:4E:33:41:09:50:15:47:A6:6A:1F:17:DA:46:DD:DA:11:13:75:DA:92:46:F4:DF:24:0F:90:3D` |

- Fingerprints are **identical** to the `com.quickserve.app` record — the certificate identity is
  preserved across the package change. **VERIFIED IN DURABLE ARTIFACT** (prior-session transcript,
  cross-checked against the Expo dashboard by the operator during Phase 5B; recorded independently in
  project memory `kwikserve-migration.md`).
- **Not re-verifiable headlessly:** remote EAS keystore fingerprints can only be read through the
  interactive `eas credentials` TUI or the Expo dashboard. They were **not** re-read in this
  reconstruction session, so they are *not* marked VERIFIED NOW.
- **Corroborating VERIFIED NOW evidence:** build `c59c7ac1` completed against credential config
  `L14kmLmfgO` with **no generate/replace prompt**, and `eas.json` contains **no** `credentialsSource:
  local` and no keystore block — credentials remain EAS remote-managed.
- **No keystore password or key password appears anywhere in this report, the repo, or git history.**

---

## 5. Firebase / FCM configuration

**Firebase project: `quickserve-1bfa9` — unchanged.** No project created, renamed, or deleted.

Local `google-services.json` structure — **VERIFIED NOW** (inspected programmatically; **all api keys,
app ids, and the project number are redacted and were never printed**):

| File | project_id | Android clients | Disposition |
|---|---|---|---|
| `google-services.json` | `quickserve-1bfa9` | **2** — `com.quickserve.app` **and** `ke.co.hiredcorp.kwikserve` | Active superset |
| `google-services.quickserve.bak.json` | `quickserve-1bfa9` | **1** — `com.quickserve.app` only | **Rollback asset** |

- SHA-256 of active superset: `44a3f414c09997b6ddb071c5a8282b77198bb13e0776da5730697ca18a877294`
  — **VERIFIED NOW**, and it **matches** the hash recorded in project memory at Phase 5C. Independent
  cross-check that the file has not drifted since the certified build.
- SHA-256 of rollback backup: `390946243a7ffc51b3c80f84d1d655b86d9f7c4a5c1f9b09009477612d673ab8` — **VERIFIED NOW**.
- **The old Firebase Android app was intentionally preserved** — it remains a client entry in the
  superset and is the sole entry in the backup. **VERIFIED NOW.**
- Both files are git-ignored (`google-services.json`, `*google-services*.json`) and **never entered git
  history** — **VERIFIED NOW**.

**Config injection path** (`app.config.js`, unchanged this phase) — **VERIFIED NOW**:
`process.env.GOOGLE_SERVICES_JSON` (EAS file env var) → else local `./google-services.json` → else
unset. Resolved config shows `android.googleServicesFile` **[SET]** locally.

**FCM V1:** the **existing Firebase project service account** (`firebase-adminsdk-fbsvc@quickserve-1bfa9`)
was **reused** and associated with the new application identifier — **no new service account was
created**, and the old identifier's FCM credential is untouched. FCM HTTP v1 authenticates against the
whole Firebase project, so the same key serves both Android apps.
**VERIFIED IN DURABLE ARTIFACT** (transcript, Phase 5B) · **corroborated VERIFIED NOW** by the fact
that the native Firebase/Gradle step of build `c59c7ac1` succeeded and every Step 0–13 send returned
server-side `push_status = sent`.

**Push transport path exercised (unchanged architecture):**
`notifications` INSERT → DB webhook → `send-push` Edge Function → Expo Push Service → FCM → device.

---

## 6. EAS credential & environment state

**Build credentials** — **VERIFIED IN DURABLE ARTIFACT**:

| Identifier | Credential config | Disposition |
|---|---|---|
| `ke.co.hiredcorp.kwikserve` | **`L14kmLmfgO`** (new record, **reused** certified keystore) | Active, used by build `c59c7ac1` |
| `com.quickserve.app` | `UtQY5hdcBq` | **Preserved untouched** — rollback asset |

EAS keys Android build credentials **per application identifier**, so the new record was created
additively; the old record was never modified.

**Environment variables** — **VERIFIED NOW** (`eas env:list`, names/metadata only; no values read):

| Environment | `GOOGLE_SERVICES_JSON` | Other variables |
|---|---|---|
| `development` | **absent** — unchanged this phase | `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SUPABASE_URL`, `SENTRY_DISABLE_AUTO_UPLOAD` |
| `preview` | **present** — type `file`, visibility `SENSITIVE`, scope PROJECT, **updated 2026-08-15 00:51:40** to the superset | `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SUPABASE_URL`, `SENTRY_DISABLE_AUTO_UPLOAD` |
| `production` | **absent** | **No variables at all** |

- Exactly **one** `GOOGLE_SERVICES_JSON` entry exists project-wide (no duplicate) — **VERIFIED NOW**.
- **Development and production `GOOGLE_SERVICES_JSON` were NOT changed** during Phase 5C — confirmed by
  the fact that neither environment has the variable at all. **VERIFIED NOW.**
- **Consequence (open risk, §15):** a future **production** Android build will fail at the Gradle
  google-services step until `GOOGLE_SERVICES_JSON` is created in the `production` environment. The
  production environment is currently **empty of all variables**.
- `eas.json` unchanged this phase — `submit.production` is still `{}` (**no Play service account
  configured**) — **VERIFIED NOW**.

---

## 7. Preview APK build result

**VERIFIED NOW** via `eas build:list --platform android`:

| Field | Value |
|---|---|
| Build ID | **`c59c7ac1-0a4d-44e3-9069-c9ee4f4d340e`** |
| Status | **FINISHED** |
| Application identifier | **`ke.co.hiredcorp.kwikserve`** |
| Profile / environment | `preview` / `preview` |
| Distribution | **INTERNAL** (not a store submission) |
| Artifact | APK |
| appVersion | `1.0.0` |
| Git commit | `444a9d9` |

The two immediately preceding Android builds (`617c3fa7` @ `ce9105c`, `ec0b61c5` @ `b3365e4`) still
show application identifier `com.quickserve.app`, confirming `c59c7ac1` is the first build of the new
identity — **VERIFIED NOW**.

**Pre-build gates (VERIFIED IN DURABLE ARTIFACT):** Jest 231 suites / 3062 tests; targeted config
assertions 19/19; root tsc 0 errors; QA tsc 0 errors; `expo config` OK; Android export 0 errors; secret
scan clean.

**Signing at build time (VERIFIED IN DURABLE ARTIFACT — build log):** `Using remote Android credentials
(Expo server)` + `Using Keystore from configuration: Build Credentials L14kmLmfgO (default)`. No
prompt to generate or replace a keystore occurred. No credential was created or modified by the build.

**Stage 1 — physical S24 install & UI regression — PASS.**
**USER-REPORTED PHYSICAL OBSERVATION** (recovered verbatim from the durable transcript, 2026-08-14):
install succeeded · app displays as **KwikServe** · launches normally · no blank/black screen · login
works · home/navigation work · **all five Android bottom-tab labels visible** · Booking Detail → Back
works · Google Places/address flow works · notification permission granted · no obvious crash or
layout regression.

**Build-credit note (VERIFIED IN DURABLE ARTIFACT):** EAS reported **90% of the month's build credits
used** at the time of this build. Relevant before any future production AAB.

---

## 8. Physical Samsung S24 certification — Steps 0–13

**Device:** Samsung Galaxy S24 Ultra ("MUDU's S24 Ultra"). **App under test:** KwikServe
(`ke.co.hiredcorp.kwikserve`), build `c59c7ac1`, commit `444a9d9`.
**Backend:** QA `wjvjuplooidctlxxozws`. **Execution window:** 2026-08-14 22:39 → 2026-08-15 09:59 UTC.
**Method:** one gate at a time; the operator set the device state and reported the physical
observation; the assistant sent exactly one notification per gate through the **real** QA path and
queried the database read-only.

**Token fingerprints are redacted to the last 4 characters throughout. No full Expo push token appears
in this report.**

| Fingerprint | Platform | Identity |
|---|---|---|
| `…FqV]` | android | **New KwikServe** installation (`ke.co.hiredcorp.kwikserve`) |
| `…bGn]` | android | **Old QuickServe** installation (`com.quickserve.app`) |
| `…iCY]` | ios | Existing iPhone installation |

**Standing guardrail applied throughout:** no token was ever manually deleted or mutated. The operator
explicitly authorised (Option B) the application's own designed `DeviceNotRegistered` auto-prune to run
if it triggered. **It never triggered** — no token was auto-pruned at any step.

---

### Step 0 — Baseline device_tokens state

- **Purpose:** capture the exact pre-certification token state before any push is sent.
- **Required state:** none (read-only).
- **Action:** read-only query of QA `device_tokens` via PostgREST + service role, redacted output.
- **Server/DB evidence** — **VERIFIED IN DURABLE ARTIFACT**: **3 rows, all owned by the QA `customer`
  account**:

  | # | Platform | Token | device_name | created_at | last_seen_at |
  |---|---|---|---|---|---|
  | 1 | android | `…FqV]` | MUDU's S24 Ultra | 2026-08-14 22:36:30 | **2026-08-14 22:36:30** (newest) |
  | 2 | android | `…bGn]` | MUDU's S24 Ultra | **2026-08-10 09:00:57** | 2026-08-14 15:45:25 |
  | 3 | ios | `…iCY]` | iPhone | 2026-08-13 17:25:53 | 2026-08-13 17:25:53 |

  No duplicates, no stale/synthetic `QA-P2F` residue.
- **Schema limitation recorded honestly:** `device_tokens` has **no package/app column**
  (`id, user_id, platform, provider, push_token, native_push_token, device_name, last_seen_at,
  created_at`), and both Android rows share the same `device_name`. Package attribution is therefore
  **timing-based inference**, not a server-side proof.
- **Independent corroboration (VERIFIED NOW, cross-artifact):** the Phase 4E.1 certification report
  (`docs/qa/PHASE-4E1-ANDROID-PHYSICAL-PUSH-CERTIFICATION.md` §7) records the retained
  `com.quickserve.app` S24 token as `ExponentPushToken[…kZbGn]` — matching `…bGn]`. This independently
  confirms `…bGn]` is the old-package token.
- **Physical observation:** none required.
- **Status: PASS.**

---

### Step 1 — New KwikServe token registration

- **Purpose:** prove exactly one fresh token registered for the new package, with no duplicate.
- **Required state:** KwikServe installed and logged in on the S24.
- **Action:** read-only re-query including `created_at`.
- **Server/DB evidence** — **VERIFIED IN DURABLE ARTIFACT**:
  - `…bGn]` `created_at` = **2026-08-10 09:00:57** — predates the existence of the KwikServe package →
    old `com.quickserve.app` token.
  - `…FqV]` `created_at` == `last_seen_at` == **2026-08-14 22:36:30** — a single fresh registration →
    the new KwikServe token.
  - Exactly **one** new-package token, **no duplicate**, iOS untouched.
- **Token lifecycle evidence:** attribution upgraded from inference to **near-confirmed at Step 2**,
  when `…FqV]`'s `last_seen_at` advanced to **2026-08-15 08:36:45** at the exact moment the operator
  foregrounded KwikServe (`register-device` upsert). It advanced again to **09:03:47** after the Step 7
  relaunches. Only the KwikServe app could produce those bumps.
- **Physical observation:** operator confirmed KwikServe open and logged in.
- **Status: PASS** (package attribution explicitly recorded as timing-based, not schema-proved).

---

### Step 2 — Foreground push

**This step has two records. Only FG2 is the certification.**

#### 2a — FG1 (`d958bc5b…`) — INVALID as foreground certification

- **Purpose (intended):** foreground delivery.
- **Actual device state:** the operator has stated the app was **accidentally BACKGROUNDED** when this
  notification was sent. **USER-REPORTED PHYSICAL OBSERVATION** (correction issued 2026-08-15 08:38,
  recovered verbatim from the durable transcript).
- **Action:** one customer notification, title `KWIK-QA-FG Foreground Test`, via the real path.
- **Server evidence** — **VERIFIED IN DURABLE ARTIFACT**: `push_status = sent` (attempts 1, no error);
  `device_tokens` still 3 rows; **no token pruned** — meaning Expo returned no `DeviceNotRegistered`
  for any of the three tokens, so all three installs were still live and valid.
- **Physical observation:** **none was ever collected for FG1** — the operator's next message was the
  request to redo the test, not a device report.
- **Status: NOT COUNTED AS CERTIFICATION.** Recorded and preserved as an **accidental background-state
  observation**, exactly as instructed. It was not deleted or rewritten.

#### 2b — FG2 (`16afe12d-6a3d-499c-84f2-5eded5491d45`) — the Step 2 certification

- **Purpose:** certify foreground push behaviour with the app visibly open.
- **Required state:** KwikServe **open and visible on-screen** (not merely in recent-apps). The
  operator explicitly confirmed this state before the send.
- **Action:** exactly one customer notification, title `KWIK-QA-FG2 Foreground Test`, via
  `notifications` INSERT → webhook → `send-push` → Expo → FCM. No code, token, Firebase, EAS, or
  credential change.
- **Server/DB evidence** — **VERIFIED IN DURABLE ARTIFACT**: `push_status = sent` (attempts 1, no
  error); fresh pre-send baseline 3 rows; post-send **3 rows unchanged**; **no token auto-pruned**.
- **Token lifecycle evidence:** `…FqV]` `last_seen_at` advanced to **2026-08-15 08:36:45** on
  foregrounding — the positive KwikServe-token confirmation described in Step 1.
- **Physical observation** — **USER-REPORTED PHYSICAL OBSERVATION** (operator reply: *"all steps passed
  successfuly"* to the four explicit questions): foreground banner appeared while KwikServe was
  visibly open · `KWIK-QA-FG2 Foreground Test` appeared in KwikServe's Notifications tab · app remained
  stable, no crash/freeze · no unexpected interaction behaviour on tap.
- **Status: PASS** — this is the authoritative Step 2 result.

---

### Step 3 — Background push

- **Purpose:** certify OS-level delivery while the app is backgrounded but not force-closed.
- **Required state:** KwikServe opened normally, then Home pressed. **Not** force-closed, **not** swiped
  from Recent Apps. Operator confirmed this state.
- **Action:** exactly one customer notification `KWIK-QA-BG Background Test`, id
  **`19485bb4-7169-414b-a456-139cac48b4c5`**, via the real path.
- **Server/DB evidence** — **VERIFIED IN DURABLE ARTIFACT**: `push_status = sent` (attempts 1, no
  error); baseline unchanged at 3 rows; post-send **3 rows**, **no token pruned**, no cleanup.
- **Physical observation** — **USER-REPORTED PHYSICAL OBSERVATION**: *"Step 3 passed, banner appeared
  with correct title/body."* Android system notification appeared while backgrounded, with title
  exactly `KWIK-QA-BG Background Test` and the correct body. Not tapped (tap routing is Step 4).
- **Status: PASS.**

---

### Step 4 — Notification-tap routing (warm/background tap)

- **Purpose:** certify that tapping a booking-linked notification deep-links to the correct screen.
- **Required state:** notification waiting in the shade; app backgrounded.
- **Action:** one **booking-linked** customer notification id
  **`0bee48e5-42c9-4f9d-8110-bd59e0e09730`**, title `KWIK-QA-TAP Booking Notification`, `type =
  booking_assigned`, `category = booking`, linked to a **real** customer booking `71d019e5…` (status
  *pending*), payload route `/booking/71d019e5-1773-481f-b100-30c4c34207d0`.
  Code inspection during this step confirmed `send-push` builds the payload via
  `specFromNotificationRow(rec)` and passes the row's `route` straight into the push `data`.
- **Server/DB evidence** — **VERIFIED IN DURABLE ARTIFACT**: `push_status = sent` (attempts 1, no
  error); 3 rows, no prune, no cleanup.
- **Physical observation** — **USER-REPORTED PHYSICAL OBSERVATION**: *"Step 4 passed, routed to correct
  Booking Detail, Back works."* Tap opened/foregrounded KwikServe → routed to the correct Booking
  Detail for `71d019e5…` → visible Back control present and working → no wrong screen, no blank screen,
  no crash.
- **Status: PASS.**

---

### Step 5 — Terminated-state delivery

- **Purpose:** certify delivery while the app process is fully terminated.
- **Required state:** KwikServe **force-closed** (swiped from Recent Apps / Force stop). Operator
  confirmed force-closed.
- **Action:** one booking-linked notification id **`2b32911f-69ca-4290-bf2e-a0fa5e4a10f9`**, title
  `KWIK-QA-TERM Terminated Test`, same booking/route as Step 4. Explicitly **left untapped** so Step 6
  could reuse it.
- **Server/DB evidence** — **VERIFIED IN DURABLE ARTIFACT**: `push_status = sent` (attempts 1, no
  error); baseline unchanged; 3 rows, no prune.
- **Physical observation** — **USER-REPORTED PHYSICAL OBSERVATION**: *"Step 5 passed, terminated
  notification appeared with correct title/body."* Notification arrived while KwikServe was terminated,
  with the correct title and body; delivery did not force-launch the app.
- **Status: PASS.**

---

### Step 6 — Cold-start tap routing

- **Purpose:** certify that tapping a notification from a fully terminated state cold-starts the app
  and routes correctly (the historical Phase 4E.1 defect #2 area).
- **Required state:** app still terminated; the Step 5 notification still in the shade.
- **Action:** **no new push** — the Step 5 notification was reused. Pure device observation.
- **Server evidence:** none required (no send).
- **Physical observation** — **USER-REPORTED PHYSICAL OBSERVATION**: *"Step 6 passed, cold-start routed
  to correct Booking Detail."* App cold-started successfully → routed to the correct Booking Detail
  (`71d019e5…`) → **no black/blank screen** → visible Back present and working → app remained usable.
- **Status: PASS.**

---

### Step 7 — Repeated cold launch / stale-tap safety

- **Purpose:** prove a prior notification tap does not "stick" and replay on a normal icon launch.
- **Required state:** two full cycles of force-close → reopen **from the app icon** (not from a
  notification).
- **Action:** no push. Pure device observation.
- **Server evidence:** none required.
- **Token lifecycle evidence:** `…FqV]` `last_seen_at` advanced to **2026-08-15 09:03:47** across these
  relaunches — consistent with registration firing on each cold launch while signed in.
- **Physical observation** — **USER-REPORTED PHYSICAL OBSERVATION**: *"Step 7 passed, launched to Home
  both times, no stale replay."* Both launches landed on the normal Home screen, no auto-jump into
  Booking Detail, no black/blank screen, stable both times.
- **Status: PASS.**

---

### Step 8 — Logout token cleanup

- **Purpose:** prove in-app logout removes **only** the KwikServe device token.
- **Required state:** signed in as QA customer, then in-app Logout on the S24.
- **Action:** read-only pre-logout baseline; operator signed out; read-only re-query. **No manual
  deletion.**
- **Server/DB evidence** — **VERIFIED IN DURABLE ARTIFACT**:

  | Token | Before | After logout |
  |---|---|---|
  | `…FqV]` (KwikServe, android) | present, `last_seen` 09:03:47 | **REMOVED** ✅ |
  | `…bGn]` (old QuickServe, android) | present, `last_seen` 2026-08-14 15:45:25 | **remains** ✅ |
  | `…iCY]` (iOS) | present, `last_seen` 2026-08-13 17:25:53 | **remains** ✅ |

  3 rows → 2 rows. Exactly the desired scoping: KwikServe's logout removed its own token only; the old
  app's token and the iPhone token were untouched.
- **Physical observation** — **USER-REPORTED PHYSICAL OBSERVATION**: *"Signed out, check the tokens."*
- **Status: PASS.**

---

### Step 9 — Re-login / token restoration

- **Purpose:** prove a valid token is restored on re-login, with correct ownership and no duplicate row.
- **Required state:** log back into KwikServe as the QA customer; wait for registration.
- **Action:** read-only re-query.
- **Server/DB evidence** — **VERIFIED IN DURABLE ARTIFACT**: back to **3 rows**.
  - `…FqV]` **RESTORED** — `last_seen_at` **2026-08-15 09:06:48** (fresh registration), owned by
    **customer**.
  - `…bGn]` remains (customer); `…iCY]` untouched (customer).
  - **Exactly one** KwikServe Android token; **no duplicate row.**
- **Token lifecycle note (important, and explicitly correct):** the restored row carries the **same
  token value** as before. A re-login does **not** require Expo to mint a new token value — the
  device's FCM/Expo registration survives logout/login. The row was deleted on logout and cleanly
  **re-created** on login. The fresh `last_seen_at` of `2026-08-15 09:06:48` is what demonstrates a
  genuine post-login registration/reassociation rather than reliance on a stale database row.
- **Status: PASS.**

---

### Step 10 — Account claim / isolation (single-owner invariant)

Run as two gates.

**Step 10a — ownership move.**
- **Required state:** log out of KwikServe (customer), log in as the QA **provider1** account.
- **Server/DB evidence** — **VERIFIED IN DURABLE ARTIFACT**:

  | Token | Owner before | Owner after |
  |---|---|---|
  | `…FqV]` (KwikServe, S24) | customer | **provider1** (moved; `last_seen` 09:11:21) |
  | `…bGn]` (old QuickServe) | customer | customer (unchanged) |
  | `…iCY]` (iOS) | customer | customer (unchanged) |

  `…FqV]` moved to provider1 and is **no longer owned by customer**. **No duplicate row** was created;
  the old-package and iOS rows were not disturbed. This is the `register-device` service-role
  token-claim behaviour working as designed.

**Step 10b — push isolation.**
- **Action 1:** one notification to **provider1**, id `89779531…`, title `KWIK-QA-ISO-PROV Provider
  Push`. `push_status = sent`. **Physical observation — USER-REPORTED:** *"Provider push arrived on the
  S24."*
- **Action 2:** one notification to **customer**, id `465ec892…`, title `KWIK-QA-ISO-CUST Customer
  Push`. `push_status = sent`; server-side fan-out targeted the customer's tokens only — `…bGn]` (old
  app) and `…iCY]` (iPhone) — and **did not target `…FqV]`**, which was provider1-owned. Token table
  still 3 rows, no pruning.
- **Physical observation** — **USER-REPORTED PHYSICAL OBSERVATION**: *"Step 10 passed, KwikServe did not
  receive the customer push."*
- **What this demonstrates, stated no more strongly than the evidence supports:** the same physical
  token belonged to **exactly one account at a time**, ownership moved cleanly customer → provider1
  **without creating a duplicate row**, provider-targeted push reached the S24, and customer-targeted
  push did **not** reach that physical KwikServe installation while the token belonged to provider1.
- **Status: PASS.**

---

### Step 11 — Permission-denied behaviour — **PASS WITH ANOMALY**

- **Purpose:** confirm the app stays usable with Android notification permission denied, and that no
  invalid/garbage token is registered.
- **Required state (as corrected by the operator):** on the S24, Android notification permission for
  KwikServe turned **OFF**; the app **reopened and used**. **The operator was logged in as the QA
  CUSTOMER — not provider1 — and remained authenticated on customer screens, not on the login/welcome
  screen.** This correction was issued explicitly and is recorded verbatim in the durable transcript.
- **Action:** read-only `device_tokens` queries and read-only source inspection. **No mutation, no
  push sent during this step.**

**Observed results:**

- **Physical (USER-REPORTED):** notification permission OFF · *"KwikServe still opens and functions
  normally"* · **no crash** · navigation continued working.
- **Server/DB (VERIFIED IN DURABLE ARTIFACT):** only **2 rows** remained — `…bGn]` and `…iCY]`, both
  customer, both valid Expo tokens. **`…FqV]` had disappeared.**
- **No garbage/invalid token was registered** — both remaining rows are legitimate.

**Code inspection performed (read-only) — VERIFIED IN DURABLE ARTIFACT:**

- `registerForPushNotifications()` returns `null` when permission is unavailable/denied. **That path
  does not obviously delete an existing token.**
- `unregisterForPushNotifications()` performs the deletion, and is wired to **logout**
  (`src/auth/auth-context.tsx:135`).
- The only registration trigger is `src/app/_layout.tsx:35–37` —
  `useEffect(() => { if (signedIn) void registerForPushNotifications(); }, [signedIn])` — which fires
  **only on a `signedIn` transition** (cold launch while authenticated, or fresh login). There is **no**
  AppState/foreground listener and **no** permission-change listener.
- **There is no "delete token on permission-denied" code path.**

**Characterisation — deliberately not overstated:**

> **Unexpected token disappearance observed during the permission-denied test; causation not proven.**

The **leading evidence-based explanation** (labelled **INFERRED**, not proven) is the
**provider1 → customer account switch** that occurred between Step 10b and Step 11: signing provider1
out invokes `unregisterForPushNotifications()`, which deletes the row; the subsequent customer login
then ran `registerForPushNotifications()` with permission already OFF, which returned `null` and so did
**not** recreate the row. Candidate causes checked and ruled out read-only: `DeviceNotRegistered`
pruning (no push was sent during Step 11, and disabling the notification permission does not invalidate
an FCM token), token claim/reassignment (requires a new registration, which could not run), and any
other concurrent test action (Step 11 was read-only).
**This explanation is not accepted as proven, and the permission toggle is explicitly NOT claimed to
have caused the deletion.**

**Restoration evidence:**

1. Permission re-enabled + app **foregrounded** as the same customer → `…FqV]` did **not** reappear
   (still 2 rows). Explained by the registration lifecycle above: foregrounding an already-running,
   already-`signedIn` process produces no `signedIn` transition, so registration never runs.
2. **Force-close → true cold launch from the icon**, still the QA customer, permission ON →
   **`…FqV]` reappeared cleanly**, owned by **customer**, `last_seen_at` **2026-08-15 09:56:12**, **no
   duplicate row**. `…bGn]` and `…iCY]` remained untouched throughout.

**Independent corroboration — VERIFIED NOW:** today's read-only query shows the `…FqV]` row with
`created_at = 2026-08-15T09:56:12`, i.e. the row itself was **created at the cold-launch restoration**,
which independently confirms the delete-then-recreate sequence described above.

- **Status: PASS WITH ANOMALY.**
  - Permission denial did not crash or break the app ✅
  - No garbage/invalid token registered ✅
  - **Anomaly:** a valid, customer-owned KwikServe token was removed while the user remained
    authenticated; causation **not proven** ⚠️
  - Token restored cleanly on cold launch ✅
  - **Lifecycle finding:** registration fires only on a `signedIn` transition — re-enabling permission
    mid-session or foregrounding does not self-register until the next cold launch or re-login. This is
    **pre-existing** behaviour, present in the same code path that served `com.quickserve.app`, and is
    **not introduced by the package migration** (see also the analogous iOS observation logged in
    `phase4e2-cert-state`).

---

### Step 12 — Payload privacy

- **Purpose:** confirm no unnecessary PII reaches the lock screen or the push payload.
- **Required state:** none — read-only source/template inspection of the real push path.
- **Action:** inspected what `send-push` puts on the wire and the real notification templates.
- **Evidence** — **VERIFIED IN DURABLE ARTIFACT**:
  - Wire payload is exactly `{ to, title, body, data: { type, route }, sound }`. The lock screen shows
    **title + body**; `data.route` is an internal app path.
  - **Booking / quote / payment / generic templates are fully generic** — e.g. *"New job assigned"*,
    *"Your booking has been accepted."*, *"Your provider is on the way."*, *"Payment confirmed"*. **No
    names, phone numbers, addresses, amounts, tokens, or secrets.**
  - `route` / `data` always carries a **UUID-only internal path** (`/booking/<uuid>`,
    `/provider/job/<uuid>`, `/booking/chat/<uuid>`) — no PII.
  - The QA notifications sent in Steps 2–10 match this shape (generic title/body, `/booking/<uuid>`).
- **One design note (not a migration defect):** the chat **"New message"** template sets `body` to the
  **message-text preview (≤80 chars)**, which surfaces user-typed content on the lock screen. This is
  an intentional messaging-preview feature and is **pre-existing** — the same templates served
  `com.quickserve.app`. Logged as a product/privacy consideration.
- **Physical observation:** none required (payload-level verification).
- **Status: PASS** (with the pre-existing chat-preview design note).

---

### Step 13 — Duplicate / stale token inspection

- **Purpose:** final read-only sweep for duplicate rows, stale rows, or synthetic test residue.
- **Required state:** end of sequence, customer logged in on the S24.
- **Action:** read-only query. **No token mutation performed or needed.**
- **Server/DB evidence** — **VERIFIED IN DURABLE ARTIFACT** and **re-VERIFIED NOW**: exactly **3 rows**,
  all customer-owned, no duplicates, no synthetic residue, no stale row requiring manual cleanup.
- **Status: PASS.**

---

### Step summary

| Step | Test | Status |
|---|---|---|
| 0 | Baseline `device_tokens` state | **PASS** |
| 1 | New KwikServe token registration | **PASS** |
| 2 | Foreground push — **FG2** (FG1 explicitly not counted) | **PASS** |
| 3 | Background push | **PASS** |
| 4 | Notification-tap routing | **PASS** |
| 5 | Terminated-state delivery | **PASS** |
| 6 | Cold-start tap routing | **PASS** |
| 7 | Repeated cold launch / stale-tap safety | **PASS** |
| 8 | Logout token cleanup | **PASS** |
| 9 | Re-login / token restoration | **PASS** |
| 10 | Account claim / isolation | **PASS** |
| 11 | Permission-denied behaviour | **PASS WITH ANOMALY** |
| 12 | Payload privacy | **PASS** (pre-existing chat-preview note) |
| 13 | Duplicate / stale token inspection | **PASS** |

**13 PASS · 1 PASS WITH ANOMALY · 0 FAIL · 0 DEFERRED · 0 NOT RECOVERABLE.**

---

## 9. Final `device_tokens` state

**VERIFIED NOW** — read-only query of QA `wjvjuplooidctlxxozws` during this reconstruction session
(redacted fingerprints only):

| Fingerprint | Platform | Provider | Owner | Device | created_at | last_seen_at | Disposition |
|---|---|---|---|---|---|---|---|
| `…FqV]` | android | expo | **customer** | MUDU's S24 Ultra | 2026-08-15 09:56:12 | 2026-08-15 09:56:12 | **Current KwikServe token — active. KEEP.** |
| `…bGn]` | android | expo | **customer** | MUDU's S24 Ultra | 2026-08-10 09:00:57 | 2026-08-14 15:45:25 | **Old `com.quickserve.app` token — still Expo-valid, legitimately customer-owned. KEEP.** |
| `…iCY]` | ios | expo | **customer** | iPhone | 2026-08-13 17:25:53 | 2026-08-13 17:25:53 | **Legitimate existing iPhone token. KEEP.** |

**Exactly 3 legitimate rows. No duplicate rows. No synthetic residue. No stale row requiring manual
cleanup.**

> **Explicit guidance — do NOT delete `…bGn]` merely because it belongs to the old package.** It is a
> valid, live Expo token for an installed app owned by the QA customer. The real push path already
> contains `DeviceNotRegistered` stale-token pruning in `send-push`; a valid old-package token should
> remain until it actually becomes invalid or is removed through legitimate lifecycle behaviour
> (logout, uninstall + prune). Manual deletion would destroy evidence and pre-empt the designed
> lifecycle.

**Seeded QA notification rows still present (VERIFIED NOW — 7 rows, deliberately preserved as
certification evidence per operator instruction, cleanup not yet authorised):**

| Id | Title | Created |
|---|---|---|
| `d958bc5b…` | KWIK-QA-FG Foreground Test *(accidental background-state observation)* | 2026-08-15 08:36:01 |
| `16afe12d…` | KWIK-QA-FG2 Foreground Test *(Step 2 certification)* | 2026-08-15 08:39:47 |
| `19485bb4…` | KWIK-QA-BG Background Test | 2026-08-15 08:50:51 |
| `0bee48e5…` | KWIK-QA-TAP Booking Notification | 2026-08-15 08:54:43 |
| `2b32911f…` | KWIK-QA-TERM Terminated Test | 2026-08-15 08:58:31 |
| `89779531…` | KWIK-QA-ISO-PROV Provider Push | 2026-08-15 09:12:20 |
| `465ec892…` | KWIK-QA-ISO-CUST Customer Push | 2026-08-15 09:13:48 |

---

## 10. Observed anomalies

### A10.1 — **Step 11: unexpected device-token disappearance (causation not proven)** — OPEN, non-blocking

- **What happened:** during the permission-denied test, while the operator was **authenticated as the
  QA customer on customer screens**, the valid KwikServe token `…FqV]` disappeared from
  `device_tokens`.
- **What is proven:** the app did not crash, remained usable, navigation worked, **no garbage/invalid
  token was registered**, and the token **restored cleanly** on a true cold launch (`created_at`
  2026-08-15 09:56:12, customer-owned, no duplicate) — **VERIFIED NOW**.
- **What is NOT proven:** that denying notification permission caused the deletion. The code contains
  no permission-denied delete path.
- **Leading explanation (INFERRED, unproven):** the provider1 → customer account switch between Steps
  10b and 11 triggered `unregisterForPushNotifications()` on the provider1 logout; the customer login
  then could not re-register because permission was OFF.
- **Follow-up:** see §15 F1.

> **AMENDMENT 2026-08-16 (Phase 6H).** The text above is the original, correct record as written on
> 2026-08-15 and is **preserved unchanged**. **The Android Step 11 verdict remains
> `PASS WITH ANOMALY` — it is NOT reclassified as a clean PASS.** Only the *causation* assessment has
> changed. Phase 6H Step 11 re-ran the permission-denied test on iOS **in isolation** (single account,
> no account switch): permission OFF left the token **untouched with zero database writes**, and
> permission ON + cold launch **upserted the same row** (`created_at` unchanged, `last_seen_at`
> advanced). Phase 6H Step 8 independently demonstrated that **logout alone deletes the row**
> (queried after logout, before any login). **Permission denial is therefore experimentally excluded
> as the cause, and the account-switch logout is now the supported explanation.** **Limitation: the
> isolated experiment was NOT re-run on Android** — the inference carries because the delete/register
> logic is shared TypeScript with no platform-specific path. See
> [`PHASE-6H-IOS-KWIKSERVE-APNS-PUSH-CERTIFICATION.md`](./PHASE-6H-IOS-KWIKSERVE-APNS-PUSH-CERTIFICATION.md) §12.

### A10.2 — **Registration lifecycle: no self-registration on permission-enable or foreground** — PRE-EXISTING, non-blocking

Push registration fires only on a `signedIn` transition (`_layout.tsx:35–37`). Enabling notification
permission mid-session, or foregrounding a still-running signed-in app, does **not** re-register a
token until the next cold launch or re-login. **Not introduced by the package migration** — the same
code path served `com.quickserve.app`, and the analogous iOS observation is already logged in
`phase4e2-cert-state`. Product consideration, not a migration defect.

### A10.3 — **Chat "New message" lock-screen preview** — PRE-EXISTING, non-blocking

The chat notification template places up to 80 characters of user-typed message text in the push
`body`, which appears on the lock screen. Intentional messaging-preview design, **pre-existing**, not a
migration defect. Logged as a privacy consideration.

### A10.4 — **`device_tokens` has no package/app column** — architectural observation

Package attribution for two Android rows on the same device is **timing-based inference**, not a
server-side fact. It was corroborated three independent ways here (`created_at` predating the
migration; `last_seen_at` bumps coinciding exactly with KwikServe foregrounding; and the Phase 4E.1
report recording `…kZbGn]` as the `com.quickserve.app` token). Adding a package/app column would make
future multi-package certifications provable rather than inferred. Enhancement, not a defect.

### A10.5 — **FG1 procedural anomaly** — resolved

The first foreground attempt was invalidated by an incorrect device state (app backgrounded) and was
re-run as FG2. FG1 is preserved, not deleted, and is **not** counted as the foreground certification.
No device observation was ever collected for FG1.

---

## 11. Security / secret-handling result

**VERIFIED NOW** unless noted.

| Control | Result |
|---|---|
| Temporary `credentials.json` handling | Used **only** as a local vehicle to upload the existing keystore into EAS remote-managed credentials, then **deleted**. **Not present** at the repo root today. |
| `credentials.json` in git history | **Never committed** — `git log --all -- credentials.json` is empty. No keystore or key password ever entered git history. |
| `.gitignore` protection | Rule `credentials.json` added permanently and committed **alone** as `444a9d9`. Also ignored: `*.jks`, `google-services.json`, `*google-services*.json`, `*-firebase-adminsdk-*.json`, `.env`, `.env.backup`. |
| Tracked secret files | **None.** `git ls-files` matches no `google-services*`, `credentials.json`, `*.jks`, `*.keystore`, `*.p8`, `*.p12`, `*.mobileprovision`. |
| `google-services.json` in git history | **Never committed** (neither the superset nor the backup). |
| Keystore in git history | **Never committed** (`git log --all -- '*.jks'` empty). |
| JKS rollback asset | Present **outside** the repository: `C:\Users\ADMIN\Desktop\@dalmarmudu__QuickServe-keystore-backup\@dalmarmudu__QuickServe-keystore.bak.jks` (+ `.zip`). **Existence verified; contents never opened or printed.** |
| EAS credential source | Remote-managed. `eas.json` contains no `credentialsSource: local` and no keystore block. |
| Secret exposure in this report | **None.** No full Expo push token, no service-account private key, no API key, no Firebase app id or project number, no keystore password, no key password. Token fingerprints are last-4 only; `google-services.json` was inspected structurally with all key material redacted at read time. |
| EAS env var values | `GOOGLE_SERVICES_JSON` is stored **SENSITIVE**; only its name, type, scope, visibility and update timestamp were read. |

---

## 12. Rollback assets

All preserved and verified present:

| Asset | State | Evidence |
|---|---|---|
| Old Firebase Android app `com.quickserve.app` | **Preserved** inside project `quickserve-1bfa9`; still a client entry in the active superset | **VERIFIED NOW** |
| `google-services.quickserve.bak.json` (single-client, old package) | **Present**, SHA-256 `39094624…3ab8` | **VERIFIED NOW** |
| EAS credential config `UtQY5hdcBq` (`com.quickserve.app`, keystore + FCM V1) | **Untouched** | **VERIFIED IN DURABLE ARTIFACT** |
| Local JKS keystore backup (Desktop, outside repo) | **Present** | **VERIFIED NOW** (existence only) |
| Commit `ce9105c` — pre-migration branch point (tab-label superset) | Present, `feat/android-tab-labels` | **VERIFIED NOW** |
| Commit `b3365e4` — certified Phase 4E baseline, head of PR #15 | Present, `qa/booking-idempotency` | **VERIFIED NOW** |
| `main` @ `203fd0f` | Unchanged | **VERIFIED NOW** |
| PR #15 | **OPEN / unmerged** | **VERIFIED NOW** |
| `GOOGLE_SERVICES_JSON` rollback procedure | `eas env:update --variable-name GOOGLE_SERVICES_JSON --variable-environment preview --type file --value ./google-services.quickserve.bak.json --visibility sensitive` | **VERIFIED IN DURABLE ARTIFACT** (documented, not executed) |
| Android package rollback | Single-line revert of `app.json` `android.package` (managed workflow; no native files) | **INFERRED from VERIFIED NOW config** |

---

## 13. Protected / untouched systems

| System | State | Evidence |
|---|---|---|
| **Old `com.quickserve.app` configuration** | **Untouched.** Firebase app preserved; EAS credential record `UtQY5hdcBq` preserved; its device token `…bGn]` never manually deleted. | **VERIFIED NOW** |
| **Google Play** | **Untouched.** No Play app created, no AAB produced or uploaded, no Play App Signing enrolment, no `eas submit`, no release. `eas.json` `submit.production` is still `{}` — **no Play service account configured**. The irreversible first-AAB gate has not been approached. | **VERIFIED NOW** |
| **iOS bundle / APNs** | **Untouched.** Bundle remains `ke.co.hiredcorp.quickserve`; no Apple credential created, revoked, or modified; no APNs work performed; no iOS build, TestFlight, or App Store Connect record. The iOS token `…iCY]` was never mutated and its `last_seen_at` has not moved since 2026-08-13. | **VERIFIED NOW** |
| **Supabase production** | **Untouched.** All certification traffic targeted QA `wjvjuplooidctlxxozws`. No production project linked, queried, or written. | **VERIFIED NOW** (QA host confirmed on every query this session) |
| **Production deployment** | **None.** No production build, no OTA/EAS Update, no deploy of any kind. | **VERIFIED NOW** |
| **Deep-link scheme** | **Unchanged** — still `quickserve`. | **VERIFIED NOW** |
| **Protected branches / PRs** | `main` @ `203fd0f` unchanged. **PR #15 OPEN, unmerged**, head `b3365e4`, `mergeStateStatus = BLOCKED`, `reviewDecision = REVIEW_REQUIRED` (branch protection requires one approving review from a non-author; `crsdmudu-dot` is the only account). Branch protection was **not** changed or bypassed. `feat/android-tab-labels` @ `ce9105c` and `qa/booking-idempotency` @ `b3365e4` intact. | **VERIFIED NOW** |
| **Development / production EAS environments** | **Unchanged.** Neither has `GOOGLE_SERVICES_JSON`; `production` has no variables at all. | **VERIFIED NOW** |

---

## 14. Deferred / not yet certified

| Item | Status |
|---|---|
| **Google Play production release** | **NOT STARTED.** No Play app, no AAB, no App Signing enrolment, no service account. |
| **Production Android build / AAB** | **NOT BUILT, NOT CERTIFIED.** Blocked by the missing production `GOOGLE_SERVICES_JSON` (§15 F2). |
| **Production environment configuration** | **NOT CERTIFIED.** The `production` EAS environment currently holds **zero** variables. |
| **Production push delivery** | **NOT TESTED.** All sends were QA. |
| **iOS bundle migration to the KwikServe identity** | ~~**NOT PERFORMED.**~~ **SUPERSEDED 2026-08-16** — performed in Phase 6E (`33b3685`); `ios.bundleIdentifier` is now `ke.co.hiredcorp.kwikserve`. *(Original entry preserved: at the time of writing the app still shipped `ke.co.hiredcorp.quickserve`.)* |
| **iOS/APNs re-certification for a new identity** | ~~**NOT PERFORMED / DEFERRED.**~~ **SUPERSEDED 2026-08-16** — completed as **Phase 6H: PASS — 14 gates, 0 FAIL, 0 open anomalies**, on build `e062e892`. See [`PHASE-6H-IOS-KWIKSERVE-APNS-PUSH-CERTIFICATION.md`](./PHASE-6H-IOS-KWIKSERVE-APNS-PUSH-CERTIFICATION.md). *(Original note preserved: the Phase 4E.2 certification of 2026-08-13 belongs to `ke.co.hiredcorp.quickserve`, not to the migrated identity.)* |
| **Deep-link scheme migration to `kwikserve://`** | **DEFERRED.** |
| **Backend runtime copy rename** (mpesa Edge Function `transactionDesc`, migration 0007 notification text) | **DEFERRED** — requires a coordinated deploy/migration. |
| **Living-docs brand sweep** (`docs/engineering/**`, `docs/pilot/**`) | **DEFERRED.** Historical `docs/qa/PHASE-*` and completed superpowers specs are intentionally preserved. |
| **Cosmetic identifiers** (Expo `slug` still `QuickServe`, npm names, `/why-quickserve` route, `quickserve.co.ke` domain) | **DEFERRED.** |
| **PR #15 merge** | **DEFERRED by operator decision** — leave open, do not change branch protection. |
| **Phase 4F** | **NOT STARTED.** |
| **QA seed-notification cleanup** (7 `KWIK-QA-*` rows) | **PENDING** — deliberately preserved; cleanup not yet authorised. |

---

## 15. Open risks / follow-up items

| # | Risk / item | Severity | Recommended action |
|---|---|---|---|
| **F1** | ~~**Step 11 token-disappearance causation unproven.**~~ **RESOLVED 2026-08-16 by Phase 6H Step 11.** *(Original entry, preserved: the leading explanation — account-switch logout + permission-blocked re-registration — was inferred, not demonstrated.)* | Medium → **closed** | **Done.** The isolated re-test was executed on **iOS** (Phase 6H Step 11, run before Step 10 so no account switch could confound it). Permission OFF → token untouched, zero DB writes. Permission ON + cold launch → same row upserted, `created_at` unchanged. Combined with Phase 6H Step 8 (logout alone deletes the row), **permission denial is excluded and account-switch logout is the supported explanation**. **Limitation: not re-run on Android** — inference carries via shared TypeScript. The Android Step 11 verdict stays `PASS WITH ANOMALY`. See [Phase 6H §12](./PHASE-6H-IOS-KWIKSERVE-APNS-PUSH-CERTIFICATION.md). |
| **F2** | **Production `GOOGLE_SERVICES_JSON` is absent** — the `production` EAS environment has no variables at all. A production Android build will fail at the Gradle google-services step. | **High — blocks any production Android build** | Before any production build: `eas env:create` `GOOGLE_SERVICES_JSON` (file, sensitive) in `production` with the approved superset, then re-verify. Treat as its own gated phase. |
| **F3** | **Registration lifecycle gap** (A10.2): enabling notification permission mid-session never re-registers a token until cold launch/re-login. A real user who enables notifications in Settings will silently receive nothing until they restart the app or sign in again. | Medium — product/UX, pre-existing | Add an AppState/permission-change listener that re-runs `registerForPushNotifications()` when the app foregrounds while signed in. Schedule as product work, not as migration remediation. |
| **F4** | **Chat lock-screen message preview** (A10.3). | Low — privacy design, pre-existing | Product decision: keep, or gate behind a "hide message content" notification setting. |
| **F5** | **Package attribution is inference-only** (A10.4). | Low | Consider a `package`/`app_id` column on `device_tokens` for provable multi-package certification. |
| **F6** | **EAS build credits at ~90% for the month** (as of 2026-08-14). | Medium — operational | Confirm remaining credits before scheduling a production AAB build. |
| **F7** | **7 QA seed notification rows retained** in QA. | Low — QA hygiene | Perform the controlled cleanup of `KWIK-QA-*` + `d958bc5b…` when the operator authorises it. **Do not touch `device_tokens` during that cleanup.** |
| **F8** | **PR #15 blocked** by branch protection (needs a non-author approving review). | Medium — release process | Add a non-author collaborator to approve, then merge with a normal merge commit (no squash — preserve migration history). Do not weaken branch protection. |
| **F9** | **Two Android apps installed side by side** on the QA device, both registering tokens for the same account. Correct behaviour, but it means QA push fan-out reaches both. | Low | Keep until the old app is deliberately retired; expect `…bGn]` to be auto-pruned when the old app is uninstalled. |

---

## 16. Final GO / NO-GO matrix

**These are separate verdicts. They must not be collapsed into a single "ready" statement.**

| Area | Verdict | Basis |
|---|---|---|
| **Android package migration** (`ke.co.hiredcorp.kwikserve`) | **GO** | Config verified now; identifier assertions 19/19; signing keystore reused with identical fingerprints; Firebase superset registered with the old app preserved; rollback assets intact. |
| **Android preview APK** | **GO** | Build `c59c7ac1` FINISHED for the new identifier at commit `444a9d9`, internal distribution, no credential created or modified; Stage-1 physical UI regression reported clean. |
| **Android FCM / push (QA)** | **GO** | Real path `notifications → webhook → send-push → Expo → FCM` exercised end-to-end; every send returned `push_status = sent`; no token ever auto-pruned; FCM V1 reuse validated by successful native build and delivery. |
| **QA physical-device certification (S24)** | **GO WITH ONE LOGGED ANOMALY** | 13 PASS + 1 PASS WITH ANOMALY across Steps 0–13. Step 11's token-disappearance causation is unproven (F1). No blocking defect. |
| **Google Play production release** | **NO-GO** | Nothing on Play has been touched: no app, no AAB, no App Signing enrolment, no service account, no submit. Preview/push certification is **not** Play readiness. |
| **iOS / APNs (KwikServe identity)** | ~~**NO-GO / NOT PERFORMED**~~ → **SUPERSEDED 2026-08-16: GO (QA)** | *(Original verdict preserved: at the time of writing the iOS bundle was deliberately unchanged, with no APNs work and no iOS build.)* Subsequently migrated in Phase 6E and certified in **Phase 6H — PASS, 14 gates, 0 FAIL, 0 open anomalies** on build `e062e892`. **QA only** — App Store / TestFlight / production remain NO-GO. See [Phase 6H](./PHASE-6H-IOS-KWIKSERVE-APNS-PUSH-CERTIFICATION.md). |
| **Production environment configuration** | **NO-GO** | `production` EAS environment holds **zero** variables, including no `GOOGLE_SERVICES_JSON` (F2). No production-specific configuration has been certified. |
| **Production deployment / production push** | **NO-GO** | Never built, never sent, never certified. |

---

## 17. Exact recommended next phase

**Phase 5F — Certification closure & controlled QA cleanup (no new capability, no release).**

Run strictly in this order, each on explicit approval:

1. **Record the Android package migration as CERTIFIED** in project memory and this document's status
   line — with the Step 11 anomaly and the two pre-existing findings carried forward as non-blocking.
2. **Controlled cleanup of the 7 `KWIK-QA-*` seed notification rows only.** Do **not** touch
   `device_tokens`; do **not** delete `…bGn]`.
3. ~~**F1 isolation re-test**~~ — **DONE 2026-08-16**, executed on iOS as Phase 6H Step 11 (§15 F1).
   Causation resolved; the Android Step 11 verdict deliberately remains `PASS WITH ANOMALY`.

> **STATUS UPDATE 2026-08-16.** Items 1 and 3 are complete. **Item 2 — controlled cleanup of the 7
> `KWIK-QA-*` rows — is still OUTSTANDING and unauthorised.** Those rows plus the 6 `KWIK-IOS-*` rows
> from Phase 6H total **13 retained certification rows**, all deliberately preserved. Since this
> report was written the migration has continued through Phases 6A–6I (iOS identity + APNs
> certification); the Android-specific content below remains accurate as of `444a9d9`.

**Explicitly not the next phase:** the production environment work (F2), the Google Play / Hired Corp
developer-account migration, the iOS bundle + scheme migration, and Phase 4F. Each is its own gated
phase, and F2 must precede any production Android build.

---

## 18. Final repository / QA state proof

All **VERIFIED NOW**, read-only, at the time of writing:

```
branch          chore/kwikserve-identity
HEAD            444a9d9882ed91a2cc27df19141cdb366f912ff5
                "Ignore local EAS credential files"  (Mahamud Mohamed, Sat Aug 15 00:41:21 2026 +0300)
main            203fd0f876197d42afa09e03b980ef1c85245847  (unchanged)
git status      clean before this report was written (this document is the only new file)

PR #15          OPEN · head qa/booking-idempotency @ b3365e4 · base main
                mergeable=MERGEABLE · mergeStateStatus=BLOCKED · reviewDecision=REVIEW_REQUIRED
                https://github.com/crsdmudu-dot/QuickServe/pull/15

expo config     name=KwikServe · slug=QuickServe · scheme=quickserve
                android.package=ke.co.hiredcorp.kwikserve
                ios.bundleIdentifier=ke.co.hiredcorp.quickserve
                android.googleServicesFile=[SET] · owner=dalmarmudu
                eas.projectId=587f8663-a722-4882-ab56-9007413003ee · 1.0.0 / versionCode 1

jest            src/__tests__/android-config.test.ts + ios-config.test.ts → 19/19 PASS

EAS build       c59c7ac1-0a4d-44e3-9069-c9ee4f4d340e | FINISHED | ANDROID | preview | INTERNAL
                | 1.0.0 | 444a9d9 | ke.co.hiredcorp.kwikserve

EAS env         development: no GOOGLE_SERVICES_JSON
                preview:     GOOGLE_SERVICES_JSON (file, SENSITIVE) updated 2026-08-15 00:51:40
                production:  no variables at all

google-services google-services.json            → 2 android clients, project quickserve-1bfa9
                                                  sha256 44a3f414…7294
                google-services.quickserve.bak.json → 1 android client (com.quickserve.app)
                                                  sha256 39094624…3ab8
                (both git-ignored, never committed)

secrets         credentials.json absent + never in git history
                no *.jks / google-services* / credential file tracked
                JKS rollback backup present outside the repo (contents never read)

QA device_tokens (wjvjuplooidctlxxozws) — 3 rows, all customer-owned:
                …FqV] android  created 2026-08-15 09:56:12  last_seen 2026-08-15 09:56:12
                …bGn] android  created 2026-08-10 09:00:57  last_seen 2026-08-14 15:45:25
                …iCY] ios      created 2026-08-13 17:25:53  last_seen 2026-08-13 17:25:53

QA notifications 7 KWIK-QA-* seed rows retained as evidence (cleanup pending authorisation)
```

**Nothing was mutated to produce this report.** All checks were read-only: git reads, `expo config`,
Jest, `eas build:list`, `eas env:list` (names/metadata only), PostgREST `SELECT`s, and filesystem
existence checks.

---

*Reconstructed 2026-08-15 from durable evidence after a VS Code restart cleared the working session.
Primary durable sources: the on-disk prior-session transcript
`113fae4e-667c-40a5-ba12-b196353b3a58.jsonl`, project memory `kwikserve-migration.md` and
`phase4e2-cert-state.md`, `.remember/today-2026-08-15.md`, git history, and live read-only checks of
the repo, EAS, and the QA database.*
