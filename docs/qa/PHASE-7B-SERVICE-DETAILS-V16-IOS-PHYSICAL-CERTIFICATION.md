# Phase 7B — Service Details V1.6 iOS Physical-iPhone Certification (`a3e699c2`) + Simulator Regression Provenance

> **Status:** AUTHORITATIVE / CANONICAL record for the physical-iPhone certification of **Service
> Details V1.6** after the G/H/J product fixes, and for the **Mobile Admin V1.4 snapshot** on iOS.
>
> **Scope:** QA backend only (`wjvjuplooidctlxxozws`). Branch `feat/service-details-v1`. No App Store,
> no TestFlight, no production Supabase, no deploy, no merge, no push/APNs testing.
>
> **Companion report:** [Phase 7A](PHASE-7A-SERVICE-DETAILS-V16-ANDROID-PHYSICAL-CERTIFICATION.md)
> covers the same feature on Android. **The two are NOT equivalent in evidence strength.** Read §2
> before comparing any verdict across them.

---

## 0. Evidence classes used in this report

Adopted unchanged from [Phase 5E](PHASE-5E-ANDROID-PACKAGE-MIGRATION-FCM-PUSH-CERTIFICATION.md) and
[Phase 7A](PHASE-7A-SERVICE-DETAILS-V16-ANDROID-PHYSICAL-CERTIFICATION.md), with one iOS-specific
caveat added below the table.

| Label | Meaning |
|---|---|
| **VERIFIED NOW** | Machine-obtained and re-checked read-only during this work: EAS API queries, git state, local artifact hashing, and direct inspection of files extracted from the `.ipa`. |
| **VERIFIED IN DURABLE ARTIFACT** | Recovered from an artifact that outlived the working session: GitHub Actions run records, prior phase reports, git history, or the session transcript `~/.claude/projects/C--Users-ADMIN-QuickServe/937d881d-c9cf-4da1-b8a8-1f2a6b0ee609.jsonl`. |
| **USER-REPORTED PHYSICAL OBSERVATION** | Observable only by the operator looking at the physical iPhone. **Not independently re-verifiable by tooling.** |
| **INFERRED** | A conclusion drawn from evidence rather than directly observed. Always labelled. Never promoted to a certification verdict. |
| **NOT TESTED / DEFERRED** | Never exercised. Listed in §15. |

> **iOS-specific caveat governing this entire report.** In Phase 7A, *every* physical assertion had
> machine corroboration available — `adb` focus and activity dumps, logcat, accessibility-hierarchy
> extracts, and on-device APK SHA-256 comparison. **In this campaign none of that exists.** No
> Apple-official device CLI runs on Windows (§6.1), so **every physical-iPhone behavioural result in
> this report is USER-REPORTED PHYSICAL OBSERVATION with zero machine corroboration.** Where this
> report says VERIFIED NOW, it refers to the **build, artifact, repository or extracted-bundle**
> layer — never to on-device behaviour.

---

## 1. Executive certification verdict

**The G and H product fixes are CERTIFIED on the physical iPhone** against the QA backend, on
physical-device build **`a3e699c2`** (source commit `32367c5`, product tree equivalent to `37e8455`).
**J is only PARTIALLY certified**, and **Service Details V1.6 as a whole is NOT fully certified on
iOS.**

**Scope of that verdict, precisely:**

- **G physical iPhone = PASS / CERTIFIED** (§8)
- **H physical iPhone = PASS / CERTIFIED** (§9)
- **J-admin physical iPhone = PASS** (§10.2)
- **J-customer physical iPhone = NOT EXECUTED / NOT CERTIFIED** — blocked by **item M** (§10.3, §11).
  It produced **no product PASS and no product FAIL**, because the deep link never reached KwikServe.
- **J overall physical iPhone = PARTIALLY CERTIFIED**
- **Mobile Admin V1.4 snapshot physical iPhone = PASS / CERTIFIED**, narrowly scoped (§12)
- **Service Details V1.6 physical iPhone = NOT FULLY CERTIFIED**
- **APNs / push on `a3e699c2` = NOT CERTIFIED**

**The J-customer gap is NOT inferred away.** It is not filled by Phase 7A's Android result, by the
six unit tests in `src/__tests__/admin-native-route-guard.test.tsx`, by the simulator suite, or by
the J-admin pass. **A guard that admits correctly is not evidence that it refuses correctly.**

**This verdict does NOT extend to:** admin mutations · RLS enforcement · cross-customer isolation ·
APNs/push · the `substitute` and `skip` substitution branches · the provider route guard · anything
in §15.

---

## 2. Evidence-standard boundary — why this is weaker than Phase 7A

**This section governs every comparison between 7A and 7B.**

