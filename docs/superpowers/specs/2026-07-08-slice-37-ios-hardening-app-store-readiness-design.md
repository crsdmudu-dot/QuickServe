# Slice 37 — iOS Hardening & App Store Readiness — Design Spec

**Date:** 2026-07-08
**Status:** Approved (refinements applied 2026-07-08)
**Slice goal:** Make QuickServe production-ready on iOS and prepare it for TestFlight / App Store submission, at **parity with Android**, without adding business features or regressing Android.

---

## 1. Overview

QuickServe is an Expo React Native app (SDK ~56, Expo Router, TypeScript, Supabase) that has been built Android-first across Slices 1–36. This slice is a **hardening + configuration + documentation** pass focused on iOS. It does **not** add customer/provider/admin features, and it changes **no** booking, dispatch, payment, auth, ranking, payout, or backend/schema behavior except where a defect is **provable by static code inspection** and iOS-specific.

### Verification boundary (defining constraint)

The development environment is Windows with **no macOS / iOS simulator or device**. Therefore this slice cannot empirically reproduce iOS runtime behavior. The operative rule is: **correct only issues that are statically provable from inspection** — never "fix iOS issues" on suspicion. Scope is limited to:

- A missing/incorrect config value (e.g. no iOS splash image).
- A missing user-facing permission string.
- A `Platform.select`/platform branch that omits or mis-handles iOS.
- A code pattern documented as unreliable on iOS (e.g. `fetch('file://…').arrayBuffer()`).
- A form lacking safe-area / keyboard handling that its siblings have.

Everything requiring a live device to confirm (actual APNs delivery, real TestFlight upload, on-device gesture/keyboard feel) is delivered as a **checklist for the human to execute on a Mac**, not as speculative code.

**Out of scope (speculative hardening):** adding defensive code where no defect is provable (extra keyboard wrappers "just in case", upload retry beyond what exists, broadened permission-denial UX) — explicitly excluded to avoid churn and Android regression.

**Scope guardrail on wording:** this spec deliberately avoids the phrase "fix iOS issues." Everywhere a correction is described, the operative rule is: **correct only issues that are statically provable from inspection.** If an issue cannot be proven wrong by reading the code/config, it is documented as a checklist item for on-device verification — it is not changed in code.

---

## 2. Current iOS surface (audit findings)

Established by inspection during brainstorming:

- **`app.json`**: `version 1.0.0`; top-level `orientation: portrait`; iOS `bundleIdentifier com.quickserve.app`, `buildNumber "1"`, `icon: ./assets/expo.icon` (the SDK-54+ `.icon` bundle — present on disk). `expo-splash-screen` configures a `backgroundColor` and **only** an `android.image` — **no iOS splash image**. **No `ios.infoPlist` block**, no associated domains, no ATT. `extra.eas.projectId` is **empty**; Sentry `organization`/`project` are **empty**.
- **`eas.json`**: `appVersionSource: local`; production profile has `autoIncrement: true`; `development.ios.simulator: false`; empty `submit.production`.
- **Permissions actually used**: photo **library** only (`launchImageLibraryAsync`; **no `launchCameraAsync` anywhere** → no camera permission needed), **location when-in-use** (provider live tracking), notifications. Existing iOS strings: `expo-image-picker.photosPermission`, `expo-location.locationWhenInUsePermission`.
- **No IDFA / tracking / ATT code** anywhere → App Tracking Transparency is **not required**; this will be documented, not implemented.
- **Maps navigation**: only `src/app/provider/job/[id].tsx:136` (`Platform.select` iOS `http://maps.apple.com/?daddr=…`, default Google Maps). Customer side does not launch maps.
- **Payment handoff**: `expo-web-browser` `openBrowserAsync` via `src/components/external-link.tsx`.
- **Photo upload read path**: `src/lib/photos.ts:62` reads the picked URI with `fetch(input.uri).arrayBuffer()` — reliable on Android, historically unreliable for `file://` URIs on iOS.
- **Safe-area / keyboard**: ~154 references across the app already; broadly wired.
- **Push**: `src/lib/push.ts` (`registerForPushNotifications`, `getExpoPushTokenAsync`, `setNotificationHandler`), invoked from `src/app/_layout.tsx` after sign-in.

---

## 3. Decisions (from brainstorming)

