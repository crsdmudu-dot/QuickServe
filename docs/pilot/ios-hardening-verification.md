# Slice 37 — iOS Hardening Verification

**Branch:** `feat/slice-37-ios-hardening` · **Base:** `8dd8fc3` (`git merge-base main HEAD`)
**Purpose:** prove Slice 37 stayed strictly within scope (iOS config + one inspection-proven helper + tests + docs) and changed nothing else.

---

## 1. Isolation Proof (whole-branch diff)

`git diff --stat 8dd8fc3..HEAD` — the 9 files below (plus this verification doc itself, `docs/pilot/ios-hardening-verification.md`, once committed = 10 total):

| File | Category |
|---|---|
| `app.json` | iOS configuration (splash image + associated-domains scaffold) |
| `src/lib/maps.ts` | inspection-proven helper (new) |
| `src/app/provider/job/[id].tsx` | rewire to use the helper (behavior-preserving) |
| `src/lib/maps.test.ts` | regression test |
| `src/__tests__/ios-config.test.ts` | regression test |
| `src/__tests__/ios-permissions.test.ts` | regression test |
| `docs/pilot/ios-app-store-readiness.md` | documentation |
| `docs/superpowers/specs/2026-07-08-…-design.md` | spec (docs) |
| `docs/superpowers/plans/2026-07-08-…-readiness.md` | plan (docs) |

**Production/config code changed: only `app.json`, `src/lib/maps.ts`, `src/app/provider/job/[id].tsx`.** Everything else is tests or docs. Confirmed:
`git diff --name-only 8dd8fc3..HEAD | grep -vE '^docs/|test|\.superpowers/'` → `app.json`, `src/app/provider/job/[id].tsx`, `src/lib/maps.ts`.

---

## 2. Unchanged Proofs

Verified by `git diff --name-only 8dd8fc3..HEAD` (the file was **not** in the diff, so it is byte-for-byte unchanged):

| Area | Evidence | Status |
|---|---|---|
| **Android behavior** | `app.json` `android` block untouched (only a top-level splash `image` was added; the `android.image` override is unchanged); maps helper preserves the Android `google.navigation:q=${lat},${lng}` branch verbatim | **Unchanged** |
| **Booking workflow** | no `src/lib/bookings*` / `src/app/booking/*` logic file in diff (only `provider/job/[id].tsx` maps rewire) | **Unchanged** |
| **Dispatch workflow** | no dispatch/assignment file in diff | **Unchanged** |
| **Payment workflow** | no payment / M-Pesa file in diff | **Unchanged** |
| **Wallet workflow** | no wallet file in diff | **Unchanged** |
| **Provider workflow** | only the Navigate button URL construction changed (inline → helper); no job-flow/status logic changed | **Unchanged** |
| **Authentication** | no `src/auth/*` / auth file in diff | **Unchanged** |
| **Promotions** | no promotions file in diff | **Unchanged** |
| **Rankings / payouts** | no ranking/earnings/payout file in diff | **Unchanged** |
| **Notifications pipeline** | no `emit_notification`/`broadcast_announcement`/`notify_user`/trigger/migration in diff | **Unchanged** |
| **Push notification pipeline** | `src/lib/push.ts` not in diff | **Unchanged** |
| **Deep-link behavior** | `app.json` `scheme` unchanged; no `resolveNotificationDeepLink`/linking file in diff | **Unchanged** |
| **Navigation routes / stacks / tabs** | no `_layout.tsx` / route-group / `(tabs)` / `app/index` file in diff | **Unchanged** |

Grep evidence:
- `git diff --name-only 8dd8fc3..HEAD | grep -E '_layout|\(tabs\)|\(customer\)|\(admin|\(onboarding\)'` → **NONE**.
- `git diff --name-only 8dd8fc3..HEAD | grep -iE 'bookings|payment|wallet|dispatch|auth|promo|rank|push|notif|linking|scheduling|earnings|payout'` → **NONE**.