| | **Phase 7A (Android, `fa138be5`)** | **Phase 7B (iOS, `a3e699c2`)** |
|---|---|---|
| Installed-binary identity | **on-device SHA-256 matched the artifact byte-for-byte**, re-verified 5× | **impossible** — see below |
| Behavioural corroboration | `adb` focus/activity dumps, logcat, hierarchy extracts | **none** |
| Deep-link targeting | package-pinned (`am start -n …`), resolved package confirmed on device | **impossible** — item M |
| Booking identity for the snapshot gate | **addressed by UUID** `f9b7fb18-…` | **INFERRED** from a seven-value content combination |
| Route-guard directions proven | **3 of 3** (customer refused, admin warm, admin cold) | **1 of 2** (admin admitted only) |

### 2.1 No byte-for-byte verification of the installed application

Phase 7A ran `adb shell sha256sum /data/app/…/base.apk` and matched it against the local artifact.
**iOS has no equivalent for a third-party app** — the container is sandboxed and the on-device binary
is signed and encrypted. **No tool, Apple-official or otherwise, can hash the installed executable
from this environment.**

**This report therefore never claims byte-for-byte on-device verification.** The strongest
installation evidence achieved is stated in §6.5, kept in a separate evidence class from artifact
provenance, and deliberately not combined with it.

### 2.2 Two figures that prove nothing on their own

- **Version `1.0.0 (1)`** — the `preview` profile does not `autoIncrement`, so this string is
  **shared with `e062e892`**, the Phase 6H build previously on this iPhone.
- **EAS fingerprint `f822a512…`** — identical across `e1424e60`, `003f3d5a` and `a3e699c2`, because
  fingerprints hash the **native** layer and only JavaScript changed between them.

**Neither may be used as an identity discriminator.** This was predicted before the build ran and
confirmed afterwards — see §4.3.

---

## 3. Certified device identity

| Attribute | Value | Evidence |
|---|---|---|
| Device | iPhone | **VERIFIED IN DURABLE ARTIFACT** (Phase 6H) |
| UDID | `00008140-0009288C14D2801C` | **VERIFIED NOW** — `eas device:list --apple-team-id 8586HL9NBM` |
| Registered devices for this team | **exactly one** | **VERIFIED NOW** |
| Apple Team | **Hired Corp Ltd — `8586HL9NBM`** | **VERIFIED NOW** |
| Same handset as Phase 6H | yes | **USER-REPORTED PHYSICAL OBSERVATION** |
| Second app on the device | legacy **QuickServe** (`ke.co.hiredcorp.quickserve`), deliberately retained since Phase 6H | **USER-REPORTED PHYSICAL OBSERVATION** |

The single-device registry matters for Ad Hoc signing: a device added after the provisioning profile
was created would force regeneration. None was added, so the existing profile covered the build
without any credential change (§6.3).

---

## 4. Artifact provenance — physical-device build `a3e699c2`

### 4.1 Build record — **VERIFIED NOW** (`eas build:view --json`)

| Field | Value |
|---|---|
| **EAS build ID** | **`a3e699c2-d5e7-4e56-8668-076a5b5a9730`** |
| Status | `FINISHED` |
| Platform / profile | iOS / **`preview`** |
| Distribution | `INTERNAL` (Ad Hoc) |
| **`isForIosSimulator`** | **`false`** |
| **Bundle identifier** | **`ke.co.hiredcorp.kwikserve`** |
| **Source commit** | **`32367c50b914af2f6ad005f788627b46edc55203`** |
| Version / build number | **`1.0.0` / `1`** |
| SDK / runtime | `56.0.0` / `1.0.0` |
| Fingerprint | `f822a512ed16bbdc5e69e2f5682d980dd2c9ee0b` |
| Artifact | `…/ZoKP2I0jPSyQane1BHx2srzq5Jo0zwzRf6ILiLOnooQ.ipa` |
| Built | 2026-08-25 17:42:08 → 17:48:07 (5m 59s) |
| Artifact expiry | 2026-11-23T14:42:08Z |

### 4.2 Local artifact fingerprint — **VERIFIED NOW**

| Field | Value |
|---|---|
| Filename | `KwikServe-a3e699c2.ipa` |
| **Byte size** | **17,049,715** |
| **SHA-256** | **`45296709354f667fcfb09912e2e44be601a6437fcfc758853959ab2db40aeedb`** |

Hashed twice, identical both passes. Downloaded to a scratchpad **outside the repository**; the
working tree was confirmed clean afterwards.

**The download URL was returned by the query for that exact build ID** — not selected from a build
list, not "latest", not matched by filename. The artifact comes from `a3e699c2` by construction.

**Structural integrity — VERIFIED NOW:** magic bytes `504b0304` (`PK` zip); `Payload/` present;
`Payload/KwikServe.app/` present; **`embedded.mobileprovision` present**; `_CodeSignature` present.
The embedded provisioning profile is the decisive structural marker — **simulator builds do not
contain one** — and independently corroborates a real signed device artifact alongside
`isForIosSimulator: false` and the `.ipa` extension.

### 4.3 Shipped code equivalence to `37e8455` — **VERIFIED NOW**

```
$ git diff --stat 37e8455 32367c5 -- src/ (excluding __tests__ and *.test.*) \
      app.json eas.json package.json package-lock.json assets/
(empty)
```

