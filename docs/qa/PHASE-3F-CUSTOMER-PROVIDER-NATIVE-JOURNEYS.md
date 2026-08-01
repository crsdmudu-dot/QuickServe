# Phase 3F — Customer and Provider Native Journey Certification

> **Re-run outcome: PASS.** On the **Phase 3G candidate** (build `aa9fa606`, deterministic
> native entry) the complete customer and provider mobile journeys were certified through
> the real native UI, with backend persistence, cleanup, and lifecycle all verified. The
> original Phase 3F run (below, §Original Finding) was **blocked** by the ambiguous native
> root route; Phase 3G fixed it, and this re-run is the evidence.
>
> **Full Native Journey Certification** is achieved for the defined critical customer +
> provider journeys on Android. **Full Platform Certification is NOT claimed** (iOS, real
> payment settlement, real push delivery, background location, accessibility, performance,
> production deployment are out of scope / not certified).

- **Branch:** `fix/phase-3g-native-entry-routing` (Phase 3G candidate under test)
- **Pre-work baseline (main):** `c015afe`

---

## 1. Executive Summary

The customer and provider native journeys are **fully implemented and now reachable** after
the Phase 3G entry-routing fix. Driven by **Maestro 2.8.0** against the QA Supabase backend
on the Phase 3G preview APK (`aa9fa606`), an end-to-end run certified: customer sign-in →
home → browse → **create a booking through the UI** → confirmation → history/detail;
admin-API assignment to Provider One; provider sign-in → assigned job → **status
progression `provider_assigned → on_the_way → in_progress → completed`**; customer
completion visibility → **review submission through the UI**; the mock payment boundary;
session/lifecycle; role isolation; and full backend persistence at every step. All Phase 3F
data was cleaned up (0 residual) and the provider aggregate restored. No admin leakage, no
error boundary, no crash/ANR, no navigation loop. Regression gates (Jest, Vitest, tsc, lint,
cert 116/116, Phase 3A 8/8, qa:release, Phase 3D/3E) all pass.

## 2. Starting Baseline

`main` @ `c015afe`; Phase 3G candidate at `375b444`. Expo SDK ~56, RN 0.85, expo-router
~56.2.11. Native driver Maestro 2.8.0 (`qa/native/maestro.bat`).

## 3. Phase Objective

Certify the complete customer and provider mobile journeys on Android through the UI (not
merely backend APIs), verify no admin leakage, backend persistence, cleanup, lifecycle, and
no regressions — on the Phase 3G candidate.

## 4. Native Architecture and Test Driver

- **Driver:** Maestro 2.8.0 (reproducible launcher `qa/native/maestro.bat`; Maestro binary
  lives outside the repo). Reads RN text, drives the emulator, dismisses system dialogs.
  Credentials are passed via Maestro `-e` params (never stored in flow files).
- **Backend helper:** `qa/native/backend.mjs` — QA Supabase REST via the service role, used
  **only** for setup-verification, the admin assignment prerequisite, and cleanup (parses
  `qa/.env` via dotenv). The behaviours under test are all driven through the native UI.
- **Committed flows:** `qa/native/flows/entry-reachability.yaml`, `customer-journey.yaml`,
  `customer-review.yaml`. Credentialed/temp flows (`flows/_*.yaml`) are gitignored.

## 5. Build and Device Environment

| Item | Value |
|---|---|
| Build | EAS `aa9fa606` — **preview** APK, ~111 MB (Phase 3G candidate; runtime = `375b444`) |
| Emulator | `Pixel_9_Pro_XL`, **Android 16** (`sdk_gphone16k_x86_64`), swiftshader GPU |
| Install | `Success` |
| QA backend | dedicated QA Supabase project (redacted host `wjvj…`) via uncommitted EAS preview env vars |
| Accounts | persistent QA customer, provider1, provider2, admin (never modified beyond the transient booking/review, which were cleaned up) |

## 6. Customer Journey Map

(unchanged — all flows implemented; see §7–§8 for the exercised path).

## 7. Customer Authentication — ✅ PASS

