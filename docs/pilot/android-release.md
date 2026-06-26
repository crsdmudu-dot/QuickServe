# QuickServe — Android Store Readiness Checklist

**Purpose:** Operator-actionable checklist for releasing QuickServe to the Google Play Store.
Work top-to-bottom. Items marked **[EAS]** require the EAS CLI (`npm install -g eas-cli`).

**Companion docs (read before starting):**
- Backend setup, migrations, Edge Functions, secrets → [`backend-readiness.md`](./backend-readiness.md)
- Manual E2E test scripts → [`qa-e2e.md`](./qa-e2e.md)
- Push credentials and dev-build requirement → [`../../docs/superpowers/verification/slice-15-push.md`](../superpowers/verification/slice-15-push.md)
- M-Pesa / Daraja credentials and sandbox verification → [`../../docs/superpowers/verification/slice-13-daraja.md`](../superpowers/verification/slice-13-daraja.md)

**Key config values from `app.json` / `eas.json`:**

| Field | Value |
|---|---|
| Package name | `com.quickserve.app` |
| Version | `1.0.0` |
| versionCode | `1` |
| runtimeVersion policy | `appVersion` |
| appVersionSource | `local` (set in `eas.json`) |
| EAS project ID | **(empty — must be set before first build; see item 1)** |

---

## 1. EAS Project Initialisation

- [ ] Run `eas login` to authenticate with your Expo account.
- [ ] Run `eas init` in the project root. This sets `extra.eas.projectId` in `app.json`.
  ```bash
  eas init
  ```
  Without a real `projectId`, `getExpoPushTokenAsync` returns a dev-only token that will not deliver push notifications on physical devices (see the push guide for details).
- [ ] Verify `app.json` now contains a non-empty `"projectId"` string under `expo.extra.eas`.
- [ ] Commit the updated `app.json` to source control.

---

## 2. Development Build (dev client)

The development profile builds an APK with the Expo dev client embedded. Use this for local
testing and push notification verification. It uses the `development` channel.

```bash
eas build -p android --profile development
```

- [ ] Build completes without errors on EAS.
- [ ] Download the resulting APK from the EAS dashboard and install on at least one physical Android device (`adb install <file>.apk` or the EAS install link).
- [ ] App opens and the dev client launcher appears.
- [ ] Push token registers on device (verify a row appears in `public.device_tokens` in Supabase); see [`slice-15-push.md`](../superpowers/verification/slice-15-push.md) — Expo Go cannot reliably receive push notifications on Android.

---

## 3. Preview Build (internal APK for testers)

The preview profile produces an APK suitable for sideloading to a wider tester group. It uses
the `preview` channel and `distribution: internal`.

```bash
eas build -p android --profile preview
```

- [ ] Build completes without errors.
- [ ] Download APK from EAS dashboard.
- [ ] Share the install link or APK file with internal testers; testers must enable "Install from unknown sources" on their device settings.
- [ ] At least one tester successfully installs and signs in.

---

## 4. APK vs AAB — Which Build Artifact Goes Where

| Profile | Artifact | Purpose |
|---|---|---|
| `development` | APK (per `eas.json: android.buildType: "apk"`) | Expo dev client; sideload to dev devices |
| `preview` | APK (per `eas.json: android.buildType: "apk"`) | Internal tester distribution; sideload |
| `production` | AAB (default when `buildType` is not set) | Google Play upload |

- [ ] Confirm you are using an **APK** for sideloading (preview/development builds).
- [ ] Confirm you will upload an **AAB** to the Play Console (production build only).

---

## 5. Production Build (AAB for Play Store)

The production profile enables `autoIncrement: true` which will bump `versionCode` automatically.
Current starting versionCode in `app.json`: **1**.

```bash
eas build -p android --profile production
```

- [ ] Build completes without errors.
- [ ] Download the `.aab` artifact from the EAS dashboard.
- [ ] Confirm the versionCode in the build metadata is **≥ 1** and increments on subsequent builds (controlled by `autoIncrement: true` in `eas.json`).

---

## 6. Google Play Console Setup