Blob-level confirmation of the four files carrying the fixes:

```
IDENTICAL  src/app/admin/_layout.tsx             fd0d8e8c…   (J)
IDENTICAL  src/app/booking/service-details.tsx   7c3c36b2…   (G wiring)
IDENTICAL  src/booking/service-details-form.ts   121c8992…   (G rule)
IDENTICAL  src/constants/service-forms.ts        c776dee3…   (H copy)
```

`32367c5` differs from `37e8455` only by documentation (`128ad0c`) and QA automation (`32367c5`
itself). **`src/__tests__/qa-automation-service-details.test.ts` is not bundled** — the entry point is
`expo-router/entry` and **no application module imports from `__tests__`** (**VERIFIED NOW**), so it
cannot enter the Metro graph.

**Therefore `a3e699c2` contains the G, H and J product fixes.**

---

## 5. Simulator provenance — **SEPARATELY SCOPED, NOT PHYSICAL EVIDENCE**

> **The results in this section were produced on the iOS Simulator in CI. They are NOT
> physical-iPhone evidence and are NOT part of any verdict in §1 concerning the physical device.**
> They are recorded because they establish what was already green before hardware testing began.

| Item | Value | Evidence |
|---|---|---|
| Simulator build | **`003f3d5a-d95a-492c-b35b-cd49eb9ad5bf`** — profile `ios-simulator`, commit `128ad0c` | **VERIFIED NOW** |
| Workflow run | **`32855651445`**, `headSha 32367c5`, `build_id` pinned explicitly | **VERIFIED IN DURABLE ARTIFACT** |
| Result | **SUCCESS — 21/21 steps, 0 failed commands, 39m 14s** | **VERIFIED IN DURABLE ARTIFACT** |
| Simulator | iPhone SE (3rd gen), iOS 18.1 | **VERIFIED IN DURABLE ARTIFACT** |

**H was runtime-certified on the simulator** in that run: the Towing flow executed
`assertVisible ".*KwikServe is not an emergency service.*"` and passed, alongside the blocked-progression
and no-999/112/911 assertions. That assertion is a real test rather than a tautology — the flow at
HEAD contains **zero** occurrences of the stale wording, and the pinned build's own commit carries
`'KwikServe is not an emergency service. …'` at `src/constants/service-forms.ts:1015` (both
**VERIFIED NOW** before dispatch).

**What the simulator suite cannot certify, on either platform:** **G's error-clearing behaviour** and
**J's route guard** have **no Maestro coverage at all** — no flow asserts `"This is required."`, and
none exercises `/admin/**`. Its value for G is **collateral** regression across the shared change
path, not direct proof.

**One automation defect was found and fixed between the two simulator runs.** Run `32850930655`
failed in `service-details-massage.yaml` while blindly scrolling the Home list for Massage — the same
failure class `b3bbfcf` had already solved for Car Towing. Fixed in commit `32367c5` by entering
through Search. **Product, not implicated:** the flow file was unchanged since the last green run, the
simulator was identical, House Cleaning passed on the same Home screen in the same run, and none of
the four changed shipped files can reach the Home list.

---

## 6. Installation gate

### 6.1 Tooling discovery — **VERIFIED NOW**

| Tool | Present | Note |
|---|---|---|
| `devicectl`, `xcrun` | ❌ | Apple-official; **macOS/Xcode only** — cannot exist on Windows |
| `ideviceinstaller`, `idevice_id`, `ideviceinfo`, `idevicepair` | ❌ | libimobiledevice not installed |
| `cfgutil`, `ios-deploy` | ❌ | — |
| Apple Mobile Device Support 14.1.0.35 | ✅ | service running; **drivers only, no app-install CLI** |
| 3uTools 3.25.005 | ✅ | **GUI only** — its install tree contains no CLI capable of app installation |

**Direct wired `.ipa` installation is NOT supported on this machine by any automated path.** This is
the root cause of the evidence-standard gap in §2.

### 6.2 Route used — official EAS internal distribution

The build-specific EAS page → **Install** → **QR** → iPhone camera → iOS confirmation → in-place
update. **No `eas upload`, no new EAS record, no rebuild, no re-sign, no TestFlight, no App Store, no
3uTools, no newly installed tooling.**

Two failures preceded the successful route and are recorded so the path is reproducible:

1. **Mobile Safari, signed out** → *"Account Not Found"*. Diagnosed **VERIFIED NOW**: an
   unauthenticated fetch of that exact URL returns `HTTP 200` with title
   `Build a3e699c2 — @dalmarmudu/QuickServe — Expo`. The Expo dashboard is client-rendered and hides
   private accounts from unauthorised viewers, so this was an **authorisation outcome presented as a
   not-found message** — not a wrong URL, wrong slug, missing build, or expired artifact.
2. **Mobile Safari, signed in** → *"Something went wrong."* A **client-side rendering failure**;
   authenticated CLI calls against the same account succeeded throughout, so neither the session nor
   the backend was at fault. Resolved by using the **desktop browser + QR**, which is Expo's own
   documented flow.