1. **Verification model:** inspection-provable code/config changes **+** comprehensive Mac/TestFlight/App-Store/QA checklists. No speculative iOS-runtime code.
2. **Missing IDs/credentials** (`eas.projectId`, Sentry org/project, Apple Team ID, APNs key): **leave empty values untouched**; capture each as an explicit checklist TODO (what it is, where to get it, where it goes). **No fabricated IDs committed.**
3. **Universal links / associated domains:** **scaffold + document, inert** — an associated-domains block in `ios.infoPlist` with a clearly placeholder domain that changes no runtime behavior; the `quickserve://` custom scheme remains the sole active deep-link mechanism. AASA hosting + Apple capability steps go in the checklist.
4. **Task shape:** 5 review-gated tasks (below).
5. **Maps / upload / keyboard** are treated as **extract-and-harden**, never as new customer-facing capability (e.g. no new "navigate" button is added to the customer app).

---

## 4. Guardrails (binding on every task)

- **iOS parity with Android; Android behavior unchanged (no regression).**
- No new customer/provider/admin features.
- No booking / dispatch / payment / auth / ranking / payout / promotions / analytics **logic** changes — unless fixing a defect that is both iOS-specific **and** provable by static inspection.
- No database / schema / migration changes unless strictly required for iOS (none anticipated).
- No AI.
- No App Store submission this slice; no marketing assets/screenshots beyond what config verification requires.
- Every documented claim in deliverables cites a real `file:line` or an explicit checklist action; no invented credentials or behavior.
- Any change to a real credential/identifier value is a checklist TODO, not a committed value.

---

## 5. Task breakdown

### Task 1 — iOS app config hardening + static config test
**Files:** `app.json` (modify), `eas.json` (review; modify only if a provable gap), `src/__tests__/ios-config.test.ts` (create).

This task explicitly covers each of the following audits. Where the audit finds the config already correct, the item ships **no change** and the finding is recorded (in the Task 5 verification doc). Where the audit finds a statically-provable gap, it is corrected here.

