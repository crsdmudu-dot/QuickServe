# QuickServe — iOS Release Readiness & App Store Checklist

> **Permanent operational document.** This is the definitive checklist to run **before every iOS release** (TestFlight and App Store). It was produced by Slice 37 (iOS Hardening) and is kept up to date as the app evolves. Sections 1–12 are the release gate; Section 13 tracks intentionally-deferred work.

Accurate as of branch `feat/slice-37-ios-hardening`. Config references: `app.json`, `eas.json`, `src/lib/push.ts`.

---

## 1. Executive Summary

**Scope of Slice 37.** An audit-first iOS hardening pass to bring QuickServe to iOS parity with Android and prepare for TestFlight / App Store. It added: an iOS splash image and an inert Associated Domains scaffold (Task 1), a full iOS capability/permission audit locked by tests (Task 2), an extracted `buildDirectionsUrl` maps helper with the iOS Apple Maps URL tightened to HTTPS (Task 3), and this readiness documentation (Task 4).

**Inspection boundary.** The slice was developed on Windows with **no macOS / iOS simulator or device**. The operative rule was **correct only issues that are statically provable from inspection**. Anything requiring a running device to confirm (real APNs delivery, TestFlight upload, on-device keyboard/notch behavior) is captured as a checklist item here rather than changed speculatively in code. Guardrail: *if a proposed code change cannot be proven necessary by static inspection, it is documented here instead of modifying production code.*

**What was intentionally NOT changed.** No booking, dispatch, payment, wallet, promotions, ranking/payout, auth, provider-workflow, analytics, or Operations-workflow logic. No database/schema/migration change. No notification-pipeline change (the Slice-23 push pipeline is preserved). No navigation/route/tab/stack or deep-link route change. No Android behavior change (the maps Android `google.navigation:` branch was preserved verbatim). No new dependencies. No AI. No App Store submission.

---

## 2. EAS Build Checklist

iOS builds are produced with EAS (`eas.json`). Production profile: `production` (channel `production`, `autoIncrement: true`); `cli.appVersionSource: local`.

- [ ] **Production profile** selected: `eas build --platform ios --profile production`.
- [ ] **Version** (`app.json` → `expo.version`) is correct for this release. Current: `1.0.0`.
- [ ] **Build number** (`app.json` → `expo.ios.buildNumber`, current `"1"`) — with `production.autoIncrement: true`, EAS auto-increments the build number per production build. Confirm it is higher than the last uploaded build.
- [ ] **Bundle identifier** = `com.quickserve.app` (matches App Store Connect record). Do not change once registered.
- [ ] **Apple credentials** configured: `eas credentials` (or EAS-managed). Apple ID / Team available.
- [ ] **Distribution certificate** present and valid (EAS-managed or uploaded).
- [ ] **Provisioning profile** (App Store distribution) present and matches the bundle id + entitlements (incl. Associated Domains once enabled — see §9).
- [ ] Simulator vs device: `development.ios.simulator: false` (device builds). Use a dedicated simulator profile only for local smoke testing.

### Credentials TODO table (fill before first real build)

| Item | Current state | Where to get it | Where it goes |
|---|---|---|---|
| `eas.projectId` | **empty** (`app.json` → `extra.eas.projectId: ""`) | run `eas init` | `app.json` → `extra.eas.projectId` (also required for iOS push tokens — see §3) |
| Apple Team ID | not stored in repo | developer.apple.com → Membership | EAS credentials / `eas.json` submit config |
| APNs key (`.p8`) | not uploaded | developer.apple.com → Keys | `eas credentials` (see §3) |
| Sentry `organization` / `project` | **empty** (`app.json` `@sentry/react-native/expo` plugin) | sentry.io | `app.json` Sentry plugin config |

---

## 3. APNs Checklist

