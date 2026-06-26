# QuickServe — iOS Store Readiness Checklist

**Purpose:** Operator-actionable checklist for releasing QuickServe to the Apple App Store.
Work top-to-bottom. Items marked **[EAS]** require the EAS CLI (`npm install -g eas-cli`).

**Companion docs (read before starting):**
- Backend setup, migrations, Edge Functions, secrets → [`backend-readiness.md`](./backend-readiness.md)
- Manual E2E test scripts → [`qa-e2e.md`](./qa-e2e.md)
- Push credentials and dev-build requirement (APNs) → [`../../docs/superpowers/verification/slice-15-push.md`](../superpowers/verification/slice-15-push.md)
- M-Pesa / Daraja credentials and sandbox verification → [`../../docs/superpowers/verification/slice-13-daraja.md`](../superpowers/verification/slice-13-daraja.md)

**Key config values from `app.json` / `eas.json`:**

| Field | Value |
|---|---|
| Bundle identifier | `com.quickserve.app` |
| Version | `1.0.0` |
| Build number | `1` (`ios.buildNumber` in `app.json`) |
| runtimeVersion policy | `appVersion` |
| appVersionSource | `local` (set in `eas.json`) |
| EAS project ID | **(empty — must be set before first build; see item 1)** |

---

## 1. Apple Developer Account

