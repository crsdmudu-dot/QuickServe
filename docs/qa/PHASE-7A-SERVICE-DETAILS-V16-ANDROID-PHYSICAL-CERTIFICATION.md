# Phase 7A — Service Details V1.6 Android Physical-Device Certification + `fa138be5` Focused Regression

> **Status:** AUTHORITATIVE / CANONICAL record for the physical Samsung S24 certification of
> **Service Details V1.6**, the three defects it discovered, their consolidated fix, and the focused
> physical regression of that fix. Also carries the **Mobile Admin V1.4 snapshot** physical
> certification.
>
> **Scope:** QA backend only (`wjvjuplooidctlxxozws`). Branch `feat/service-details-v1`. No Google
> Play, no production AAB, no production Supabase, no deploy, no merge, no iOS physical device.
>
> **Boundary warning — read §2 before reading any result table.** This report covers **two distinct
> builds**. A PASS recorded against one is **not** evidence for the other. Every results table is
> tagged with the build it belongs to.

---

## 0. Evidence classes used in this report

Adopted unchanged from [Phase 5E](PHASE-5E-ANDROID-PACKAGE-MIGRATION-FCM-PUSH-CERTIFICATION.md), so
the two reports can be read against each other without translating terms.

| Label | Meaning |
|---|---|
| **VERIFIED NOW** | Re-checked read-only during the authoring session on **2026-08-25**, live over `adb` against the physical device, or against git / the filesystem. |
| **VERIFIED IN DURABLE ARTIFACT** | Recovered from an artifact that outlived the working session: git history, the session transcript `~/.claude/projects/C--Users-ADMIN-QuickServe/937d881d-c9cf-4da1-b8a8-1f2a6b0ee609.jsonl`, GitHub Actions run records, or committed test files. |
| **USER-REPORTED PHYSICAL OBSERVATION** | An observation only the operator could make by looking at the physical S24. Recorded verbatim in intent. **Not independently re-verifiable by tooling** — and deliberately kept separate from machine evidence, because in this campaign operator observation **overturned machine readings twice** (§7.4, §9.3). |
| **INFERRED** | A conclusion drawn from evidence rather than directly observed. Always labelled. Never promoted to a certification verdict. |
| **NOT TESTED / DEFERRED** | Never exercised. Listed in §14. |

**Discipline applied throughout:** machine evidence answers *what rendered and what it settled on*.
It cannot answer *was there a sub-second flash*. Wherever a verdict depended on transient visual
behaviour, the machine evidence is reported **and the verdict is attributed to the operator**.

---

## 1. Executive certification verdict

**Service Details V1.6 is CERTIFIED on the physical Samsung S24 against the QA backend**, across two
builds whose scopes are different and must not be merged:

- **Build A (`bd6c51a5`)** — a **20-checkpoint manual certification campaign**, all 20 PASS. It
  discovered **three real product defects — G, H and J** — that four automated suites had missed.
- **Build B (`fa138be5`)** — a **focused regression of those three fixes**, plus one reduced smoke and
  the **Mobile Admin V1.4 snapshot** certification. **7 gates, all PASS.**

**Scope of that verdict, precisely:**

- **G, H and J are FIXED and PHYSICAL-DEVICE REGRESSION CERTIFIED on Build B.**
- **Mobile Admin V1.4 snapshot rendering is PHYSICALLY CERTIFIED on Build B.**
- **The 20-checkpoint campaign was executed against Build A ONLY and was NOT re-run against Build B.**
  See §2.
- The single most important finding of this phase is methodological: **all three defects were found by
  a human, and none by automation.** The iOS Simulator suite (21 steps) and the Android emulator suite
  (both green at the time) exercised the same screens and reported success. Automation proved logic
  and state; it could not judge what was *wrong to a person looking at it*. That is recorded in the
  fix commit message itself (§8).

**This verdict does NOT extend to:** Android FCM/push on Build B (§14.1) · the provider route guard on
a physical device (§14.2) · cross-customer booking `SELECT` enforcement (§14.3) · non-admin
admin-mutation enforcement (§14.4) · the `substitute` and `skip` substitution branches (§14.5) · any
iOS physical device (§14.6) · production anything. See §14 and §18.

---

## 2. Certification boundary — the two builds

**This section governs the whole report.**

| | **Build A** | **Build B** |
|---|---|---|
| EAS build id | `bd6c51a5` | `fa138be5` |
| Source commit | `1d24261` | `37e8455` |
| APK SHA-256 | `294c7441…` | `569d881ba05b901f539124f04bf91124b7a4ec87e3f7bd7ab60aa89e02208b4f` |
| Campaign | **20-checkpoint manual certification** | **Focused G/H/J regression + reduced smoke + Mobile Admin V1.4 snapshot** |
| Gates executed | 20 | 7 |
| Role | Discovered defects G, H, J | Proved G, H, J fixed |

### 2.1 The non-transfer rule

> **The 20-checkpoint campaign belongs to Build A ONLY. It was NOT re-run against Build B.**
>
> **No Build A PASS transfers automatically to Build B.** Build B carries evidence for exactly seven
> gates: install/provenance, launch smoke, J (customer-blocked), G (three parts), H (two steps), one
> **reduced** focused smoke, and the Mobile Admin V1.4 snapshot (three checkpoints). Nothing else about
> Build B was physically exercised.
>
> Where this report says a behaviour is certified, the build tag on that table says which binary it is
> certified on. Absence of a Build B row is **not** evidence of a Build B pass.

