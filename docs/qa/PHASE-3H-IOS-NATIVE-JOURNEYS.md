# Phase 3H — iOS Customer and Provider Native Journey Certification

> **Outcome: iOS Native Journey Certification is BLOCKED by an external prerequisite.**
> The execution environment is **Windows** with **no macOS, no Xcode, no iOS Simulator, and
> no attachable physical iOS device**, so an iOS build **cannot be installed, launched, or
> exercised** here. The customer/provider iOS journeys therefore **cannot be certified**.
> This phase records the levels that *are* achievable — **(1) iOS configuration readiness**
> and **(2) a successful iOS (simulator) build** — and stops honestly before any journey
> claim. No product code was changed. **Full Platform Certification is NOT claimed.**

- **Branch:** `qa/phase-3h-ios-native-journeys`
- **Pre-work baseline (main):** `c056e36fd045d1e6f3cf41238cbacc314fed57fd`

---

## Certification level ledger (do NOT collapse)

| Level | Item | Status |
|---|---|---|
| 1 | iOS configuration readiness | ✅ ready (see §6) |
| 2 | Successful iOS build | ✅ **achieved** — EAS `8deeff19` **finished** (iOS simulator `.app`, ~5 min, no signing) |
| 3 | Installation on simulator/device | ❌ **impossible here** (no macOS/Xcode/simulator/device) |
| 4 | Native launch | ❌ not performed (blocked by 3) |
| 5 | Customer journey certification | ❌ not performed (blocked by 3) |
| 6 | Provider journey certification | ❌ not performed (blocked by 3) |
| 7 | Full iOS native journey certification | ❌ **NOT achieved / NOT claimed** |

## 1. Executive Summary

