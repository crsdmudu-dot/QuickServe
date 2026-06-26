# Crash Logging — QuickServe Pilot

## 1. Current State (Pilot Day 1)

QuickServe ships with a lightweight React **ErrorBoundary** component located at
`src/components/error-boundary.tsx`. It is wired into `_layout` and wraps the entire app tree.

### What it does

- Implements `getDerivedStateFromError` to detect any render-phase exception in the React tree.
- Renders a friendly fallback screen ("Something went wrong / Try again") instead of a white crash.
- Calls `console.error('ErrorBoundary caught:', error)` inside `componentDidCatch`, writing the
  error and stack to the Metro / device console.
- Provides a **"Try again"** button that calls `this.setState({ hasError: false })`, resetting the
  boundary so the user can continue without restarting the app.

### What it does NOT do (yet)

- Does **not** send errors to any external service (no Sentry, no Crashlytics).
- Does **not** capture JavaScript errors that occur outside the React render tree
  (e.g. async/await unhandled rejections, native module crashes).
- Does **not** capture native (C++/ObjC/Java) crashes.

### Implications for the pilot

During the pilot, crash information is available only in:

1. **Metro console** (terminal running `npx expo start`) — visible to the developer running the
   build session.
2. **Android Logcat** (`adb logcat`) — all `console.error` output appears under the React Native
   tag.
3. **Xcode console** — same on iOS.
4. **Tester manual reports** — testers must describe what happened and which screen they were on.

Pilot testers must therefore report crashes manually (see Section 5).

---

## 2. Sentry Integration — Checklist Only (NOT installed this slice)

Sentry (`@sentry/react-native`) is the **recommended next step** for structured crash reporting.
**Do not install or configure Sentry during Slice 17.** Capture the steps below as a pre-launch
checklist for the slice that follows the pilot.

### Pre-conditions

- [ ] `@sentry/react-native` added to `package.json` and installed.
- [ ] Sentry Expo config plugin added to `app.config.ts` (or `app.json`).
- [ ] A Sentry project created at sentry.io; DSN copied.
- [ ] DSN stored as an **EAS secret** (`eas secret:create --name SENTRY_DSN --value <dsn>`);
      **never committed to the repo**.
- [ ] Source maps uploaded via EAS build hook (`sentry-expo` or `@sentry/react-native` EAS plugin)
      so stack traces resolve to TypeScript source lines.

### Initialization

- [ ] `Sentry.init({ dsn: process.env.SENTRY_DSN, environment: 'pilot' })` called at the top of
      `app/_layout.tsx`, before the navigation tree renders.
- [ ] `Sentry.wrap(App)` (or the Expo Router equivalent) used to capture navigation breadcrumbs.

### Wiring into ErrorBoundary

- [ ] Inside `componentDidCatch(error, info)` in `src/components/error-boundary.tsx`, add:
  ```ts
  Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  ```
- [ ] Import guard added so the call is a no-op when Sentry is not initialized
      (avoid crashing in dev or test without a DSN).

### Global handler

