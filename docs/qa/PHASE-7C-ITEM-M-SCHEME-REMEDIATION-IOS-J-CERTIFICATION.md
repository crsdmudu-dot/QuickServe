# Phase 7C — Item M Scheme Remediation + iOS Physical J Certification (`003a0369`)

> **Status:** AUTHORITATIVE / CANONICAL record for the **item M** deep-link scheme remediation, its
> physical-iPhone runtime certification, and the completion of **defect J** on iOS.
>
> **Also authoritative for one correction:** this report **corrects two false diagnostic claims in
> [Phase 7B](PHASE-7B-SERVICE-DETAILS-V16-IOS-PHYSICAL-CERTIFICATION.md) §11.2 and §11.3** (§3).
> Phase 7B's **certification verdicts are not changed** — only its explanation of *why* a test could
> not be run.
>
> **Scope:** QA backend only (`wjvjuplooidctlxxozws`). Branch `feat/service-details-v1`. No App
> Store, no TestFlight, no production Supabase, no push/APNs testing, no Android.
>
> **Companions:** [Phase 7A](PHASE-7A-SERVICE-DETAILS-V16-ANDROID-PHYSICAL-CERTIFICATION.md)
> (Android) · [Phase 7B](PHASE-7B-SERVICE-DETAILS-V16-IOS-PHYSICAL-CERTIFICATION.md) (iOS, prior).
> Evidence strength differs materially between them — see §12.

---

## 0. Evidence classes used in this report

Adopted unchanged from Phase 5E / 7A / 7B.

| Label | Meaning |
|---|---|
| **VERIFIED NOW** | Machine-obtained during this work: EAS API queries, git state, artifact download and hashing, and **properly decoded** binary-plist inspection. |
| **VERIFIED IN DURABLE ARTIFACT** | Recovered from an artifact that outlived the session: git history, prior phase reports, GitHub API responses, the session transcript. |
| **USER-REPORTED PHYSICAL OBSERVATION** | Observable only by the operator on the physical iPhone. **Not independently re-verifiable by tooling.** |
| **INFERRED** | Drawn from evidence rather than observed. Always labelled. Never promoted to a verdict. |
| **NOT TESTED / DEFERRED** | Never exercised. Listed in §11. |

> **The same iOS caveat as Phase 7B governs this report.** No Apple device CLI runs on Windows, so
> **every physical-iPhone behavioural result here is USER-REPORTED PHYSICAL OBSERVATION with zero
> machine corroboration**, and **no byte-for-byte verification of the installed application was
> achieved or is achievable on iOS.** Where this report says VERIFIED NOW it refers to the build,
> artifact, repository or decoded-bundle layer — never to on-device behaviour. See §12.

---

## 1. Executive verdict

**Item M is remediated and the remediation is CERTIFIED at runtime on the physical iPhone.**
**Defect J is now certified in both directions on iOS.** **Item M is NOT closed.**

- **Item M runtime remediation via `kwikserve://` = PASS / CERTIFIED** (§7, Check 2)
- **J-customer physical iPhone = PASS / CERTIFIED** — closes the Phase 7B §15.1 gap
- **J-admin physical iPhone = PASS**
- **J overall physical iPhone = PASS / CERTIFIED**
- **Item M overall = NOT CLOSED** (§9)
- **No unexpected product defect was discovered** (§13)

**This verdict does NOT extend to:** admin admission *through* `kwikserve://` (§8) · the authored
simulator gate, which never ran (§5.3) · APNs/push on `003a0369` · Android · admin mutations · RLS
or cross-customer isolation · anything in §11.

**G, H and Mobile Admin V1.4 were NOT re-run on this build.** They remain historical physical-iPhone
verdicts on `a3e699c2` (§10).

---

## 2. Why this phase exists

Phase 7B could not execute the J-customer check **at all**. On the physical iPhone
`quickserve://admin` was intercepted by the legacy QuickServe app — deliberately retained since
Phase 6H as the rollback identity — so the link never reached KwikServe and its `/admin` guard never
ran. The check produced **no PASS and no FAIL**. It produced nothing.

