# Phase 3C — Native Login-to-Dashboard Render Loop Stabilization

> **Status: REPRODUCED and ROOT-CAUSED on-device; NOT yet fixed.** Two minimal fixes
> were implemented and **failed native verification**. The confirmed fix requires a
> restructure of the `(admin-web)` route-guard's rendering, which is broader than the
> anticipated "minimal fix" and carries authorization-UI correctness nuances — so per
> the phase's contingency this is reported for **approval before proceeding**. The
> defect is **NOT closed**.

- **Branch:** `fix/phase-3c-native-login-render-loop`
- **Pre-work baseline (main):** `85943f49ea9b4cc721360f78e366cceaf59f8bfc`
- **Working tree:** restored to baseline (no code fix committed; diagnostics removed).

---

## 1. Executive Summary

On the Android build, a successful admin login transitions toward the dashboard and
throws `Maximum update depth exceeded`, caught by the app error boundary; a cold
relaunch with the restored session renders the dashboard correctly. This phase
reproduced the defect on-device, then used an instrumented diagnostic build to
**definitively localize** it: during the brief window after `SIGNED_IN` where the
session is set but the profile **role has not resolved yet**, the `(admin-web)`
route-guard layout renders a **non-navigator element** (a bare `<SafeAreaView>` for
its "Loading" and "Not authorized" branches) instead of the child navigator
`<Slot/>`. On the native stack navigator this causes a self-sustaining navigation
re-render loop (the root navigator emits ~50 no-op state notifications with a stable
route), which overflows React's update depth. Web and jest test-renderer reconcile
the same transient harmlessly, which is why the defect is **native-only**.

Two minimal fixes were tried and **both failed native verification**: (a) making the
auth context re-enter `isLoading` while the role resolves (so the guard shows
"Loading" not "Not authorized") — failed because "Loading" is *also* a bare view;
(b) stabilizing the root `<Stack screenOptions>` object — failed, and the diagnostic
proved the route never changes. The correct fix is to keep a navigator mounted
during the guard's transient/blocked states, which is a guard/layout restructure.

## 2. Starting Baseline

`main` @ `85943f4` (Phase 3B merged). Managed Expo workflow, SDK ~56, React 19,
RN 0.85, expo-router ~56.2.11. No android/ios native dirs.

## 3. Original Phase 3B Finding

Live admin login → dashboard throws `Maximum update depth exceeded`; error boundary
catches it ("Something went wrong / Try again"); a cold relaunch with the restored
session renders the dashboard with live data. Recorded in
`docs/qa/PHASE-3B-EAS-NATIVE-READINESS.md` §19.2.

## 4. Reproduction Environment

- **Device:** `Pixel_9_Pro_XL` AVD, Android 16 (`sdk_gphone16k_x86_64`), emulator.
- **Build:** EAS `preview` profile, standalone release APK (~111 MB).
- **Backend:** dedicated **QA** Supabase project (redacted; host `wjvj…`), injected
  via uncommitted EAS environment variables (`EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`).
- **Tooling:** Node v24.14.1, npm 11.11.0, Expo CLI 56.1.16, EAS CLI 18.7.0.
- Local `expo run:android` was attempted for a readable dev-mode stack but **failed**
  on a toolchain incompatibility (`JvmVendorSpec … IBM_SEMERU` under Gradle 9.3.1),
  unrelated to the app; a dev-client build was not possible without adding the
  `expo-dev-client` dependency (out of scope). Diagnosis therefore used
  instrumented **release** builds + logcat.

## 5. Reproduction Steps

1. Clean install / `pm clear` app data (fresh, unauthenticated).
2. Launch → app lands on the **Admin Panel** login (`(admin-web)/login`).
3. Enter valid **QA admin** credentials; tap **Sign in**.
4. Observe the login→dashboard transition.

## 6. Observed Failure

`Maximum update depth exceeded` is thrown and caught by the error boundary
("Something went wrong"). Reproduced **every time** on a fresh admin login on native.
Component stack (release, minified) rooted consistently at:

```
Error: Maximum update depth exceeded …
  at NativeStackNavigator
  at anonymous  (route wrappers)
  at RootNavigator
  at ErrorBoundary
  at BookingDraftProvider → ServicesProvider → AuthProvider → ThemeProvider → RootLayout
```

Reproducibility matrix (confirmed this phase):

