# Phase 4E.2 — iOS PRE-PHYSICAL Certification Report

**Status: iOS simulator / mobile regression gate is GREEN. No remaining simulator-reproducible blockers.**
**Physical iPhone push certification is NOT yet done — it is the next, separate, user-gated layer.**

- **Scope:** Replay every Android Phase 4E.1 hurdle on iOS using the existing GitHub-hosted
  macOS / iOS-Simulator infrastructure (no local Mac, no Apple account, no physical iPhone), fix
  any iOS/cross-platform defect found, and prove each real user journey with simulator-level
  evidence — before any Apple/APNs or physical-device work.
- **Branch:** `qa/phase-4e2-ios-physical-push` · report commit `f0b8c79`
- **Production:** untouched. **Phase 4F:** not started. **PRs #13 / #14 / 4E.2:** not merged.
- **Date:** 2026-08-11

---

## 1. Environment (GitHub-hosted, no local machine)

| Item | Value |
|---|---|
| Workflow | `.github/workflows/ios-native-journeys.yml` (`workflow_dispatch`) |
| Runner | GitHub `macos-14` (Apple silicon, arm64) — image release `20260629.0180` |
| Xcode / simulator runtime | macos-14 image default toolchain; iOS **18.1** simulator runtime |
| Simulator device | **iPhone SE (3rd generation) — iOS 18.1** (UDID `CE5053…4505A`) |
| App under test | EAS **iOS *simulator*** build `3a695e06-459b-4b85-85a5-db51fcbdcc9f` (`QuickServe.app`, **no Apple signing**), source commit `71a12ef` |
| Test driver | Maestro (installed from `get.maestro.mobile.dev`) |
| Backend | Dedicated **QA** Supabase project (service role used only for setup/seed/verify/cleanup, exactly as the certified Phase 3F helpers) |

> The iOS simulator build carries **no Apple credentials** and cannot register a real APNs/Expo
> push token (`Device.isDevice === false`). That boundary is why push *delivery* is explicitly a
> physical-only layer (Section 5), while everything the simulator *can* genuinely exercise is
> certified here (Sections 3–4).

---

## 2. GitHub Actions runs (evidence trail)

| Run ID | Build | Result | What it proved / why it failed |
|---|---|---|---|
| `31434429958` | `3a695e06` | ✅ success | nav/search regression + full Phase 3F journey green on iOS |
| `31438330558` | `3a695e06` | ❌ failure | notification-refresh **test selector** bug — see Section 6 (root cause proven from CI hierarchy) |
| `31474701049` | `3a695e06` | ✅ **success (all steps)** | **the clean pre-physical gate** — entry + nav/search + **notification refresh** + Phase 3F all green |

Earlier iterations `31394479418` and `31396935406` failed and were fixed during this phase
(Movers result-card selector; the iOS-only missing Back button — Section 4, defect I-8).

All runs upload `maestro-ios-artifacts` (screenshots + full UI hierarchies + logs, 14-day retention).

---

## 3. Simulator journeys executed (run `31474701049`, all ✅)

| Step | Flow | Evidence |
|---|---|---|
| Entry reachability | `entry-reachability.yaml` | native entry = customer/provider welcome (not admin); role-select reachable |
| Customer nav/search regression | `customer-nav-search.yaml` | screenshots `n01`–`n11` |
| **Notification-center refresh** | `notifications-refresh-a.yaml` + `-b.yaml` | screenshots `r01-initial-load`, `r02-before-refresh`, `r03-after-refresh` |
| Full customer/provider journey | `ios-journeys.sh` (Phase 3F) | booking → assign → provider progression → review, backend-verified |

### 3.1 Notification-center refresh — detailed evidence (Android defect #1 replayed on iOS)

Orchestrated by `qa/native/ios-notif-refresh.sh` against the **real in-app Notifications screen**
using **QA notification data** (service-role seed of `notifications` rows — in-app only, never a
faked push). Single continuous session, **no app restart**:

```
== [1] Seed initial notification ==      "QA Initial 1786438456"
== [2] Flow A: login + Notifications initial load ==
        → initial list loads, ".*QA Initial…*" visible
        → ".*QA Refresh…*" is NOT visible ............ COMPLETED   (baseline)
== [3] Seed refresh notification (after mount) ==   "QA Refresh 1786438456"
== [4] Flow B: pull-to-refresh (same running session) ==
        → before pull, ".*QA Refresh…*" NOT visible .. COMPLETED
        → Swipe (50%,40%)→(50%,95%) 900ms ............ COMPLETED   (pull-to-refresh)
        → ".*QA Refresh…*" now visible, ".*QA Initial…*" still visible
== [5] Verify no duplicate notification rows ==
        row counts: initial=1 refresh=1
== NOTIFICATION-CENTER REFRESH JOURNEY PASSED ==
```

Verification checklist (all satisfied on the simulator):

- ✅ **Initial notification list loads** — the pre-seeded row is on screen at mount (`r01`).
- ✅ **A newly-created notification becomes visible without force-closing/restarting** — the
  "refresh" row is seeded *after* the screen mounted and appears in the **same session** (`r03`).
- ✅ **Pull-to-refresh genuinely refetches** — the row appears only after the downward swipe
  fires `RefreshControl → onRefresh → reload()` (it is provably absent in `r02`, before the pull).
- ✅ **Refresh spinner/state clears** — enforced by the screen's `finally { setRefreshing(false) }`
  and covered by unit tests (Section 5.2); the flow continues and asserts post-refresh content.
- ✅ **No duplicate rows** — backend count is exactly `1` per title after the whole journey.
- ✅ **No crash / stale screen** — both the original and refreshed rows render; flow completes.

---

## 4. Android-hurdle → iOS matrix

Every Phase 4E.1 Android defect, classified for iOS and replayed where the simulator can prove it.

| # | Android 4E.1 defect | Fix | iOS status | iOS evidence |
|---|---|---|---|---|
| 1 | Foreground notification-center did **not refresh** | pull-to-refresh + focus refetch | ✅ **PASS (simulator)** | Section 3.1 (`r01`–`r03`) |
| 4 | Customer screens unreachable inside `NativeTabs` group | moved to **root stack routes** | ✅ **PASS (simulator)** | `customer-nav-search`: Browse Providers / Favorites / Preferences / Trust all open |
| 5 | `/providers` collided with admin-web → "Not authorized" | customer at **`/browse-providers`** | ✅ **PASS (simulator)** | `n02`: "Browse Providers" shown, "Not authorized" / ".*admin access.*" asserted **absent** |
| 6 | Search suggestions from a **hardcoded** catalogue | DB-backed `searchSuggestions` | ✅ **PASS (simulator)** | 5 live queries (Mechanic/Plumbing/House Cleaning/Electrical/Movers) surface correct services |
| 7 | Home search bar = **dead TextInput** stealing focus | `pointerEvents="none"` → tap routes to `/search` | ✅ **PASS (simulator)** | `n08`: tap opens "Popular searches"; result card → booking |
| I-8 | **iOS-only** (found this phase): root-stack screens had **no visible Back** (iOS has no hardware back) | added standard "← Back" to the 4 screens | ✅ **PASS (simulator)** | `customer-nav-search` returns via "← Back" from every screen |
| 2 | Cold-start notification **routing race** | live response listener + `getLastNotificationResponseAsync` + dedupe + stale-guard | ⚠️ **Logic verified; delivery PHYSICAL-ONLY** | Section 5.1 |
| 3 | Cross-account **push-token ownership** | client unregister on logout + backend token-claim on register | ⚠️ **Logic verified; token PHYSICAL-ONLY** | Section 5.3 |

**All simulator-testable hurdles: PASS.** The two remaining (2, 3) are push-*delivery*/token
behaviors that a simulator cannot genuinely perform — carried to the physical layer (Section 5),
with their logic already covered by automated tests so nothing is unverified going in.

---

## 5. Not simulator-testable → **PHYSICAL-ONLY gates** (kept separate from simulator proof)