### 2.2 What the reduced smoke deliberately did not repeat

The focused smoke on Build B was **reduced by explicit operator decision**. The numeric-field,
conditional-disclosure and Car Towing NO-path elements were **credited to the G and H regression
evidence on the same build** (§9.4, §9.5), because those gates had already exercised them minutes
earlier on Build B. Only the element **not** otherwise covered — House Cleaning completing to Step 2
of 5 — was run as smoke (§9.6).

This is a **substitution of Build B evidence for Build B evidence**, not a transfer from Build A.

---

## 3. Certified device identity

| Attribute | Value | Evidence |
|---|---|---|
| Model | `SM-S928B` | **VERIFIED NOW** — `adb -s R5CXA2WT1HH shell getprop ro.product.model` |
| Manufacturer | `samsung` | **VERIFIED NOW** — `ro.product.manufacturer` |
| Device / product | `e3q` / `e3qxxx` | **VERIFIED NOW** |
| adb serial | `R5CXA2WT1HH` | **VERIFIED NOW** — `get-serialno`, `ro.serialno` |
| Android release / SDK | **16** / `36` | **VERIFIED NOW** |
| Build fingerprint | `BP4A.251205.006.S928BXXS6DZG1` | **VERIFIED NOW** — `ro.build.display.id` |
| adb state | `device` (authorised) | **VERIFIED NOW** — `get-state` |
| Connection | Wired USB throughout | **VERIFIED NOW** — wireless debugging declined by the operator |

This is the same physical handset certified in
[Phase 5E](PHASE-5E-ANDROID-PACKAGE-MIGRATION-FCM-PUSH-CERTIFICATION.md).

### 3.1 Target-selection discipline

An Android **emulator (`emulator-5554`) was attached simultaneously** for most of the physical
campaign. Every `adb` invocation was pinned with **`-s R5CXA2WT1HH`**. Bare `adb`, `-d` and `-e` were
never used against a certification step.

This mattered in practice. The transport dropped **three times** during the session (§17.2). On each
occasion the pinned command **failed loudly at the preflight** — `device not found`, `device
unauthorized` — rather than silently retargeting the emulator. **No emulator result was ever recorded
as physical evidence.** — **VERIFIED NOW**

---

## 4. Build provenance

### 4.1 Build B — `fa138be5` (the build carrying the fixes)

| Attribute | Value | Evidence |
|---|---|---|
| EAS build id | `fa138be5` | **VERIFIED IN DURABLE ARTIFACT** |
| Source commit | `37e845503e945a23c4996d74df68757122b2a621` | **VERIFIED NOW** — `git rev-parse HEAD` |
| Branch | `feat/service-details-v1` | **VERIFIED NOW** |
| Package | `ke.co.hiredcorp.kwikserve` | **VERIFIED NOW** — `pm path` resolves |
| Installed APK path | `/data/app/~~b3llSRJhv0JRH8UIgEJNZw==/ke.co.hiredcorp.kwikserve-OGzovBGkr2GpLCWztCN5Hg==/base.apk` | **VERIFIED NOW** |
| **On-device SHA-256** | `569d881ba05b901f539124f04bf91124b7a4ec87e3f7bd7ab60aa89e02208b4f` | **VERIFIED NOW** — `adb shell sha256sum`, re-verified **five separate times** across the session |
| versionName / versionCode | `1.0.0` / `1` | **VERIFIED NOW** — `dumpsys package` |
| Device `lastUpdateTime` | `2026-08-24 00:57:58` | **VERIFIED NOW** — `dumpsys package` |
| Install method | in-place `-r` upgrade; **no uninstall, no data clear** | **VERIFIED IN DURABLE ARTIFACT** |

The checksum was re-verified **before every gate that followed a reconnection**, on the standing rule
that a returning device is re-proven, never assumed. Every check matched.

### 4.2 Build A — `bd6c51a5` (the build the 20 checkpoints ran on)

| Attribute | Value | Evidence |
|---|---|---|
| EAS build id | `bd6c51a5` | **VERIFIED IN DURABLE ARTIFACT** |
| Source commit | `1d24261feba3f8f03e59c65f4c07fcd80fabcced` | **VERIFIED NOW** — commit resolves in git |
| APK SHA-256 | `294c7441…` | **VERIFIED IN DURABLE ARTIFACT** |

**Honest limitation:** Build A's build id and checksum were **not** re-verified during this authoring
session — Build A is no longer the installed binary. They are carried from the operator's directive
and the durable session transcript. They are therefore **VERIFIED IN DURABLE ARTIFACT**, deliberately
*not* **VERIFIED NOW**, and this report does not claim otherwise.

### 4.3 Fix commit `37e8455` — contents

```
 qa/native/flows/service-details-towing-safety.yaml |   6 +-
 src/__tests__/admin-native-route-guard.test.tsx    |  85 +++++++++++++
 src/__tests__/qa-automation-service-details.test.ts|  14 ++-
 src/__tests__/service-details-error-clearing.test.ts| 137 ++++++++++++++++++
 src/app/admin/_layout.tsx                          |  46 ++++++-
 src/app/booking/service-details.tsx                |  15 ++-
 src/booking/service-details-form.ts                |  55 +++++++++
 src/constants/service-forms.ts                     |   2 +-
 8 files changed, 351 insertions(+), 9 deletions(-)
```