**No separate install URL exists.** Every URL-bearing field EAS returns for this build was
enumerated: `artifacts.buildUrl` and `artifacts.applicationArchiveUrl` are both the raw `.ipa`
(Safari cannot install from a bare `.ipa`), and the rest are build logs. `eas build:run` is
**simulator/emulator only** by its own definition and cannot install to a physical iPhone. — all
**VERIFIED NOW**

### 6.3 Signing — no credential mutation

The build ran `--non-interactive`, which makes EAS **fail rather than prompt-and-generate** when
credentials are missing or stale. It did not fail, so the existing remote Apple distribution
certificate and Ad Hoc provisioning profile were reused as-is for this bundle identifier and the
registered device. **No credential was created, revoked, regenerated or replaced; no device was
registered.** No certificate, profile contents, Apple credentials or session tokens appear in this
report.

### 6.4 Pre- and post-install device state — **USER-REPORTED PHYSICAL OBSERVATION**

| Measure | Before | After |
|---|---|---|
| KwikServe present | yes | yes — **exactly one** |
| **App Size** | **59 MB** | **52.9 MB** |
| **Documents & Data** | **3 MB** | **3 MB** |
| Last Used | none shown | — |
| Legacy QuickServe | installed separately | **unchanged, untouched** |

The install proceeded as an **in-place update**: the progress ring appeared on the **existing** icon,
exactly one KwikServe remained afterwards, and no second icon appeared. **No uninstall, no data
clear, no reset, no provisioning change.** The iOS confirmation dialog named **KwikServe**, sourced
from **expo.dev**, with ordinary Cancel/Install controls and no integrity, trust, provisioning,
registration, deletion or replacement warning.

### 6.5 Strongest installation evidence achieved — and its limits

**Kept in a separate class from §4 artifact provenance, and deliberately not combined with it.**

- Install initiated from the **build-specific `a3e699c2` page**, whose build ID, commit, profile,
  version and distribution were **read on screen before any tap**.
- iOS confirmation named **KwikServe**, not the legacy app.
- In-place update completed with no error.
- **App Size changed 59 → 52.9 MB**, confirming the on-disk bundle differs from the previous build.

**This is NOT byte-for-byte verification** (§2.1). Version and fingerprint are useless as
discriminators (§2.2). **The App Size change is corroborating evidence only, never identity proof.**

---

## 7. Launch smoke and session state

**Launch smoke = PASS** — **USER-REPORTED PHYSICAL OBSERVATION**: the app launched, the splash
cleared normally, no crash, no blank or stuck screen, **no trust or provisioning prompt**, visuals
normal, no error banner.

**The first launch landed on the Welcome screen — i.e. signed out.**

**Cause indeterminate, and NOT attributed to the update.** The container survived (Documents & Data
unchanged at 3 MB), and the pre-install baseline never established whether a *valid session* was
inside it — `Last Used` showed nothing, and Phase 6H (2026-08-16, nine days earlier) explicitly
exercised logout token cleanup. **The session may well have been absent before the install.** This is
recorded as an observation, not a defect, and **the operator was instructed not to sign in to "fix"
it**, so the true starting state was preserved.

**Data/container retention = SUPPORTED. Authenticated-session retention = NOT ESTABLISHED.**

---

## 8. Defect G — physical iPhone — **PASS / CERTIFIED**

All results **USER-REPORTED PHYSICAL OBSERVATION**. Exercised on House Cleaning after QA-customer
authentication (which itself passed: correct customer tabs, no wrong-role surface, no crash).

| # | Assertion | Result |
|---|---|---|
| 1 | Continue on unanswered required fields produces **field-attached** errors | **PASS** |
| 2 | Answering a failed field clears **its own** error **immediately**, with no second Continue press | **PASS** |
| 3 | Resolving one field **preserves** other outstanding errors | **PASS** |
| 4 | Continue **blocks** while visible required fields are empty | **PASS** |
| 5 | Questions removed by pruning take their errors with them — **no orphaned errors** | **PASS** |
| 6 | Hidden/pruned fields **do not gate** progression — Continue reaches **Step 2 of 5** | **PASS** |

**Why assertions 3 and 5 carry the weight.** A blunt "clear everything on any change" implementation
would satisfy assertion 2 while hiding genuinely outstanding problems — assertion 3 is what
distinguishes a correct fix. Assertion 5 covers the condition the unit tests found rather than the
design anticipated: a pruned question was **never answered**, so its value never changed, and a naive
change-based rule would leave an error attached to a question no longer on screen.

Assertion 6 doubles as the happy-path smoke element: ordinary form completion still reaches Address.

---

## 9. Defect H — physical iPhone — **PASS / CERTIFIED**

All results **USER-REPORTED PHYSICAL OBSERVATION**. Exercised on Car Towing, with a towing reason
("After an accident") answered **before** the gate, so the block is proven to override a partly
filled form rather than only an empty one.

