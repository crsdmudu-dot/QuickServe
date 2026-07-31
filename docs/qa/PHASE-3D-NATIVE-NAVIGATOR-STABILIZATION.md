# Phase 3D — Native Navigator Stabilization

> Implements the approved architectural fix for the native admin login→dashboard render
> loop root-caused in Phase 3C. **Native verification is the authority for closure** and
> is recorded in §9–§10.

- **Branch:** `fix/phase-3c-native-login-render-loop`
- **Baseline (main):** `85943f49ea9b4cc721360f78e366cceaf59f8bfc`
- **Phase 3C investigation commit (preserved):** `fe489d3`

---

## 1. Executive Summary

On native, a live admin login threw `Maximum update depth exceeded` because the
`(admin-web)` route guard **replaced the child navigator (`<Slot/>`) with a bare view**
during the transient window where the session is set but the profile role has not resolved
yet. On the React-Navigation native stack, unmounting the nested navigator mid-transition
made the root navigator churn (a self-sustaining navigation-store re-render loop). This
phase restores the invariant **"once the native navigator exists, it stays mounted"**: the
guard now keeps `<Slot/>` mounted at a stable position inside `AdminShell` for every
authenticated state, and expresses authorization with **opaque overlays** (Loading /
Not authorized) layered on top — never by swapping the navigator subtree. `AdminShell`
gained a `showChrome` flag so its sidebar/top-bar (and the admin-only notification query)
render only for an authorized admin, so loading/non-admin users are fully obscured and no
admin navigation is exposed. Authentication, routing, RLS and backend authorization are
unchanged.

## 2. Phase 3C Findings (established)

Reproduced on-device every native admin login; not on web (any width) or in jest.
Instrumented diagnostic build proved: `onAuthStateChange` fired twice (no auth loop);
`AuthProvider`/`ServicesProvider` stable (<10 renders); `RootNavigator` + `AdminWebLayout`
looped (50+ renders) with frozen state `isLoading=false, signedIn=true, role=null,
seg0=(admin-web)`; route segments stable (`["(admin-web)"]`). The loopers are exactly the
`useSegments()` subscribers — the navigation store was emitting no-op notifications while
the guard rendered a **non-navigator** (bare `<SafeAreaView>`) for its Loading / Not
authorized branches. See `docs/qa/PHASE-3C-NATIVE-LOGIN-RENDER-LOOP.md`.

## 3. Architectural Invariant

**Once the native navigator (`<Slot/>`) exists for the `(admin-web)` group, it remains
mounted.** Authorization state determines what is *presented inside* the navigation
hierarchy (chrome + overlays), and must never *replace the hierarchy itself*. Loading,
authorization failure, and temporary role resolution do not destroy/recreate the navigator
subtree.

## 4. Previous Failed Approaches (do not retry)

1. **Auth-effect / loading-state only** — made the guard show "Loading" instead of "Not
   authorized" during the role window. Failed native verification: "Loading" was *also* a
   bare view (still no `<Slot/>`), so the navigator still churned.
2. **Stabilize `<Stack screenOptions>`** — hoisted the inline object to a constant. Failed;
   the diagnostic proved the route/segments never change, ruling this out.

Both are superseded — the defect is a navigator-lifecycle invariant, not an auth-effect or
prop-identity issue.

## 5. New Design

`src/app/(admin-web)/_layout.tsx`:
- `onLogin` → `<Slot/>` (full-screen public login; unchanged).
- Anonymous on a protected route, **once resolved** (`!loading && !session`) →
  `<Redirect href="/(admin-web)/login">` (transient, navigator-safe).
- Otherwise (session present or **still resolving**) → a single stable tree:
  ```
  <View>
    <AdminShell showChrome={authorizedAdmin}><Slot/></AdminShell>   // navigator ALWAYS mounted
    {loading  && <opaque Loading overlay/>}
    {denied   && <opaque "Not authorized" overlay + Sign out/>}
  </View>
  ```
  `<Slot/>` sits at the same position across loading → admin → not-admin, so the navigator
  subtree is never destroyed/recreated by an auth-state change (verified by a mount-count
  assertion in the regression suite).

