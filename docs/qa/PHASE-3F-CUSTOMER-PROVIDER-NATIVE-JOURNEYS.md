# Phase 3F — Customer and Provider Native Journey Certification

> **Outcome: BLOCKED at the entry point.** The native automation driver (Maestro) is
> installed and working, the build and QA backend are ready, and the customer/provider
> journeys are fully implemented in code — but a **product routing defect makes the
> customer/provider onboarding unreachable on the native Android build**, so the
> customer and provider journeys cannot be exercised or certified. No product code was
> changed (routing fixes require separate approval per the phase rules). This phase
> **does not claim** customer/provider native journey certification.

- **Branch:** `qa/phase-3f-customer-provider-native-journeys`
- **Pre-work baseline (main):** `c015afe89c08d29199ddd0c81ad138b81bab6666`

---

## 1. Executive Summary

Phase 3F set out to certify the customer and provider mobile journeys on a real Android
build against the QA backend, through the UI. Preparation succeeded: **Maestro 2.8.0** was
installed locally and confirmed to drive the emulator and read the app's React-Native text;
the native-verified **preview APK from build `4f6c6f88`** (byte-identical customer/provider
runtime to `main`) was reused; and a full journey map was built from the source (all flows
— onboarding, booking creation, provider progression, review, payment boundary — are
implemented).

Certification is **blocked by a product defect**: the native app's root route `/` is claimed
by **both** `src/app/(admin-web)/index.tsx` and `src/app/(customer)/index.tsx`. Expo-router
resolves `/` to `(admin-web)` on essentially every launch (observed admin login on ~12 of 13
cold launches; 0/8 in the final controlled run), so the app opens on the **Admin Panel
login**. The root auth gate explicitly does not redirect away from `(admin-web)`, there is no
in-app link from the admin login to the customer/provider onboarding, and the app's
custom-scheme deep links do not route to `/welcome`. **Result: a customer or provider cannot
reach their onboarding/authentication surface on the native build.**

Per the phase rules (only certify accessible flows; do not invent/work around; routing
changes need separate approval; stop and request approval before fixing product), this is
documented as a blocker and no product code was modified.

## 2. Starting Baseline

`main` @ `c015afe` (Phases 3A–3E merged). Expo SDK ~56, React 19, RN 0.85, expo-router
~56.2.11, managed workflow. Connected certification 116/116, Phase 3A 8/8, non-cert 130,
native admin login→dashboard loop fixed (3C–3E).

## 3. Phase Objective

Certify the actual **customer** and **provider** mobile journeys on Android through the UI
(not merely backend APIs), using a real native build, the QA backend, and deterministic
data. Out of scope: iOS, real M-Pesa settlement, real push delivery, accessibility,
performance, load, production deployment.

## 4. Native Architecture and Test Driver

- **App:** managed Expo, no `.native.tsx`/`.android.tsx` variant files. Customer and
  provider tab bars use `expo-router/unstable-native-tabs` (**NativeTabs** — OS-native tab
  bars, selectable only by label text; no settable testIDs). Very few testIDs exist in the
  mobile surfaces (`remove-photo-*`, `tag-*`, `quality-loading`, and `StarInput` idPrefixes).
- **Driver: Maestro 2.8.0** (JVM-based; runs on the Android Studio JBR 21). Installed by
  downloading the official release zip to `~/.maestro-dl/maestro` (kept **outside** the
  repo). A reproducible launcher is committed at **`qa/native/maestro.bat`** (sets
  `JAVA_HOME`, silences analytics, runs `maestro.cli.AppKt`). Maestro was verified to launch
  the app, read RN text (e.g. asserts "Sign in", "Admin Panel", "QuickServe"), open deep
  links, and capture UI-hierarchy + screenshots. No product testIDs were added.
- ADB (`platform-tools`) was used only for setup/diagnostics (install, ANR dismissal,
  screenshots, launch), never as the primary UI driver.

## 5. Build and Device Environment