— **VERIFIED NOW** (`git show --stat 37e8455`)

---

## 5. Campaign timeline

### 5.1 Automated tracks — **PROVENANCE / CONTEXT ONLY**

> **These two tracks are NOT physical-device evidence and are NOT part of any verdict in this report.**
> They are recorded because they establish *what was already green before a human touched the device* —
> which is the entire point of §7's finding. **Neither track ran on the S24. Neither certifies any
> behaviour on Build A or Build B.**

| Track | Environment | Outcome | Evidence |
|---|---|---|---|
| **iOS Simulator autonomous certification** | GitHub Actions, `.github/workflows/ios-native-journeys.yml`, iOS Simulator | Final run **32190197188** — **21/21 steps SUCCESS** | **VERIFIED IN DURABLE ARTIFACT** |
| **Android emulator autonomous certification (non-push)** | Local Android emulator, four runners under `qa/native/` | **PASS** (non-push scope) | **VERIFIED IN DURABLE ARTIFACT** |

Reaching those green states required fixing **automation** defects, not product defects — below-fold
tap targets, header occlusion of upward scroll targets, a full-match selector for a wildcard-suffixed
required label, a workflow timeout, an Android system-dialog guard ordering, and keyboard-dismissal
scroll positioning. Those are QA-harness corrections. **None of them is a product certification, and
none appears in any verdict table in this report.**

A platform difference discovered while building the Android track is worth preserving because it
shapes how *all* Android UI evidence in this report must be read:

> **iOS reports accessibility frames for nodes scrolled outside the ScrollView clip. Android reports
> only on-screen nodes.** Therefore, on Android, **absence of a node from the hierarchy means
> "below the fold", not "missing"**. This report never treats an absent Android node as a missing
> element. Where it mattered — booking status at §11.2 — the claim was explicitly withheld until the
> operator scrolled. — **VERIFIED IN DURABLE ARTIFACT**

### 5.2 Physical campaign

| Stage | Build | Work | Section |
|---|---|---|---|
| Install + provenance | A | APK installed, checksum verified | §6 |
| **20-checkpoint manual certification** | **A** | Full V1.6 manual campaign | §6 |
| Defects raised | A | **G**, **H**, **J** | §7 |
| Consolidated fix | — | commit `37e8455` | §8 |
| New build + install | B | `fa138be5`, in-place `-r` | §4.1 |
| **Focused regression, 7 gates** | **B** | G / H / J / smoke | §9 |
| J three-direction proof | B | customer + admin warm + admin cold | §10 |
| **Mobile Admin V1.4 snapshot** | **B** | 3 checkpoints | §11 |

---

## 6. Build A — 20-checkpoint manual certification

**BUILD A (`bd6c51a5` / `1d24261` / `294c7441…`) — DOES NOT APPLY TO BUILD B**

**Result: 20 of 20 checkpoints PASS.** Every checkpoint result in this section is
**USER-REPORTED PHYSICAL OBSERVATION** unless stated otherwise.

The campaign covered, in operator-driven sequence: dark-mode entry and Home rendering; House Cleaning
capture including numeric fields and progressive disclosure; multi-service form behaviour; the Car
Towing safety interlock; Grocery Delivery item capture, goods budget and substitution; Review; booking
placement; Customer Booking Detail; and hardware/app Back navigation across multiple paths.

**Recorded observations that were NOT classified as defects:**

- **Checkpoint 2** — Continue is enabled before all required fields are answered; validation is
  enforced on press. Recorded as a **UX observation**, deliberately **not** raised as a defect, and
  **not** added to the outstanding register.