`src/components/admin-web/admin-shell.tsx`:
- New `showChrome` prop (default `true`). When `false`, the sidebar (side + top) and the
  top bar are rendered as empty slots, and the admin-only unread-notification query is
  skipped. `children` (the navigator) stays at the same child index whether or not chrome
  is shown, so toggling `showChrome` never remounts the navigator.

`src/auth/auth-context.tsx`:
- `applySession` re-enters `isLoading` while the role resolves **for a newly signed-in
  user** (tracked by a `resolvedUserId` ref; same-user token refreshes do not re-enter
  loading). This makes "role resolving" a distinct state that shows the **Loading** overlay
  rather than momentarily treating an unresolved role as a rejection. (Necessary input to
  the overlay logic — not a standalone fix.)

### Why this resolves the native-only behaviour

The loop was driven by the React-Navigation **native stack** re-deriving state when its
nested navigator was repeatedly absent during a persistent transient window (web/react-dom
and jest/react-test-renderer reconcile the same one-commit transient without a sustained
navigation-store feedback loop, which is why they never reproduced it). Keeping `<Slot/>`
continuously mounted removes the absent-navigator condition entirely, so the native stack
has nothing to churn against — the platform-specific trigger is eliminated at its source.

## 6. Files Changed

- `src/app/(admin-web)/_layout.tsx` — navigator-preserving guard with overlays.
- `src/components/admin-web/admin-shell.tsx` — `showChrome` flag (chrome only for admin).
- `src/auth/auth-context.tsx` — re-enter `isLoading` while a new user's role resolves.
- `src/__tests__/admin-navigator-invariant.test.tsx` — new (invariant + security states).
- `src/__tests__/admin-login-transition.test.tsx` — new (end-to-end transition).
- `docs/qa/PHASE-3D-NATIVE-NAVIGATOR-STABILIZATION.md` — this report.

No temporary diagnostics remain (removed before this build).

## 7. Security Review

| Actor / state | Result |
|---|---|
| Anonymous (resolved) | Redirected to login; no navigator content / admin chrome |
| Role resolving | Navigator mounted but fully covered by an **opaque** Loading overlay; no admin UI/nav visible; admin-only notification query skipped |
| Authenticated non-admin | Opaque "Not authorized" overlay + Sign out; **no admin sidebar/nav rendered** (verified by Phase 3A test 3); admin data still governed by RLS |
| Authenticated admin | Dashboard with full chrome |
| Logout | Session cleared → redirect to login |

No schema / migrations / RLS / storage / backend business logic / payment / push / location
changes. Authorization decisions are unchanged; only the *rendering* of the guard changed.

## 8. Regression Tests

`admin-navigator-invariant.test.tsx` (7 tests) asserts the architectural invariant directly
— it **fails on the pre-fix guard** (no navigator during loading / non-admin; 3 failures
confirmed) and passes on the fix:
1. anonymous → redirect to login, no navigator/admin UI;
2. login route → navigator renders (public);
3. role resolving → navigator mounted + Loading overlay + no "Not authorized" + no redirect;
4. non-admin → navigator mounted + "Not authorized" overlay + Sign out;
5. admin → dashboard (navigator + chrome), no overlay;
6. **navigator mounted exactly once across loading → admin → non-admin → admin** (no
   destroy/recreate);
7. logout → redirect to login.

`admin-login-transition.test.tsx` drives the real provider tree + guard through the live
login→dashboard transition: Loading state shown while the role resolves, then dashboard
renders, no error boundary, navigation happens once, and no "Maximum update depth" logged.