- [ ] Sign in to [Google Play Console](https://play.google.com/console) with the QuickServe developer account.
- [ ] Create a new app:
  - App name: **QuickServe**
  - Default language: English (or primary pilot locale)
  - App or game: **App**
  - Free or paid: as applicable
- [ ] Set the package name to **`com.quickserve.app`** (this is permanent and must match `app.json`).
- [ ] Under **Setup → App signing**: opt in to **Play App Signing** (Google manages the upload key). If using EAS-managed signing, EAS will generate the upload keystore; Play manages the distribution key.
  ```bash
  eas credentials   # generates / manages the upload keystore
  ```
- [ ] Confirm the upload certificate SHA-1 fingerprint is registered in the Play Console under App Signing.

---

## 7. Internal Testing Track

- [ ] In the Play Console go to **Testing → Internal testing**.
- [ ] Create the internal testing track if it does not exist.
- [ ] Upload the production AAB from step 5 to the internal track.
- [ ] Add tester email addresses (or share the opt-in link) under **Testers**.
- [ ] Submit the release for the internal track — no review required; testers can install immediately via the Play Store.
- [ ] Each tester joins via the opt-in link and installs through the Play Store app.

---

## 8. Store Listing Requirements

All items below must be complete before promoting to a closed/open testing track or production.

### App Assets

- [ ] **App icon** — 512 × 512 px PNG with transparency; no rounded corners (Play applies the mask). Source: `assets/images/icon.png` (current icon in project).
- [ ] **Feature graphic** — 1024 × 500 px JPG/PNG; shown at the top of the store listing.
- [ ] **Screenshots** — minimum 2, maximum 8; phone screenshots at least 320 px on the short side. Recommended: 4–6 screenshots covering Home, booking flow, payment, and provider view.
- [ ] **Adaptive icon** — already configured in `app.json` (`adaptiveIcon.foregroundImage`, `adaptiveIcon.backgroundImage`, `adaptiveIcon.monochromeImage`, `backgroundColor: "#E6F4FE"`). Verify the icon renders correctly in the Play Console preview.

### Store Listing Text

- [ ] **Short description** — up to 80 characters. Example: "On-demand home services, delivered with care."
- [ ] **Full description** — up to 4 000 characters. Cover key services (House Cleaning, Plumbing, Electrical, AC Repair, etc.), how the booking flow works, and the M-Pesa payment option.
- [ ] **Category** — set to **House & Home** (or **Lifestyle**).
- [ ] **Contact email** — an active support email address.
- [ ] **Privacy Policy URL** — required by Play; must be hosted at a public URL. Create / link the legal page before submitting. Cross-reference your legal-support.md if present.

### Policy & Compliance Forms

- [ ] **Data safety form** — complete the Data safety questionnaire in the Play Console:
  - Data collected: email address (account), phone number (account + M-Pesa), location (service address, not GPS-tracked), photos (job evidence), messages (chat).
  - Data shared: service provider receives address, photos, and messages relevant to the booking.
  - Data encryption: Supabase enforces TLS in transit; Postgres at-rest encryption at the project level.
  - No data sold to third parties.
- [ ] **Content rating questionnaire** — complete in the Play Console under **Policy → App content → Content rating**. Expected rating: Everyone or Everyone 10+ (no violent/adult content).
- [ ] **Target audience** — set to **18+** (financial transactions via M-Pesa).
- [ ] **App access** — if the app requires login, provide a demo customer account and a demo provider account for Play reviewers: email + password.

---

## 9. Android FCM Push Credentials

Push notifications on Android require FCM (Firebase Cloud Messaging) credentials registered
with EAS. Expo Push relay forwards to FCM; FCM delivers to devices.

- [ ] In the [Firebase Console](https://console.firebase.google.com), create a project for QuickServe (or use an existing one).
- [ ] Add an Android app with package name **`com.quickserve.app`**.
- [ ] Download the `google-services.json` file (not committed to source control; referenced by EAS builds).
- [ ] Register FCM credentials with EAS:
  ```bash
  eas credentials
  # Select: Android → Production → FCM API Key (or FCM V1 / Service Account JSON)
  ```
- [ ] Verify credentials are saved: `eas credentials` shows FCM credentials under the Android production profile.
- [ ] Rebuild the production APK/AAB after registering FCM credentials so the credentials are embedded.
- [ ] Full push verification steps: see [`slice-15-push.md`](../superpowers/verification/slice-15-push.md) — Dev-Build Verification Checklist, specifically the 8 push events table.

> **Important:** Push notifications require a **dev build or EAS build**, NOT Expo Go.
> Expo Go on Android cannot reliably receive remote push tokens. Install the dev-profile APK
> on your test device before running push verification.

---

## 10. M-Pesa / Daraja Test Notes

Payment integration uses the server-side `MPESA_MODE` secret set in Supabase Edge Functions.
The React Native client is mode-agnostic.

| Mode | When to use |
|---|---|
| `mock` | Default. No Daraja credentials needed. STK Push is stubbed; `payment_attempts` row created immediately as `pending`. Safe for UI/UX testing with zero credentials. |
| `sandbox` | Pre-launch. Requires all Daraja secrets. Sends a real STK Push to Safaricom sandbox test MSISDNs. |
| `live` | Production only. Real money moves. |

- [ ] Confirm `MPESA_MODE=mock` is set for initial Android testing — run scenarios C-11 and C-13 in [`qa-e2e.md`](./qa-e2e.md).
- [ ] Before real-payment testing: set `MPESA_MODE=sandbox` and configure all Daraja secrets per [`slice-13-daraja.md`](../superpowers/verification/slice-13-daraja.md) — Required Supabase Secrets table.
- [ ] Confirm the Daraja callback URL includes `?token=<MPESA_CALLBACK_SECRET>` per [`slice-13-daraja.md`](../superpowers/verification/slice-13-daraja.md) — Callback Security Guidance section.
- [ ] Back-end verification checklist: [`backend-readiness.md § 6`](./backend-readiness.md) (Daraja / M-Pesa Sandbox).

---

## 11. Android QA Checklist (Physical Device)

Run these checks on a **physical Android device** running the dev or preview APK before
promoting any build to a wider audience.

**Prerequisite:** Complete [`backend-readiness.md`](./backend-readiness.md) fully before running QA.

### Permissions

- [ ] Launch the app fresh (first install). Confirm the OS notification permission prompt appears.
- [ ] Trigger photo selection (booking step 3, "Pick photo from library"). Confirm the system media library permission dialog appears on first use.
- [ ] Deny a permission and confirm the app degrades gracefully (no crash).

### Core Flows (run the full [`qa-e2e.md`](./qa-e2e.md) scripts)

- [ ] **C-01 to C-04** — customer sign-up → booking creation end-to-end.
- [ ] **C-07** — photo attach during booking (requires media permission grant).
- [ ] **C-11** — M-Pesa STK Push in mock mode; `payment_attempts` row appears as `pending`.
- [ ] **C-16** — push notification arrives on device (dev build only); tap deep-links to correct booking.
- [ ] **P-04 to P-06** — provider job lifecycle: on_the_way → in_progress → completed.
- [ ] **P-08 / P-09** — provider photo upload (before + after photo).
- [ ] **A-06 / A-07** — admin assigns provider (manual and in-app modes).
- [ ] **Regression sweep** — run the full regression checklist at the bottom of [`qa-e2e.md`](./qa-e2e.md).

### Push Deep-Links

- [ ] Trigger each of the 8 push events in [`slice-15-push.md`](../superpowers/verification/slice-15-push.md) (push events table) and confirm:
  - Notification text is correct for the event type.
  - Tapping the notification navigates to the correct screen.

### Record Results

- [ ] Record Pass/Fail for each scenario in a copy of [`qa-e2e.md`](./qa-e2e.md).
- [ ] All scenarios passing before promoting the build.
- [ ] Any failures logged as issues with device model + Android version noted.

---

## 12. Promote to Production

- [ ] All internal testers sign off on the QA checklist.
- [ ] Store listing items (section 8) fully completed.
- [ ] FCM credentials configured and push delivery verified (section 9).
- [ ] `MPESA_MODE` set appropriately for the release target (sandbox or live per section 10).
- [ ] versionCode incremented (handled automatically by `autoIncrement: true` in `eas.json`).
- [ ] Upload production AAB to the Play Console under **Production** track.
- [ ] Submit for Play review (typically 1–3 business days).
- [ ] Monitor **Android vitals** and crash reporting after rollout.