- [ ] `Sentry.setGlobalErrorHandler` (or React Native's `ErrorUtils.setGlobalHandler`) wired to
      catch unhandled promise rejections and non-render JS exceptions.
- [ ] Confirm the global handler does **not** swallow errors in development (re-throws or logs).

### Verification

- [ ] Trigger a test exception in development; confirm it appears in the Sentry dashboard.
- [ ] Confirm source map resolves to the correct TypeScript file and line.
- [ ] Confirm no PII appears in the Sentry event payload (see Section 4).

---

## 3. What to Log

When Sentry (or any future crash service) is enabled, each error event should include:

| Field | Source | Example |
|-------|--------|---------|
| Error type | `error.name` | `TypeError` |
| Error message | `error.message` | `Cannot read property 'id' of undefined` |
| Stack trace | `error.stack` / source-mapped | `BookingReview.tsx:42` |
| Current screen / route | Expo Router `usePathname()` or Sentry breadcrumbs | `/customer/booking/review` |
| App version | `expo-constants` `expoConfig.version` | `1.0.0` |
| Build number | `expoConfig.ios.buildNumber` / `android.versionCode` | `5` |
| User role (anonymized) | Supabase session `user_metadata.role` | `"customer"` / `"provider"` / `"admin"` |
| Platform | `Platform.OS` | `android` / `ios` |
| OS version | `Platform.Version` | `"14.4"` |

**User ID in Sentry:** use `Sentry.setUser({ id: userId })` — the Supabase UUID only, never the
email or phone number.

---

## 4. What NOT to Log

The following data must **never** appear in crash logs, error payloads, or Sentry events:

| Category | Examples |
|----------|---------|
| Phone numbers | User phone, M-Pesa paybill numbers |
| Payment details | M-Pesa transaction codes, amounts, confirmation messages |
| Message contents | Full text of chat messages between users |
| Authentication tokens | Supabase JWT, refresh tokens, API keys |
| Full PII | Full name, national ID, exact address of a booking |
| Push tokens | Expo push token, FCM/APNs device tokens |

### Scrubbing strategy

- Apply Sentry's **PII scrubbing** feature: add patterns for Kenyan phone formats (`07\d{8}`,
  `254\d{9}`) in the Sentry project settings → Data Scrubbing.
- Do not log raw `user` objects or Supabase session objects — extract only the fields listed in
  Section 3.
- When logging booking-related errors, log the booking UUID only, not address or user details.

---

## 5. Privacy-Safe Error Reporting

### Opt-in consideration

For the pilot, error reporting via the `ErrorBoundary` `console.error` is implicit and does not
leave the device (no external service). When Sentry is added post-pilot:

- Add a one-line disclosure in the Privacy Policy: "We collect anonymous crash reports to improve
  app stability. No personal information is included."
- Consider an opt-out toggle in Profile → Settings if the user base or local regulation requires it
  (Kenya Data Protection Act 2019).

### Data retention

- Sentry default retention: 90 days. Reduce to **30 days** in Sentry project settings to align
  with a minimal-retention policy for the pilot.
- Remove all pilot Sentry events after the pilot concludes and production is confirmed stable.

### Kenya Data Protection Act (DPA 2019) note

Crash data that can be linked to an individual (e.g. via user ID) constitutes personal data under
the DPA. Ensure the Privacy Policy discloses crash reporting and that data is not shared with
third parties beyond Sentry (the processor).

---

## 6. Pilot Incident Response Steps

### How testers report a crash

When the app shows the "Something went wrong" fallback screen, or crashes to the OS, testers must
report via the designated pilot channel (WhatsApp group or email) with:

1. **What they were doing** — screen name and the action taken immediately before the crash.
2. **Screenshot or screen recording** — of the error screen or the moment before crash.
3. **Device and OS** — e.g. "Samsung Galaxy A32, Android 12".
4. **App build number** — visible in Profile → About (or the pilot build notes).
5. **Time** — approximate time so logs can be correlated.
6. **Reproducibility** — does it happen every time or intermittently?

### Triage (developer)

1. **Acknowledge** the report in the channel within 2 hours during pilot hours.
2. **Reproduce** locally using the same device/OS profile if possible; check Metro console /
   Logcat / Xcode console for the `ErrorBoundary caught:` log line.
3. **Severity classify:**
   - **P0 (blocker):** Core flow broken (cannot book, cannot log in, payment affected). Fix same day.
   - **P1 (high):** Feature broken but workaround exists. Fix within 24 h.
   - **P2 (medium/low):** Cosmetic or edge case. Log in `qa-findings.md`; fix post-pilot.
4. **Log** in `docs/pilot/qa-findings.md` with date, description, severity, and status.

### Fix or defer

- **P0/P1:** Create a branch off `feat/slice-17-pilot`, fix, get a quick review, merge, cut a new
  pilot build.
- **P2:** Add to `qa-findings.md` with `status: deferred`. Communicate to testers that it is known
  and will be fixed.

### Communicate back to testers

- Post a brief update in the pilot channel: "Known issue confirmed / fix in build X / workaround: …"
- Do not leave tester reports without a response for more than 4 hours during active pilot days.