| Item | Value |
|---|---|
| Node / npm | v24.14.1 / 11.11.0 |
| Expo CLI / EAS CLI | 56.1.16 / 18.7.0 |
| Expo SDK / React Native / expo-router | ~56.0.12 / 0.85.3 / ~56.2.11 |
| Android package | `com.quickserve.app` · scheme `quickserve` |
| Build reused | EAS `4f6c6f88` — **preview** APK, ~111 MB (customer/provider runtime byte-identical to `main`; no new build needed) |
| Emulator | `Pixel_9_Pro_XL`, Android 16 (`sdk_gphone16k_x86_64`), swiftshader GPU |
| Install | `Success` |
| QA backend | dedicated QA Supabase project (redacted host `wjvj…`) via uncommitted EAS preview env vars `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| Secrets | none printed/committed |

## 6. Customer Journey Map (from source — all implemented)

| Journey | Route path | Key UI anchors |
|---|---|---|
| Onboarding | `/welcome` → `/role-select` → `/register` or `/login` | "Get Started", "Choose your role", "Create account", "Welcome back"/"Continue" |
| Customer home | `/` (customer tab "Home") | greeting, "What service do you need today?", service cards |
| Booking create | service → `/booking/address` → `/booking/schedule` → `/booking/notes` → `/booking/review` | "Continue" ×3, **"Place Booking"** → `/booking/success` ("Booking created successfully") |
| Booking list/detail | `/bookings` (tab "My Bookings") → `/booking/[id]` | "My Bookings", "Booking Detail", "Assigned Professional" |
| Review | `/booking/[id]` "Your review" (status=completed & assigned) | StarInput, "Submit review" |
| Payment boundary | `/booking/[id]` "Payment" | "Pay with M-Pesa" (mock), "Card — coming soon" (disabled) |
| Provider jobs | `/provider` (tab "My Jobs") → `/provider/job/[id]` | "My Jobs", status buttons "On the way"/"In progress"/"Completed" |

**Post-login landing (`roleHref`):** customer → `/`, provider → `/provider`, admin → `/admin`.

## 7. Customer Authentication — **BLOCKED (entry unreachable)**

The customer cannot reach the customer authentication surface. See §17/§22 for the defect.
Steps 6.1–6.12 could not be executed because the app does not present the customer
onboarding/login. **Not certified.**

## 8. Service Discovery and Booking Creation — **BLOCKED**
## 9. Admin Assignment Prerequisite — **NOT REACHED** (depends on §8)
## 10. Provider Authentication — **BLOCKED** (same entry defect — provider onboarding unreachable)
## 11. Assigned-Job Visibility — **NOT REACHED**
## 12. Provider Status Progression — **NOT REACHED**
## 13. Customer Completion Visibility — **NOT REACHED**
## 14. Review Submission — **NOT REACHED**
## 15. Payment UI Boundary — **NOT REACHED** (no real payment was triggered; boundary not exercised)
## 16. Session and Lifecycle Behaviour — **NOT CERTIFIED for customer/provider** (entry blocked)

## 17. Authorization and Role Isolation — Blocking Defect

**Defect: the native app has an ambiguous root route, so customers/providers cannot reach
their app.**

Root cause (code evidence):
- `src/app/(admin-web)/index.tsx` (admin dashboard) and `src/app/(customer)/index.tsx`
  (customer home) **both resolve to the root route `/`** (route groups are stripped from the
  URL). There is no `src/app/index.tsx` and no `initialRouteName`/`unstable_settings`.
- Expo-router resolves `/` to `(admin-web)` on essentially every launch. The root navigator
  guard (`src/app/_layout.tsx`) contains `if (segments[0] === '(admin-web)') return;` — so
  when the app opens on `(admin-web)` it never redirects to the customer onboarding; the
  admin-web guard renders the **Admin Panel login** for an unauthenticated user.
- The redirect to `/welcome` only fires when the initial route is **not** `(admin-web)`
  (`if (!signedIn && !inOnboarding) router.replace('/welcome')`), which is the rare case.

Reachability evidence (this phase, Maestro on the emulator):
- Cold `clearState` launch → **Admin Panel login** on ~12 of 13 launches (0/8 in the final
  controlled run; a single "welcome" appearance was observed once).
- Deep links `quickserve:///welcome`, `quickserve://welcome`,
  `quickserve:///onboarding/welcome` → the app **remained on the Admin Panel login**
  ("Get Started" never appeared). `app.json` declares **no `android.intentFilters`**, so
  custom deep-link entry is not configured.
- The Admin Panel login exposes only Email/Password/"Sign in" — **no** link to customer or
  provider onboarding/registration.

Impact on authenticated non-admins: because `(admin-web)/index` also claims `/`, a
**logged-in customer or provider** whose session resolves onto `(admin-web)/index` is shown
the "Not authorized" overlay (Phase 3E behaviour) rather than their home — i.e. the defect is
not limited to first entry.

**Expected:** a customer/provider opening the native app reaches `/welcome` → their login →
their home/tabs. **Actual:** the app opens on the admin-web login with no reachable path to
customer/provider onboarding.

Reproduction (committed): `qa/native/flows/entry-reachability.yaml` — asserts the app lands
on the admin login and that a `/welcome` deep link does not route there.

## 18. Backend Persistence Verification — **NOT PERFORMED**