| # | Assertion | Result |
|---|---|---|
| 1 | Safety block appears on answering the injury gate **Yes** | **PASS** |
| 2 | Copy reads **"KwikServe is not an emergency service"** | **PASS** |
| 3 | **No legacy "QuickServe" copy** anywhere on screen | **PASS** |
| 4 | Progression **blocked** while active — form and Continue removed | **PASS** |
| 5 | **No hardcoded 999 / 112 / 911** | **PASS** |
| 6 | **No** path clears the block and restores form and Continue | **PASS** |
| 7 | **Unrelated answer preserved** — "After an accident" survives the gate transition | **PASS** |

**Assertion 7 is a G blast-radius check, not an H detail.** The safety gate now routes through the
same `handleFormChange` handler G introduced, consolidating four previously independent change paths.
An unrelated answer surviving that transition is direct evidence the consolidation did not leak —
the same reasoning that closed this question on Android.

Assertion 5 reflects locked decision **OD3**: the correct emergency number is jurisdictional, so none
is hardcoded anywhere.

---

## 10. Defect J — physical iPhone — **PARTIALLY CERTIFIED**

### 10.1 Why only one direction

A route guard is only fully proven when it both **admits** and **refuses**. On iOS only the admitting
direction was reachable.

| Direction | Method | Result |
|---|---|---|
| **Admin admitted** | normal role routing after admin sign-in | **PASS** (§10.2) |
| **Customer refused** | `quickserve://admin` deep link | **NOT EXECUTED** (§10.3, §11) |

### 10.2 J-admin — **PASS** — **USER-REPORTED PHYSICAL OBSERVATION**

After signing out of the customer session cleanly (landing on Welcome, no bounce, no crash) and
authenticating as the QA admin:

| Assertion | Result |
|---|---|
| Admin authentication succeeds | **PASS** |
| **Role routing automatically admits to `/admin`** — no manual navigation, no deep link | **PASS** |
| Admin chrome renders **and remains** | **PASS** |
| **No customer or provider surface**, not even briefly | **PASS** |
| No "Not authorized" state | **PASS** |
| No bounce, redirect loop, blank frame, freeze or crash | **PASS** |

`roleHref('admin')` routes to `/admin` on login, which is why this direction needed no deep link and
remained testable while **M** blocked the other.

**No admin mutation was performed.** The Admin surface carries live write controls — `Approve`,
`Reject`, `Send quote`, `Update Status`, `Assign`, `Save notes`, `Verify`/`Delete` — and none was
touched at any point.

### 10.3 J-customer — **NOT EXECUTED / NOT CERTIFIED**

The `quickserve://admin` deep link was **intercepted by legacy QuickServe** before KwikServe could
run its guard (§11). **The test produced no product result of any kind — no PASS and no FAIL.**

> **This gap is not filled by inference.** Not by Phase 7A's Android result, not by the six unit
> tests in `src/__tests__/admin-native-route-guard.test.tsx`, not by the simulator suite, and not by
> §10.2. **An admitting guard is not evidence of a refusing guard.**

### 10.4 Verdict

**J-admin physical iPhone = PASS. J overall physical iPhone = PARTIALLY CERTIFIED**, with the
customer-rejection direction **NOT CERTIFIED**.

---

## 11. Item M — iOS custom-scheme interception by legacy QuickServe — **OPEN, environment/migration**

**Discovered during the J-customer attempt.** Typing `quickserve://admin` in Safari produced the
prompt **"Open this page in QuickServe?"**, and iOS opened the **legacy** app. KwikServe was never the
handler. — **USER-REPORTED PHYSICAL OBSERVATION**

**Classification: iOS environment / migration finding. NOT a product defect in `a3e699c2`.**

> **M is NOT evidence that J's customer guard works.** The guard never executed. M explains *why the
> test could not run*, and nothing about the behaviour it would have measured.

### 11.1 Kept distinct from Android item L

Both originate in the same migration cause — the legacy and renamed apps coexisting and claiming one
scheme — but the **platform mechanisms differ materially**, so they are recorded separately:

| | **L (Android, Phase 7A §13)** | **M (iOS, here)** |
|---|---|---|
| Behaviour | Android showed an intent **resolver dialog** offering a choice | iOS **silently resolved** to the legacy app, offering no chooser |
| Mitigation available | **yes** — package-pinned `am start -n <pkg>/<activity>` neutralised it | **none** — see §11.3 |
| Effect on testing | ambiguity, worked around | **execution blocker** |

### 11.2 The shipped artifact exposes only the contested scheme — **VERIFIED NOW**

Extracted from `Payload/KwikServe.app/Info.plist` inside the verified `.ipa`:

```
CFBundleURLTypes → CFBundleURLSchemes → "quickserve"     ← the ONLY registered scheme
CFBundleIdentifier                      ke.co.hiredcorp.kwikserve
NSUserActivityTypes                     ke.co.hiredcorp.kwikserve.expo.index_route
```