| Condition | Loop? |
|---|---|
| Native, live admin login | **YES** (every time) |
| Native, cold relaunch with restored session | No (dashboard renders) |
| Web (desktop width, Phase 3A) | No |
| Web (narrow/mobile width, `orientation="top"`) | No (verified this phase) |
| jest integration (react-test-renderer, real tree) | No (verified this phase) |
| Expo Go | Not testable (app hard-imports `@sentry/react-native`) |

## 7. Root Cause

**Instrumented diagnostic build** (temporary render/event counters, since reverted):

- **`onAuthStateChange` fires exactly twice** (`INITIAL_SESSION` then `SIGNED_IN`) —
  the auth event stream does **not** loop.
- **`AuthProvider` and `ServicesProvider` render < 10 times** — the providers/auth
  **state is stable**, not looping.
- **`RootNavigator` and `AdminWebLayout` render 50+ times in lockstep**, with frozen
  state `isLoading=false, signedIn=true, role=null, seg0=(admin-web)`.
- **`segments` value is stable** (`["(admin-web)"]`) across all 50 renders — the
  **route never changes** (no redirect/replace loop, no route oscillation).

Interpretation: the loopers are exactly the components subscribed to navigation state
(`useSegments()`); the providers (non-subscribers) are stable. So the **navigation
store is emitting ~50 no-op notifications** — the native stack navigator is
re-deriving state in a loop — during the window where the profile **role is still
null** (the async `fetchProfile` has not resolved).

Why: the `(admin-web)/_layout` guard returns a **non-navigator element** during that
window. Its branches:

| Guard state | Returns | Navigator-safe? |
|---|---|---|
| on `login` | `<Slot/>` | ✅ |
| `loading` | bare `<SafeAreaView>` (spinner) | ❌ |
| `!session` | `<Redirect/>` | ✅ |
| session, `!isAdmin` (role null/other) | bare `<SafeAreaView>` ("Not authorized") | ❌ |
| session, admin | `<AdminShell><Slot/></AdminShell>` | ✅ |

During a live admin login the guard passes through `session set, role=null` and
renders a **bare view (no `<Slot/>`)**. On the native stack navigator, a layout that
stops rendering its child navigator mid-transition drives the parent navigator to
churn → `Maximum update depth exceeded`. On cold-start-with-session the role is
resolved on the first settled render, so the guard renders `<AdminShell><Slot/></…>`
(with `<Slot/>`) from frame one and never churns — matching the observed
"relaunch works" behavior.

## 8. Why Native Was Different

The loop is thrown by React's reconciler but is **driven by the React Navigation
native-stack navigator** (`@react-navigation/native-stack` via expo-router). On web
(react-dom) and in the jest **react-test-renderer**, the same transient guard output
(a non-navigator element for one commit) is reconciled without a sustained
navigation-store feedback loop; the native stack navigator re-derives and re-notifies
its descriptors, and because `RootNavigator`/the guard both subscribe to navigation
state via `useSegments()`, the notification re-renders them, which re-renders the
navigator, and so on. Evidence supporting "navigation-driven, not state-driven":
providers stable (<10 renders), only `useSegments()` subscribers loop, route value
stable, and the component stack rooted at `NativeStackNavigator`. This is a
**platform-specific rendering/navigation lifecycle** difference (native stack
navigator), not an Expo Router routing bug, not native hydration timing, and not a
scheduler difference in the abstract.

## 9. Regression Test

A focused integration test (`admin-login-transition.test.tsx`, react-native-testing-
library) was written driving the real provider tree + real `(admin-web)` guard
through the login→dashboard transition. **It reproduces the auth-state inconsistency
but NOT the loop** (react-test-renderer settles like web). Therefore it is **not a
valid "proves the loop" regression test** and was **not retained** — a faithful
regression test for this defect must run against the native stack navigator (native
E2E), or assert the guard invariant "the layout always renders a navigator/`<Slot/>`
for session'd routes" once the fix defines that invariant. This will be added with
the fix.

## 10. Minimal Fix

**Not achieved.** Two minimal candidates were implemented and **failed native
verification** on-device:

1. **Auth loading-state fix** — `applySession` re-enters `isLoading=true` while the
   role resolves for a newly signed-in user, so the guard shows "Loading" rather than
   the inconsistent "Not authorized". *Result: still looped* — because the "Loading"
   branch is also a bare `<SafeAreaView>` (non-navigator).
2. **Stable `screenOptions`** — hoisted the root `<Stack screenOptions={{…}}>` inline
   object to a module constant. *Result: still looped*; the diagnostic proved the
   route/segments never change, ruling this out.

## 11. Files Changed

