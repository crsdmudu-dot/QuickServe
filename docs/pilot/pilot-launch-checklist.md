# QuickServe — Pilot Launch Checklist (Master Index)

**Purpose:** Single entry point for the pilot launch operator. Work through each section
top-to-bottom. Every `- [ ]` item must be checked before accepting live user traffic.
Link to sibling docs for full step-by-step instructions.

**Branch:** `feat/slice-17-pilot`
**Target platforms:** Android (primary), iOS (secondary)

---

## How to use this checklist

1. Print or open this file alongside the linked sibling docs.
2. Assign each section to an owner (backend, mobile, legal, etc.).
3. Check items as they are completed.
4. Do not open the app to users until every Critical item is checked.

---

## 1. Backend & Database

> Full instructions: [backend-readiness.md](./backend-readiness.md)

- [ ] Supabase project created and linked (`supabase link --project-ref <ref>`)
- [ ] All 15 migrations applied in order (`supabase db push` reports zero pending)
- [ ] `is_admin()` helper verified against a real admin account
- [ ] RLS smoke-test: customer cannot read another customer's bookings
- [ ] RLS smoke-test: provider cannot read unassigned bookings
- [ ] Admin account created manually in Supabase Studio (`role='admin'`, `approval_status='approved'`)
- [ ] `MPESA_CALLBACK_SECRET` secret set (min 32 chars, high entropy)
- [ ] `PUSH_WEBHOOK_SECRET` secret set (min 32 chars, high entropy)
- [ ] `DARAJA_SHORTCODE`, `DARAJA_PASSKEY`, `DARAJA_CALLBACK_URL` set for production M-Pesa
- [ ] `MPESA_MODE` set to `live` (not `mock` or `sandbox`) for production
- [ ] Expo Push Access Token (`EXPO_ACCESS_TOKEN`) set in Edge Function secrets
- [ ] `private.push_config` row populated (`send_push_url` + `webhook_secret`)
- [ ] `booking-photos` Storage bucket exists and is confirmed private
- [ ] pg_net extension enabled (`create extension if not exists pg_net`)
- [ ] Database webhook from `bookings`, `payments`, `booking_messages` → `send-push` function configured

---

## 2. Android Release Build

> Full instructions: [android-release.md](./android-release.md)

- [ ] `app.json` version / versionCode incremented for this release
- [ ] EAS project ID populated in `app.json` (`extra.eas.projectId`)
- [ ] Production keystore provisioned and stored in EAS
- [ ] `eas build --platform android --profile production` completed successfully
- [ ] APK / AAB downloaded and smoke-tested on a physical device
- [ ] `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` set in EAS environment (production channel)
- [ ] Deep-link scheme `quickserve://` resolves booking detail on device
- [ ] Push notification received on a physical Android device (dev build)

---

## 3. iOS Release Build

> Full instructions: [ios-release.md](./ios-release.md)

- [ ] Apple Developer account active; Bundle ID `com.quickserve.app` registered
- [ ] Provisioning profile and distribution certificate provisioned in EAS
- [ ] `eas build --platform ios --profile production` completed successfully
- [ ] IPA smoke-tested on a physical iOS device (TestFlight or direct)
- [ ] `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` set in EAS environment (production channel)
- [ ] Push notification received on a physical iOS device (dev build with APNs)
- [ ] App Store Connect entry created; first build uploaded

---

## 4. Onboarding

> Full instructions: [onboarding-checklists.md](./onboarding-checklists.md)

- [ ] Pilot customer testers recruited and given app download link
- [ ] Pilot service providers recruited; each account manually approved in admin panel
- [ ] Admin operator trained: dispatch flow, quote flow, payment confirmation, photo verification
- [ ] Provider onboarding brief shared (account pending → admin approves → can accept jobs)
- [ ] Customer onboarding brief shared (sign up, book a service, review flow)

---

## 5. QA Sign-off

> Full instructions: [qa-e2e.md](./qa-e2e.md)
> Triage findings: [qa-findings.md](./qa-findings.md)

- [ ] All E2E manual test scripts in `qa-e2e.md` executed (C-01 through A-xx) and marked Pass
- [ ] No Critical or unresolved Important findings in `qa-findings.md`
- [ ] IMP-01 (storage SELECT overly broad) acknowledged and deferred post-pilot
- [ ] MIN-01 (Admin role card) acknowledged and deferred post-pilot
- [ ] TypeScript: `npx tsc --noEmit` exits 0
- [ ] Test suite: `npm test` exits 0 with >= 456 passing
- [ ] Android export: `npx expo export --platform android` exits 0

---

## 6. Performance

> Full instructions: [performance-checklist.md](./performance-checklist.md)

- [ ] Home screen JS bundle TTI measured on a mid-range Android device (target < 2 s)
- [ ] Booking list renders <= 50 rows without jank (FlatList + pagination confirmed)
- [ ] Photo upload completes in < 10 s on a 4G connection for a 3 MB photo
- [ ] M-Pesa STK Push round-trip (initiate → callback → paid) completes in < 30 s (sandbox)
- [ ] Push notification delivered to foreground + background device in < 5 s (happy path)

---

## 7. Crash Logging & Monitoring

> Full instructions: [crash-logging.md](./crash-logging.md)

- [ ] Sentry (or equivalent) DSN configured in app.json / EAS environment
- [ ] Test crash triggered in dev build; Sentry dashboard shows event within 60 s
- [ ] Supabase Edge Function logs reviewed; no unexpected errors at launch
- [ ] Supabase Database logs reviewed; no RLS policy violations at launch
- [ ] Alert rule configured: > 5 errors / minute triggers on-call notification

---

## 8. Legal & Support

> Full instructions: [legal-support.md](./legal-support.md)

- [ ] Terms of Service URL live and linked from the app
- [ ] Privacy Policy URL live and linked from the app
- [ ] M-Pesa merchant agreement signed with Safaricom; production shortcode active
- [ ] Data retention policy documented; GDPR/local privacy law review complete
- [ ] Support email or in-app contact mechanism live (pilot users can reach support)
- [ ] Refund / dispute process documented for pilot operators

---

## 9. Go / No-Go Decision

All items above must be checked. The operator and tech lead sign off below before
opening the app to pilot users.

| Role | Name | Sign-off date |
|------|------|---------------|
| Tech Lead | | |
| Backend Operator | | |
| QA Lead | | |
| Legal / Compliance | | |

---

## Sibling documents

| Document | Covers |
|----------|--------|
| [backend-readiness.md](./backend-readiness.md) | Supabase project setup, migrations, secrets, storage, Edge Functions |
| [android-release.md](./android-release.md) | EAS build, keystore, Play Store submission |
| [ios-release.md](./ios-release.md) | EAS build, Apple certificates, TestFlight, App Store |
| [onboarding-checklists.md](./onboarding-checklists.md) | Customer, provider, and admin onboarding flows |
| [qa-e2e.md](./qa-e2e.md) | Manual E2E test scripts for all user roles |
| [performance-checklist.md](./performance-checklist.md) | TTI, bundle size, photo upload, push latency targets |
| [crash-logging.md](./crash-logging.md) | Sentry setup, alert rules, log review |
| [legal-support.md](./legal-support.md) | ToS, Privacy Policy, M-Pesa agreement, GDPR |
| [qa-findings.md](./qa-findings.md) | Triage table: Critical / Important / Minor findings from code review |