iOS configuration is ready and an iOS **simulator** build was submitted to EAS (no Apple
signing credentials required for a simulator build; QA backend env vars loaded from the
preview environment). However, the environment is Windows — there is no macOS/Xcode/iOS
Simulator and no physical iOS device — so the artifact **cannot be installed or exercised**.
Per the phase rules ("Do not claim native journey certification if the build cannot be
installed and exercised"), the customer and provider iOS journeys are **not certified**;
the blocker is reported precisely and no speculative changes were made beyond the minimal,
isolated EAS `ios-simulator` profile needed to produce the build evidence.

## 2. Starting Baseline

`main` @ `c056e36` (Android customer/provider journeys certified, entry routing
deterministic, admin loop fixed, cert 116/116, Phase 3A 8/8, qa:release green).

## 3. Phase Objective

Certify the implemented customer and provider journeys on **iOS** using a real iOS native
build and the QA backend — distinguishing configuration readiness, build, install, launch,
and per-journey certification, without collapsing them.

## 4. iOS Execution Path

Environment: **Windows 11 (MINGW64 / win32-x64)**. `xcodebuild`, `xcrun`, and `simctl` are
**not available**.

| Path | Feasible? | Why |
|---|---|---|
| A. Local iOS Simulator | ❌ | Requires macOS + Xcode; host is Windows |
| B. EAS iOS **Simulator Build** | ⚠️ build-only | EAS can build (no Apple creds); but **installing/running** needs an iOS Simulator = macOS (absent) |
| C. Physical iPhone dev/internal | ❌ | No attachable iOS device; Windows cannot sideload signed IPAs; Apple Developer signing not configured |
| D. App Store / TestFlight | ❌ | Out of scope |

**Strongest feasible path = B, but as BUILD EVIDENCE ONLY** — installation, launch, and
journey exercise are impossible in this environment. Journey certification is blocked.

## 5. Apple / EAS Credential Readiness

- **Expo:** authenticated as `dalmarmudu` (`crsd.mudu@gmail.com`). Project linked
  (`@dalmarmudu/QuickServe`, projectId present).
- **Apple Developer access:** not configured for this run and **not required** for a
  simulator build (EAS skips signing for simulator builds — confirmed: the build queued
  with no credential/signing step). A physical-device build *would* require Apple Developer
  access + signing + a registered device; none are available. No Apple credentials were
  entered or exposed.
- **QA backend:** the build loaded `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
  and `SENTRY_DISABLE_AUTO_UPLOAD` from the EAS **preview** environment (QA project, redacted
  host `wjvj…`). No secret values are committed.

## 6. iOS Configuration Review (Level 1 — ✅ ready)

- **Bundle identifier:** `com.quickserve.app` (unchanged; not silently altered). Build
  number `1`.
- **owner:** `dalmarmudu`; **EAS projectId:** present; **scheme:** `quickserve`.
- **runtimeVersion:** `{ policy: "appVersion" }`. **updates:** none (no OTA config).
- **Permissions (iOS usage descriptions via config plugins):** photo —
  `expo-image-picker.photosPermission` ("QuickServe needs photo access to attach job
  photos."); location — `expo-location.locationWhenInUsePermission` ("QuickServe shares your
  live location with the customer only while you are travelling to and performing an active
  job."); notifications — `expo-notifications` (default). All present and user-facing.
- **Plugins:** expo-router, expo-splash-screen, @react-native-community/datetimepicker,
  expo-image-picker, expo-notifications, expo-location, @sentry/react-native/expo (empty
  org/project → source-map upload disabled via `SENTRY_DISABLE_AUTO_UPLOAD`).
- **associatedDomains:** still the placeholder `["applinks:REPLACE_ME.quickserve.app"]`
  (iOS-only). It does **not** block a simulator build (no code signing / no domain
  validation at build time) and did not block queueing. It **must** be set to a real,
  owned domain before any Universal-Links / production iOS build; **not changed** here (a
  real domain is a user decision requiring domain ownership).
- **No `ios.infoPlist` overrides** needed beyond the plugin-provided descriptions.

## 7. Build Profile and Artifact (Level 2)

- **Config change:** added an isolated EAS profile `ios-simulator` = `{ extends: "preview",
  ios: { simulator: true } }`. Rationale: a simulator build needs `ios.simulator: true` and
  no Apple signing; `extends: "preview"` inherits the QA `preview` environment + internal
  distribution. Existing `development`/`preview`/`production` profiles and all Android builds
  are unchanged (verified). This is the smallest safe config for the chosen path.
- **Build:** `eas build -p ios --profile ios-simulator --non-interactive` → build id
  `8deeff19-431d-4bcb-8484-abf4b37d308c`.
  - **Status: FINISHED (success)** · Platform iOS · Profile `ios-simulator` · Distribution
    internal · SDK 56.0.0.
  - **Artifact:** iOS **simulator** app archive (`.tar.gz` containing the `.app`) — a
    simulator artifact, **not** an installable-on-device `.ipa`.
  - **Duration:** ~5 min compile (queued 12:21:44 → finished 12:26:50); left the queue
    quickly.
  - **Signing:** none — simulator build, **no Apple credentials generated, reused, or
    required** (no credential/signing stage ran). QA env vars loaded from the preview
    environment.
  - **Advisory (non-blocking):** `expo-updates` not installed → the declared channel has no
    effect (OTA, out of scope).
  - **Not installable here:** the `.tar.gz` requires an iOS Simulator (macOS) to run —
    absent in this environment. So Level 3+ remain blocked.

  This confirms **iOS configuration readiness + a successful iOS build** (Levels 1–2). It
  does **not** and **cannot** confirm installation, launch, or any journey (Levels 3–7).

## 8. Device or Simulator Environment

**None available.** No macOS, no iOS Simulator (`simctl` absent), no physical iOS device.
Installation and launch (Level 3–4) were **not performed** because they are impossible in
this environment.

## 9. Native Automation Driver

Maestro 2.8.0 is present (used for Android in Phase 3F) and is platform-independent for the
flow *design*, but it **cannot drive an iOS target without an iOS Simulator or device**. No
iOS automation was executed. The Phase 3F journey flows (`qa/native/flows/*.yaml`) are
reusable for a future iOS run once an iOS runtime is available.

## 10–18. Customer/Provider Journeys, Completion, Review, Payment, Lifecycle, Authorization

**Not performed / NOT certified** — all require an installed, running iOS app (Level 3+),
which is impossible here. No iOS UI was exercised; no bookings/reviews were created on iOS.

## 19. Backend Persistence Verification

**No Phase 3H iOS data created** (no journey ran). The QA backend was untouched by this
phase beyond the build loading its public env vars.

## 20. Runtime Log Review

**Not applicable** — no device/simulator logs (nothing installed/launched). The EAS build
log is the only artifact; its result is recorded in §7.

## 21. Cleanup and Residual Data

Nothing to clean — **0 iOS bookings, 0 reviews, 0 dependent records created**. Persistent QA
accounts untouched. Provider aggregate unchanged. **Zero Phase 3H residual data.**

## 22. Files Changed

- `eas.json` — added the isolated `ios-simulator` build profile (config only).
- `docs/qa/PHASE-3H-IOS-NATIVE-JOURNEYS.md` — this report.
- **No product/source/schema/dependency changes.** (Maestro wrapper + Phase 3F flows already
  exist from prior phases and are reusable.)

## 23. Validation Matrix

| Gate | Command | Result |
|---|---|---|
| Expo config | `expo config --type public` | ✅ resolves |
| TypeScript (root / qa) | `tsc --noEmit` | ✅ 0 / 0 |
| Root Jest | `npm test` | ✅ 222 / 2951 |
| Website Vitest | `apps/website test` | ✅ 102 |
| Lint | `npm run lint` | ✅ 59 errors (unchanged baseline) |
| Phase 3D/3E + 3G routing tests | jest (subset) | ✅ 20/20 |
| Connected certification 116/116 | `qa:test:certification` | ✅ (validated on `c056e36` at merge — product unchanged; only `eas.json` profile added) |
| Phase 3A admin web 8/8 | `qa:test:web` | ✅ (same — product unchanged) |
| qa:release | `npm run qa:release` | ✅ non-cert 130/56/0 (same — product unchanged) |
| iOS build result | EAS `8deeff19` | ✅ **FINISHED** (iOS simulator `.app`, SDK 56, no signing, ~5 min) |
| iOS install / launch / journeys | — | ❌ **impossible (no iOS runtime)** |
| Cleanup / residual | — | ✅ 0 created / 0 residual |

_Note: the connected/Phase-3A/qa:release gates test the **app + backend**, which are byte-
identical to the certified `c056e36`; the only change in this phase is an additive `eas.json`
build profile (no effect on the bundle or backend). The fast gates were re-run fresh above._

## 24. Defects and Blockers

- **BLOCKER (external, environment): no iOS runtime.** Windows host with no macOS/Xcode/iOS
  Simulator and no physical iOS device → an iOS build cannot be installed, launched, or
  exercised. This blocks Levels 3–7 (install → journey certification). **Not a product
  defect.**
- **Pre-existing config item (not a blocker for this phase):** `ios.associatedDomains` is a
  placeholder; must be a real owned domain before Universal Links / production iOS. Not
  changed (user decision).
- **No product defects found** (none could be exercised on iOS).

## 25. Pilot-Readiness Impact

iOS is **not pilot-ready-verified**: configuration is ready and the app can be built for iOS,
but no on-device/simulator verification is possible in this environment. Android
customer/provider journeys, admin web, and backend remain certified and unaffected. iOS
journey certification requires a macOS/Xcode + simulator or a physical iPhone with Apple
Developer signing.

## 26. Remaining iOS Gaps

Install · launch · customer journey · provider journey · completion/review · payment
boundary · lifecycle · role isolation on iOS — **all pending an iOS runtime**. Universal
Links (placeholder domain), real push, background location, accessibility, performance —
out of scope / not certified.

## 27. Recommended Next Phase

**Phase 3H-run (with an iOS runtime):** on a macOS machine with Xcode + an iOS Simulator (or
a physical iPhone + Apple Developer signing), install the `ios-simulator` build (or a signed
device build) and run the Phase 3F journey flows on iOS. Alternatively, provision a
macOS/EAS-simulator-capable runner. Until then, iOS journey certification cannot proceed.

## 28. Final Status

- **iOS configuration readiness:** ✅ ready.
- **Successful iOS build:** ✅ achieved (EAS `8deeff19` finished — iOS simulator `.app`).
- **iOS simulator certification:** ❌ not achieved (cannot install/run — no simulator).
- **Physical-iPhone certification:** ❌ not achieved (no device/signing).
- **iOS Native Journey Certification:** ❌ **NOT claimed** (no journey exercised).
- **Android certification / backend certification / admin-web certification:** ✅ unchanged
  (from prior phases).
- **External payment settlement / actual push delivery / production deployment:** ❌ not
  certified / out of scope.
- **No real payment · no production push · no App Store/TestFlight submission · no production
  release / OTA.**
- **Full Platform Certification: NOT claimed.**