---

## 3. Navigation Verification

- **Routes unchanged** — no file added/removed/renamed under `src/app/` route structure; the only `src/app` change is content inside `provider/job/[id].tsx` (the Navigate button), not a route/screen add/remove.
- **Stacks unchanged** — no `_layout.tsx` in the diff.
- **Tabs unchanged** — no `(tabs)` layout in the diff.
- **Deep-link routes unchanged** — `app.json` `scheme: "quickserve"` unchanged; `resolveNotificationDeepLink` (Slice 36) not touched; the added `ios.associatedDomains` is an **inert placeholder** (`applinks:REPLACE_ME.quickserve.app`) that does not register any live universal link.
- **Navigation behavior unchanged** — the maps rewire only changes the URL passed to `Linking.openURL`; it adds/removes/reorders no screen, tab, or route.

---

## 4. Configuration Verification (asserted by `src/__tests__/ios-config.test.ts` + `ios-permissions.test.ts`, both green)

- iOS splash configured — top-level `image: "./assets/images/splash-icon.png"` in `expo-splash-screen` plugin. ✅
- Bundle identifier unchanged — `ios.bundleIdentifier: "com.quickserve.app"`. ✅
- Build number present — `ios.buildNumber: "1"`. ✅
- Orientation unchanged — `orientation: "portrait"`. ✅
- Permission strings correct — `photosPermission` + `locationWhenInUsePermission` present and non-empty; Location is when-in-use only (no Always/background key). ✅
- Associated-domains scaffold present — `ios.associatedDomains: ["applinks:REPLACE_ME.quickserve.app"]` (inert placeholder). ✅
- No unnecessary iOS permissions introduced — Camera/Microphone/Contacts/Bluetooth/Calendars/Motion absent (13 forbidden Info.plist keys / plugin names asserted absent); notifications system-managed. ✅

---

## 5. Documentation Verification

`docs/pilot/ios-app-store-readiness.md` contains every required section: (1) Executive Summary, (2) EAS Build + Credentials TODO table, (3) APNs, (4) TestFlight, (5) App Store Submission, (6) Privacy Nutrition Labels, (7) ATT Assessment (NOT required), (8) Privacy Manifest, (9) Universal Links / Associated Domains, (10) Manual QA (Customer/Provider/Admin), (11) App Store Compliance, (12) Findings from Task 3 (four items, each "Deferred by design because not statically provable"), (13) Future Improvements. Verified accurate against real config in the Task-4 review.

---

## 6. Final Verification Gate

| Check | Result |
|---|---|
| `npm test` | **2881 / 2881 passed** (213 suites) |
| `npx tsc --noEmit` | clean (0 errors) |
| `npx expo export --platform web` | success |
| `npx expo export --platform android` | success |
| `git status` | clean working tree (only `supabase/.temp/` scratch untracked) |

---

## 7. Deferred (documented, not code-changed — per the inspection-only guardrail)

The four Task-3 findings (`file://` upload, root `SafeAreaProvider`, `KeyboardAvoidingView`, `StatusBar`) are device-verifiable, not statically provable, and are recorded in `ios-app-store-readiness.md` §12 for on-device QA. No production code was changed for them.

---

## 8. Verdict

Independent whole-branch review (opus, base `8dd8fc3`): **READY TO MERGE** — 0 Critical, 0 Important. Confirmed: production surface is exactly 3 files (app.json + maps.ts + provider job rewire); Android provably unchanged (android block byte-identical; maps Android branch verbatim); no new dependency; `photos.ts` unchanged (four deferrals honored, not silently patched); associated-domains inert; capability matrix locked; docs accurate; tests substantive. Minor (non-blocking): plan snippet still shows `Platform.select` (superseded by the documented `Platform.OS` branching in `maps.ts`); `eas.json` doc claims are audit-based (file intentionally not in the diff).

**Final verdict: READY TO MERGE.**