**Exactly one URL scheme is registered, and it is the contested one.** No `kwikserve://`, no `exp+…`,
no bundle-identifier scheme. `NSUserActivityTypes` is expo-router's internal activity type, **not a
URL entry point** — it cannot be typed or tapped.

### 11.3 No clean targeting method exists

- **Universal links / associated domains — non-functional.** `app.json` declares
  `ios.associatedDomains = ["applinks:REPLACE_ME.quickserve.app"]`, a literal placeholder. The
  extracted `embedded.mobileprovision` grants `com.apple.developer.associated-domains = *`, but **no
  `applinks:` host appears anywhere in the bundle** and the declared domain does not exist, so no
  `apple-app-site-association` file can be served. — **VERIFIED NOW**
- **No official iOS mechanism** lets a user choose which app handles a custom scheme when two are
  registered. There is no iOS equivalent of Android's package-pinned `am start -n`.
- **Shortcuts / Notes / Safari cannot disambiguate.** Shortcuts' *Open App* can launch KwikServe but
  **cannot carry a URL**; *Open URLs*, Notes and Safari all defer to the same system resolution. The
  ambiguity is resolved by iOS **before any app is involved**.

### 11.4 Consequence and disposition

**J-customer cannot be manually deep-link certified on this device while the legacy app remains
installed.** A device-local side effect worth noting — and explicitly **not** a mitigation: while
legacy QuickServe holds the scheme, a customer on *this* device has no working route into KwikServe's
`/admin` at all. That says nothing about a device without the legacy app.

**No remediation was performed.** The legacy app was **not uninstalled**, the scheme was **not
changed**, and no code, config, build or install state was modified. Phase 6H deliberately retains
that app as the **rollback identity** holding the legacy iOS push token, so removing it is a
migration decision rather than a test convenience.

**Relationship to Phase 5E:** 5E recorded the deep-link scheme `quickserve` as **unchanged** by
decision, with migration deferred to a later identity phase. **Phase 5E is NOT amended by this
report.**

---

## 12. Mobile Admin V1.4 snapshot — physical iPhone — **PASS / CERTIFIED (narrow)**

Exercised read-only on the live admin session, against the QA Grocery Delivery booking. All results
**USER-REPORTED PHYSICAL OBSERVATION**.

### 12.1 Booking identity — **INFERRED, not UUID-addressed**

Because **M** prevented package-specific deep-link targeting, the booking was reached by tapping the
**single** Grocery Delivery row in the Admin Bookings list, and its identity established by requiring
**all seven** of the following to match:

```
Grocery Delivery · Pending · Shop for me
Milk — 2 bottles — Brand: Brookside
Rice — 5 kg
Maximum goods budget: KES 5,000
Substitutions: Call me first
```

> **This is INFERRED identity by content combination.** Phase 7A addressed
> `f9b7fb18-fc25-413a-ad27-81182ebab53a` **by UUID** over a package-pinned deep link and confirmed the
> resolved package from the device. **This report does not claim UUID-addressed verification.** The
> combination is specific enough to be convincing; it is not the same standard.

### 12.2 Certified assertions

| Assertion | Result |
|---|---|
| **Snapshot parses** — Service Details section renders real content | **PASS** |
| Fallback *"Service details were not captured for this booking."* **absent** | **PASS** |
| **No raw JSON or internal key names** | **PASS** |
| **Fidelity** — shopping mode, both item lines, quantities, brand, budget amount, substitution branch | **PASS** |
| **Goods budget renders as a cap**, with its goods-only explanatory caption directly beneath | **PASS** |
| **Per-line item structure preserved** — item / quantity / brand as structured detail, not flattened | **PASS** |
| **Correct audience absences** — no safety-acknowledgement line (Grocery has no gate), no priority flag | **PASS** |
| **Nothing fabricated** — no row or value never submitted | **PASS** |
| **Display-only** — no Edit/Change/Save/Delete/Add/Remove affordance inside the snapshot card | **PASS** |
| **Screen/layout integrity** — full scroll without crash, freeze, blank frame, clipping or overlap | **PASS** |
| **Clean read-only path** — open → inspect → Back → Admin list, no crash, redirect or auth change | **PASS** |
| **Booking remained `Pending`** | **PASS** |

**Why the budget caption is a certification item, not cosmetics:** on this screen the goods cap
renders directly above **Send quote**. A bare amount would read as a quote. Amount **plus** caption is
the V1.4 intent.

**Why display-only matters:** the snapshot is **immutable after booking creation, enforced in the
database by migration 0038**. An edit affordance would present an action the database is guaranteed
to refuse.

**Layout is the one part of this feature that is not shared code** between platforms, so §12.2's
integrity row is genuinely new information rather than a repeat of Phase 7A.

### 12.3 Explicit limitations

- **Booking identity is INFERRED** (§12.1), not UUID-addressed.
- **Provider-assignment state was NOT separately confirmed.** The operator reported PASS without
  distinguishing "confirmed unassigned" from "not observable from the Admin list", and **no durable
  evidence establishes which**. It is recorded as **unproven** and is **not strengthened**.