The native render loop is renderer-specific (does not reproduce in jest), so it is verified
on-device (§9); the suite locks the invariant + the security behaviour that guarantee it.

## 9. Native Verification

**Build:** `4319548f` — EAS `preview`, Android APK (~111 MB). **Device:** `Pixel_9_Pro_XL`
emulator, Android 16.

| Cycle | Steps | Result |
|---|---|---|
| **1** | Clean install (`pm clear`) → launch → **live admin login** → dashboard | ✅ Dashboard renders (full chrome, live data); **no loop, no error boundary** |
| **2** | Session cleared → relaunch → **login screen shown** → **second fresh admin login** → dashboard | ✅ Returns to login; second login reaches the dashboard; **no loop** |
| **3** | Terminate (`am force-stop`) → relaunch → **restored session** → dashboard | ✅ Dashboard renders immediately; **no loop** |
| Lifecycle | Background (Home/rotation) → resume → dashboard | ✅ Resumes to dashboard; **no loop** |
| Rotation | Device rotated to landscape | App is **portrait-locked** (`app.json orientation: portrait`) — rotation is a no-op for the app; **no regression / no loop** |

**Repeated login cycles:** 2 independent fresh admin logins + 1 restored-session relaunch,
all clean. The previously-failing scenario (live admin login) now succeeds every time. The
non-admin rejection path is covered on web by Phase 3A test 3 (re-run 8/8) and by the
invariant unit suite; a native non-admin account was not exercised on-device (no separate
native non-admin credential in scope).

## 10. Runtime Log Review

Aggregate logcat review across **all** cycles (Cycle 1/2/3 + resume + rotation + interaction):

| Signature | Count |
|---|---|
| `Maximum update depth exceeded` | **0** |
| Error-boundary activation (`reportError` / "Something went wrong") | **0** |
| React render / navigation loop warnings | **0** |
| Repeated auth transitions (`onAuthStateChange` storm) | **0** |
| `FATAL EXCEPTION` / native crash (SIGSEGV / tombstone) | **0** |
| ANR (app) | **0** |
| Network / `UnknownHostException` | **0** |
| `ReactNativeJS … Error:` | **0** |

## 11. Regression Validation

| Gate | Result |
|---|---|
| Root Jest | ✅ 222 suites / **2951** tests (incl. 8 new Phase 3D tests) |
| Website Vitest | ✅ 102 |
| TypeScript (root + qa) | ✅ 0 / 0 |
| Lint | ✅ 59 errors (**unchanged** baseline) + standard test-file warnings; no new errors |
| Connected certification | ✅ **116/116** |
| Phase 3A admin web | ✅ **8/8** (re-run; guard change verified on web incl. non-admin rejection) |
| qa:release | ✅ green — Jest 2951 · `expo export` web + **android** · cert 116 · non-cert 101 |
| Pre-fix guard vs invariant suite | ✅ 3 invariant tests **fail on baseline**, pass on the fix |

## 12. Remaining Limitations

- The native loop cannot be reproduced in jest (renderer-specific); the unit suite asserts
  the invariant that prevents it, and on-device verification is the closure authority.
- iOS not built (Android-only per program scope).
- Customer/provider native journeys remain out of scope.

## 13. Pilot Readiness

Restores the native admin login→dashboard path. Web admin (Phase 3A) unaffected;
customer/provider native surfaces remain a separate concern.

## 14. Final Status

- **Reproduced:** ✅ (Phase 3C, on-device).
- **Fixed:** ✅ (navigator-preserving guard + `AdminShell.showChrome` + auth loading-state).
- **Regression-tested:** ✅ (invariant suite fails on baseline, passes on the fix; full gates green).
- **Native verified:** ✅ (build `4319548f`, 3 cycles + lifecycle, logs clean).
- **Defect closed:** ✅ **YES.**
- **Full Native Journey Certification:** **NOT** claimed.
- **Full Platform Certification:** **NOT** claimed.