`Device.isDevice === false` on a simulator, so the app **never** registers a token, **never**
prompts for permission, and **cannot** receive APNs. These are certified only on a real iPhone:

- **Real iOS Expo/APNs push-token registration**
- **Real permission prompt + device registration**
- **Actual remote APNs delivery — foreground / background / terminated**
- **Physical notification banner / lock-screen behavior**
- **Physical logout / account-switch token ownership (single-owner invariant on-device)**
- **Real cross-account delivery isolation (a message reaches only the intended account's device)**

These must **not** be claimed from any simulator run. Their supporting **automated / source
evidence** (which de-risks the physical run but does not replace it):

### 5.1 Cold-start routing logic (Android defect #2)
`src/lib/push.ts` + `src/lib/push.test.ts` — `routeForNotificationData` maps chat/booking payloads
to routes and safely returns `null` for empty/blank input; the response listener is deduped by id
with an AsyncStorage stale-guard. *Real* cold-start delivery/tap is physical-only.

### 5.2 Notification-center refresh (Android defect #1) — also unit-covered
`src/__tests__/notifications-refresh.test.tsx`: initial mount render; pull-to-refresh surfaces a
post-load notification with **no duplicate rows**; spinner clears on success **and** on refetch
error; refetches on re-focus but skips the first focus. (Simulator-proven in Section 3.1.)

### 5.3 Cross-account token ownership (Android defect #3)
`src/__tests__/register-device-token-claim.test.ts`: user_id derives from the verified JWT (never
the body); a service-role delete **claims the token from other accounts only**; claim runs before
the caller-scoped upsert; owner-only RLS on `device_tokens`.
`src/auth/auth-context.test.tsx`: `signOut` unregisters this device's token **before** Supabase
sign-out, and still signs out if push cleanup fails. *Real on-device token hand-off is physical-only.*

---

## 6. Root-cause note — the one failure fixed this phase (run `31438330558`)

Flow A's `assertVisible: "QA Initial …"` timed out. The Maestro **failure hierarchy** showed the
seeded card **was on screen**, as a single combined iOS accessibility label:

```
"QA Initial 1786401337, 10:35 PM, Seeded before the screen mounted (1786401337), System"
```

So the data/refresh path was correct — iOS merges a card's title+time+body+category into one
label and Maestro anchors a text selector to the whole element, so a bare title never matches.
**Fix (test-only, no app change):** match card content with `.*…*`, exactly as the repo's other
iOS card flows already do. Re-run `31474701049` passed. (Illustrates the evidence rule working:
a green Jest run alone would not have caught an iOS-simulator selector mismatch.)

---

## 7. iOS-specific observations

- iOS provides **no hardware Back** → full-screen stack routes must carry a visible control; the
  4 customer root-stack screens now do (defect I-8). Guarded by `customer-nav-routes.test.ts`.
- iOS **groups card sub-texts** into one accessibility label → card assertions use `.*…*`.
- After a cold start / `launchApp`, **expo-router is briefly non-interactive**; flows use the
  repeat-until-`Welcome back` login pattern and avoid mid-flow `launchApp` resets.
- The Home search bar renders **before routing is live**; `pointerEvents="none"` makes the tap
  fall through to navigation rather than focusing a dead field (holds on iOS).

---

## 8. Remaining simulator-reproducible blockers

**None.** Entry, customer nav/search (all Android hurdles), notification-center refresh, and the
full Phase 3F customer/provider journey are green on the iPhone SE / iOS 18.1 simulator (run
`31474701049`). The only items left are the **physical-only** push/token behaviors in Section 5.

---

## 9. Gate decision

✅ **iOS simulator / mobile regression gate: PASSED.**
➡️ **Cleared to proceed to the physical iPhone push layer** — Apple/APNs credential setup, an EAS
iOS *device* build, and the O1–O16 physical push certification — **subject to explicit user
approval and a physical iPhone.** That work is intentionally **not** started here.

**This report certifies simulator/mobile regression only. It does NOT certify real APNs delivery,
real token registration, or physical notification behavior.**
