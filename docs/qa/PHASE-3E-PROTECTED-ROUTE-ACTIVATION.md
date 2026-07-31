# Phase 3E — Protected Route Activation Stabilization

> Preserves the Phase 3D native navigator-stabilization fix while eliminating the
> loading-window regression it introduced (found during Phase 3D→merge verification).
> **Native verification is the closure authority** and is recorded in §Validation.

- **Branch:** `fix/phase-3c-native-login-render-loop`
- **Baseline (main):** `85943f49ea9b4cc721360f78e366cceaf59f8bfc`
- **Builds on:** `fe489d3` (Phase 3C investigation) → `fc371b9` (Phase 3D native fix).

---

## 1. Root Cause

Phase 3D fixed the native login→dashboard render loop by keeping the `(admin-web)`
navigator (`<Slot/>`) **mounted at all times** (authorization expressed via opaque
overlays, never by swapping the navigator subtree). Correct for the loop — but it
changed *when* protected screens mount: they now mount **during** the post-login
"session set, role not yet resolved" window, instead of only after auth resolved.

The Executive Analytics screen (`(admin-web)/analytics/index.tsx`) therefore:
1. **rendered its section scaffolding** during the loading window (behind the overlay), and
2. **ran its data-fetch effect** before authorization completed.

The connected/mock test `executive-dashboard.spec.ts` asserts that opening the
dashboard requests the `analytics_executive_overview` RPC. On the pre-3D baseline the
screen mounted only *after* auth resolved, so its section headings became visible
*after* the RPC fired — the test's "sections visible" wait naturally gated the
assertion until the RPC was in flight. Under Phase 3D the section headings were visible
*during* loading (screen mounted early), so the test reached its RPC assertion **before**
the fetch ran (the fetch was delayed while the Supabase client initialised its session),
and failed:

```
Expected RPC(s) were never requested: analytics_executive_overview
```

Isolated rigorously: **baseline `85943f4` PASS 3/3; Phase 3D `fc371b9` FAIL 3/3**, same
test file (untouched by the fix). Instrumentation confirmed the screen mounts exactly
once (no remount) and the RPC *does* eventually fire — the regression is purely the
early, pre-auth activation.

## 2. Why Phase 3D Regressed

Phase 3D's invariant ("once the native navigator exists, it stays mounted") is right and
must be kept — but it made "mounted" imply "active." A mounted protected screen executed
its protected logic (render + fetch) before authorization resolved. Visually the overlay
hid it, but the DOM/effects ran: the fetch raced the test, and (more generally) admin
data fetches would run during the loading window and for a not-yet-authorized user.

## 3. Architectural Invariant (Phase 3E)

Extend Phase 3D with a second invariant:

> **A protected admin screen stays mounted (navigator preserved) but does not present its
> protected content or execute protected logic until auth has resolved to a confirmed
> admin.**

Mounted ≠ active. Activation is gated on authorization; mounting is not.

## 4. Architectural Solution

**Auth-ready gating + deferred screen activation** — the smallest change that keeps the
navigator untouched:

- **`src/auth/auth-context.tsx`** — new reusable hook `useAdminReady()` returning
  `!isLoading && role === 'admin'`. A single, self-documenting source of truth for
  "auth resolved to a confirmed admin."
- **`src/app/(admin-web)/analytics/index.tsx`** — the Executive Analytics screen:
  - **defers its data fetch**: the initial `load()` effect runs only when `adminReady`
    (`useEffect(() => { if (adminReady) void load(); }, [adminReady, load])`);
  - **defers its content render**: until `adminReady`, it returns a stable, empty
    placeholder `<View>` (the screen component stays mounted — the navigator is never
    disturbed — but presents no protected structure). Once admin is confirmed it renders
    the real dashboard and the fetch fires.

The `(admin-web)/_layout.tsx` guard, `AdminShell`, and the whole Phase 3D navigator
structure are **unchanged** — `<Slot/>` still stays mounted throughout. Only the screen's
*activation* is gated.

**Explicitly avoided:** timers, arbitrary delays, retries, forced remounts, disabling
effects globally, weakening authorization, and any change that toggles the navigator.

## 5. Why Phase 3E Resolves Both Issues

- **Native loop stays fixed:** the navigator (`<Slot/>`) is never unmounted/swapped — the
  screen component remains continuously mounted; only its *output* changes from a
  placeholder to the dashboard. Nothing in the navigator lifecycle changed vs Phase 3D.
- **Loading-window regression fixed:** the screen presents no sections and issues no RPC
  until `adminReady`. The dashboard's section headings become visible only after auth
  resolves — restoring the baseline ordering where the RPC fires before the test's
  assertion. A non-admin never activates (never fetches); an anonymous user is redirected
  by the guard and never mounts the screen.