- **This verdict does NOT extend to** admin mutations, RLS enforcement, cross-customer isolation, or
  any other untested behaviour.
- **No admin mutation control was touched** at any point.

---

## 13. Side finding — Home greeting safe area does not reproduce on iPhone

On the physical iPhone the Home greeting ("Good Evening") sits **clear of the iOS status bar** — no
overlap. — **USER-REPORTED PHYSICAL OBSERVATION**

**The Android finding is NOT closed globally.** This is recorded only as evidence that the issue
**currently appears Android-specific**. The Android item remains **OPEN** (§14.2), and iOS layout
differs materially (safe-area insets, type metrics), so a single non-reproduction is not a fix.

---

## 14. Open product findings

### 14.1 Item K — native `/admin` non-admin redirect flicker — **OPEN, cosmetic, non-blocking**

Carried from Phase 7A §12.1. **Not observable in this campaign**: K occurs on the *rejection* path,
which **M** made unreachable on iOS. Its status is unchanged, and this report adds no evidence either
way.

### 14.2 Home-screen safe area — **OPEN (Android), non-repro on iPhone**

Carried from Phase 7A §12.2. See §13. **Not closed.**

---

## 15. Deferred / NOT CERTIFIED

**Each item is a gap, not a soft pass. None may be read as an inferred PASS.**

| # | Item | Status |
|---|---|---|
| 15.1 | **J-customer physical iPhone** | **NOT EXECUTED / NOT CERTIFIED** — blocked by M (§10.3) |
| 15.2 | **APNs / push on `a3e699c2`** | **NOT CERTIFIED** — no push testing of any kind was performed. Phase 6H certified APNs on a **different build** (`e062e892`, commit `33b3685`); that does **not** transfer. Note also that the customer sign-out in §10.2 **unregistered KwikServe's iOS push token**, an inherent `signOut` side effect (Phase 4E.1), so the `device_tokens` baseline differs from 6H's final recorded state |
| 15.3 | **Service Details V1.6 physical iPhone** | **NOT FULLY CERTIFIED** — G, H and the Admin snapshot are certified; J-customer is not; Grocery capture, Massage, Review and Customer Booking Detail were **not** exercised on the physical iPhone |
| 15.4 | **Substitution `substitute` / `skip` branches** | **NOT CERTIFIED** — only the `Call me first` branch has runtime evidence, on either platform. Carried from Phase 7A §14.5 |
| 15.5 | **Android FCM / push on `fa138be5`** | **NOT CERTIFIED** — carried from Phase 7A §14.1 |
| 15.6 | **Provider physical route guard** | **NOT RUN** on either platform — carried from Phase 7A §14.2 |
| 15.7 | **Cross-customer booking `SELECT`** | **UNPROVEN** — carried from Phase 7A §14.3 |
| 15.8 | **Non-admin admin-*mutation* enforcement** | **UNPROVEN** — carried from Phase 7A §14.4 |
| 15.9 | **Build A (`bd6c51a5`) 20-checkpoint campaign** | **NOT RE-RUN** on `fa138be5` — carried from Phase 7A §14.7 |
| 15.10 | **Production anything** | **NOT IN SCOPE** |

### 15.11 Supersession of Phase 7A §14.6

Phase 7A recorded **"iOS physical device — NOT RUN"**. **This report supersedes that state** with the
precise partial certification established here: **G and H CERTIFIED · J-admin PASS · J-customer NOT
EXECUTED · Mobile Admin V1.4 CERTIFIED (narrow) · Service Details V1.6 NOT FULLY CERTIFIED · APNs NOT
CERTIFIED.**

**Phase 7A itself is NOT rewritten.** It remains accurate as of its own authoring.

---

## 16. Process and test-infrastructure items

### 16.1 Item C — Maestro `commands.json` credential/artifact hygiene — **OPEN, process**

Carried from Phase 7A §15.1. Unchanged by this campaign; the practice of filtering credential-bearing
fields held throughout (§17).

### 16.2 Item D — `customer-search.test.tsx` load-sensitive flake — **OPEN, test infrastructure**

Carried from Phase 7A §15.2. Not a product defect; not addressed in this phase.

---

## 17. Security and secret handling

| Control | Result | Evidence |
|---|---|---|
| QA customer and admin credentials | Entered **directly on the device**. Never pasted, dictated, transcribed or requested | **VERIFIED IN DURABLE ARTIFACT** |
| Apple credentials / certificates / provisioning contents | **Never read, printed or reproduced.** `eas credentials` was deliberately **not run** — it is interactive and can mutate credentials | **VERIFIED NOW** |
| Build credential handling | `--non-interactive` throughout, so EAS fails rather than prompt-and-generate | **VERIFIED NOW** |
| Full UDID | Recorded once in §3 as the registered-device identity; abbreviated elsewhere | — |
| JWTs / refresh tokens / service-role keys / API secrets | **None** written to this report or surfaced in terminal output | **VERIFIED NOW** |
| Privileged shortcuts | **None.** No service-role query was substituted for any test | **VERIFIED NOW** |