That blocker was recorded as **item M**. This phase adds an uncontested address, proves it works on
hardware, and closes the J-customer gap.

---

## 3. CORRECTION — Phase 7B §11.2 and §11.3 were wrong

### 3.1 What Phase 7B claimed

> §11.2: *"**Exactly one URL scheme is registered, and it is the contested one.** No `kwikserve://`,
> no `exp+…`, no bundle-identifier scheme."* — labelled **VERIFIED NOW**
>
> §11.3: *"**No clean targeting method exists**"* while legacy QuickServe remains installed.

### 3.2 What is actually true — **VERIFIED NOW**

Decoding `Payload/KwikServe.app/Info.plist` from the **same** physical build
**`a3e699c2-d5e7-4e56-8668-076a5b5a9730`** (Phase 7B's certified artifact) with a proper
binary-plist parser (`simple-plist`) yields:

```json
"CFBundleURLTypes": [
  { "CFBundleURLSchemes": [ "quickserve", "ke.co.hiredcorp.kwikserve" ] }
]
```

**Two schemes, not one.** The second is Expo's auto-generated bundle-identifier scheme. Because the
legacy app has a *different* bundle id (`ke.co.hiredcorp.quickserve`), it registers a *different*
bundle-id scheme — so **`ke.co.hiredcorp.kwikserve://admin` was already an uncontested address on
`a3e699c2`**, with no code change required.

**Therefore §11.3's conclusion is also wrong:** a clean targeting method did exist.

### 3.3 Root cause of the error

**The evidence method was inadequate.** The plist was inspected by **scanning printable ASCII
strings** out of a **binary** plist rather than decoding its structure. The bundle-identifier string
also occurs in that file as `CFBundleIdentifier`, so a single observed occurrence was misread as
"one scheme entry". The conclusion was then labelled **VERIFIED NOW**, which overstated it.

**This is a documentation / evidence-analysis defect, not a product defect** (§13).

### 3.4 What does NOT change

- **Phase 7B's certification verdicts are unchanged and remain historically accurate.**
- **J-customer was NOT CERTIFIED in Phase 7B because the test was never executed.** That is a
  statement about what was done, not about what was possible.
- **Discovering later that the test *could* have been run does not convert an unexecuted historical
  test into a PASS.** No retroactive certification is claimed or implied.
- Item M itself was and is **real**: `quickserve://` genuinely was contested and genuinely did
  intercept the attempt.

### 3.5 Method rule adopted going forward

**Binary plists are decoded, never string-scanned.** Every plist claim in this report used
`simple-plist`. The focused simulator gate encodes the same rule in CI, verifying
`CFBundleURLTypes.0.CFBundleURLSchemes` with `plutil` + `jq` rather than text matching.

---

## 4. Remediation — Option C

Four strategies were assessed against the constraint that legacy QuickServe must remain installed as
the Phase 6H rollback identity. **Option C was chosen: add `kwikserve`, retain `quickserve`.**

```
app.json  "scheme": "quickserve"   →   "scheme": ["kwikserve", "quickserve"]
```

| Property | Consequence |
|---|---|
| `kwikserve` | **new uncontested address** — only KwikServe registers it |
| `quickserve` | **retained** for backward compatibility with any already-distributed link |
| Collision | **SIDESTEPPED, not removed** — `quickserve://` stays contested (§9) |
| Ordering | `kwikserve` first; Expo treats entry 0 as the default for `Linking.createURL` |

**Why `quickserve` was retained:** a read-only audit could not prove from the repository that no
`quickserve://` link had already been distributed to testers. Silently breaking such a link was
judged worse than a known, bounded ambiguity. **Dropping it is a later step (§9).**

**Why the change is three lines:** an audit found the scheme has almost no dependents — **no runtime
code constructs, parses or asserts a scheme URL**; `expo-linking` and `Linking.createURL` are unused
(the only `Linking` call opens map directions); notification tap routing resolves **expo-router
paths**, not URLs; there is no Supabase redirect, magic-link or OAuth flow; and Maestro flows and CI
never fire scheme URLs. **`app.json` was the single source of truth.** — **VERIFIED NOW**

### 4.1 Commits

| Commit | Subject | Contents |
|---|---|---|
| **`060df7e87d351f79daa2bf726d41f47fa11e55c7`** | `fix(config): add KwikServe deep-link scheme` | `app.json` + the two config guards (`ios-config`, `android-config`), mutation-tested three ways |
| **`75b43dca98aa10c509713ddbf7f1eb42f1343f4e`** | `test(qa): add Item M iOS scheme gate` | 7 new QA/workflow files; **no shipped product change** |

**VERIFIED NOW:** the shipped product tree at `75b43dc` is identical to `060df7e` — an empty diff
across `src/` (excluding tests), `app.json`, `eas.json`, `package.json`, `package-lock.json`,
`assets/`, with `app.json` **blob-identical**.

---

## 5. The focused simulator gate — **AUTHORED, NOT RUN**

### 5.1 What was authored

Three read-only flows (`item-m-customer-rejection`, `item-m-scheme-compat`,
`item-m-admin-admission`), a reusable `steps/login-admin.yaml`, a runner, a dedicated workflow, and
17 static guards mutation-tested four ways. Committed at `75b43dc`.

### 5.2 Why it was never dispatched — **VERIFIED NOW**

```
$ gh workflow run ios-item-m-scheme.yml --ref feat/service-details-v1 …
HTTP 404: workflow ios-item-m-scheme.yml not found on the default branch

default branch:                    main
workflows registered with Actions: ios-native-journeys.yml, pr-ci.yml   ← ours absent
```

**A `workflow_dispatch` workflow is only dispatchable once its file exists on the default branch.**
The file lives only on the feature branch, so Actions never registered it.

### 5.3 Classification and consequence

**AUTOMATION / PLATFORM constraint. NOT a product failure. NOT a build-provenance failure.** The
gate never executed, so **no simulator evidence exists for item M**, and none is claimed anywhere in
this report. The gate remains valid and will run unmodified once legitimately registered.

**It was deferred rather than unblocked** because the simulator **cannot answer the central
question**: CI installs only KwikServe, so `quickserve://` is uncontested there and the collision
that defines item M cannot arise, let alone be shown resolved. Only a device holding both apps can
demonstrate that — which is what §7 does.

---

## 6. Artifact provenance — `003a0369` — **VERIFIED NOW**

**Machine-obtained. Kept separate from the physical behavioural evidence in §7.**

| Field | Value |
|---|---|
| **EAS build ID** | **`003a0369-0054-44a4-811f-ea6a05ef7488`** |
| Status | `FINISHED` |
| Platform / profile | iOS / **`preview`** |
| Distribution | `INTERNAL` (Ad Hoc) |
| **`isForIosSimulator`** | **`false`** — physical-device artifact |
| **Source commit** | **`75b43dca98aa10c509713ddbf7f1eb42f1343f4e`** |
| Bundle identifier | **`ke.co.hiredcorp.kwikserve`** |
| Version / build | `1.0.0` / `1` |
| SDK / runtime | `56.0.0` / `1.0.0` |
| Fingerprint | `b36019a48ed36a1458a855ce38677d965a03b61e` |
| Duration | 2026-08-25 19:59:14 → 20:05:09 (5m 55s) |
| Artifact expiry | 2026-11-23T19:59:14Z |
| **Local `.ipa` byte size** | **17,049,703** — matches server `Content-Length` exactly |
| **Local `.ipa` SHA-256** | **`53b90c93f74dcdd2174325afce274301c110cbd6367caa90a59ba13b4b210954`** |

**Structure:** magic `504b0304` (`PK` zip) · `Payload/KwikServe.app/` · **`embedded.mobileprovision`
present** · `_CodeSignature` present · `CFBundleSupportedPlatforms: ["iPhoneOS"]`. The embedded
provisioning profile is the decisive marker — simulator builds never contain one.

**Signing:** built `--non-interactive`, so EAS would **fail rather than prompt-and-generate** if any
credential had degraded. It did not fail; existing remote credentials were reused as-is. **Nothing
created, revoked, regenerated or replaced; no device registered.**

**Fingerprint note:** `b36019a4…` is **identical to the simulator build `b2492c12`** from the same
product tree, and **differs from `a3e699c2`'s `f822a512…`** — confirming the scheme change moved the
native layer. Fingerprints hash the native layer only and **cannot** distinguish builds that differ
in JavaScript alone.

### 6.1 Native scheme registration — decoded, not scanned — **VERIFIED NOW**

```json
"CFBundleURLTypes": [
  { "CFBundleURLSchemes": [ "kwikserve", "quickserve", "ke.co.hiredcorp.kwikserve" ] }
]
```

`kwikserve` present ✅ · `quickserve` present ✅ · Expo's generated bundle-id scheme present ✅ ·
**`kwikserve` first / default** ✅

**Decoded with `simple-plist`. No ASCII/string scanning** — per the method rule in §3.5.

---

## 7. Physical-iPhone certification

**Device:** the registered iPhone, UDID `00008140-0009288C14D2801C`, team `8586HL9NBM` — the same
handset as Phases 6H, 7B. Legacy QuickServe remains separately installed throughout.

**All results in this section are USER-REPORTED PHYSICAL OBSERVATION.**

### 7.1 Stage 1 — install + provenance + launch — **PASS**

| Measure | Before | After |
|---|---|---|
| App Size | **52.9 MB** | **52.9 MB** |
| Documents & Data | **2.2 MB** | **2.2 MB** |

- Installed via the **build-specific EAS page** (Route A: page → Install → QR → iPhone confirmation);
  **all six provenance fields verified on screen before the irreversible tap**.
- **The iOS confirmation explicitly named KwikServe, not QuickServe** — the only point at which the
  target bundle is visible before the write, and material because both apps are installed.
- **In-place update:** progress ring on the existing icon; **exactly one KwikServe** afterwards.
- **Legacy QuickServe unchanged and untouched.** No uninstall, no data clear.
- **No install, trust, provisioning, registration, deletion or replacement error or prompt.**
- **Launch:** successful, no crash, blank frame, stuck state or trust prompt; landed on **Customer
  Home**, indicating the customer session survived the update.

> **Unchanged App Size is NOT evidence of binary identity** and is not offered as such. The
> machine-obtained evidence of what was built is §6; §7.1 establishes only installation behaviour.
> Version `1.0.0 (1)` is shared with `a3e699c2` and is likewise no discriminator.

### 7.2 Check 1 — customer role established — **PASS**

Authenticated **QA customer** confirmed via customer navigation and the Profile account; no Admin
chrome; no crash or stuck state.

**Why this was verified rather than assumed:** the session retained through the update could in
principle have been the **admin** session left signed in at the end of Phase 7B. Had it been, Check 2
would have **admitted** rather than rejected, and a correct guard would have looked like a failure —
or an admin admission could have been misread as a customer breach. **The role was confirmed before
the decisive check.**

### 7.3 Check 2 — `kwikserve://admin` customer rejection — **PASS — DECISIVE**

**Observed sequence:**

```
KwikServe · authenticated QA customer · starting screen My Bookings
  → Safari → kwikserve://admin
  → iOS offered/opened KwikServe
  → Customer Home
```

| Assertion | Result |
|---|---|
| iOS offered/opened **KwikServe** (not legacy QuickServe) | **PASS** |
| Final screen **Customer Home** | **PASS** |
| Admin chrome at any instant, including a flash | **NONE** |
| Admin data at any instant | **NONE** |
| "Not authorized" | **NONE** |
| Redirect loop | **NONE** |
| Crash / blank / stuck frame | **NONE** |

#### Why the My Bookings starting state is what makes this conclusive

Had the check begun on **Customer Home**, a final state of Customer Home would have been
**ambiguous** between two very different outcomes:

- the guard resolved `/admin` and **redirected** to `/home` ✅, or
- the URL **never routed at all** and iOS merely **resumed** the app where it was ❌

Both look identical on screen. **Phase 7B's entire failure was a link that never reached the app**,
so that ambiguity had to be designed out. Starting on **My Bookings** does exactly that:
`roleHref('customer')` sends a rejected customer to `/home`, so **arriving at Customer Home from My
Bookings is positive evidence that the router acted.**

**Verdicts:** **Item M runtime remediation via `kwikserve://` = PASS / CERTIFIED** ·
**J-customer physical iPhone = PASS / CERTIFIED**

### 7.4 Check 3 — `quickserve://admin` retained collision — **COLLISION DOCUMENTED**

**Observed sequence:**

```
Safari → quickserve://admin
  → iOS open prompt explicitly naming QuickServe
  → Open
  → legacy QuickServe → Welcome screen
```

No crash, no error. **No interaction was performed inside legacy QuickServe.**

**This is direct physical-device evidence that `quickserve://` remains contested and cannot
deterministically target KwikServe on this device while both applications are installed.**

**It is NOT a failure of Option C.** `quickserve` was retained deliberately (§4); this outcome is the
expected, known consequence, and it is the evidence base for §9. Note also that the resolution was
**not silent and not unknown** — iOS named the app in a prompt, which is a stronger observation than
"iOS chose something".

### 7.5 Check 4 — customer sign-out — **PASS**

Correct KwikServe application verified **before** acting (both apps were reachable; the legacy app
sat on Welcome). Sign-out completed cleanly, landed on **KwikServe Welcome** and **remained** there —
no silent bounce, no error, no crash.

**The push-token unregister performed by `signOut` is an inherent, long-standing session side effect
(Phase 4E.1), not an arbitrary Supabase mutation.** It does shift the `device_tokens` baseline for
any future APNs work, as already noted in Phase 7B §15.2.

### 7.6 Check 5 — QA admin admission — **PASS**

Credentials entered **directly on the device** and never exposed in the working session.

| Assertion | Result |
|---|---|
| Admin authentication succeeds | **PASS** |
| **Automatic role routing to Admin**, no manual navigation, no deep link | **PASS** |
| Expected Admin chrome present | **PASS** |
| Customer Home / service grid after authentication | **NONE** |
| "Not authorized" | **NONE** |
| Wrong-role flash, even briefly | **NONE** |
| Redirect loop | **NONE** |
| Crash / blank / stuck spinner | **NONE** |

**No admin mutation control was exercised.** No booking was opened or changed. Admission and
rendering only.

**No deep link was used here, deliberately:** `roleHref('admin')` routes an authenticated admin to
`/admin` on sign-in, so reaching Admin **without** a URL is itself the proof that role routing
admitted them — and it isolates role routing from scheme behaviour, which Check 2 had already proven
separately.

**Verdicts:** **J-admin physical iPhone = PASS** · **J overall physical iPhone = PASS / CERTIFIED**

---

## 8. Coverage distinction — what was NOT exercised

**Preserved explicitly so it is never assumed covered:**

| Combination | Status |
|---|---|
| Customer **rejection** through `kwikserve://admin` | **CERTIFIED** (§7.3) |
| Admin **admission** through normal authentication / role routing | **CERTIFIED** (§7.6) |
| **Admin admission specifically through `kwikserve://admin`** | **NOT EXERCISED on hardware — NOT CERTIFIED** |

The authored simulator check that would have covered that combination (**S3**,
`item-m-admin-admission.yaml`) **remains NOT RUN** (§5). **This combination must not be claimed as
certified on either surface.**

---

## 9. Item M final status — two verdicts, kept separate

> **Item M runtime remediation via `kwikserve://` = PASS / CERTIFIED**
>
> **Item M overall = NOT CLOSED**

**These must not be conflated.** The new deterministic scheme works and is certified on hardware. But
KwikServe **still registers the legacy `quickserve` scheme** for backward compatibility, and **Check
3 demonstrated on the device that scheme remains contested** while both applications are installed.

**Full closure requires the eventual retirement / removal of KwikServe's legacy `quickserve`
registration, once backward compatibility permits** — which in turn depends on retiring the legacy
QuickServe app that currently serves as the Phase 6H rollback identity.

**Item M is NOT marked CLOSED in this report.**

---

## 10. Historical verdicts — NOT transferred

**G, H and Mobile Admin V1.4 were NOT re-run on `003a0369`.** They remain **historical
physical-iPhone verdicts obtained on `a3e699c2`** (Phase 7B §8, §9, §12). This scheme-only build does
not invalidate their underlying product findings — the shipped product tree is unchanged apart from
a scheme that no runtime code reads — but **it is a different binary, and no transfer is claimed.**

Likewise: **no Android result may be inferred from this iPhone evidence**, and **no mutation-path
certification may be inferred from the read-only Admin admission check.**

---

## 11. Deferred / NOT CERTIFIED — full open register

**Each item is a gap, not a soft pass.**

| # | Item | Status |
|---|---|---|
| 11.1 | **Item M overall** | **NOT CLOSED** — legacy `quickserve` retained (§9) |
| 11.2 | **Admin admission via `kwikserve://admin`** | **NOT EXERCISED / NOT CERTIFIED** (§8) |
| 11.3 | **Focused simulator gate (S1/S2/S3)** | **AUTHORED, NOT RUN** — automation/platform (§5) |
| 11.4 | **APNs / push on `003a0369`** | **NOT CERTIFIED** — no push testing performed; `device_tokens` baseline further shifted by the Check 4 sign-out |
| 11.5 | **Android item L** | **NOT CLOSED** — separate finding; untouched by this phase |
| 11.6 | **Provider physical route guard** | **NOT RUN** on either platform |
| 11.7 | **Cross-customer booking `SELECT`** | **UNPROVEN** |
| 11.8 | **Non-admin admin-*mutation* enforcement** | **UNPROVEN** |
| 11.9 | **Substitution `substitute` / `skip` branches** | **NOT CERTIFIED** — only `Call me first` has runtime evidence |
| 11.10 | **Android FCM / push on `fa138be5`** | **NOT CERTIFIED** |
| 11.11 | **Build A (`bd6c51a5`) 20-checkpoint campaign** | **NOT RE-RUN** on `fa138be5` |
| 11.12 | **Item C** — Maestro `commands.json` credential/artifact hygiene | **OPEN, process** |
| 11.13 | **Item D** — `customer-search.test.tsx` load-sensitive flake | **OPEN, test infrastructure** |
| 11.14 | **Item K** — native `/admin` non-admin redirect flicker | **OPEN, cosmetic** — no flash was observed on iOS in Check 2, but the Android finding is not closed by a single non-observation |
| 11.15 | **Home-screen safe area** | **OPEN (Android)** — non-repro on iPhone, not globally closed |
| 11.16 | **Service Details V1.6 physical iPhone** | **NOT FULLY CERTIFIED** — Grocery capture, Massage, Review and Customer Booking Detail were never exercised on hardware |
| 11.17 | **Production anything** | **NOT IN SCOPE** |

---

## 12. Evidence strength

### 12.1 Machine-obtained — **VERIFIED NOW**

Repository and commit state · EAS build metadata · downloaded artifact byte size and SHA-256 ·
**properly decoded plist scheme arrays** (both `003a0369` and, for the §3 correction, `a3e699c2`) ·
GitHub Actions workflow registration state.

### 12.2 USER-REPORTED PHYSICAL OBSERVATION

**All** installation and runtime behaviour on the iPhone: Stage 1 and Checks 1–5 in their entirety,
including every storage figure, every screen transition, and every negative observation.

### 12.3 The gap, stated plainly

**There is no `adb`-equivalent machine corroboration for any iPhone observation in this
environment.** No Apple device CLI runs on Windows. **User-reported physical observations are not
elevated to machine-verified evidence anywhere in this report**, and **no byte-for-byte verification
of the installed application is claimed** — iOS exposes no equivalent to the Android
`adb shell sha256sum /data/app/…/base.apk` check used in Phase 7A.

**This standard is weaker than Android Phase 7A**, which had machine corroboration for every physical
assertion and UUID-addressed deep-link targeting.

---

## 13. Defect classification

**No unexpected product defect was discovered during Stage 1 or Stage 2.**

Three non-passing or notable outcomes occurred. They are **distinct in kind** and are not merged:

| Finding | Classification |
|---|---|
| Focused simulator gate could not be dispatched | **AUTOMATION / PLATFORM** — GitHub Actions default-branch registration constraint (§5) |
| `quickserve://` still resolves to legacy QuickServe | **KNOWN / EXPECTED MIGRATION LIMITATION** under Option C (§7.4, §9) |
| Phase 7B §11.2 / §11.3 incorrect diagnosis | **DOCUMENTATION / EVIDENCE-ANALYSIS DEFECT** (§3) |

---

## 14. Protected / untouched systems

Production Supabase · production environment · production push · App Store · TestFlight · Google
Play · Android identity, credentials and builds · EAS credentials and keystores · database
migrations · RLS policies · DB functions · `qa/docs/LAUNCH-CERTIFICATION.md` · **Phase 5E, 6H, 7A,
7B** · product runtime code · Maestro flows and CI beyond the new item M gate · **legacy QuickServe
app** (not uninstalled, not signed into, not navigated) · app data and storage (never cleared) ·
device registrations (unchanged).

**QA data:** the only Supabase writes were those **inherent to authentication and sign-out**,
including the push-token unregister in §7.5. **No booking was created, opened, modified or deleted.
No admin mutation control was exercised.**

**Credentials:** QA customer and admin credentials were entered **directly on the device**, never
pasted, dictated, transcribed or requested. No certificates, provisioning contents, Apple
credentials, tokens or keys appear in this report.

---

## 15. GO / NO-GO matrix

| Item | Verdict |
|---|---|
| Artifact provenance `003a0369` | **GO** — machine-verified |
| Native scheme registration (decoded) | **GO** — `kwikserve` first, `quickserve` retained |
| Install + in-place update + launch smoke | **GO** |
| **Item M runtime remediation via `kwikserve://`** | **GO — PASS / CERTIFIED** |
| **J-customer physical iPhone** | **GO — PASS / CERTIFIED** |
| **J-admin physical iPhone** | **GO — PASS** |
| **J overall physical iPhone** | **GO — PASS / CERTIFIED** |
| **Item M overall** | **NOT CLOSED** |
| Admin admission via `kwikserve://` | **NOT EXERCISED** |
| Focused simulator gate | **AUTHORED, NOT RUN** |
| APNs / push on `003a0369` | **NOT CERTIFIED** |
| Android item **L** | **NOT CLOSED** |
| G / H / Mobile Admin V1.4 | **HISTORICAL on `a3e699c2`** — not re-run |
| Items **C**, **D**, **K**, Home safe area | **OPEN** |
| Provider guard · cross-customer `SELECT` · admin-mutation enforcement | **NOT RUN / UNPROVEN** |
| Production anything | **NOT IN SCOPE** |

---

## 16. Recommended next steps — none started

1. **Register the focused gate on the default branch** so S1–S3 become runnable, or formally accept
   it as deferred. Also closes the §8 admin-admission-via-scheme gap cheaply.
2. **Plan the `quickserve` retirement** — the only route to closing item M (§9). Gated on retiring
   the legacy QuickServe rollback identity.
3. **Android build carrying `060df7e`** — item **L** is untouched until one ships.
4. **Complete Service Details V1.6 on iPhone** (§11.16).
5. **APNs/push certification** on a current build, noting the shifted `device_tokens` baseline.

---

## 17. Final repository / QA state proof

| Item | State | Evidence |
|---|---|---|
| Branch | `feat/service-details-v1` | **VERIFIED NOW** |
| HEAD at authoring | `75b43dca98aa10c509713ddbf7f1eb42f1343f4e` | **VERIFIED NOW** |
| Local = remote, ahead/behind | `0 / 0` | **VERIFIED NOW** |
| Working tree before this report | **clean** | **VERIFIED NOW** |
| Product code / tests / flows / config | **unchanged** by this documentation phase | **VERIFIED NOW** |
| Installed iPhone app | `ke.co.hiredcorp.kwikserve` from `003a0369` | **USER-REPORTED PHYSICAL OBSERVATION** + **VERIFIED NOW** (artifact layer) |
| Legacy QuickServe | installed, untouched | **USER-REPORTED PHYSICAL OBSERVATION** |
| Production | untouched — never contacted | **VERIFIED NOW** |

---

*End of Phase 7C.*