- **App icon asset validation** — confirm `ios.icon` (`./assets/expo.icon` `.icon` bundle) exists on disk and is well-formed (`icon.json` + `Assets/`); confirm the top-level `icon` fallback asset exists. No change unless a referenced asset is missing/broken.
- **Splash asset validation** — `expo-splash-screen` currently configures a `backgroundColor` and **only** an `android.image`. Add an **iOS-visible splash image** (a shared `image` or explicit `ios.image`) using an existing asset (`./assets/images/splash-icon.png`); confirm the asset exists on disk.
- **Bundle identifier verification** — confirm `ios.bundleIdentifier === 'com.quickserve.app'` (matches Android `package`). No change unless provably wrong.
- **Version + build number verification** — confirm `version` (`1.0.0`) and `ios.buildNumber` (`"1"`) are present and well-formed; note `eas.json` production `autoIncrement: true` governs build-number bumps. No change unless missing/malformed.
- **Supported iOS version audit** — determine the effective iOS deployment target for Expo SDK ~56 (Expo's default minimum). Document the value; set `ios.deploymentTarget` (or the equivalent config) **only if** inspection shows it is unset and a default is required for a clean build. Prefer documentation over a speculative override.
- **Orientation audit** — confirm top-level `orientation: 'portrait'` and that no screen overrides it inconsistently. No change unless provably wrong.
- **Info.plist key audit** — enumerate the `Info.plist` keys the app will generate (via config plugins: `NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription`; the app scheme; associated domains). Confirm no key is missing for a capability the code actually uses, and **no key exists for a capability the code does not use** (esp. camera/microphone). Add an `ios.infoPlist` block only for the associated-domains scaffold below.
- **EAS iOS profile audit** — review `eas.json` `development`/`preview`/`production` iOS settings (`development.ios.simulator: false`, `production.autoIncrement`, `appVersionSource: local`, `submit.production`). Document findings; change only a provable gap.
- **Associated Domains placeholder scaffold** — add an `ios.infoPlist` `com.apple.developer.associated-domains` entry with a clearly-placeholder value (e.g. `applinks:REPLACE_ME.quickserve.app`), **inert** and future-ready; does not alter `quickserve://` behavior.
- **Leave `extra.eas.projectId` and Sentry `organization`/`project` empty** — recorded as Task 4 checklist TODOs. No fabricated IDs.

**Static test** (`ios-config.test.ts`, following the Slice 36 `communication-center-schema.test.ts` fs-read pattern) — assert:
- iOS splash image is configured (iOS gets a splash image, not only a background color).
- required icons are configured (`ios.icon` reference present; asset path exists).
- bundle identifier exists (`ios.bundleIdentifier === 'com.quickserve.app'`).
- build number exists (`ios.buildNumber` present and non-empty).
- permission strings exist (photos + location-when-in-use present and non-empty).
- **no camera permission introduced** (no camera usage-description key / no camera plugin config).
- orientation remains correct (`orientation === 'portrait'`).
- the associated-domains scaffold is present and uses the placeholder token.

**Gate:** `npm test`, `npx tsc --noEmit`, `npx expo export --platform android`, `npx expo export --platform ios` (or `web` if `ios` export is unavailable on this platform — record which ran).

### Task 2 — Complete iOS capability & permission audit
**Files:** `app.json` (permission copy only, if tightened); the permissions section of `docs/pilot/ios-app-store-readiness.md` is **owned by Task 4** — Task 2 produces the audit findings that Task 4 documents.

This task does **not** merely verify the two existing strings — it performs a **complete audit of every iOS capability/permission the project could request**, by static code inspection (grep for each native API + review of every config plugin in `app.json`). For **each** capability below, determine: is it actually used in code? is a usage-description string declared? is the declaration justified?

| Capability | iOS Info.plist key | Expected finding (to be proven by inspection) |
|---|---|---|
| **Photos** | `NSPhotoLibraryUsageDescription` | **Used** — `launchImageLibraryAsync`. String required and present. Verify copy. |
| **Location** | `NSLocationWhenInUseUsageDescription` | **Used** — provider live tracking (when-in-use only). String required and present. Verify copy. No `Always`/background key unless code proves background location. |
| **Camera** | `NSCameraUsageDescription` | **Not used** — no `launchCameraAsync` anywhere. Must remain **intentionally absent**. |
| **Microphone** | `NSMicrophoneUsageDescription` | Expected **not used** — confirm no audio/recording API. Must remain absent. |
| **Contacts** | `NSContactsUsageDescription` | Expected **not used** — confirm no contacts API. Must remain absent. |
| **Bluetooth** | `NSBluetoothAlwaysUsageDescription` | Expected **not used** — confirm no BLE API. Must remain absent. |
| **Calendars** | `NSCalendarsUsageDescription` | Expected **not used** — confirm no calendar API (note: in-app scheduling uses the datetime picker, not the system calendar). Must remain absent. |
| **Motion** | `NSMotionUsageDescription` | Expected **not used** — confirm no pedometer/motion API. Must remain absent. |

- **Notifications** remain **system-managed** on iOS (no `Info.plist` usage string). Document the permission-prompt behavior only.
- **Rule:** document every permission (used or deliberately absent). **Do not introduce any permission that is not required.** Camera stays absent **unless** code inspection proves `launchCameraAsync` (or another camera API) is actually used — in which case the finding is reported to the human before any string is added.
- Tighten a usage-description string only if inspection shows it is inaccurate/unclear; otherwise **no code change** and the audit result is recorded for Task 4/Task 5.

### Task 3 — Inspection-proven code hardening
**Files:** `src/lib/maps.ts` (create — extracted helper), `src/app/provider/job/[id].tsx` (use the helper), `src/lib/photos.ts` (harden upload read only if provably needed), the named form/screen files **only where a gap is provable**, plus tests.

**This task is inspection-only. Correct only issues that are statically provable from inspection.** No speculative improvements, no redesigns, no feature work, no Android changes. If an area has no provable gap, it ships **no code change** and the finding is recorded in the Task 5 verification doc.

- **Apple Maps helper:** extract `buildDirectionsUrl(lat, lng)` (iOS → `https://maps.apple.com/?daddr=…` — tighten the provably-loose `http`→`https`; default → Google Maps directions URL) into `src/lib/maps.ts`; unit-test both platform branches; rewire the existing `provider/job/[id].tsx` usage. **No new customer maps button** (that would be a feature).
- **`file://` upload inspection:** audit `photos.ts` upload. `fetch('file://…').arrayBuffer()` (photos.ts:62) is documented-unreliable for local file URIs on iOS; **only if** inspection confirms the gap, replace the read with a cross-platform mechanism that behaves identically on Android and iOS, and test it. If this requires a new dependency (`expo-file-system`), the implementer **stops and reports** to the human rather than adding a dependency unilaterally.
- **Safe Area audit:** review booking / payment / profile / provider-onboarding screens for notch/safe-area handling; add safe-area handling **only** where a sibling-proven gap exists. No blanket wrapping.
- **Keyboard audit:** review the same forms for `KeyboardAvoidingView` coverage; add it **only** where a provable gap exists, matching the codebase's existing platform conventions (Android `behavior` conventions must be preserved — no Android layout change).
- **Status bar / notch compatibility audit:** review `expo-status-bar` usage and top-level layout insets for notch/Dynamic-Island/safe-area-top handling; correct **only** a statically-provable gap (e.g. a screen that hardcodes a top offset instead of using safe-area insets). Document; change nothing speculative.

### Task 4 — App Store readiness documentation
**Files:** `docs/pilot/ios-app-store-readiness.md` (create).

Single comprehensive doc — the **permanent iOS release checklist** — with these sections:
- **EAS build checklist:** `eas init` → projectId; `eas credentials`; Apple Team ID; provisioning profiles; simulator vs device build commands; the `development.ios.simulator` flag; `appVersionSource: local` + `autoIncrement` behavior.
- **APNs checklist:** APNs key (`.p8`) upload via `eas credentials`; Expo push token behavior on iOS; foreground vs background handler notes (referencing `src/lib/push.ts`); permission-prompt behavior; **no new pipeline**.
- **Permissions section** (from the Task 2 audit): every capability (Photos, Location, Camera, Microphone, Contacts, Bluetooth, Calendars, Motion) with used/absent status + justification; each declared string, when it prompts, and why; camera deliberately omitted; notifications system-managed.
- **TestFlight checklist:** build upload, internal/external testers, beta app review, tester onboarding.
- **App Store submission checklist:** App Store Connect record, metadata, categories, pricing/availability, build selection, review submission.
- **Privacy Nutrition checklist:** data-collection labels (account, location-when-in-use, photos, payment metadata) mapped to features and linkage/tracking answers.
- **ATT determination:** App Tracking Transparency = **not required** — cite the absence of any IDFA/tracking/`AppTrackingTransparency` code; document the reasoning so a reviewer can confirm.
- **Privacy Manifest readiness:** `PrivacyInfo.xcprivacy` — required-reason API declarations + the future-ready steps (documented, not implemented this slice).
- **Universal Links readiness:** host `apple-app-site-association`, enable the Associated Domains capability, replace the placeholder domain; note `quickserve://` remains the active scheme until then.
- **Associated Domains setup:** the exact `ios.infoPlist` block, the placeholder token, and how to make it live.
- **Manual QA checklist:** customer booking, provider job flow, notifications, location share + denial, photo library upload, M-Pesa payment webview/browser handoff + return, wallet, promotions, reviews, saved addresses, support/operations links. (Admin is web-only → marked N/A for native iOS.)
- **App Store Compliance Checklist** — a pre-submission sweep covering: placeholder content, lorem ipsum, debug text/`console` artifacts left visible, test accounts, demo/seed data, broken links, missing screenshots, missing privacy policy URL, missing support URL, the export-compliance questionnaire (encryption usage), and the age-rating questionnaire.
- **Credentials TODO table:** eas.projectId, Apple Team ID, APNs key, Sentry org/project — what / where to get it / where it goes.

### Task 5 — Verification doc + final gate + whole-branch review
**Files:** `docs/pilot/ios-hardening-verification.md` (create).

- Document + verify (cite `file:line`): config hardening applied; permission strings correct; no camera permission introduced; maps helper extracted + tested; upload read status (hardened or audited-safe); safe-area/keyboard/status-bar findings; no schema/payment/auth/dispatch logic change.
- **Explicitly prove each of the following is unchanged** (via `git diff` scope + targeted inspection, cited):
  - **Android unchanged** — no Android-affecting code/config diff; the config additions are iOS-scoped or shared-inert.
  - **Booking workflow unchanged** — no diff in booking creation/state/flow logic.
  - **Payment workflow unchanged** — no diff in payment/M-Pesa logic (the M-Pesa handoff is documented, not modified).
  - **Provider workflow unchanged** — the provider job screen changes only swap the inline maps URL for the extracted helper (behavior-preserving); no dispatch/job-flow change.
  - **Notification pipeline unchanged** — no diff in `notify_user`/triggers/`emit_notification`/`broadcast_announcement`/push pipeline (Slice 36 infra untouched).
  - **Deep links unchanged** — `quickserve://` scheme and `resolveNotificationDeepLink` route behavior unchanged; the associated-domains scaffold is inert.
  - **Push notifications unchanged** — `src/lib/push.ts` registration/token/handler logic untouched.
- **Navigation Verification** — prove, by inspection and `git diff` review, that:
  - All existing navigation routes remain unchanged (no route file added/removed/renamed under `src/app/`).
  - All existing tabs remain unchanged (customer/provider tab layouts and declared tabs untouched).
  - All existing navigation stacks remain unchanged (stack/layout `_layout.tsx` files untouched in structure).
  - No existing deep-link routes are modified (`scheme`, linking config, and `resolveNotificationDeepLink` route mappings unchanged; the associated-domains scaffold is inert).
  - Any iOS-specific change does not alter navigation behavior (config/asset/helper changes do not add, remove, or reorder any screen, tab, or route).
- **Final gate:** `npm test`, `npx tsc --noEmit`, `npx expo export --platform android`, `npx expo export --platform ios` (or `web`, recording which), `git status` clean.
- Independent **whole-branch review** (most-capable model): iOS parity, no Android regression, guardrails honored, config correctness, doc accuracy, code quality, tests. Fix only Critical/Important. Then **pause before merge**.

---

## 6. Architecture & isolation

New/changed units are small and well-bounded:
- `src/lib/maps.ts` — pure `buildDirectionsUrl(lat, lng)`; single responsibility; testable without a device.
- `app.json` / `eas.json` — declarative config; validated by a static test and `expo export`.
- `src/lib/photos.ts` — upload read hardened behind the existing `uploadBookingPhoto` interface (callers unchanged).
- Docs are standalone under `docs/pilot/`.

No shared runtime module’s public interface changes; screens consuming photos/maps keep their current props.

## 7. Testing strategy

- **Static config test** (`ios-config.test.ts`) — asserts app.json iOS invariants (splash, permission strings, bundleId, scheme, no-camera, inert associated-domains placeholder).
- **Unit tests** for `buildDirectionsUrl` (iOS vs default branch) and, if the upload read changes, for the new read path (mock the file read + supabase storage).
- **No tests for documentation** (checklists are prose).
- Every task runs the full gate; the suite must stay green with no weakened assertions. Baseline: 2852 tests (Slice 36 head).

## 8. Rollback

All changes are additive/config-level and isolated:
- `app.json`/`eas.json` — revert the config diff; iOS returns to prior (Android-only-splash) state with no data impact.
- `src/lib/maps.ts` extraction — revert to the inline `Platform.select` in the provider screen.
- `photos.ts` read change — revert to `fetch().arrayBuffer()`.
- Docs — delete the markdown files.
No migration, no schema, no destructive operation → clean revert of the branch restores the pre-slice state exactly.

## 9. Deliverables summary

| Task | Deliverable | Type |
|---|---|---|
| 1 | app.json/eas.json iOS config hardening (icon/splash/bundle/version/iOS-version/orientation/Info.plist/EAS/associated-domains audits) + `ios-config.test.ts` | code + test |
| 2 | Complete iOS capability & permission audit (Photos/Location/Camera/Mic/Contacts/Bluetooth/Calendars/Motion) | code (maybe no-op) + findings |
| 3 | `maps.ts` helper + `file://` upload inspection + safe-area/keyboard/status-bar audits — inspection-proven only | code + tests |
| 4 | `docs/pilot/ios-app-store-readiness.md` (EAS/APNs/TestFlight/App-Store/Privacy-Nutrition/ATT/Privacy-Manifest/Universal-Links/Associated-Domains/QA + App Store Compliance Checklist) | docs |
| 5 | `docs/pilot/ios-hardening-verification.md` + unchanged-proofs + final gate + whole-branch review | docs + verify |

## 10. Implementation guardrail

> **If a proposed code change cannot be proven necessary by static inspection, document it in the iOS Readiness Checklist instead of modifying production code.**

This is a binding scope guardrail on every task: the default action for any unprovable concern is documentation, not a code edit.

## 11. Explicit non-goals

- No macOS/device execution in this slice (checklists hand that to the human).
- No App Store / TestFlight submission.
- No camera capture, no ATT, no background location, no new deep-link scheme, no maps routing engine.
- No new features, no Android behavior change, no schema/payment/auth/dispatch/ranking/payout logic change.