---

## 18. Protected / untouched systems

Production Supabase · production environment · production push · App Store · TestFlight · Google Play ·
Android identity and credentials · EAS credentials and keystores · database migrations · RLS policies ·
DB functions · `qa/docs/LAUNCH-CERTIFICATION.md` · **Phase 5E** · **Phase 6H** · **Phase 7A** ·
product code · tests · Maestro flows · `app.json` · `eas.json` · **legacy QuickServe app** (not
uninstalled, not opened for any action, not signed into or out of) · iOS URL scheme (unchanged) ·
device registrations (unchanged) · app data and storage (never cleared).

**QA data state:** the QA Grocery booking remained `Pending` throughout; no provider assigned, no
status changed, no notes saved, no Approve/Reject pressed, no booking created or deleted, no photo
verified or deleted. The only Supabase writes were those **inherent to authentication and sign-out**,
including the push-token unregistration noted in §15.2.

---

## 19. GO / NO-GO matrix

| Item | Verdict |
|---|---|
| Artifact provenance `a3e699c2` | **GO** — machine-verified |
| Installation + in-place update | **GO** — no byte-for-byte proof possible (§2.1) |
| Launch smoke | **GO** |
| **G physical iPhone** | **GO — PASS / CERTIFIED** |
| **H physical iPhone** | **GO — PASS / CERTIFIED** |
| **J-admin physical iPhone** | **GO — PASS** |
| **J-customer physical iPhone** | **NOT EXECUTED / NOT CERTIFIED** (M) |
| **J overall physical iPhone** | **PARTIALLY CERTIFIED** |
| **Mobile Admin V1.4 snapshot physical iPhone** | **GO — PASS / CERTIFIED (narrow, §12.3)** |
| **Service Details V1.6 physical iPhone** | **NOT FULLY CERTIFIED** |
| **APNs / push on `a3e699c2`** | **NOT CERTIFIED** |
| Item **K** | **OPEN** — cosmetic; not observable on iOS |
| Home safe area | **OPEN (Android)** — non-repro on iPhone, not closed |
| Item **L** (Android) | **OPEN** — environment/migration |
| Item **M** (iOS) | **OPEN** — environment/migration, execution blocker |
| Item **C** | **OPEN** — process |
| Item **D** | **OPEN** — test infrastructure |
| Substitution `substitute` / `skip` | **NOT CERTIFIED** |
| Android FCM/push on `fa138be5` | **NOT CERTIFIED** |
| Provider route guard | **NOT RUN** |
| Cross-customer `SELECT` | **UNPROVEN** |
| Non-admin admin-mutation enforcement | **UNPROVEN** |
| Build A 20-checkpoint set on `fa138be5` | **NOT RE-RUN** |
| Production anything | **NOT IN SCOPE** |

---

## 20. Recommended next phase, and final state proof

### 20.1 Recommended next steps — **none started**

Ordered by what unblocks the most, not by convenience.

1. **Resolve item M.** Adding a KwikServe-specific scheme (e.g. `kwikserve://`) in `app.json` plus a
   rebuild would permanently unblock **J-customer** on iOS and serve the identity migration already
   scheduled. Uninstalling legacy QuickServe would also work, but costs the Phase 6H rollback identity
   and its push token — a migration decision, not a test convenience.
2. **Certify J-customer on iOS** once M is resolved. It is the only remaining direction of a security
   guard and the largest single gap in this report.
3. **Complete Service Details V1.6 on iPhone** — Grocery capture, Massage, Review and Customer Booking
   Detail were never exercised on hardware (§15.3).
4. **APNs/push certification on `a3e699c2`** — a separate gate, with the `device_tokens` baseline
   caveat in §15.2.
5. **Provider Job Detail snapshot** — still uncertified on any physical device (§15.6).

### 20.2 Final repository / QA state proof

| Item | State | Evidence |
|---|---|---|
| Branch | `feat/service-details-v1` | **VERIFIED NOW** |
| HEAD at authoring | `32367c50b914af2f6ad005f788627b46edc55203` | **VERIFIED NOW** |
| Local = remote, ahead/behind | `0 / 0` | **VERIFIED NOW** |
| Working tree before this report | **clean** | **VERIFIED NOW** |
| Product code / tests / flows / config | **unchanged** by this documentation gate | **VERIFIED NOW** |
| Installed iPhone app | `ke.co.hiredcorp.kwikserve` from `a3e699c2` — in-place update, provenance per §6.5 | **USER-REPORTED PHYSICAL OBSERVATION** + **VERIFIED NOW** (artifact layer) |
| Legacy QuickServe | installed, untouched | **USER-REPORTED PHYSICAL OBSERVATION** |
| QA booking | `Pending`, unmodified | **USER-REPORTED PHYSICAL OBSERVATION** |
| Production | untouched — never contacted | **VERIFIED NOW** |
| Commits / pushes during certification | **none** | **VERIFIED NOW** |

---

*End of Phase 7B.*
