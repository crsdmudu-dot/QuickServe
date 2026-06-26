# Slice 17 — Pilot Readiness & QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make QuickServe pilot-ready on Android + iOS — build/config fixes, a safety error boundary, and a complete set of QA/deployment/store checklists — fixing only verified blockers.

**Architecture:** Mostly documentation (`docs/pilot/`) + small config changes (`app.json`, new `eas.json`) + one safety component (error boundary). No features, no UI redesign, no logic/DB changes except a verified-blocker fix (with a test).

**Tech Stack:** Expo RN + TS, EAS, Supabase, Jest. Docs in Markdown.

## Global Constraints

- **Strict scope:** no new product features, no UI redesign, no business-logic or DB/RLS change EXCEPT to fix a verified, reproducible blocker — and every such fix ships with a regression test.
- App identifiers: `android.package = ios.bundleIdentifier = com.quickserve.app` (permanent).
- Do NOT install Sentry (checklist-only). Do NOT invent `extra.eas.projectId` (operator runs `eas init`).
- iOS/Android permissions: add usage strings ONLY for capabilities already used; add/remove no capability.
- Merge gate: `npm test` green, `npx tsc --noEmit` clean, `npx expo export` succeeds, `git status` clean; `eas.json` is valid JSON.

---

## File Structure

**Create**
- `eas.json` — development / preview / production build profiles.
- `src/components/error-boundary.tsx` (+ `src/components/error-boundary.test.tsx`).
- `docs/pilot/qa-e2e.md`, `backend-readiness.md`, `onboarding-checklists.md`, `android-release.md`, `ios-release.md`, `performance.md`, `crash-logging.md`, `legal-support.md`, `qa-findings.md`.

**Modify**
- `app.json` — identifiers, versioning, iOS `infoPlist` usage strings.
- `src/app/_layout.tsx` — wrap the app tree in `<ErrorBoundary>`.

---

## Task Order

1. **T1** — `app.json` config fixes (identifiers, versioning, permissions).
2. **T2** — `eas.json` build profiles.
3. **T3** — Error boundary component + wire into `_layout` (+ test).
4. **T4** — QA E2E scripts (`qa-e2e.md`).
5. **T5** — Backend readiness checklists (`backend-readiness.md`) — Supabase migrations, Daraja/M-Pesa sandbox, push, Edge deploy.
6. **T6** — Onboarding checklists (`onboarding-checklists.md`).
7. **T7** — Store readiness: `android-release.md` (Play internal testing) + `ios-release.md` (TestFlight).
8. **T8** — Performance + crash-logging + legal/support docs.
9. **T9** — QA pass: run scripts, triage, fix only verified blockers (each with a test), record in `qa-findings.md`; final gate.

T1–T3 are code/config (each ends green). T4–T8 are docs (gate = tests still green, files complete). T9 is the QA/fix wave.

---

### Task 1: `app.json` config fixes

**Files:** Modify `app.json`

- [ ] Add `android.package = "com.quickserve.app"`, `android.versionCode = 1`.
- [ ] Add `ios.bundleIdentifier = "com.quickserve.app"`, `ios.buildNumber = "1"`.
- [ ] Add `runtimeVersion = { "policy": "appVersion" }`.
- [ ] Audit capabilities already used (expo-image-picker, expo-notifications, expo-device) and add matching `ios.infoPlist` usage strings (e.g. `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`) — strings only, no new capability. Confirm the existing `expo-image-picker` plugin photo permission copy.
- [ ] Leave `extra.eas.projectId` as-is (operator fills via `eas init`).

**Checks:** `npx expo config --type public` resolves with the new fields; `npm test` green, `npx tsc --noEmit` clean. Commit `chore: slice17 app identifiers + permissions`.

---

### Task 2: `eas.json` build profiles

**Files:** Create `eas.json`

- [ ] `cli.version` floor; three profiles:
  - `development` — `developmentClient: true`, `distribution: "internal"`.
  - `preview` — `distribution: "internal"` (APK for Android testers; ad-hoc/internal IPA for iOS).
  - `production` — store builds (AAB / App Store).
- [ ] Per-profile `channel` (EAS Update) and Android `buildType`/iOS `simulator:false` as appropriate.
- [ ] Valid JSON; document required credentials in the store docs (T7).

**Checks:** `eas.json` parses (JSON valid); `npm test` green, `tsc` clean. Commit `chore: slice17 eas build profiles`.

---

### Task 3: Error boundary

**Files:** Create `src/components/error-boundary.tsx` (+ `.test.tsx`); Modify `src/app/_layout.tsx`

- [ ] Class component with `getDerivedStateFromError` + `componentDidCatch` (→ `console.error`); friendly branded fallback (design-system tokens: "Something went wrong", "Try again" resets state).
- [ ] Wrap the app tree in `_layout.tsx` INSIDE the providers (so theme/auth available to the fallback) — do not change boot/auth logic.
- [ ] Test: renders children normally; a throwing child renders the fallback; pressing "Try again" clears the error and re-renders children.

**Checks:** `npm test` green (+ boundary test), `tsc` clean, `npx expo export` succeeds. Commit `feat: slice17 error boundary`.

---

### Task 4: QA E2E scripts — `docs/pilot/qa-e2e.md`

Step-by-step manual scripts (pass/fail column) per role — customer / provider / admin — covering every flow end-to-end (auth/role → booking create → quote → accept → pay [M-Pesa mock + sandbox] → status progression → chat → review → notifications/deep-links; provider job progression + photos + earnings; admin dispatch/quote/confirm/payout/reviews). **Commit `docs: slice17 QA e2e scripts`.**