- **Checkpoint 11 (Car Towing / "After an accident")** — a suspected state-loss defect was raised and
  then **withdrawn**. The suspicion originated in *incorrect question labels supplied to the operator*
  (Plumbing's "What problem are you having?" / "Accident" instead of Car Towing's "Why do you need a
  tow?" / "After an accident"). Re-checking with the correct labels showed the answer was preserved.
  **No product defect existed.** Preserved here because a withdrawn defect is part of the honest
  record. — **VERIFIED IN DURABLE ARTIFACT**
- **Item F — hardware Back navigation.** Verified PASS on three separate paths during Checkpoints
  11–18 on Build A. — **USER-REPORTED PHYSICAL OBSERVATION**

**Three real defects were raised and carried forward: G, H, J (§7).**

---

## 7. Defects discovered on Build A

All three are **cross-platform product defects in shared TypeScript**, and **none was caught by the
automated suites described in §5.1**.

### 7.1 Defect G — stale field-level validation error

**Discovered:** Checkpoint 3, Build A. **Reproduced independently:** Checkpoint 6, Build A, on a
second unrelated question. — **USER-REPORTED PHYSICAL OBSERVATION**

`setErrors` was called in exactly one place — `handleContinue` — so `errors` was a frozen snapshot of
the last Continue press while `answers` moved on through four independent paths. Answering a field
that had failed left **"This is required." displayed beside a visibly valid answer** until Continue
was pressed again.

Reproduction on **two unrelated questions** (`variant` and `provider_bring_supplies`) is what
established this as **shared error state**, not one misbehaving control. — **VERIFIED IN DURABLE
ARTIFACT** (fix commit message)

### 7.2 Defect H — stale brand in Car Towing safety copy

**Discovered:** Checkpoint 9, Build A. — **USER-REPORTED PHYSICAL OBSERVATION**

The safety interlock behaved correctly, but the customer-facing copy still read **"QuickServe is not
an emergency service…"** after the KwikServe rebrand. A single occurrence in
`src/constants/service-forms.ts` — the only customer-facing stale-brand string found.

### 7.3 Defect J — native `/admin/**` route group had no role guard

**Discovered:** Build A, after Checkpoint 20, by deep-linking a **customer-authenticated** session to
`quickserve://admin/booking/<id>`. The session **received Admin chrome.**

The root navigator (`src/app/_layout.tsx`) guards **authentication only**. The `(admin-web)` group has
always guarded itself; the **native** `admin` group never received an equivalent.

**Data exposure assessment — bounded, and stated without overclaim:** RLS held. A customer-context
read returned only that customer's own rows. **No data belonging to another customer was exposed.**
The fix is therefore **defence in depth and correct UX** — **not** a replacement for RLS, which
remains the authoritative data-layer control and was **not modified**. — **VERIFIED IN DURABLE
ARTIFACT**

**What this assessment does not claim:** it does **not** prove cross-customer `SELECT` is blocked, and
it does **not** prove non-admin admin-*mutations* are refused. Both remain **unproven** (§14.3,
§14.4). No service-role query was substituted for an RLS test.

### 7.4 Methodological finding — automation could not have found these

Four automated suites were green across these screens when all three defects were present. G is a
*feedback-timing* defect, H is a *wording* defect, and J required *deliberately misusing a deep link*.
Automation asserted the states it was told to assert, and every one of those assertions was correct.

**Operator observation also corrected machine analysis twice** — once at §9.3 (J-customer flicker),
once at §6/Checkpoint 11 (labels supplied were wrong). This is the reason §0 keeps the two evidence
classes apart.

---

## 8. Consolidated fix — commit `37e8455`

Authored as a **single consolidated gate** covering G + H + J. — **VERIFIED NOW** (git)

| Defect | Change | File |
|---|---|---|
| **G** | New pure function `clearResolvedErrors(form, prev, before, after)` — drops an error when its answer changes, when item lines change, when the gate answer changes, or when the question is no longer visible. Applied at **one** screen handler (`handleFormChange`) that all four paths already flow through. `validate` remains the **sole** authority on Continue. | `src/booking/service-details-form.ts`, `src/app/booking/service-details.tsx` |
| **H** | `'QuickServe is not an emergency service…'` → `'KwikServe is not an emergency service…'` | `src/constants/service-forms.ts` |
| **J** | Native `admin` layout replaced (was a bare `Stack`) with a role guard reusing `useAdminGuard` and the project's single `roleHref` mapping. Renders `null` while loading (so admin chrome never flashes), `null` when signed out (root navigator owns that redirect), redirects non-admins to their own home, and renders the Stack only for admins. | `src/app/admin/_layout.tsx` |
| **H (QA)** | Two assertions + one comment updated to KwikServe | `qa/native/flows/service-details-towing-safety.yaml` |

**Test coverage added:** `service-details-error-clearing.test.ts` (**10 tests**, G) and
`admin-native-route-guard.test.tsx` (**6 tests**, J); `qa-automation-service-details.test.ts` extended
to **45 tests**. — **VERIFIED NOW** (files present at HEAD)

**Mutation-testing holes found in the author's own work, and closed** — recorded because they are the
reason the coverage is trustworthy:

1. Reverting the screen's `onChange` to bare `setState` left **every G test green** — a pure rule
   nobody calls fixes nothing. Closed with source-level assertions pinning the wiring
   (`onChange={handleFormChange}`, the gate `onPress`, and that `validate` still runs on Continue).
2. Reverting the H product copy left the QA suite green. Closed by asserting the product string in
   `src/constants/service-forms.ts` directly.

— **VERIFIED NOW** (both assertion sets present in the committed test files)

---

## 9. Build B — focused physical regression

**BUILD B (`fa138be5` / `37e8455` / `569d881b…08b4f`)**

**7 gates. All PASS. The 20-checkpoint campaign was NOT re-run (§2.1).**

Gate order was set by session dependency: G and H require the retained **customer** session; the
legitimate admin tests require **ending** it. Customer-side gates therefore ran first.

### 9.1 Gate 1 — install + provenance

On-device SHA-256 `569d881b…08b4f` matched the local artifact. In-place `-r` upgrade only; **no
uninstall, no app-data clear**. — **VERIFIED NOW** / **VERIFIED IN DURABLE ARTIFACT**

> A standing operator instruction governed this: *if a signature/certificate incompatibility had
> required an uninstall, the gate was to STOP and ask* — never uninstall automatically. No such
> incompatibility arose.

### 9.2 Gate 2 — launch smoke

Process started (pid 5487), `MainActivity` resumed, no crash, no ANR, landed on customer Home, and the
**customer session survived the in-place update**. — **VERIFIED NOW** (machine) +
**USER-REPORTED PHYSICAL OBSERVATION**

### 9.3 Gate 3 — J, customer blocked from native `/admin` — **PASS**

Deep link `quickserve://admin/booking/f9b7fb18-fc25-413a-ad27-81182ebab53a` fired over `adb` at a
**customer-authenticated** session.

| Check | Result |
|---|---|
| Admin chrome shown | **none** |
| Booking Detail shown | **none** |
| Admin data exposed | **none** |
| Landed on | customer Home |

**Verdict correction, recorded deliberately:** machine evidence read as a clean PASS. The **operator
observed a flicker** and **corrected the verdict to NOT PASS pending diagnosis**. Diagnosis (read-only)
found a cosmetic push-then-replace transition: no update-depth errors, no competing redirect, and the
child screen never mounts. The operator then accepted **PASS**, with the flicker recorded separately
as **item K** (§12.1) — explicitly **not** to be fixed in this build.

— machine: **VERIFIED IN DURABLE ARTIFACT**; verdict: **USER-REPORTED PHYSICAL OBSERVATION**

### 9.4 Gate 4 — G regression — **PASS (three parts)**

| Part | Assertion | Result |
|---|---|---|
| 1 | A failed required field clears **its own** error immediately on being answered — no second Continue press | **PASS** |
| 2 | Errors on **other** still-unanswered fields are **preserved** | **PASS** |
| 3 | A question removed by pruning does not retain an error; Continue validation remains strict; hidden fields do not gate progression | **PASS** |

Operator declaration: **"DEFECT G = FIXED AND PHYSICAL-DEVICE REGRESSION CERTIFIED."**
— **USER-REPORTED PHYSICAL OBSERVATION**

### 9.5 Gate 5 — H regression — **PASS (two steps)**

| Step | Assertion | Result |
|---|---|---|
| 1 | Copy reads **"KwikServe is not an emergency service"**; no "QuickServe"; safety block title present; form and Continue removed; **no 999 / 112 / 911** presented | **PASS** |
| 2 | Selecting **No** clears the block, restores form and Continue, and **preserves "After an accident"** | **PASS** |

**Step 2 carries load beyond H.** The safety gate now routes through the *same* `handleFormChange`
path introduced for G. An unrelated answer surviving that transition is direct evidence of **no G
blast-radius regression** on the shared `onChange` path.
— **USER-REPORTED PHYSICAL OBSERVATION**

### 9.6 Gate 6 — reduced focused smoke — **PASS**

House Cleaning completed with all required fields (Deep cleaning; whole home; bedrooms 4; bathrooms 3;
supplies Yes) → **Continue advanced first time** → **Your Address / Step 2 of 5** rendered normally.
No stale errors, no spurious validation block, clean transition.

**Reduced by operator decision** — see §2.2 for exactly what was credited and why. This gate proves
the G rewrite did not disturb ordinary form completion; G's own gates proved only that errors *clear*.
— **USER-REPORTED PHYSICAL OBSERVATION**

### 9.7 Gate 7 — Mobile Admin V1.4 snapshot — **PASS**

Full detail in §11.

---

## 10. Defect J — three-direction physical proof

**BUILD B**

A route guard is only proven when it both **admits** and **refuses**. All three directions were
exercised on the physical device.

| Direction | Method | Result | Evidence |
|---|---|---|---|
| **Customer refused** | `adb` deep link to `quickserve://admin/booking/<id>` on a customer session | **PASS** — no admin chrome, no data, redirected to customer Home | §9.3 |
| **Admin admitted (warm, post-login)** | Profile → *Sign out / Switch role* → Welcome → Log in → admin credentials | **PASS** — landed on native Admin, no loop, **no flicker at all** | **USER-REPORTED PHYSICAL OBSERVATION** |
| **Admin admitted (cold deep link)** | `am force-stop`, then package-pinned `am start` with `quickserve://admin` | **PASS** — Admin rendered directly, no wrong-role flash | §10.2 |

### 10.1 Why the cold test was required

The customer half of J was proven by **deep link**; the admin half initially by **post-login
redirect**. Both mount the same layout, so the authorisation decision is identical code — but the
*timing* differs. A cold deep link resolves the route while the auth context is still hydrating, which
is precisely where a wrong-role flash would appear. Matching the method is what makes the pair
**conclusive rather than merely consistent**.

### 10.2 Cold deep-link machine evidence — **VERIFIED NOW**

```
pid before force-stop → killed;  pid after launch → 32742  (genuine cold start)
ReactNativeJS: Running "main"                              (fresh JS boot)
START u0 {act=VIEW dat=quickserve://admin/... flg=0x10000000
          cmp=ke.co.hiredcorp.kwikserve/.MainActivity}
          with LAUNCH_SINGLE_TASK ... result code=0
Transition #11698 type=OPEN  taskId=13182  numActivities=1
Displayed ke.co.hiredcorp.kwikserve/.MainActivity for user 0: +573ms
No FATAL EXCEPTION · No ANR · No RN errors
Rendered: Admin · Payments · Notifications · Sign out · Bookings|Providers · filters · booking list
```

**Operator visual confirmation (all seven):** Admin appeared and stayed · no customer Home flash · no
provider flash · no white/blank frame beyond normal splash · no bounce/double-render/redirect · no
"Open with" dialog · no crash/freeze. — **USER-REPORTED PHYSICAL OBSERVATION**

**Machine limitation stated at the time and preserved here:** `adb` samples after settling and cannot
prove the *absence* of a sub-second flicker. The no-flash verdict is the operator's, not the tool's.

### 10.3 Verdict

**DEFECT J = FIXED AND PHYSICAL-DEVICE REGRESSION CERTIFIED** on Build B, in all three directions.

Note that the **absence** of flicker on the admin path is consistent with the **item K** diagnosis: K
occurs on the *rejection* path, where a `<Redirect>` fires after the group mounts. An admitted admin
renders the Stack directly with no redirect, so no bounce is possible. K is therefore a property of the
redirect transition, **not** of the guard decision.

---

## 11. Mobile Admin V1.4 snapshot certification

**BUILD B** · booking `f9b7fb18-fc25-413a-ad27-81182ebab53a` (Grocery Delivery, `pending`, unassigned)

**Read-only gate.** No provider assignment, no status change, no notes mutation, no Approve/Reject, no
deletion, no new booking.

### 11.1 Navigation

Opened by **package-pinned deep link** to `quickserve://admin/booking/f9b7fb18-…` rather than by
tapping the Admin list row, so the booking under inspection is **addressed by id, not assumed** from a
row that merely read "Grocery Delivery". Pinning also neutralised item **L** (§13). — **VERIFIED NOW**

### 11.2 Checkpoint 1 — open & identify — **PASS**

Header **Booking Detail**; Service **Grocery Delivery**; status **Pending**; **Service Details**
section present with real content; the fallback string *"Service details were not captured for this
booking."* **absent** (which is the primary failure this gate exists to catch); no crash, no redirect.

A leak scan for `service_slug`, `form_version`, `primary_kind`, `schema`, `line_id`, `safety_ack`,
`{`, `}`, `null` in on-screen text returned **empty**. — **VERIFIED NOW**

> **Status was NOT claimed from the first machine dump.** `Pending` was below the fold, and per §5.1
> an absent Android node means "off-screen", not "missing". The claim was withheld until it appeared
> after the operator's scroll.

### 11.3 Checkpoint 2 — snapshot fidelity — **PASS**

Complete card, in render order — **VERIFIED NOW** (machine dump) and confirmed against what was
submitted — **USER-REPORTED PHYSICAL OBSERVATION**:

```
Service Details
  How would you like to shop?        Shop for me
  Requested items
    Milk    2 bottles    Brand: Brookside
    Rice    5 kg
  Maximum goods budget               KES 5,000
    "The most we may spend buying the items.
     Delivery and service fees are separate."
  Substitutions                      Call me first
```

| Assertion | Result |
|---|---|
| Primary answer renders from snapshot | **PASS** |
| Item lines complete; per-line quantity and brand preserved as distinct nodes | **PASS** |
| Goods budget renders **with** its goods-only caption — as a cap, not a price | **PASS** |
| Substitutions row renders | **PASS** (see §14.5 — **only** the `Call me first` branch) |
| Safety-ack line **absent** — correct, Grocery has no safety gate | **PASS** |
| Priority flag absent — booking not flagged urgent | **PASS** |
| No raw JSON / internal keys | **PASS** |

**Why the budget caption matters:** on this screen the goods cap sits directly above **Send quote**. A
bare amount would read as a quote. Rendering amount **plus** caption is the V1.4 intent and is correct.

**Line asymmetry is correct, not a defect:** Milk carries a brand, Rice does not. The renderer emits
`Brand:` only when the line has one — reflecting input, not a dropped field.

### 11.4 Checkpoint 3 — display-only guarantee & clean exit — **PASS**

| Assertion | Result |
|---|---|
| Service Details card is **inert** — no edit/change control, no input, no tappable row | **PASS** |
| No affordance anywhere to alter the customer's captured answers | **PASS** |
| Full-screen scroll past every write control without crash, freeze or blank frame | **PASS** |
| Lower sections render normally; `Admin Notes` empty | **PASS** |
| Back returns cleanly to Admin list, no auth flash | **PASS** |
| **Booking still `Pending`, no provider assigned** | **PASS** |

Final machine verification — **VERIFIED NOW**:

```
Admin list · Grocery Delivery · Pending · ASAP     (unchanged)
pid 32742 unchanged — no crash, no restart
No FATAL EXCEPTION · No ANR · No RN errors across the entire gate
```

The display-only result matters because the snapshot is **immutable after booking creation, enforced
in the database by migration 0038**. The UI offering no edit affordance means it does not present an
action the database would refuse.

### 11.5 Verdict

**MOBILE ADMIN V1.4 SNAPSHOT = PHYSICALLY CERTIFIED on Build B (`fa138be5`).**

---

## 12. Open product findings

### 12.1 Item K — native `/admin` non-admin redirect flicker — **OPEN, cosmetic, non-blocking**

On the **rejection** path, admin chrome is briefly visible before the redirect completes
(push-then-replace transition). Diagnosed read-only: no update-depth errors, no competing redirect,
child screen never mounts.

**Not a security finding** — the guard's *decision* is correct and was certified (§10). This concerns
the *transition* only. Explicitly **not fixed in Build B** by operator decision.
— **USER-REPORTED PHYSICAL OBSERVATION** + **VERIFIED IN DURABLE ARTIFACT** (diagnosis)

### 12.2 Home-screen safe area — **OPEN, non-blocking**

"Good Evening" overlaps the status bar on the customer Home screen. Raised during Build A and kept
deliberately separate from the Service Details defect set. **Not fixed in Build B.**
— **USER-REPORTED PHYSICAL OBSERVATION**

---

## 13. Item L — competing legacy `com.quickserve.app` installation — **OPEN, environment/migration**

**Discovered on Build B**, when a deep link raised Android's intent disambiguation dialog
(`ResolverActivity` → *"Open with: KwikServe | QuickServe"*).

```
$ adb -s R5CXA2WT1HH shell pm list packages | grep -iE "quick|kwik"
package:ke.co.hiredcorp.kwikserve       ← build under certification
package:com.quickserve.app              ← legacy pre-rename install

$ cmd package query-activities -a android.intent.action.VIEW -d quickserve://admin
  com.quickserve.app/.MainActivity
  ke.co.hiredcorp.kwikserve/.MainActivity
```

— **VERIFIED NOW**

**Both packages register `VIEW` for the `quickserve://` scheme.** Android has no basis to choose.

**Classification: environment / migration finding. NOT a defect in `fa138be5`.**

**Why it is preserved rather than dismissed:** it makes **every** `quickserve://` deep link on this
device ambiguous unless the target package is pinned — manual or automated, now or later. It also
previews a real migration decision, since the deep-link scheme is scheduled to migrate to a
KwikServe-specific one in a later identity phase.

**Impact on this report's evidence — assessed, not assumed:**

- All Mobile Admin deep links (§11) were **package-pinned** — unambiguous. — **VERIFIED NOW**
- The J cold-entry deep link (§10.2) was **package-pinned**; the trace shows
  `cmp=ke.co.hiredcorp.kwikserve/.MainActivity` and no mention of the legacy package. — **VERIFIED NOW**
- The **first** admin deep link (unpinned) resolved to `ke.co.hiredcorp.kwikserve/.MainActivity`,
  **verified by package name in `mCurrentFocus`**, not assumed. — **VERIFIED NOW**
- The **J-customer** deep link (§9.3) was fired before L was known. Its handler package was not
  recorded at the time. The **INFERRED** argument that it reached the new build is strong — the legacy
  package predates the guard entirely and would have rendered admin chrome and *stayed*, whereas the
  observed behaviour was chrome briefly appearing and then bouncing to customer Home, which only the
  new guard produces. **This is labelled INFERRED and is not promoted to VERIFIED.** Re-verification
  remains available and cheap.

**No action was taken on L.** The legacy package was **not** uninstalled; no Android default handler
was set. Both are outside this gate's scope and are the operator's decision.

**Relationship to Phase 5E:** 5E deliberately retained the old package and its Firebase app as
rollback assets. **Phase 5E is NOT amended by this report** and carries no back-link to it.

---

## 14. Deferred / NOT CERTIFIED

**Each item below is a gap, not a soft pass. None may be read as an inferred PASS.**

### 14.1 Android FCM / push on `fa138be5` — **NOT CERTIFIED**

No push testing of any kind was performed on Build B. Push was certified for the package under
**Phase 5E on a different build**; that certification **does not transfer to `fa138be5`**.

### 14.2 Provider physical route guard — **NOT RUN**

The guard redirects `provider` role to `/provider`; this is covered by unit tests
(`admin-native-route-guard.test.tsx`) but was **never exercised on the physical device**. The operator
explicitly declined to manufacture a provider session or mutate QA state to obtain it.
**Status is NOT RUN — not PASS, and not inferred from the customer result.**

### 14.3 Cross-customer booking `SELECT` — **UNPROVEN**

RLS was observed returning only the authenticated customer's own rows. **No test attempted to read
another customer's booking.** Not proven, not disproven. No service-role query was substituted for an
RLS test.

### 14.4 Non-admin admin-*mutation* enforcement — **UNPROVEN**

Whether a non-admin session is refused at the data layer when attempting an admin mutation was
**never tested**. The J fix is a **UI guard**; it is defence in depth, not proof of data-layer refusal.

### 14.5 Substitution branches — **PARTIALLY CERTIFIED**

Runtime evidence exists for the **`Call me first`** branch only (§11.3).
**`option-substitution-substitute` and `option-substitution-skip` have NO runtime certification** on
either build. Do not read §11.3 as certifying the substitution question as a whole.

### 14.6 iOS physical device — **NOT RUN**

No iPhone certification was performed for either build. G, H and J are shared TypeScript, so the fixes
are expected to carry — but **expected is not certified**. The operator has no Mac, so iOS Simulator
work is CI-only (§5.1) and is provenance, not device evidence.

### 14.7 Build A checkpoint set on Build B — **NOT RE-RUN**

Per §2.1. Listed here so it appears in the deferred register, not only in the boundary section.

---

## 15. Process and test-infrastructure items

### 15.1 Item C — Maestro `commands.json` credential/artifact hygiene — **OPEN, process**

During Android automation work, raw bytes of a Maestro `commands.json` were dumped into the working
session, **surfacing QA customer credentials into the transcript**. Self-reported at the time. All
subsequent extractions filtered those fields, and the practice held for the remainder of the campaign
(§16). The item remains open as a **procedural** control, not a code defect.
— **VERIFIED IN DURABLE ARTIFACT**

### 15.2 Item D — `customer-search.test.tsx` load-sensitive flake — **OPEN, test infrastructure**

A load-sensitive intermittent failure. Not a product defect; not addressed in this phase.

---

## 16. Security and secret handling

| Control | Result | Evidence |
|---|---|---|
| Admin credentials | Entered **directly on the device**. Never pasted, dictated, transcribed, or requested. | **VERIFIED IN DURABLE ARTIFACT** |
| UI dumps | All `uiautomator` extractions filtered `@`-bearing nodes and `password` / `token` / `bearer` patterns before display | **VERIFIED NOW** |
| JWTs / refresh tokens / service-role keys / API secrets | **None** written to this report or surfaced in terminal output during the physical gates | **VERIFIED NOW** |
| Privileged shortcuts | **None.** No service-role query was substituted for an RLS test | **VERIFIED IN DURABLE ARTIFACT** |
| Temporary device artifacts | Every `/sdcard/*.xml` dump removed immediately after reading | **VERIFIED NOW** |

The only credential-hygiene deviation in the campaign is **item C** (§15.1), which is recorded rather
than quietly dropped.

---

## 17. Protected / untouched systems

### 17.1 Not touched at any point in the physical campaign

Production Supabase · production environment · production push · Google Play · production AAB · iOS /
APNs configuration · EAS credentials and keystores · database migrations · RLS policies · DB functions ·
`qa/docs/LAUNCH-CERTIFICATION.md` · `PHASE-5E` · the legacy `com.quickserve.app` package (not
uninstalled) · Android default intent handlers (none set) · app data and storage (never cleared) ·
`bookings.service_details` (immutable; never written).

**QA data state:** booking `f9b7fb18-fc25-413a-ad27-81182ebab53a` remained `pending`,
`assigned_provider_id: null`, snapshot intact, through every gate. No provider assigned, no status
changed, no notes saved, no Approve/Reject pressed, no booking created or deleted. — **VERIFIED NOW**

### 17.2 Session incidents that did not affect results

| Incident | Effect |
|---|---|
| USB transport dropped 3× (`device not found`; `unauthorized` ×2) | Each failed **loudly at preflight**; no command executed against a wrong target. Device identity **and APK checksum re-verified** after every reconnection. |
| Intent resolver dialog (item **L**) | Caused one attempt to be discarded, not misreported. Resolved by package pinning. |
| `am start` "brought to the front" | Correctly identified as a **task resume**, not a route re-resolution; the affected attempt was **explicitly discounted** rather than counted as evidence. |
| `SecurityException: Shell does not have permission to access user 150` on `pm list packages` | Samsung Secure Folder refusing shell enumeration. Unrelated to the app; package still resolved and checksum matched. Recorded so it is not later mistaken for a signal. |
| `Unable to open libpenguin.so` in logcat | Emitted by `system:ui` (pid 17281), **not** the app process. Explicitly discounted. |

---

## 18. GO / NO-GO matrix

| Item | Build | Verdict |
|---|---|---|
| Service Details V1.6 capture — 20-checkpoint manual campaign | **A** | **GO** (20/20) |
| Defect **G** — stale validation errors | **B** | **GO** — fixed & certified |
| Defect **H** — Towing safety copy + interlock | **B** | **GO** — fixed & certified |
| Defect **J** — native `/admin` role guard (3 directions) | **B** | **GO** — fixed & certified |
| Reduced focused smoke | **B** | **GO** |
| **Mobile Admin V1.4 snapshot** | **B** | **GO** — physically certified |
| Item **K** — redirect flicker | B | **OPEN** — cosmetic, non-blocking |
| Home-screen safe area | A | **OPEN** — non-blocking |
| Item **L** — legacy scheme handler | B | **OPEN** — environment/migration |
| Item **C** — QA credential hygiene | — | **OPEN** — process |
| Item **D** — `customer-search` flake | — | **OPEN** — test infra |
| Android FCM / push on `fa138be5` | B | **NOT CERTIFIED** |
| Provider physical route guard | B | **NOT RUN** |
| Cross-customer booking `SELECT` | — | **UNPROVEN** |
| Non-admin admin-mutation enforcement | — | **UNPROVEN** |
| Substitution `substitute` / `skip` branches | — | **NOT CERTIFIED** |
| iOS physical device | — | **NOT RUN** |
| 20-checkpoint campaign on `fa138be5` | B | **NOT RE-RUN** |
| Production anything | — | **NOT IN SCOPE** |

---

## 19. Recommended next phase

Ordered by risk, not by convenience. **None of these was started.**

1. **iOS physical certification of `fa138be5`.** The largest gap — an entire uncertified platform. G,
   H and J are shared TypeScript and *should* carry, but §14.6 applies.
2. **Item L decision.** Either uninstall the legacy `com.quickserve.app` from test devices, or make
   package-pinned deep links a **written** rule in QA procedure. Cheapest change that makes all future
   deep-link evidence unambiguous.
3. **Provider Job Detail snapshot certification** — the one V1.4 surface never certified on hardware
   (§14.2). Requires a provider session the operator declined to manufacture; a deliberate cost call.
4. **Admin Web snapshot certification** — same shared renderer, different surface, no device dependency.
5. **Close-out decisions for K and the Home safe area** — whether they enter the next build.

---

## 20. Final repository / QA state proof

| Item | State | Evidence |
|---|---|---|
| Branch | `feat/service-details-v1` | **VERIFIED NOW** |
| HEAD | `37e845503e945a23c4996d74df68757122b2a621` | **VERIFIED NOW** |
| Working tree before this report | **clean** — no modified, no untracked files | **VERIFIED NOW** (`git status --porcelain --untracked-files=all`) |
| Product code / tests / flows / config | **unchanged** by this phase's documentation gate | **VERIFIED NOW** |
| Installed APK on S24 | `569d881b…08b4f` = `fa138be5` | **VERIFIED NOW** |
| QA booking `f9b7fb18-…` | `pending`, unassigned, snapshot intact | **VERIFIED NOW** |
| Production | untouched | **VERIFIED NOW** (never contacted) |
| Commits / pushes during certification | **none** | **VERIFIED NOW** |

---

*End of Phase 7A.*