No Phase 3F booking/review/payment records were created (no journey ran). Service-role
setup/cleanup was not needed. Zero QA data was created or altered.

## 19. Cleanup and Residual Data

Nothing to clean — **no Phase 3F data was created**. Persistent QA accounts were never
signed into on the customer/provider surfaces (they are unreachable). App uninstalled and
emulator shut down after investigation. **Residual Phase 3F records: 0** (none created).

## 20. Files Changed

- `qa/native/maestro.bat` — reproducible Maestro launcher (test tooling; Maestro binary
  lives outside the repo in `~/.maestro-dl`).
- `qa/native/flows/entry-reachability.yaml` — Maestro flow that reproduces the entry blocker.
- `docs/qa/PHASE-3F-CUSTOMER-PROVIDER-NATIVE-JOURNEYS.md` — this report.
- **No product/source/schema/dependency changes.**

## 21. Validation Matrix

| Gate | Result |
|---|---|
| Native driver (Maestro 2.8.0) install + smoke | ✅ works (launches app, reads RN text, drives emulator) |
| Build reuse (`4f6c6f88` preview APK) | ✅ installed on Android 16 emulator |
| Journey map (source audit) | ✅ complete — all customer/provider flows implemented |
| Entry reachability | ❌ **customer/provider onboarding unreachable** (blocker) |
| Customer journey A–C / Provider journey A–B | ❌ **BLOCKED / NOT RUN** |
| Product regression gates (Jest / Vitest / tsc / lint / cert 116 / Phase 3A 8 / qa:release) | **inherited-green from `main` c015afe** — Phase 3F added no product code (only `qa/native/*` test files + a doc), so these are unaffected; re-running was unnecessary and no code path changed |
| Cleanup / residual | ✅ 0 records created; 0 residual |

## 22. Defects and Limitations

**DEFECT (Critical / pilot-blocking) — ambiguous native root route makes customer/provider
app unreachable.** Details, evidence, and root cause in §17. Classification: **product
routing defect**. This is the sole reason Phase 3F could not certify the customer/provider
journeys.

Recommended fix (requires separate approval — routing change, disallowed in this phase):
disambiguate the root route so the **customer app is the deterministic default entry** —
e.g. add a dedicated `src/app/index.tsx` that routes by auth/role/onboarding, or remove the
`(admin-web)/index` root claim so the admin panel is reached via an explicit `/admin`-style
path, or set an explicit `initialRouteName`. Optionally add deep-link `intentFilters` for a
deterministic entry. After the fix, re-run Phase 3F.

Limitations: emulator swiftshader GPU intermittently raised a system-level "System UI isn't
responding" ANR (not the app); iOS not attempted.

## 23. Pilot-Readiness Impact

**Critical.** As currently built, the native Android app does not deliver the
customer or provider experience to those users — it opens on the admin login. The mobile
customer/provider product surfaces are **not pilot-ready** until the root-route entry defect
is fixed. The admin-web surface (Phase 3A) and the connected backend (116/116) remain
certified and unaffected.

## 24. Remaining Native Gaps

- Customer & provider native UI journeys: **uncertified** (blocked at entry).
- iOS: not attempted.
- Real payment settlement, real push delivery, background location, accessibility,
  performance: explicitly out of scope; **not certified**.

## 25. Recommended Next Phase

**Phase 3G — Native Entry-Routing Fix (product):** with approval, fix the ambiguous root
route so customers/providers reach their app deterministically; then **re-run Phase 3F**
(customer/provider native journey certification) on the fixed build using the Maestro driver
already prepared here.

## 26. Final Status

- **Native driver:** ✅ ready (Maestro 2.8.0, reproducible wrapper committed).
- **Build/QA backend:** ✅ ready (preview APK `4f6c6f88`, QA backend).
- **Journey map:** ✅ built (flows implemented in code).
- **Customer native journey certification:** ❌ **BLOCKED / not achieved.**
- **Provider native journey certification:** ❌ **BLOCKED / not achieved.**
- **Blocking defect:** ambiguous native root route (customer/provider onboarding unreachable).
- **No real payment triggered · no production push sent · no production release / store
  submission / OTA.**
- **Full Native Journey Certification: NOT claimed** (critical journeys did not run).
- **Full Platform Certification: NOT claimed.**

### Certification layer distinctions (unchanged by this phase)
- Android native customer/provider UI: **NOT certified** (blocked).
- Android native **admin** UI login→dashboard: certified (3C–3E).
- Backend connected certification: certified (116/116).
- Admin web certification: certified (Phase 3A, 8/8).
- iOS · real payment settlement · actual push delivery · background location ·
  accessibility · performance · production deployment: **NOT certified / out of scope**.