---

### Task 5: Backend readiness — `docs/pilot/backend-readiness.md`

- [ ] **Supabase migrations:** apply `0001…0015` in order on the pilot project; verify tables/RLS/functions; run the existing `docs/superpowers/verification/slice-*` SQL scripts.
- [ ] **Daraja / M-Pesa sandbox:** secrets, `MPESA_MODE`, STK push e2e, callback token + ResultCode, idempotency (ref `slice-13-daraja.md`).
- [ ] **Push:** `register-device`/`send-push` deployed, `private.push_config` set, `PUSH_WEBHOOK_SECRET`, fire 8 events on a dev build (ref `slice-15-push.md`).
- [ ] **Edge deploy:** `supabase functions deploy mpesa-stk-push mpesa-callback register-device send-push`; `verify_jwt` per `config.toml`; secrets set.

Commit `docs: slice17 backend readiness`.

---

### Task 6: Onboarding checklists — `docs/pilot/onboarding-checklists.md`

Admin account setup (role gating + admin-only screens), provider onboarding (apply → approve → profile → availability → first job), customer pilot (install → sign up → book → pay → review + how to report issues). Commit `docs: slice17 onboarding checklists`.

---

### Task 7: Store readiness — Android + iOS

**Files:** Create `docs/pilot/android-release.md`, `docs/pilot/ios-release.md`

**Android (Play internal testing):**
- [ ] `eas build -p android --profile development` (dev client) + `--profile preview` (tester APK).
- [ ] Play Console: create app, **Internal testing** track, add testers (email list / link).
- [ ] Listing requirements: icon, feature graphic, screenshots, descriptions, **Privacy Policy URL**, Data safety form, content rating.
- [ ] Signing via EAS; upload AAB (`production` profile) for the track.

**iOS (TestFlight):**
- [ ] Apple Developer Program enrollment; App Store Connect app record (bundle id `com.quickserve.app`).
- [ ] `eas build -p ios --profile development`/`preview`/`production`; EAS-managed certs/profiles (`eas credentials`).
- [ ] **TestFlight** internal (then external) testing; invite testers; export-compliance + App Privacy questionnaire.
- [ ] iOS permissions review (each usage string + prompt copy); **iPhone QA checklist** = run T4 scripts on a physical iPhone (push needs the dev/EAS build).

Commit `docs: slice17 android + ios store readiness`.

---

### Task 8: Performance + crash-logging + legal/support

**Files:** Create `docs/pilot/performance.md`, `crash-logging.md`, `legal-support.md`

- [ ] **performance.md:** cold-start, bundle size (`expo export` output), list scrolling, image sizes, re-render/over-fetch spot-checks; record findings, fix only verified perf blockers (→ T9).
- [ ] **crash-logging.md:** error boundary (now) + `@sentry/react-native` recommended path (config plugin, DSN secret, source maps via EAS) — checklist-only.
- [ ] **legal-support.md:** required docs (Privacy Policy, Terms, Support contact), hosting + store Privacy Policy URL, recommended minimal in-app placement (Support/Legal row on Profile) — building links OPTIONAL/only if trivial.

Commit `docs: slice17 performance + crash-logging + legal`.

---

### Task 9: QA pass + verified-blocker fixes + final gate

**Files:** Create `docs/pilot/qa-findings.md`; fix files only as needed for verified blockers (+ regression tests)

- [ ] Execute the T4 scripts (logic-level review + automated suite as proxy where device runs aren't possible); log every issue in `qa-findings.md` (issue → repro → root cause → fix/deferred → test).
- [ ] Fix ONLY reproducible blockers (crash / broken core flow / security-permission gap); each fix minimal + a regression test; cosmetic issues logged not fixed.
- [ ] **Final gate:** `npx expo export` → `npx tsc --noEmit` clean → `npm test` green → `git status` clean; `eas.json` valid; `expo config` resolves identifiers.
- [ ] Commit `test: slice17 QA findings + verified fixes`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-17-pilot`. Abandon = `git checkout main` + delete branch; `main` untouched.
- **Per-task revert:** docs and config are independent commits — `git revert <commit>` rolls back one (e.g. revert `eas.json` or the `app.json` identifiers) without affecting others.
- **Identifiers caution:** `com.quickserve.app` is permanent ONCE published to a store; pre-publish it is freely revertable in `app.json`. Do not publish until approved.
- **Error boundary:** `git revert` the T3 commit removes it cleanly (pure presentation/safety wrapper).
- **No schema/data changes** in this slice (unless a verified-blocker fix touches a migration — that fix is forward-only and gets its own numbered migration + documented rollback). Checklists are docs — nothing to roll back operationally.

---

## Self-Review

- **Spec coverage:** app.json identifiers/permissions (T1), eas.json (T2), error boundary (T3), QA scripts (T4), backend/Daraja/M-Pesa/push/Edge (T5), onboarding (T6), Android Play + iOS TestFlight (T7), performance/crash-logging/legal (T8), QA pass + verified fixes + gate (T9 + sections). Strict scope repeated in Global Constraints + every task.
- **Placeholder scan:** none; `projectId` intentionally operator-filled.
- **Type/consistency:** identifier `com.quickserve.app` consistent T1↔T7; error-boundary wiring T3↔_layout; doc filenames consistent across plan ↔ spec deliverables.
