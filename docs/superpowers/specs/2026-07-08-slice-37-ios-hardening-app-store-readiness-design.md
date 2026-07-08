# Slice 37 — iOS Hardening & App Store Readiness — Design Spec

**Date:** 2026-07-08
**Status:** Draft for approval
**Slice goal:** Make QuickServe production-ready on iOS and prepare it for TestFlight / App Store submission, at **parity with Android**, without adding business features or regressing Android.

---

## 1. Overview

QuickServe is an Expo React Native app (SDK ~56, Expo Router, TypeScript, Supabase) that has been built Android-first across Slices 1–36. This slice is a **hardening + configuration + documentation** pass focused on iOS. It does **not** add customer/provider/admin features, and it changes **no** booking, dispatch, payment, auth, ranking, payout, or backend/schema behavior except where a defect is **provable by static code inspection** and iOS-specific.

### Verification boundary (defining constraint)

The development environment is Windows with **no macOS / iOS simulator or device**. Therefore this slice cannot empirically reproduce iOS runtime behavior. "Fix verified iOS issues" is scoped to **inspection-provable** changes only:

- A missing/incorrect config value (e.g. no iOS splash image).
- A missing user-facing permission string.
- A `Platform.select`/platform branch that omits or mis-handles iOS.
- A code pattern documented as unreliable on iOS (e.g. `fetch('file://…').arrayBuffer()`).
- A form lacking safe-area / keyboard handling that its siblings have.

Everything requiring a live device to confirm (actual APNs delivery, real TestFlight upload, on-device gesture/keyboard feel) is delivered as a **checklist for the human to execute on a Mac**, not as speculative code.

**Out of scope (speculative hardening):** adding defensive code where no defect is provable (extra keyboard wrappers "just in case", upload retry beyond what exists, broadened permission-denial UX) — explicitly excluded to avoid churn and Android regression.

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

- Add an **iOS splash image** to the `expo-splash-screen` plugin config (a shared `image` or an explicit `ios.image`) so iOS gets a real splash, not just a background color. Use an existing asset (`./assets/images/splash-icon.png`).
- Add an `ios.infoPlist` block containing an **inert associated-domains scaffold** — `com.apple.developer.associated-domains` with a clearly-placeholder entry (e.g. `applinks:REPLACE_ME.quickserve.app`) — documented as future-ready and non-functional until the domain + AASA + Apple capability exist. Does not alter `quickserve://` behavior.
- Confirm (no change unless provably wrong): `bundleIdentifier`, `buildNumber`, `version`, `orientation`, `.icon` bundle reference, `scheme: quickserve`.
- **Leave `extra.eas.projectId` and Sentry `organization`/`project` empty** — recorded as Task 4 checklist TODOs.
- **Static test** (`ios-config.test.ts`, following the Slice 36 `communication-center-schema.test.ts` fs-read pattern): assert app.json has an iOS-visible splash image; both existing permission strings present and non-empty; `ios.bundleIdentifier === 'com.quickserve.app'`; `scheme === 'quickserve'`; **no camera permission key is present** (guards against accidental scope creep); the associated-domains scaffold is present but uses the placeholder token.
- **Gate:** `npm test`, `npx tsc --noEmit`, `npx expo export --platform android`, `npx expo export --platform ios` (or `web` if `ios` export is unavailable on this platform — record which ran).

### Task 2 — Permission strings audit
**Files:** `app.json` (permission copy only, if tightened), `docs/pilot/ios-app-store-readiness.md` (permissions section — created/extended here or in T4; keep in T4 to avoid split ownership).

- Verify the two user-facing strings are clear and accurate:
  - Photos: "QuickServe needs photo access to attach job photos." (library only.)
  - Location (when-in-use): the provider live-tracking string.