Cold launch → **welcome** (customer/provider onboarding, not admin login) → "Log in" →
customer sign-in ("Welcome back") → QA customer login → **customer home** ("What service do
you need today?"). Asserted **no** admin login and **no** "Not authorized". Session survives
background/foreground and terminate/relaunch; logout returns to welcome; login again reaches
home (§16). No error boundary / crash / loop / leakage.

## 8. Service Discovery and Booking Creation — ✅ PASS (through the UI)

Home → browsed Popular services → selected **House Cleaning** → `/booking/address` (manual
entry) → `/booking/schedule` (**ASAP**) → `/booking/notes` (unique marker) → `/booking/review`
→ **"Place Booking"** → **"Booking created successfully"** → "Back to Home" → **My Bookings**
shows the House Cleaning booking. No API insertion was used for creation.

**Backend (service-role read):** exactly **1** booking (no duplicate) —
`customer_id` = QA customer, `service_id` = `house-cleaning`, `status` = `pending`,
`address` = "QA P3F Test Address, Nairobi", `scheduled_for` set, `notes` = marker,
`assigned_provider_id` = null, `created_at` set.

## 9. Admin Assignment Prerequisite — ✅ done (controlled API setup)

**Method:** certified admin **connected-helper API** (the Phase 2 `assignProvider` pattern —
service-role PATCH setting `assigned_provider_id`/`_name`/`_phone` + `status`), used as the
acceptable fallback because running the admin **web** UI concurrently with the native app on
one emulator would destabilise the native run. **This is controlled setup, NOT a new admin
UI certification.**

**Result:** `status` = `provider_assigned`, `assigned_provider_id` = Provider One
(`20ffb0c8…`), `assigned_provider_name` = "QA Provider One".

## 10. Provider Authentication — ✅ PASS

Provider One cold launch → welcome → sign-in → **My Jobs** (approved provider dashboard).
Asserted **no** admin login / "Not authorized" (no cross-role leakage).

## 11. Assigned-Job Visibility — ✅ PASS

My Jobs lists the assigned **House Cleaning** job → opened → **Job Detail** shows: Service
"House Cleaning", Address matching the customer entry, When "ASAP", Notes = marker, Provider
"QA Provider One", status badge "Provider assigned". (Provider Two isolation is covered by
the connected certification's provider-progression security tests.)

## 12. Provider Status Progression — ✅ PASS (UI + backend per state)

Through the provider job-detail UI (the "Location Accuracy" system prompt that appears for
live-location was dismissed naturally with "No thanks"):

| Transition (UI button) | Backend status | `assigned_provider_id` |
|---|---|---|
| `provider_assigned` → **"On the way"** | `on_the_way` | unchanged |
| `on_the_way` → **"In progress"** | `in_progress` | unchanged |
| `in_progress` → **"Completed"** | `completed` | unchanged |

Each transition was triggered through the UI and verified in the backend; the assigned
provider was never reassigned. No API updates were used for the behaviour under test.

## 13. Customer Completion Visibility — ✅ PASS

Customer → My Bookings → booking detail shows **"Completed"** with the full progress tracker
(Pending → Assigned → In Progress → Completed) and an **activity log** reflecting all four
transitions ("A professional has been assigned", "Your professional is on the way", "Work has
started", "Your job is complete").

## 14. Review Submission — ✅ PASS (through the UI)

Booking detail → "Your review" → tapped **★★★★★** (overall `star-5`) → comment → **"Submit
review"** → UI shows "Edit review" (submission succeeded; a second submission is prevented —
the control becomes edit, so **no duplicate**).

**Backend:** **1** review — `booking_id` correct, `customer_id` = QA customer, `provider_id`
= Provider One, `rating` = 5, comment persisted, `is_hidden` = false. **Provider aggregate
updated:** `average_rating` 5, `review_count` 1.

## 15. Payment UI Boundary — ✅ observed (no payment triggered)

The booking detail Payment section showed **"No quote yet."** (no amount → no pay action).
**No** "Pay with M-Pesa" was triggered, **no** Daraja/production endpoint called, **no** real
phone charged, **no** settlement claimed. The disabled "Card — coming soon" boundary is
present by design. Payment functionality was not expanded.

## 16. Session and Lifecycle Behaviour — ✅ PASS

background/foreground ✅ · terminate/relaunch with restored session ✅ · logout → welcome ✅ ·
login again → home ✅ · keyboard/text input ✅ · tab navigation ✅ · back navigation ✅.
Aggregate logcat across the journeys: **no** `Maximum update depth`, **no** error boundary,
**no** fatal exception / native crash, **no** ANR, **no** navigation loop, **no** cross-role
leakage. (Emulator raised occasional system-level "System UI isn't responding" ANRs under
swiftshader — a host/GPU artifact, not the app; mitigated by a fresh boot + reduced
animations.)

## 17. Authorization and Role Isolation — ✅ PASS

Customer and provider surfaces never showed the admin login or "Not authorized" (asserted at
each entry). The customer only ever saw customer UI; the provider only provider UI. Backend
RLS (unchanged) governs data access; provider2 isolation is covered by the connected cert.

## 18. Backend Persistence Verification — ✅ PASS

Every UI action was confirmed in the QA backend (service-role reads): booking create
(pending, correct fields, no duplicate) → assignment (provider_assigned) → progression
(on_the_way → in_progress → completed, provider unchanged) → review (rating 5, correct
linkage) → provider aggregate (5 / 1).

## 19. Cleanup and Residual Data — ✅ PASS

`backend.mjs cleanup <marker>` deleted **1 review + 1 booking**; residual bookings **0**,
residual reviews **0**. Provider aggregate **restored** (`average_rating` null,
`review_count` 0). App uninstalled, emulator shut down. Persistent QA accounts preserved.
**Zero Phase 3F residual data.**

## 20. Files Changed

- `qa/native/backend.mjs` (new — service-role setup/verify/cleanup helper).
- `qa/native/flows/customer-journey.yaml`, `qa/native/flows/customer-review.yaml` (new).
- `qa/native/flows/entry-reachability.yaml` (from Phase 3G; unchanged here).
- `qa/native/.gitignore` (+ ignore `flows/_*.yaml` credentialed/temp flows).
- `docs/qa/PHASE-3F-CUSTOMER-PROVIDER-NATIVE-JOURNEYS.md` (this report).
- **No product/source/schema/dependency changes.**

## 21. Validation Matrix

| Gate | Command | Result |
|---|---|---|
| Customer journey (native UI) | Maestro `customer-journey.yaml` | ✅ PASS |
| Booking backend | `backend.mjs find` | ✅ 1 booking, correct fields, no duplicate |
| Assignment | `backend.mjs assign` (admin API) | ✅ provider_assigned → Provider One |
| Provider progression (native UI) | Maestro (per-state) + `backend.mjs read` | ✅ on_the_way → in_progress → completed |
| Review (native UI) | Maestro `customer-review.yaml` + `backend.mjs review` | ✅ rating 5 persisted; aggregate 5/1 |
| Lifecycle + logcat | Maestro + adb + logcat | ✅ clean (0 loop/boundary/crash/ANR/leak) |
| Cleanup | `backend.mjs cleanup` | ✅ 0 residual; aggregate restored |
| Root Jest | `npm test` | ✅ 222 / **2951** |
| Website Vitest | `npm --prefix apps/website test` | ✅ 102 |
| TypeScript (root / qa) | `tsc --noEmit` | ✅ 0 / 0 |
| Lint | `npm run lint` | ✅ 59 errors (unchanged baseline) |
| Connected certification | `qa:test:certification` | ✅ **116/116** |
| Phase 3A admin web | `qa:test:web` | ✅ **8/8** |
| qa:release | `npm run qa:release` | ✅ Jest 2951 · web+android export · cert 116 · **non-cert 130 / 56 skipped / 0 failed** |
| Phase 3D/3E tests | jest (navigator-invariant, login-transition, executive-dashboard) | ✅ 15/15 (intact) |
| Native smoke | the journeys above | ✅ PASS (logcat clean) |

## 22. Defects and Limitations

- **No new product defects.** The original Phase 3F blocker (ambiguous native root route) was
  fixed by Phase 3G (candidate under test here) and is resolved.
- **Test-driver notes (not product defects):** the `on_the_way` job detail triggers a Google
  "Location Accuracy" system prompt (expected — provider live-location) — dismissed with "No
  thanks"; the emulator intermittently raised a system "System UI isn't responding" ANR
  (host GPU artifact). Neither is an app defect.

## 23. Pilot-Readiness Impact

The customer and provider native journeys are now **reachable and functional end-to-end** on
Android, persisting correctly to the backend. Combined with the certified admin web (Phase
3A) and connected backend (116/116), the mobile customer/provider surfaces are materially
**pilot-ready on Android** (subject to the out-of-scope layers below).

## 24. Remaining Native Gaps (out of scope / not certified)

iOS · real M-Pesa settlement · actual push delivery · background location tracking ·
accessibility · performance/load · production deployment. Provider2 native isolation not
exercised on-device (covered by connected cert). Chat/track screens not exercised.

## 25. Recommended Next Phase

Merge Phase 3G (this evidence supports it), then (with approval) an iOS native pass and/or a
payment-settlement (mock→sandbox) certification phase.

## 26. Final Status

- **Customer native journey:** ✅ certified (auth, booking creation, completion visibility,
  review).
- **Provider native journey:** ✅ certified (auth, assigned-job visibility, full status
  progression).
- **Backend persistence / cleanup / lifecycle / role isolation:** ✅ verified.
- **Regressions:** none (Phase 3D/3E intact; cert 116/116; Phase 3A 8/8; qa:release green).
- **No real payment · no production push · no production release / store submission / OTA.**
- **Full Native Journey Certification (customer + provider, Android):** ✅ **claimed** — every
  defined critical journey passed.
- **Full Platform Certification: NOT claimed.**

### Original Finding (Phase 3F first run — historical, now resolved)
The first Phase 3F run was **blocked**: the native app opened on the admin login because the
root route `/` was claimed by both `(admin-web)/index` and `(customer)/index`, so the
customer/provider onboarding was unreachable. Documented and reported without a product fix.
**Phase 3G** corrected the entry routing (single `/` dispatcher; customer `/home`, admin
`/dashboard`, onboarding `/signin`); this re-run on the Phase 3G candidate passes.