- [ ] **APNs authentication key** (`.p8`) created in the Apple Developer portal and uploaded via `eas credentials` (recommended over per-app certificates).
- [ ] **Environment**: development APNs for TestFlight/dev builds, production APNs for App Store — EAS manages this per build profile. Confirm the production build targets production APNs.
- [ ] **`eas.projectId` is set** — `src/lib/push.ts` calls `getExpoPushTokenAsync({ projectId })` reading `Constants.expoConfig.extra.eas.projectId` (`push.ts:39–42`). It is currently **empty**, so iOS push-token registration cannot succeed until it is filled (see §2 TODO table).
- [ ] **Verification**: on a physical iOS device (not simulator, not Expo Go), sign in → `registerForPushNotifications()` runs from `src/app/_layout.tsx` after sign-in → confirm a token is stored via the `register-device` Edge Function → send a test push → confirm receipt in foreground and background, and that tapping routes via the deep-link listener (`setupNotificationResponseListener`).
- [ ] **Existing pipeline preserved (Slice 23).** Slice 37 made **no** change to the push pipeline: `src/lib/push.ts` (token registration + tap→deep-link), the `register-device` / send-push Edge Functions, `device_tokens`, and the `emit_notification`/`broadcast_announcement` in-app path are all unchanged. **No new push pipeline was introduced.** Push respects the user's `push_enabled` preference downstream, as before.
- [ ] Note: `push.ts` intentionally no-ops in Expo Go and on simulators (`Device.isDevice` / `isExpoGo()` guards) — test push only on a real device build.

---

## 4. TestFlight Checklist

- [ ] Production (or a distribution) build uploaded to App Store Connect (`eas submit --platform ios --profile production`, or Transporter).
- [ ] Build finished processing in App Store Connect (no invalid-binary email).
- [ ] **Export compliance** answered for the build (see §11 — QuickServe uses only standard HTTPS/TLS).
- [ ] Internal testers group configured; build assigned.
- [ ] External testers group + **beta app review** submitted (required for external testing).
- [ ] Test information filled: what to test, beta app description, feedback email, marketing/privacy URLs.
- [ ] Tester onboarding: install TestFlight, accept invite, install build.
- [ ] Run the full **Manual QA Checklist (§10)** on the TestFlight build on a physical device.

---

## 5. App Store Submission Checklist

- [ ] App Store Connect app record exists for `com.quickserve.app`.
- [ ] App name, subtitle, primary/secondary category chosen.
- [ ] Description, keywords, promotional text finalized (no placeholder — see §11).
- [ ] Screenshots for all required device sizes uploaded (see §11).
- [ ] App icon (from the `assets/expo.icon` bundle) renders correctly.
- [ ] Pricing & availability set (territories, price tier / free).
- [ ] **App Privacy** (Privacy Nutrition Labels — §6) completed.
- [ ] **ATT** section answered consistently with §7 (no tracking).
- [ ] Age rating questionnaire completed (§11).
- [ ] Build selected for the version; "Submit for Review".
- [ ] Review notes + a demo account provided if reviewers need to sign in (see §11 — use a controlled review account, not committed test data).

---

## 6. Privacy Nutrition Labels

Complete App Store Connect → App Privacy. Map each collected data type to its purpose (App Functionality unless noted). QuickServe collects:

- [ ] **Contact info / account** (name, email/phone) — account creation & auth. Linked to the user.
- [ ] **Precise location** — *while-in-use only*, for provider live-tracking to the customer during an active job (`expo-location`, when-in-use). Linked to the user; **not** used for tracking.
- [ ] **Photos** — user-selected job photos uploaded to booking records (`expo-image-picker`, library). Linked to the user.
- [ ] **Payment / purchase info** — booking/payment metadata (e.g. M-Pesa transaction references). Linked to the user. (No raw card data is collected in-app.)
- [ ] **Identifiers** — account/user id. Linked to the user.
- [ ] **Tracking answer**: for every data type, answer **"No, not used to track"** (see §7). No data is linked to third-party data for advertising/measurement.

---

## 7. ATT (App Tracking Transparency) Assessment

**ATT is currently NOT required.** Basis (verified by code inspection):