- [ ] Enroll in the **Apple Developer Program** at [developer.apple.com/enroll](https://developer.apple.com/enroll). Paid membership (USD 99/year) is required to distribute on TestFlight or the App Store.
- [ ] Confirm account type: **Individual** (sole operator) or **Organization** (company — requires a D-U-N-S number; allow 2–5 business days for verification).
- [ ] Set up team roles if working with others: Account Holder, Admin, App Manager, or Developer as appropriate.
- [ ] Sign in to [App Store Connect](https://appstoreconnect.apple.com) and verify the account is active.

---

## 2. EAS Project Initialisation

- [ ] Run `eas login` to authenticate with your Expo account.
- [ ] Run `eas init` in the project root. This sets `extra.eas.projectId` in `app.json`.
  ```bash
  eas init
  ```
  Without a real `projectId`, `getExpoPushTokenAsync` may return a dev-only token that will not deliver on physical devices.
- [ ] Verify `app.json` now contains a non-empty `"projectId"` string under `expo.extra.eas`.
- [ ] Commit the updated `app.json` to source control.

---

## 3. App Store Connect — Create the App Record

- [ ] In App Store Connect go to **My Apps → +** and choose **New App**.
- [ ] Fill in:
  - **Platform:** iOS
  - **Name:** QuickServe
  - **Primary language:** English (or pilot locale)
  - **Bundle ID:** **`com.quickserve.app`** — must match `app.json ios.bundleIdentifier` exactly. Register the App ID first (see section 4) if it does not appear in the dropdown.
  - **SKU:** A unique internal identifier (e.g. `quickserve-001`).
- [ ] Confirm the app record is created and appears under My Apps.

---

## 4. Bundle Identifier and App ID

- [ ] Sign in to the [Apple Developer portal](https://developer.apple.com/account/resources/identifiers/list).
- [ ] Under **Certificates, Identifiers & Profiles → Identifiers**, register a new App ID:
  - Type: **App**
  - Bundle ID: **Explicit** — enter `com.quickserve.app` exactly.
- [ ] Enable the **Push Notifications** capability on the App ID (required for Expo push relay via APNs).
- [ ] Save. The registered App ID will now appear in App Store Connect when creating a new app record.

---

## 5. EAS-Managed Certificates and Provisioning Profiles

EAS can manage all iOS credentials automatically (recommended for Expo projects).

```bash
eas credentials
# Select: iOS → <your Apple account> → Manage credentials
```

- [ ] EAS generates or imports the **Distribution Certificate** and **Provisioning Profile** for `com.quickserve.app`.
- [ ] An **APNs Auth Key** (`.p8`) is generated and registered with EAS for push notification delivery (see section 8 for push details).
- [ ] Verify credentials are saved: `eas credentials` shows a distribution cert and provisioning profile for iOS.
- [ ] If building for development/TestFlight, EAS will also create an **Ad Hoc** or **Development** provisioning profile automatically.

---

## 6. EAS iOS Builds

### Development build (dev client)

Builds a development client for physical iPhone testing. `ios.simulator: false` in `eas.json`
means only real-device builds are produced.

```bash
eas build -p ios --profile development
```

- [ ] Build completes on EAS servers.
- [ ] Install on a physical iPhone via the EAS install link (device must be registered in the provisioning profile if using Ad Hoc distribution, or join TestFlight internal testing).
- [ ] App opens and dev client launcher appears.

### Preview build (internal distribution)

```bash
eas build -p ios --profile preview
```

- [ ] Build completes.
- [ ] Distribute to internal testers via the EAS internal distribution link.

### Production build (App Store / TestFlight)

The production profile enables `autoIncrement: true` — the build number increments automatically.
Current starting build number in `app.json`: **1**.

```bash
eas build -p ios --profile production
```

- [ ] Build completes without errors.
- [ ] Download the `.ipa` artifact from the EAS dashboard.
- [ ] Confirm build number in the EAS metadata is **≥ 1** and increments on subsequent production builds.

---

## 7. TestFlight Setup

### Upload the build

- [ ] Upload the production `.ipa` to App Store Connect via:
  ```bash
  eas submit -p ios --profile production
  ```
  Or use **Transporter** (macOS app) to manually upload the `.ipa`.
- [ ] In App Store Connect go to **TestFlight** and confirm the build appears (may take a few minutes to process).
- [ ] Answer the **Export compliance** question: QuickServe uses standard HTTPS encryption provided by Supabase (not custom encryption algorithms). Select **"No"** for proprietary encryption unless you have added custom crypto.

### Internal testers

- [ ] Add internal testers under **TestFlight → Internal Testing** (up to 100 Apple Developer account members; no Beta App Review required).
- [ ] Testers will receive an email invitation to install via TestFlight.
- [ ] Confirm at least one internal tester can install and launch the build.

### External testers (Beta App Review)

- [ ] Create an **external testing group** under **TestFlight → External Testing**.
- [ ] Add tester email addresses or share the public link.
- [ ] Submit the build for **Beta App Review** (Apple review required; typically 1–2 business days).
- [ ] Once approved, external testers can install via the TestFlight link.

---

## 8. iOS Permissions Review

All iOS permission strings used by QuickServe must be accurate and justified. Apple will reject
the app if an unused permission is declared or the description is vague.

| Permission | Usage description in `app.json` | Status |
|---|---|---|
| Photo library | `"QuickServe needs photo access to attach job photos."` (set via `expo-image-picker photosPermission`) | Required — do not remove |
| Notifications | Standard Expo notifications prompt copy | Required — do not remove |
| Camera | **(removed in Slice 17 T1 — NOT requested)** | Confirm absent |

- [ ] Confirm `info.plist` (generated by EAS) contains `NSPhotoLibraryUsageDescription` with the value from `app.json`: `"QuickServe needs photo access to attach job photos."`.
- [ ] Confirm **no** `NSCameraUsageDescription` key is present (camera permission was removed in Slice 17 T1).
- [ ] Confirm the notifications permission prompt copy is accurate and matches the actual notification types fired (booking status, payment, chat message — see [`slice-15-push.md`](../superpowers/verification/slice-15-push.md) push events table).
- [ ] No other unused permissions are declared in the built `.ipa`. Run `eas build --inspect` or review the Xcode build log if in doubt.

---

## 9. APNs Push Credentials

Push notifications on iOS require APNs (Apple Push Notification service) credentials
registered with EAS. Expo Push relay forwards to APNs; APNs delivers to devices.

- [ ] Generate an **APNs Auth Key** (`.p8`) in the Apple Developer portal:
  - Certificates, Identifiers & Profiles → Keys → Create a new key.
  - Enable **Apple Push Notifications service (APNs)**.
  - Download the `.p8` file (you can only download it once).
- [ ] Register the APNs key with EAS:
  ```bash
  eas credentials
  # Select: iOS → <account> → Push Notifications → Add APNs Key
  ```
- [ ] Confirm the key is saved: `eas credentials` shows an APNs key for the iOS profile.
- [ ] Rebuild the production `.ipa` after registering the APNs key.
- [ ] Full push verification steps: see [`slice-15-push.md`](../superpowers/verification/slice-15-push.md) — Dev-Build Verification Checklist, specifically the 8 push events table.

> **Important:** Push notifications require a **dev build, TestFlight build, or production build**, NOT Expo Go.
> The Expo Go app cannot reliably request or receive remote push tokens in the way needed
> for production delivery. Use `eas build --profile development` and install on a real iPhone
> before running push verification.

---

## 10. M-Pesa / Daraja Test Notes

Payment integration is server-side only. The React Native client is mode-agnostic —
it calls `mpesa-stk-push` and polls the result regardless of `MPESA_MODE`.

| Mode | When to use |
|---|---|
| `mock` | Default. No Daraja credentials needed. STK Push is stubbed; `payment_attempts` row created immediately as `pending`. Safe for UI/UX and TestFlight testing. |
| `sandbox` | Pre-launch. Requires all Daraja secrets. Sends a real STK Push to Safaricom sandbox test MSISDNs. |
| `live` | Production only. Real money moves. |

- [ ] Confirm `MPESA_MODE=mock` is set for initial iOS TestFlight testing — run scenarios C-11 and C-13 in [`qa-e2e.md`](./qa-e2e.md).
- [ ] Before real-payment testing: set `MPESA_MODE=sandbox` and configure all Daraja secrets per [`slice-13-daraja.md`](../superpowers/verification/slice-13-daraja.md) — Required Supabase Secrets table.
- [ ] Confirm the Daraja callback URL includes `?token=<MPESA_CALLBACK_SECRET>` per [`slice-13-daraja.md`](../superpowers/verification/slice-13-daraja.md) — Callback Security Guidance section.
- [ ] Back-end verification checklist: [`backend-readiness.md § 6`](./backend-readiness.md) (Daraja / M-Pesa Sandbox).

---

## 11. iPhone QA Checklist (Physical Device)

Run these checks on a **physical iPhone** running the dev or TestFlight build before
promoting any build to external testing or App Store review.

**Prerequisite:** Complete [`backend-readiness.md`](./backend-readiness.md) fully before running QA.

### Permissions

- [ ] Launch the app fresh (first install). Confirm the OS notification permission prompt appears.
- [ ] Trigger photo selection (booking step 3, "Pick photo from library"). Confirm the iOS media library permission dialog appears with the text `"QuickServe needs photo access to attach job photos."`.
- [ ] Deny a permission and confirm the app degrades gracefully (no crash, clear user guidance).
- [ ] Confirm **no** camera permission dialog appears anywhere in the app.

### Core Flows (run the full [`qa-e2e.md`](./qa-e2e.md) scripts)

- [ ] **C-01 to C-04** — customer sign-up → booking creation end-to-end.
- [ ] **C-07** — photo attach during booking (requires media permission grant).
- [ ] **C-11** — M-Pesa STK Push in mock mode; `payment_attempts` row appears as `pending`.
- [ ] **C-16** — push notification arrives on device (dev/TestFlight build only); tap deep-links to correct booking.
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
- [ ] All scenarios passing before submitting to App Store review.
- [ ] Any failures logged as issues with device model + iOS version noted.

---

## 12. App Store Review — Risks and Mitigations

Apple's review process is strict. The items below represent the most likely rejection
risks for QuickServe and what to do about each.

### Risk 1 — Demo account not provided

Apple reviewers cannot log in without a working test account. A rejection for missing demo
credentials is one of the most common.

- [ ] Create a dedicated **reviewer demo customer account** (email + password visible to the reviewer).
- [ ] Create a dedicated **reviewer demo provider account** (to demonstrate the provider-side flows).
- [ ] Supply these credentials in the **App Review Information → Demo Account** field in App Store Connect.
- [ ] Ensure the demo accounts have pre-seeded bookings so reviewers can see the full lifecycle without needing to wait for a real booking to be placed and assigned.

### Risk 2 — M-Pesa payment policy

Apple may flag in-app payment flows that are not routed through Apple's in-app purchase (IAP) system. QuickServe uses M-Pesa, which is a real-world service payment (like a taxi fare or a plumber's invoice), NOT a digital goods or content purchase — this class of payment is explicitly permitted without IAP.

- [ ] In the **App Store Connect → App Information → Notes for Reviewers** field, add a clear explanation: *"QuickServe facilitates on-demand physical home services (cleaning, plumbing, electrical, etc.). Payments are real-world service transactions processed via M-Pesa (a Kenyan mobile money network) — not digital goods, subscriptions, or in-app content. This payment category does not require Apple IAP per the App Review Guidelines."*
- [ ] Ensure the booking and payment flow is fully functional for reviewers using the demo account.

### Risk 3 — Permission usage not clearly justified

Apple requires that every declared permission has a usage description explaining WHY it is needed, in plain language. Vague strings like "for app functionality" are rejected.

- [ ] Photo library description (`"QuickServe needs photo access to attach job photos."`) is already set in `app.json`. Confirm this exact string appears in the built `.ipa`.
- [ ] Notifications description explains the types of events (booking status updates, payment confirmations, chat messages).
- [ ] Confirm no unused permission strings are present (camera was removed in Slice 17 T1).

### Risk 4 — Broken or placeholder flows

Apple rejects builds with broken navigation, placeholder screens, or "coming soon" text.

- [ ] All 19 service categories on the Home screen must navigate to a working booking flow (not a placeholder).
- [ ] All status screens (pending approval, rejected provider) must be functional and not show debug text.
- [ ] Admin routes must require login and role check — confirm a customer account cannot reach `/admin/*`.

### Risk 5 — App Privacy questionnaire (data collected)

- [ ] Complete the **App Privacy** questionnaire in App Store Connect:
  - **Contact info:** email address (account registration), phone number (account + M-Pesa payment).
  - **User content:** photos (job evidence), messages (in-app booking chat).
  - **Identifiers:** User ID (Supabase UUID linked to profile).
  - **Financial info:** payment method references stored server-side (Daraja checkout IDs; no raw card numbers).
  - **Usage data:** not collected by the app (no analytics SDK in the current build).
  - **Diagnostics:** not collected.
- [ ] Under **Data use**, mark contact info and user content as **Used for App Functionality** (not advertising/analytics).
- [ ] Under **Data linked to you**, link email, phone, photos, and messages to the user's identity.
- [ ] Under **Tracking**, select **No** (no cross-app tracking).

### Risk 6 — Export compliance

- [ ] In TestFlight export compliance: QuickServe uses standard HTTPS (TLS) provided by Supabase. No proprietary encryption. Select **"No"** for custom encryption.
- [ ] For the production App Store submission, answer the same in **App Store Connect → App Information → Encryption**.

### Summary of rejection risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Missing demo account | High | Pre-seed reviewer accounts (see Risk 1) |
| M-Pesa flagged as non-IAP payment | Medium | Add reviewer notes explaining real-world service payment exemption |
| Vague or incorrect permission strings | Medium | Verify exact strings are set in `app.json` and absent for camera |
| Broken flows / placeholder screens | Low (pilot is feature-complete) | Run full QA checklist before submission |
| App Privacy incomplete | Medium | Complete the questionnaire carefully (see Risk 5) |
| Export compliance error | Low | Answer "No" to custom encryption |

---

## 13. Store Listing Requirements

All items below must be complete before submitting for App Store review.

- [ ] **App icon** — 1024 × 1024 px PNG, no transparency, no rounded corners (iOS applies the mask). Source: `assets/expo.icon` (referenced in `app.json ios.icon`). Verify the file exists and is the correct dimensions.
- [ ] **Screenshots** — required for each device class you support: **6.9-inch** (iPhone 16 Pro Max), **6.5-inch** (iPhone 14 Plus), and optionally iPad. Minimum 1 screenshot per device class; recommended 4–6. Cover: Home screen, booking flow, payment screen, provider job view.
- [ ] **App preview video** — optional; 15–30 second MP4. Not required for pilot.
- [ ] **App name** — **QuickServe** (max 30 characters).
- [ ] **Subtitle** — up to 30 characters. Example: "On-demand home services."
- [ ] **Description** — up to 4 000 characters. Cover key services, booking flow, and M-Pesa payment.
- [ ] **Keywords** — up to 100 characters total. Example: `home services,cleaning,plumbing,mpesa,on demand`.
- [ ] **Support URL** — an active URL for user support (required).
- [ ] **Marketing URL** — optional.
- [ ] **Privacy Policy URL** — **required** by Apple for any app that collects user data. QuickServe collects email, phone, photos, and messages. The privacy policy URL must be hosted publicly and linked in App Store Connect. Cross-reference your legal-support.md if present.
- [ ] **Category** — Primary: **Lifestyle** or **Utilities**. Secondary: optional.
- [ ] **Age rating** — set via the Content Rating questionnaire. Expected: **4+** (no mature content), but confirm given payment flows involving real money.

---

## 14. Promote to App Store

- [ ] All TestFlight internal testers sign off on the QA checklist.
- [ ] All TestFlight external testers sign off (Beta App Review passed).
- [ ] Store listing items (section 13) fully completed.
- [ ] APNs credentials configured and push delivery verified on a real iPhone (section 9).
- [ ] App Privacy questionnaire complete (section 12, Risk 5).
- [ ] Demo accounts pre-seeded for Apple reviewers (section 12, Risk 1).
- [ ] `MPESA_MODE` set appropriately for the release target.
- [ ] Build number incremented (handled automatically by `autoIncrement: true` in `eas.json`).
- [ ] Submit for **App Store Review** in App Store Connect (typically 1–3 business days for first submission; can be faster for updates).
- [ ] Monitor **Crashes and Feedback** in App Store Connect after rollout.
