# Slice 17 — Pilot Readiness & Quality Assurance (Design Spec)

**Date:** 2026-06-26
**Status:** Approved design → implementation plan
**Type:** QA / release-readiness slice — checklists + config fixes + verified-blocker fixes only.

---

## 1. Goal & Strict Scope

Prepare QuickServe for a real pilot (customers, providers, admin) on **Android and iOS**.

**In scope:** end-to-end QA scripts, build/config fixes (app identifiers, permissions, EAS profiles), a lightweight error boundary, backend deployment/verification checklists, account/onboarding/pilot checklists, store-readiness checklists, performance checks, and **fixing only verified blockers**.

**Hard non-goals:** no new product features; no UI redesign; **no business-logic or DB/RLS change except to fix a verified blocker** (with a test); do **not** install Sentry (checklist-only); do not author the legal documents' content (provide the checklist + in-app placement).

---

## 2. Config Fixes (`app.json`)

- `android.package = "com.quickserve.app"`, `ios.bundleIdentifier = "com.quickserve.app"`.
- Versioning: keep `version = "1.0.0"`; add `android.versionCode = 1`, `ios.buildNumber = "1"`; add `runtimeVersion` (policy `appVersion`) for EAS Update alignment.
- **iOS permission usage strings** (`ios.infoPlist`): camera + photo library (photos feature), and confirm the notifications flow. Audit every native capability the app already uses (image picker, notifications, device) and ensure a usage string exists for each. **Add strings only for capabilities already used — add no new capability.**
- Android permissions: confirm the manifest only requests what's used (camera/storage for photos, notifications via expo-notifications) — remove nothing that's needed; add nothing new.
- `extra.eas.projectId`: stays an operator-filled value (documented `eas init` step); do not invent one.

## 3. EAS Build Config (`eas.json`)

Create `eas.json` with three profiles: `development` (dev client, internal distribution), `preview` (internal distribution APK/IPA for pilot testers), `production` (store builds). Android + iOS resource classes; an EAS Update channel per profile. Document required credentials per platform.

## 4. Error Boundary (the one code addition)

`src/components/error-boundary.tsx` — a class component catching render errors, showing a friendly branded fallback ("Something went wrong" + a "Try again" reset) using the design system; wrap the app tree in `src/app/_layout.tsx` (inside providers). Presentation/safety only — no logic change. Log the error to `console.error` for now (Sentry hooks here later). Unit test: renders children normally; renders fallback when a child throws; reset clears the error.

---

## 5. QA Test Plan (manual E2E scripts) — `docs/pilot/qa-e2e.md`

Step-by-step scripts per role covering EVERY flow, with expected results and a pass/fail column:
- **Customer:** sign-up/role, browse services, create booking (address→schedule→notes→review→success), see quote → accept → pay (M-Pesa mock + sandbox) → status updates → chat with provider → review → notifications/deep-links.
- **Provider:** apply/await approval, see assigned job, progress statuses (on-the-way→in-progress→completed), photos, chat with customer, earnings/profile, notifications.
- **Admin:** dispatch/assign provider, set quote (+ share preview), confirm payment attempt / override status, mark payout, hide/unhide reviews, read conversations, approvals.
The QA pass executes these; **any verified blocker found is triaged** (see §11).

## 6. Backend Readiness Checklists — `docs/pilot/backend-readiness.md`

- **Supabase migration verification:** apply `0001…0015` in order on the pilot project; confirm tables/RLS/functions exist; run the slice verification SQL scripts (`slice-10…15`) and the chat/payments/push checks.
- **Daraja / M-Pesa sandbox validation:** secrets set, `MPESA_MODE`, STK push end-to-end, callback token + ResultCode handling, idempotency (references `slice-13-daraja.md`).
- **Push notification validation:** `register-device` + `send-push` deployed, `private.push_config` set, `PUSH_WEBHOOK_SECRET`, fire each of the 8 events on a dev build (references `slice-15-push.md`).
- **Edge Function deployment checklist:** `supabase functions deploy mpesa-stk-push mpesa-callback register-device send-push`; `verify_jwt` per `config.toml`; secrets set; `private.push_config` populated.

## 7. Account & Onboarding Checklists — `docs/pilot/onboarding-checklists.md`

- **Admin account setup:** create the admin profile (role gating), verify admin-only screens/actions.
- **Provider onboarding:** apply → admin approval → profile completion → availability → first assigned job.
- **Customer pilot:** install, sign up, first booking → pay → review; what to test + how to report issues.

## 8. Store Readiness

### `docs/pilot/android-release.md`
EAS dev build install on devices; Play Console app creation; **internal testing** track setup; required listing assets (icon, feature graphic, screenshots, short/full description), privacy policy URL, data-safety form, content rating; signing via EAS; upload AAB; add testers.

### `docs/pilot/ios-release.md`
Apple Developer Program enrollment; App Store Connect app record (bundle id `com.quickserve.app`); EAS iOS build + credentials (certs/profiles via EAS); **TestFlight** internal/external testing setup; iOS permissions review (each usage string + prompt copy); App Privacy questionnaire; **iPhone QA checklist** (run §5 scripts on a physical iPhone, push needs a dev/EAS build).

## 9. Performance Checks — `docs/pilot/performance.md`

Cold-start time, bundle size (`expo export` output), list scrolling (bookings/notifications/chat), image sizes (photo gallery), avoid obvious re-render/over-fetch on key screens. Record findings; fix only verified perf blockers.

## 10. Crash/Error Logging Recommendation — `docs/pilot/crash-logging.md`

The error boundary (now) + the recommended pilot path: `@sentry/react-native` (Expo config plugin, DSN as secret, source maps via EAS) — **checklist-only**, not installed this slice.

## 11. Legal / Support — `docs/pilot/legal-support.md`

Checklist of required documents (Privacy Policy, Terms of Service, Support contact) + hosting + the **store-required Privacy Policy URL**, and a recommended minimal in-app placement (a Support/Legal row on Profile linking out). Building those links is OPTIONAL and only if trivial; otherwise checklist + URLs to be provided.

## 12. Verified-Blocker Fix Policy

During QA, fix ONLY issues that are reproducible blockers (crash, broken core flow, security/permission gap). Each fix: minimal, with a regression test, and noted in `docs/pilot/qa-findings.md` (issue → root cause → fix → test). Cosmetic/nice-to-have issues are logged, not fixed.

---

## 13. Verification

- `npm test` green, `npx tsc --noEmit` clean, `npx expo export` succeeds, `git status` clean.
- `npx expo config --type public` (or prebuild dry-run) shows the new identifiers/permissions resolve; `eas.json` is valid JSON with the three profiles.
- Checklists complete and internally consistent; any blocker fix has a passing test.

## 14. Deliverables

1. `app.json` (identifiers, versioning, iOS permission strings) + `eas.json` (3 profiles).
2. `src/components/error-boundary.tsx` (+ test), wired into `_layout.tsx`.
3. `docs/pilot/`: `qa-e2e.md`, `backend-readiness.md`, `onboarding-checklists.md`, `android-release.md`, `ios-release.md`, `performance.md`, `crash-logging.md`, `legal-support.md`, `qa-findings.md`.
4. Verified-blocker fixes (each with a regression test), if any.
5. Green verification gate.