- **No IDFA.** No use of `expo-tracking-transparency`, `AppTrackingTransparency`, `getAdvertisingId`, or the advertising identifier anywhere in the codebase.
- **No tracking SDK.** No advertising/attribution SDKs (e.g. Facebook SDK, AppsFlyer, Adjust, Branch). Analytics are first-party Supabase RPCs (Slice 28), not cross-app tracking.
- **No tracking authorization flow.** No `requestTrackingPermissionsAsync` / ATT prompt exists, because none is needed.
- Therefore: **no `NSUserTrackingUsageDescription`** in `app.json`, and App Store Connect "Tracking" answers are **No** across the board.

- [ ] Re-confirm at each release that no tracking SDK or IDFA usage was introduced (the Task-2 permission tests + a grep for `tracking`/`IDFA` guard against regressions).

---

## 8. Privacy Manifest (`PrivacyInfo.xcprivacy`)

**Current status:** not yet added. Expo SDK ~56 and its native modules ship their own privacy manifests; QuickServe has not authored an app-level manifest.

**Future readiness (do before/at submission if flagged by Apple):**
- [ ] Add an app-level `PrivacyInfo.xcprivacy` (via `expo-build-properties` or a config plugin) declaring **required-reason API** categories actually used and their approved reason codes (e.g. file timestamp / disk space / `UserDefaults` if applicable).
- [ ] Declare collected data types consistent with §6.
- [ ] Verify third-party SDK manifests are present (Expo modules, Sentry) after `expo prebuild` / EAS build.
- [ ] This is **documented, not implemented** in Slice 37 (would require native config work + on-device validation).

---

## 9. Universal Links / Associated Domains

- **Custom scheme deep links remain active and are the only live mechanism.** `app.json` → `expo.scheme: "quickserve"`; in-app + notification deep links resolve through the Slice-36 `resolveNotificationDeepLink` route mapping (`quickserve://` → booking/payment/wallet/provider/support routes). Slice 37 changed none of this.
- **Placeholder scaffold exists (inert).** `app.json` → `expo.ios.associatedDomains: ["applinks:REPLACE_ME.quickserve.app"]`. It is a non-functional placeholder and does not affect `quickserve://` behavior.
- **Before enabling Universal Links (production AASA setup required):**
  - [ ] Replace `REPLACE_ME.quickserve.app` with the real domain.
  - [ ] Host a valid `apple-app-site-association` (AASA) file at `https://<domain>/.well-known/apple-app-site-association` (JSON, no extension, correct `appID` = `<TeamID>.com.quickserve.app`, correct `paths`).
  - [ ] Enable the **Associated Domains** capability on the App ID / provisioning profile.
  - [ ] Rebuild via EAS and verify that tapping an `https://<domain>/...` link opens the app to the correct route.

---

## 10. Manual QA Checklist (run on a physical iOS device)

### Customer
- [ ] Registration
- [ ] Login
- [ ] Booking (create → confirm)
- [ ] Payment (M-Pesa webview/browser handoff → return to app)
- [ ] Wallet (balance, history)
- [ ] Promotions (apply a code)
- [ ] Reviews (rate + view)
- [ ] Notifications (receive, tap → deep link, mark read)
- [ ] Saved addresses (add / edit / select)

### Provider
- [ ] Registration
- [ ] Job flow (accept → status transitions → complete)
- [ ] Navigation (Navigate button → Apple Maps opens to destination)
- [ ] Upload photos (library picker → upload succeeds — **watch the §12 `file://` finding on device**)
- [ ] Notifications (receive, tap → job deep link)

### Admin (web-only — verify on the admin web app, N/A for native iOS)
- [ ] Notifications (center, filters, mark read)
- [ ] Broadcast (compose → send to Customers/Providers/Everyone)
- [ ] Services management (CRUD, toggles)

### Cross-cutting iOS checks
- [ ] Safe area / notch: no content clipped under the notch / Dynamic Island or home indicator (see §12).
- [ ] Keyboard: focused inputs on each form are not hidden behind the keyboard (see §12).
- [ ] Status bar legible in light and dark appearance.

---

## 11. App Store Compliance Checklist (pre-submission sweep)

