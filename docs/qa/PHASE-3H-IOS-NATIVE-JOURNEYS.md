# Phase 3H — iOS Customer and Provider Native Journey Certification

> **Outcome: iOS Simulator Native Journey Certification — ✅ PASS.**
> The customer **and** provider native journeys were exercised end-to-end on an **iPhone SE
> (3rd generation), iOS 18.1 Simulator**, running the EAS iOS simulator build **`281fd93b`**,
> with backend verification and cleanup — green on GitHub Actions. The result is
> **reproducible from `main`** (post-merge run #15). This certifies the **iOS Simulator**
> journeys only — **not** a physical iPhone, TestFlight/App Store, production backend, real
> payments, or real push. **Full Platform Certification is NOT claimed.**

- **Branch:** `qa/phase-3h-ios-native-journeys`
- **Pre-work baseline (main):** `c056e36fd045d1e6f3cf41238cbacc314fed57fd`
- **Merged to `main` (`--no-ff`):** `9254405`
- **Certification run:** #14 — `30782793463` (branch `46699c0`) — **success**
- **Post-merge verification run:** #15 — `30784379852` (main `9254405`) — **success**

---

## Initial blocker vs. final certified outcome

This phase began **BLOCKED** and ended **CERTIFIED**. Both states are recorded honestly.

- **Initial blocker (local environment):** the host is **Windows** with no macOS, Xcode, iOS
  Simulator, or attachable iOS device, so an iOS build could not be installed, launched, or
  exercised **locally**. Only Levels 1–2 (config readiness + a successful simulator build,
  EAS `8deeff19`) were achievable locally; Levels 3–7 were blocked.
- **Resolution:** a hosted-macOS **GitHub Actions** pipeline
  (`.github/workflows/ios-native-journeys.yml`) now fetches the EAS iOS simulator build,
  boots a Simulator, installs the app, and runs the Phase 3F journeys with backend
  verification + cleanup — triggerable from any OS, including the Windows host.
- **Final certified outcome:** with that pipeline green (runs #14 and #15), Levels 3–7 are
  **achieved on the iOS Simulator**. See §§7–21, 28.

## Certification level ledger (do NOT collapse)

| Level | Item | Status |
|---|---|---|
| 1 | iOS configuration readiness | ✅ ready (see §6) |
| 2 | Successful iOS build | ✅ achieved — EAS `281fd93b` **finished** (iOS simulator `.app`, SDK 56, no signing) |
| 3 | Installation on simulator | ✅ **achieved** — installed on iPhone SE (3rd gen) / iOS 18.1 Simulator (CI) |
| 4 | Native launch | ✅ **achieved** — cold launch reaches the customer/provider welcome (not admin) |
| 5 | Customer journey certification | ✅ **achieved** — booking created via UI + backend-verified (see §§10, 19) |
| 6 | Provider journey certification | ✅ **achieved** — assignment + full status progression + review (see §§10, 19) |
| 7 | Full **iOS Simulator** native journey certification | ✅ **achieved** (Simulator scope; physical-device / store / production NOT claimed) |

## 1. Executive Summary

The iOS **Simulator** customer and provider native journeys are **certified**. On a hosted
macOS runner, the EAS iOS simulator build `281fd93b` was installed on an **iPhone SE (3rd
generation), iOS 18.1** Simulator and driven with Maestro through the full Phase 3F journey:
a customer creates a House Cleaning booking through the UI; the booking is verified in the
backend; Provider One is assigned (admin-API prerequisite); the provider advances the job
through **On the way → In progress → Completed** (each state verified in the backend); the
customer submits a 5-star review; the review and provider aggregate are verified; and all
Phase 3H data is cleaned up (zero residual). The run is green and **reproducible from `main`**
(post-merge run #15). One small, tested product accessibility fix was required (welcome
"Log in" became a real button — see §7/§22); no other product behaviour changed. Certification
is scoped to the **iOS Simulator** against the **QA** backend; physical-device, store,
production-backend, payment, and push are explicitly out of scope.

## 2. Starting Baseline

`main` @ `c056e36` (Android customer/provider journeys certified, entry routing
deterministic, admin loop fixed, cert 116/116, Phase 3A 8/8, qa:release green).

## 3. Phase Objective

Certify the implemented customer and provider journeys on **iOS** using a real iOS native
build and the QA backend — distinguishing configuration readiness, build, install, launch,
and per-journey certification, without collapsing them.

## 4. iOS Execution Path

Local environment: **Windows 11 (MINGW64 / win32-x64)**; `xcodebuild`, `xcrun`, and `simctl`
are **not available** locally. The certified path (E) removes that local constraint by running
on a hosted macOS runner.

| Path | Feasible? | Why |
|---|---|---|
| A. Local iOS Simulator | ❌ | Requires macOS + Xcode; host is Windows |
| B. EAS iOS **Simulator Build** (build only) | ✅ | EAS builds with no Apple creds; produced `281fd93b` (and earlier `8deeff19`) |
| C. Physical iPhone dev/internal | ❌ | No attachable iOS device; Apple Developer signing not configured |
| D. App Store / TestFlight | ❌ | Out of scope |
| **E. Hosted macOS runner (GitHub Actions) + EAS simulator build** | ✅ **used** | Boots a Simulator, installs `281fd93b`, runs the journeys — triggerable from Windows |

**Certified path = E.** Install, launch, and journey exercise all occur on the hosted macOS
Simulator; the Windows host only triggers and monitors the run.

## 5. Apple / EAS Credential Readiness

- **Expo:** authenticated as `dalmarmudu` (`crsd.mudu@gmail.com`). Project linked
  (`@dalmarmudu/QuickServe`, projectId present). CI authenticates via the `EXPO_TOKEN`
  repository secret.
- **Apple Developer access:** not configured and **not required** for a simulator build
  (EAS skips signing for simulator builds). A physical-device build *would* require Apple
  Developer access + signing + a registered device; none are available. No Apple credentials
  were entered or exposed.
- **QA backend:** the build loaded `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
  and `SENTRY_DISABLE_AUTO_UPLOAD` from the EAS **preview** environment (QA project). The CI
  job reads QA secrets from repository Actions secrets. No secret values are committed.

## 6. iOS Configuration Review (Level 1 — ✅ ready)

- **Bundle identifier:** `com.quickserve.app` (unchanged; not silently altered). Build
  number `1`.
- **owner:** `dalmarmudu`; **EAS projectId:** present; **scheme:** `quickserve`.
- **runtimeVersion:** `{ policy: "appVersion" }`. **updates:** none (no OTA config).
- **Permissions (iOS usage descriptions via config plugins):** photo —
  `expo-image-picker.photosPermission`; location —
  `expo-location.locationWhenInUsePermission`; notifications — `expo-notifications` (default).
  All present and user-facing; the journeys **decline** the notification/location prompts
  (permissions are not granted during certification).
- **Plugins:** expo-router, expo-splash-screen, @react-native-community/datetimepicker,
  expo-image-picker, expo-notifications, expo-location, @sentry/react-native/expo.
- **associatedDomains:** still the placeholder `["applinks:REPLACE_ME.quickserve.app"]`
  (iOS-only). It does **not** block a simulator build and did not block the journeys. It
  **must** be set to a real, owned domain before any Universal-Links / production iOS build;
  **not changed** here (a real domain is a user decision requiring domain ownership).
- **No `ios.infoPlist` overrides** needed beyond the plugin-provided descriptions.

## 7. Build Profile and Artifact (Level 2 — ✅ achieved)

- **Config:** an isolated EAS profile `ios-simulator` = `{ extends: "preview", ios:
  { simulator: true } }` (a simulator build needs `ios.simulator: true` and no Apple signing;
  `extends: "preview"` inherits the QA `preview` environment + internal distribution).
  Existing `development`/`preview`/`production` profiles and Android builds are unchanged.
- **Certified build:** `eas build -p ios --profile ios-simulator` → build id
  **`281fd93b-70f1-4b34-a559-76008a840bd4`**.
  - **Status: FINISHED (success)** · Platform iOS · Profile `ios-simulator` · Distribution
    internal · SDK 56.
  - **Artifact:** iOS **simulator** app archive (`.tar.gz` containing the `.app`) — a
    simulator artifact, **not** an installable-on-device `.ipa`.
  - **Signing:** none — simulator build, **no Apple credentials** generated, reused, or
    required.
  - **Contents:** includes the welcome "Log in" accessibility fix (§22) required for reliable
    automation; the earlier build `8deeff19` (from the blocked-state investigation) predates
    that fix and is superseded.
- The workflow resolves the **latest finished `ios-simulator`** build by default (which is
  `281fd93b`); an optional `build_id` input can pin a specific build.

## 8. Device or Simulator Environment

**GitHub Actions `macos-14` runner.** Simulator: **iPhone SE (3rd generation), iOS 18.1**
(udid `CE505324-B3F4-4B42-8BC5-419D92D4505A`), booted via `xcrun simctl`; the `.app` was
installed with `simctl install`. (No local macOS/Simulator/device on the Windows host — the
runner provides the iOS runtime.)

## 9. Native Automation Driver

**Maestro** on the hosted runner (installed via `get.maestro.mobile.dev`), driving
`com.quickserve.app` on the booted Simulator. Flows in `qa/native/flows/*.yaml` are
cross-platform (semantic selectors); credentials are passed via `-e` and never stored in
flow files. The first iOS runs surfaced iOS-specific selector/interaction adjustments
(behaviour-preserving test-driver fixes) — see §24.

## 10. Customer and Provider Journeys (Levels 5–6 — ✅ certified)

Orchestrated by `qa/native/ios-journeys.sh` (each backend check gates the next step; a unique
per-run marker makes the booking findable; cleanup runs on exit). Verified on both run #14 and
run #15:

1. **Customer journey (UI):** cold launch → welcome (not admin) → **Log in** → sign in →
   home → select **House Cleaning** → enter address → schedule **ASAP** → notes (marker) →
   review → **Place Booking** → "Booking created successfully" → booking appears in **My
   Bookings**.
2. **Provider journey (UI):** sign in → **My Jobs** → open the assigned House Cleaning job →
   advance **On the way → In progress → Completed** (one status per fresh login).
3. **Customer review (UI):** open the completed booking → 5-star rating → comment → **Submit
   review** → "Edit review" confirms submission.

## 11–18. Completion, Review, Payment, Lifecycle, Authorization

- **Completion & review:** ✅ exercised (provider marks Completed; customer submits a
  5-star review). See §§10, 19.
- **Payment boundary:** **not exercised** — no real payment/charge occurs in the journey
  (booking → assignment → progression → review only). Out of scope.
- **Lifecycle / role isolation:** the customer never sees the admin login (`assertNotVisible
  "Sign in with your admin account."` passes on entry and after customer sign-in); customer
  and provider use distinct accounts. No admin journey was performed on iOS.

## 19. Backend Persistence Verification (✅)

Service-role REST verification against the **QA** Supabase (setup-verify, the admin-API
assignment prerequisite, and cleanup only — never the behaviour under test):

| Check | Result (run #14 · run #15) |
|---|---|
| Booking created (post-UI) | `count=1`, status=pending, `assigned=null` · same |
| Assignment (admin API) | `provider_assigned`, assignee `20ffb0c8-5af2-4f28-b8aa-59258abba960` · same |
| Provider progression | `on_the_way` → `in_progress` → `completed`, assignee unchanged · same |
| Review | `count=1`, `rating=5` · same |
| Provider aggregate | `average_rating=5`, `review_count=1` · same |

`== ALL iOS JOURNEYS PASSED ==` (markers `P3H-1785729511` · `P3H-1785731436`).

## 20. Runtime Log Review

Maestro per-step logs, device logs, and UI hierarchies are captured in the run artifact
(`maestro-ios-artifacts`). The GitHub Actions job log records the backend verification lines
(counts/status/rating/aggregate/cleanup). No unexpected errors on the certified runs.

## 21. Cleanup and Residual Data (✅)

Cleanup runs on exit and was verified: **`deletedBookings=1`, `deletedReviews=1`,
`residualBookings=0`** on both runs. Persistent QA accounts untouched; the provider aggregate
reflects only the just-created review and is reset by cleanup. **Zero Phase 3H residual data.**

## 22. Files Changed

- `eas.json` — added the isolated `ios-simulator` build profile (config only).
- `.github/workflows/ios-native-journeys.yml` — **new**: hosted-macOS CI workflow (checkout →
  eas-cli + Maestro → **`npm ci`** → resolve/download EAS simulator build → boot Simulator +
  install → entry smoke → `ios-journeys.sh` → upload artifacts). `npm ci` is required so
  eas-cli can resolve the `expo-router` config plugin; the optional `build_id` branch uses
  `eas build:view --json` (no unsupported flag).
- `qa/native/ios-journeys.sh` — **new**: orchestration (customer → verify → assign →
  provider progression → review → verify → cleanup).
- `qa/native/flows/provider-advance.yaml` — **new**: parameterized provider status-advance
  flow.
- `qa/native/flows/entry-reachability.yaml`, `customer-journey.yaml`, `customer-review.yaml` —
  iOS-hardened (combined-a11y-label regex; cold relaunch instead of the no-op `back`; a
  login-button retry loop for the post-launch router race; static-heading keyboard dismissal
  instead of `hideKeyboard`; `scrollUntilVisible` before off-screen advance buttons and the
  star row). Behaviour-preserving test-driver changes.
- `qa/native/backend.mjs` — reads `process.env` (CI secrets) when `qa/.env` is absent.
- `qa/native/README.md` — **new**: driver + iOS CI usage + required secrets.
- `.gitignore` — ignore runner-only iOS build download artifacts.
- **Product:** `src/app/(onboarding)/welcome.tsx` — the "Log in" affordance changed from a
  bare `<Text onPress>` to a `Pressable` with `accessibilityRole="button"`,
  `accessibilityLabel`, `hitSlop`, and `testID="login-link"`. This is a small **accessibility
  improvement** (VoiceOver announces it as a button; larger, reliable tap target) and is the
  only product change; the existing `welcome` unit test still passes.
- `docs/qa/PHASE-3H-IOS-NATIVE-JOURNEYS.md` — this report.
- **No schema/dependency changes.**

## 23. Validation Matrix

| Gate | Command | Result |
|---|---|---|
| Root Jest (full suite) | `npx jest` | ✅ 222 suites / 2951 tests (pre-merge, on the certified tree) |
| `welcome` a11y unit test | jest (subset) | ✅ 2/2 (Log-in-as-button, still navigates) |
| Star input / review edit | jest (subset) | ✅ passing |
| iOS build result | EAS `281fd93b` | ✅ **FINISHED** (iOS simulator `.app`, SDK 56, no signing) |
| iOS install / launch | CI (run #14, #15) | ✅ installed + launched on iPhone SE (3rd gen) / iOS 18.1 |
| iOS customer journey | CI (run #14, #15) | ✅ booking created + verified |
| iOS provider journey | CI (run #14, #15) | ✅ assignment + progression verified |
| iOS review + aggregate | CI (run #14, #15) | ✅ `rating=5`, aggregate `5 / 1` |
| Cleanup / residual | CI (run #14, #15) | ✅ `1 / 1 / 0` |
| Reproducibility from `main` | CI (run #15) | ✅ green on `main` @ `9254405` |

## 24. Defects and Blockers

- **Initial blocker (resolved): no local iOS runtime.** The Windows host has no
  macOS/Xcode/Simulator/device; resolved by the hosted-macOS CI pipeline (§4 path E).
- **iOS-specific test-driver adjustments (resolved, behaviour-preserving):** combined iOS
  accessibility labels; Maestro `back` is a no-op on iOS; a post-launch router-interactivity
  race on the login tap; `hideKeyboard` is unreliable on iOS; long scrollable screens hide
  advance buttons/stars below the fold. Each was root-caused from run evidence (screenshots +
  UI hierarchies) and fixed in the flows (§22).
- **One product accessibility fix (resolved):** welcome "Log in" was a bare `<Text onPress>`;
  made it a proper `Pressable` button with a `testID` (§22).
- **Pre-existing config item (not a blocker):** `ios.associatedDomains` placeholder — must be
  a real owned domain before Universal Links / production iOS. Not changed (user decision).
- **No functional product defects found** in the certified journeys.

## 25. Pilot-Readiness Impact

iOS customer/provider journeys are now **verified on the iOS Simulator** against the QA
backend, reproducibly via CI. Android journeys, admin web, and backend remain certified and
unaffected. Physical-iPhone verification still requires an Apple Developer account (signing) +
a real device (or a real-device cloud farm).

## 26. Remaining iOS Gaps / Out of Scope

Physical-device install & journeys · Universal Links (placeholder domain) · real push
delivery · background location · TestFlight/App Store · production backend · real payments ·
accessibility audit · performance — **not certified** (Simulator + QA only).

## 27. How to Reproduce

1. Ensure the repository Actions secrets exist (`EXPO_TOKEN`, `QA_SUPABASE_URL`,
   `QA_SUPABASE_ANON_KEY`, `QA_SERVICE_ROLE_KEY`, `QA_CUSTOMER_*`, `QA_PROVIDER1_*`).
2. Ensure a finished `ios-simulator` build exists (`eas build -p ios --profile ios-simulator`);
   the workflow uses the latest by default (`281fd93b`), or pin via the `build_id` input.
3. Trigger **iOS Native Journeys** from the Actions tab (or `gh workflow run
   ios-native-journeys.yml --ref main`). The workflow is registered on the default branch
   (`main`), so it is dispatchable from the UI/API.

## 28. Final Status

- **iOS configuration readiness:** ✅ ready.
- **Successful iOS build:** ✅ achieved (EAS `281fd93b` finished — iOS simulator `.app`).
- **iOS Simulator install + launch:** ✅ achieved (iPhone SE 3rd gen / iOS 18.1).
- **iOS Simulator customer journey certification:** ✅ achieved (booking created + verified).
- **iOS Simulator provider journey certification:** ✅ achieved (assignment + progression +
  review + aggregate verified).
- **Cleanup / residual:** ✅ `1 / 1 / 0`.
- **Reproducible from `main`:** ✅ (run #15, `9254405`).
- **Certification run #14:** `30782793463` (branch `46699c0`), **success**, ~20 min.
- **Post-merge verification run #15:** `30784379852` (main `9254405`), **success**, ~16.5 min.
- **Artifacts:** ✅ generated (screenshots, Maestro logs, UI hierarchies; backend verification
  in the job log).
- **Physical-iPhone certification:** ❌ not achieved (no device/signing).
- **Remaining limitations:** Simulator only · no physical iPhone · no TestFlight/App Store ·
  no production backend · no real payments · no real push.
- **Full Platform Certification: NOT claimed.**