**None committed.** Working tree restored to baseline `85943f4`. (Investigation code —
the auth loading-state change, the `screenOptions` constant, the integration test, and
temporary diagnostics — was reverted.)

## 12. Native Verification

**FAILED / not passed.** Build `26fc05e6` (auth loading-state fix) and build
`9d4ad1f3` (stable `screenOptions`) both still reproduced `Maximum update depth
exceeded` + error boundary on a fresh admin login. The diagnostic build `8d95e52d`
provided the localization in §7. No build has passed the login→dashboard native
verification.

## 13. Runtime Log Review

`Maximum update depth exceeded`: **present** (every admin-login attempt). Error
boundary `reportError`: **present**. Auth-event loop: **absent** (2 events). Provider
render loop: **absent**. Route oscillation: **absent** (segments stable). Fatal
native exception / SIGSEGV / tombstone: **absent**. ANR (app): **absent** (the error
boundary contains it; the app process survives).

## 14. Regression Validation

Local gates were green against the (now-reverted) candidate fix — recorded for
reference only, since the fix is not adopted: Root Jest 2945, Website Vitest 102, tsc
root+qa clean, lint 0 new errors, connected certification **116/116**, Phase 3A admin
web **8/8**, `qa:release` green (exports + cert 116 + non-cert 130). These validate
that the candidate change did not regress other suites — **not** that the defect is
fixed (native verification is the authority and it failed).

## 15. Security Review

No schema, RLS, storage, backend business logic, payment, push, or location code was
changed. No credentials/tokens/keystores were printed or committed. The QA anon key +
URL live only in uncommitted EAS env vars and `qa/.env`. The defect does **not** leak
data (RLS still governs all reads) and does **not** bypass authorization — the admin
guard's authorization decision is unaffected; only its *rendering* during a transient
window is at fault.

## 16. Defect Classification

- **Severity:** Medium. Broken first-login UX on native (error screen requiring a
  relaunch), but **contained by the error boundary** (no crash), **no data-integrity
  impact**, **no authorization bypass**, and a relaunch recovers.
- **Affected platform/build:** Android native (release/preview build); by mechanism,
  any native build (iOS untested). Not web.
- **Affected role/flow:** the admin login→dashboard transition (the `(admin-web)`
  surface). Customer/provider native flows not assessed (out of scope).
- **Trigger:** a live sign-in whose profile-role resolves asynchronously after the
  session, while on an `(admin-web)` non-login route.
- **Reproducibility:** deterministic on native (every time).
- **Error-boundary masking:** yes — the boundary catches it, so it presents as a
  recoverable error screen rather than a crash.

## 17. Pilot Readiness Impact

Admins cannot reach the dashboard on a native build via a normal live login without
hitting the error screen (a relaunch works). This is a pilot blocker **for the native
admin surface specifically**; the web admin surface (Phase 3A) is unaffected, and the
customer/provider native surfaces are a separate, later concern.

## 18. Remaining Limitations

- Root cause is proven by convergent runtime evidence + code inspection; a fully
  symbolicated native stack was not obtainable (release build; local dev build blocked
  by toolchain; dev-client blocked by dependency scope).
- The fix and its native verification are **pending approval** (see §19).

## 19. Recommended Next Phase / Fix

**Recommended fix (needs approval — broader than a one-line minimal change):** make
the `(admin-web)` guard **always render a navigator (`<Slot/>`) for session'd routes**,
presenting the Loading / "Not authorized" states as overlays (or via a dedicated
redirect target) rather than replacing `<Slot/>` with a bare view. Combine with the
auth loading-state change so the transient window shows a stable "loading" overlay.
Alternatively adopt expo-router's idiomatic protected-routes mechanism if available in
SDK 56. This touches `(admin-web)/_layout.tsx` (and possibly `AdminShell` for overlay
support) and requires **one more native verification build** (fresh admin login ×
multiple cycles, background/resume, relaunch, log review).

Because this exceeds the "smallest change" the phase anticipated and touches how the
authorization guard renders, it is submitted for **approval before implementation**.

## 20. Final Status

- **Reproduced:** ✅ YES (native, deterministic).
- **Root cause identified:** ✅ YES (evidence-based; §7).
- **Fixed:** ❌ NO (two minimal fixes failed native verification).
- **Regression-tested:** ⚠️ integration test written but does not reproduce the
  native loop; not retained (see §9).
- **Native verified:** ❌ NO.
- **Closed:** ❌ **NO — defect remains open.**
- **Full Native Journey Certification:** NOT claimed.
- **Full Platform Certification:** NOT claimed.