- [ ] **Placeholder text** — no "REPLACE_ME", "TODO", "Coming soon" (except intentionally-shipped disabled toggles), or stub copy in user-facing UI.
- [ ] **Lorem ipsum** — none anywhere in shipped screens.
- [ ] **Debug UI** — no debug menus, dev-only buttons, or verbose console output visible to users.
- [ ] **Test accounts** — no hardcoded test credentials in the build; provide a controlled reviewer account via App Store Connect review notes, not committed data.
- [ ] **Demo / seed data** — no seed/demo records surfaced to real users.
- [ ] **Broken links** — every external link (support, privacy, terms) resolves.
- [ ] **Screenshots** — present for all required device sizes; reflect the real UI.
- [ ] **Privacy policy** — public URL live and linked in App Store Connect + in-app where required.
- [ ] **Terms of Service** — public URL live and linked.
- [ ] **Support URL** — live and monitored.
- [ ] **Export compliance** — QuickServe uses only standard encryption (HTTPS/TLS); answer the encryption question accordingly (typically "exempt"). Confirm each release.
- [ ] **Encryption questionnaire** — completed consistently with the export-compliance answer.
- [ ] **Age rating questionnaire** — completed; rating reflects actual content (no objectionable/user-generated-content surprises).

---

## 12. Findings from Task 3 (documented, not code-changed)

Four iOS concerns were inspected during Task 3. None is a **statically-provable** defect, and each fix would be a device-verifiable, cross-platform, or new-dependency change. Each is therefore **Deferred by design because not statically provable** — verify on device and address per the guidance below.

1. **`file://` photo upload** — `src/lib/photos.ts:62` reads the picked image via `await (await fetch(input.uri)).arrayBuffer()`. This pattern is documented as unreliable for iOS local `file://` URIs. A robust fix requires **`expo-file-system`** (a new dependency), which Slice 37's guardrail forbids adding. *Recommendation:* on device, verify provider/customer photo upload actually succeeds on iOS; if it fails, switch the read to `expo-file-system` (`readAsStringAsync` base64 → bytes) or a verified `FormData` upload. **Deferred by design because not statically provable.**

2. **Safe Area** — 40 screens wrap individually with `SafeAreaView` / `useSafeAreaInsets` (`react-native-safe-area-context`), but there is **no root `SafeAreaProvider`** in `src/app/_layout.tsx`. The library provides a fallback, so this is not provably broken. *Recommendation:* add `SafeAreaProvider` at the root and verify notch / Dynamic Island / home-indicator insets on device. **Deferred by design because not statically provable.**

3. **KeyboardAvoidingView** — input forms (`booking/address.tsx`, `booking/notes.tsx`, `booking/schedule.tsx`, `saved-addresses.tsx`, `(onboarding)/register.tsx`, `(customer)/search.tsx`) use `ScrollView` with `keyboardShouldPersistTaps="handled"`, but there is **no `KeyboardAvoidingView` anywhere** in the app. Android's default `adjustResize` masks this; on iOS a bottom input *may* be covered by the keyboard. Whether any specific input is obscured depends on layout and cannot be proven statically; a blanket addition risks Android layout. *Recommendation:* QA each form's bottom inputs on device; add `KeyboardAvoidingView` (`behavior="padding"` on iOS) only where an input is actually covered. **Deferred by design because not statically provable.**

4. **Status Bar** — no `StatusBar` (`expo-status-bar`) component is rendered; the app relies on the system default plus `userInterfaceStyle: "automatic"` and per-screen `SafeAreaView`. Not a provable defect. *Recommendation:* verify status-bar contrast in light/dark on device; optionally add `<StatusBar style="auto" />` at the root as an enhancement. **Deferred by design because not statically provable.**

---

## 13. Future Improvements (intentionally deferred only)

Only items deliberately deferred by this slice — no invented work:

- [ ] Resolve the four Task-3 findings above after on-device QA (§12).
- [ ] Fill the credentials TODOs (§2): `eas.projectId` (also unblocks iOS push tokens, §3), Apple Team ID, APNs key, Sentry org/project.
- [ ] Go live on Universal Links: real domain + hosted AASA + Associated Domains capability, replacing the placeholder scaffold (§9).
- [ ] Author the app-level Privacy Manifest if/when Apple flags required-reason APIs (§8).