## 6. Files Changed

- `src/auth/auth-context.tsx` — add `useAdminReady()` hook.
- `src/app/(admin-web)/analytics/index.tsx` — import the hook; gate the fetch effect;
  render a placeholder until `adminReady`; add the `activationPlaceholder` style.
- `src/__tests__/executive-dashboard.test.tsx` — mock `@/auth/auth-context`
  (`useAdminReady: () => true`) so the existing unit suite still exercises the resolved-
  admin dashboard (the screen now depends on auth-ready; without the mock its new import
  chain pulls the real Supabase env at module load).

(No changes to the Phase 3D files — guard/AdminShell/navigator untouched.)

## 7. Security / Authorization

- **No protected RPC before auth-ready:** `load()` runs only when `!isLoading && role ===
  'admin'`.
- **Non-admin never executes admin fetches:** for a non-admin, `adminReady` is never true
  → the screen renders the placeholder and never fetches; the guard shows the opaque "Not
  authorized" overlay.
- **Anonymous:** redirected to the admin login by the guard (screen never mounts).
- No schema / migrations / RLS / storage / backend / payment / push / location changes.
  RLS and backend authorization are unchanged; only client-side *activation timing* changed.

## 8. Validation

### Regression suite (local)

| Gate | Result |
|---|---|
| Root Jest | ✅ 222 suites / **2951** tests (incl. the repaired `executive-dashboard.test.tsx`) |
| Website Vitest | ✅ 102 |
| TypeScript (root + qa) | ✅ 0 / 0 |
| Lint | ✅ 59 errors (**unchanged** baseline) |
| `executive-dashboard.spec.ts` (the regressed suite) | ✅ **15/15** (was 3/3 FAIL on Phase 3D) |
| Full admin Playwright suite (chromium) | ✅ **41/41** (no other loading-window regression) |
| Connected certification | ✅ **116/116** |
| Phase 3A admin web | ✅ **8/8** |
| qa:release | ✅ Jest 2951 · export web + **android** · cert 116 · **non-cert 130** (restored from the regressed 101) |

### Web behavioural checks

- `analytics_executive_overview` RPC **is** observed on dashboard open (post-auth).
- **No** protected RPC before auth-ready (fetch gated on `adminReady`).
- **Non-admin never** executes admin fetches (gate never opens).

### Native verification (build `4f6c6f88`, `Pixel_9_Pro_XL` / Android 16 emulator)

| Scenario | Result |
|---|---|
| Cycle 1 — clean install → **live admin login** → dashboard | ✅ dashboard renders (chrome + live data); no loop |
| Cycle 2 — session cleared → **login screen** → **second login** → dashboard | ✅ returns to login; second login reaches dashboard; no loop |
| Cycle 3 — terminate → relaunch → **restored session** → dashboard | ✅ dashboard immediately; no loop |
| Background → foreground (×2) | ✅ resumes to dashboard; no loop |

Aggregate logcat across all cycles: `Maximum update depth` **0** · error boundary **0** ·
render/nav-loop warnings **0** · repeated auth transitions **0** · fatal/native crash **0** ·
ANR **0** · `ReactNativeJS … Error:` **0**. The Phase 3D navigator loop fix is **preserved**;
Phase 3E introduces no native regression.

The Executive Analytics screen's gated activation + RPC timing is verified in the **web**
lane (`executive-dashboard.spec.ts` 15/15, admin suite 41/41) — the environment whose mock
tracker can observe RPC ordering. Reaching that screen through the UI on the narrow emulator
was impractical; the native lane's role is to confirm the navigator/loop invariant across the
auth lifecycle, which it does.

## 9. Remaining Limitations

- The deferred-activation gate is applied to the Executive Analytics screen — the screen
  with the confirmed regression (the strictest RPC-timing test). Other admin screens
  mount under the same navigator; none exhibited a test-observable regression (full admin
  suite 41/41), and `useAdminReady()` is available as the shared pattern should any need
  it later.
- The native render loop remains renderer-specific (not reproducible in jest); on-device
  verification is the closure authority.
- iOS not built (Android-only per program scope); customer/provider native journeys out
  of scope.

## 10. Final Status

- **Phase 3D native loop fix:** preserved (navigator untouched).
- **Loading-window regression:** resolved (executive-dashboard 15/15; non-cert 130).
- **Regression suite:** green.
- **Native verified:** ✅ build `4f6c6f88` — Cycles 1-3 + background/foreground, logs clean.
- **Defect closed:** ✅ the loading-window regression is resolved and the native loop fix
  remains intact.
- Full Native Journey Certification and Full Platform Certification are **NOT** claimed.