- Confirm and **document** that **no camera permission** is needed (no `launchCameraAsync`) and that **notifications** need no `Info.plist` string on iOS (system-managed prompt).
- Tighten copy only if a string is inaccurate/unclear; otherwise no change. (This task may collapse into Task 1's diff if no copy change is warranted — kept separate for a clean review of user-facing text.)

### Task 3 — Inspection-provable code parity fixes
**Files:** `src/lib/maps.ts` (create — extracted helper), `src/app/provider/job/[id].tsx` (use the helper), `src/lib/photos.ts` (harden upload read if provably needed), the named form screens **only where a gap is provable**, plus tests.

- **Maps helper:** extract `buildDirectionsUrl(lat, lng)` (iOS → `https://maps.apple.com/?daddr=…` [tighten `http`→`https`]; default → Google Maps dir URL) into `src/lib/maps.ts`; unit-test both platform branches; rewire the existing provider usage. **No new customer maps button.**
- **iOS file-URI upload:** audit `photos.ts` upload. `fetch('file://…').arrayBuffer()` is unreliable on iOS; if confirmed by inspection, replace the read with a cross-platform mechanism that is identical on both platforms and test it. If this requires a new dependency (`expo-file-system`), that is flagged to the human before adding — the implementer stops and reports rather than adding a dependency unilaterally.
- **Safe-area / keyboard audit:** review booking / payment / profile / provider-onboarding forms; add `KeyboardAvoidingView` / safe-area handling **only** where a sibling-proven gap exists. No blanket wrapping. Any change must be verified not to alter Android layout (Android uses `behavior={undefined}`/`'height'` conventions already in the codebase — match them).
- If the audit finds **no** provable gap in a given area, that area ships **no code change** and the finding is recorded in the verification doc.

### Task 4 — iOS readiness documentation
**Files:** `docs/pilot/ios-app-store-readiness.md` (create).

Single comprehensive doc with these sections:
- **EAS iOS build checklist:** `eas init` → projectId; `eas credentials`; Apple Team ID; provisioning; simulator vs device build commands; the `development.ios.simulator` flag.
- **APNs / push credential checklist:** APNs key (`.p8`) upload via `eas credentials`; Expo push token behavior on iOS; foreground vs background handler notes (referencing `src/lib/push.ts`); permission-prompt behavior; **no new pipeline**.
- **Permissions section:** each string, when it prompts, why; camera deliberately omitted; notifications system-managed.
- **Deep links:** `quickserve://` scheme; the Slice 36 `resolveNotificationDeepLink` route coverage (booking/payment/wallet/provider/support); universal-links (AASA) future-ready steps (host `apple-app-site-association`, enable Associated Domains capability, replace the placeholder domain).
- **Maps/navigation:** Apple Maps primary on iOS, Google fallback; provider address navigation; no routing-engine change.
- **App Store privacy:** privacy nutrition labels (data collected: account, location-when-in-use, photos, payment metadata — mapped to features); **ATT determination = not required** (no IDFA/tracking, cite the absence); **privacy manifest** (`PrivacyInfo.xcprivacy`) future-ready note.
- **TestFlight checklist:** build upload, internal testers, export compliance, beta review.
- **Manual iOS QA checklist:** customer booking, provider job flow, notifications, location share + denial, photo library upload, M-Pesa payment webview/browser handoff + return, wallet, promotions, reviews, saved addresses, support/operations links. (Admin is web-only → marked N/A for native iOS.)
- **Credentials TODO table:** eas.projectId, Apple Team ID, APNs key, Sentry org/project — what/where/where-it-goes.

### Task 5 — Verification doc + final gate + whole-branch review
**Files:** `docs/pilot/ios-hardening-verification.md` (create).

- Document + verify (cite `file:line`): config hardening applied; permission strings correct; no camera permission introduced; maps helper extracted + tested; upload read status (hardened or audited-safe); safe-area/keyboard findings; Android untouched (diff scope proof); no schema/payment/auth/dispatch logic change.
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
| 1 | app.json iOS config hardening + `ios-config.test.ts` | code + test |
| 2 | Permission strings audit (copy verified) | code (maybe no-op) |
| 3 | `maps.ts` helper + iOS upload read + safe-area/keyboard fixes | code + tests |
| 4 | `docs/pilot/ios-app-store-readiness.md` (all checklists) | docs |
| 5 | `docs/pilot/ios-hardening-verification.md` + final gate + review | docs + verify |

## 10. Explicit non-goals

- No macOS/device execution in this slice (checklists hand that to the human).
- No App Store / TestFlight submission.
- No camera capture, no ATT, no background location, no new deep-link scheme, no maps routing engine.
- No new features, no Android behavior change, no schema/payment/auth/dispatch/ranking/payout logic change.
