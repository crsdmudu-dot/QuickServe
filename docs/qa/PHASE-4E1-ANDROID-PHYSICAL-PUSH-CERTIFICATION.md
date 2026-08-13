# Phase 4E.1 — Android Physical Push Delivery Certification

> **Scope:** QA only. **Android physical device only.** No Production push was sent, no Production
> record/credential/secret was modified, no store submission, no OTA. **iOS is NOT physically
> certified** by this phase (see §12). Android certification is **not** iOS certification.

## 1. Verdict

**Android physical push delivery is CERTIFIED on a Samsung Galaxy S24 Ultra (One UI 8.5 / Android 16)
against QA.** Real Expo→FCM delivery, foreground/background/terminated behavior, warm + cold-start tap
routing, single-account device-token ownership, logout cleanup, backend token-claim, cross-account
isolation, provider push, role isolation, and permission-denied UX all pass on the physical device.
Seven runtime defects were discovered during certification and **all are CLOSED** (fixed, regression
-tested, emulator-verified where applicable, and physical-device re-verified). One QA fixture
inconsistency was corrected; one P3 server-side hardening observation remains logged as a non-blocker.

## 2. Device & Environments

- **Device:** Samsung Galaxy S24 Ultra, One UI 8.5 (Android 16), package `com.quickserve.app`.
- **Runtime:** Expo SDK 56, `expo-notifications` 56.0.18, React Native 0.85.3. Expo Go cannot receive
  Android remote push on SDK 53+, so an EAS build is required.
- **Backend:** QA `wjvjuplooidctlxxozws` (preview EAS environment → QA). DEV `gzkvna…`, Production
  `lkigkltvstlxfdztffds` untouched.
- **Emulator (developer verification):** Pixel_9_Pro_XL (Android 16) — used by the engineer to
  reproduce/verify the navigation & search defects at runtime.

## 3. Push Credential / FCM Setup (Android)

- **Transport:** Expo Push Service (BASIC, unauthenticated send) → FCM → device. The only backend
  secret is `PUSH_WEBHOOK_SECRET` (self-provisioned on QA).
- **FCM V1 configured on the Expo project:** Firebase project **`quickserve-1bfa9`** (project number
  623259584430), Android app `com.quickserve.app`.
  - `google-services.json` is **git-ignored** and delivered to EAS via the **file-type env var
    `GOOGLE_SERVICES_JSON`** on the `preview` environment; `app.config.js` injects it into
    `android.googleServicesFile`. Falls back cleanly (unset) in CI/web.
  - FCM V1 **service-account key** uploaded to the Expo project's Android credentials (dashboard).
- **DB→function trigger path (QA, final wired state):** `private.push_config.send_push_url =
  https://wjvjuplooidctlxxozws.supabase.co/functions/v1/send-push` + matching `webhook_secret`;
  `send-push` `PUSH_WEBHOOK_SECRET` set to the same value. This enables the real
  `notifications INSERT → trg_push_notification → notify_send_push → net.http_post → send-push → Expo
  → FCM → device` path.

## 4. EAS Build Sequence (all `preview`, QA, arm64 APK — never Production, never submitted)

| Build ID | Commit | Purpose |
|---|---|---|
| `167f62e0` | `42dba78` | Initial FCM-wired QA build |
| `f409b286` | `21b871a` | In-app notification refresh fix |
| `be636494` | `b642daa` | Cold-start tap-routing fix |
| `a773c89c` | `ac428a5` | Token-ownership P1 fix |
| `28efc068` | `c25f52e` | Customer orphan-route navigation fix |
| `8eb96d99` | `5bdcded` | /providers collision + DB-backed search suggestions |
| **`a176e0c6`** | **`b1e8d1b`** | **Home search-bar fix — FINAL certified build** |

## 5. Defects Discovered During Certification — all CLOSED

| # | Defect | Severity | Root cause | Fix | Status |
|---|---|---|---|---|---|
| 1 | **Foreground in-app notification refresh** | P2 | Notifications screens loaded once on mount (no `RefreshControl`, no `useFocusEffect`, no realtime); new rows never appeared without a cold restart | Pull-to-refresh + focus refetch (customer & provider); `usePaginatedList.reload` awaitable | **CLOSED** |
| 2 | **Terminated/cold-start tap-routing race** | P2 | Tap handler used only `addNotificationResponseReceivedListener`, registered after an async import; the launch tap (delivered via `getLastNotificationResponseAsync`) was missed → app fell back to Home | Read `getLastNotificationResponseAsync()` on startup, dedupe by notification id, AsyncStorage stale-guard | **CLOSED** (2/2 physical) |
| 3 | **Stale device token / cross-account push leakage** | **P1** | Logout did not unregister the device token; `device_tokens` unique on `(user_id, push_token)` let one physical token stay attached to multiple accounts | Client `unregisterForPushNotifications()` on logout (RLS-scoped) + backend service-role **token-claim** in `register-device` (removes the token from other accounts) | **CLOSED** (16-step physical cert) |
| 4 | **Customer NativeTabs orphan-route navigation** | P2/High | `providers/favorites/search/preferences/trust` lived in the `(customer)` NativeTabs group but were not `<NativeTabs.Trigger>`s → non-trigger routes are unreachable → buttons no-oped | Moved the 5 screens to **root-level stack routes**; repointed all callers | **CLOSED** |
| 5 | **`/providers` route collision** | High | Moving the customer providers screen to root `/providers` collided with `(admin-web)/providers` → customer hit the admin auth guard ("Not authorized") | Renamed customer route to **`/browse-providers`**; admin `/providers`, RLS, RPC unchanged | **CLOSED** |
| 6 | **Search catalogue source-of-truth** | Medium | Suggestions/recommendations read the hardcoded `SERVICES` constant while results read the live DB catalogue → suggestions could reference services absent from the catalogue | `searchSuggestions(services,…)` + `noResultRecommendations(services)` derive from `useServices().services` | **CLOSED** |
| 7 | **Home search TextInput tap interception** | High | Home search bar was a `TouchableOpacity(→/search)` wrapping an **editable `TextInput`**; taps focused the dead field instead of navigating — users never reached `/search` | Wrapped the display-only `SearchBar` in `<View pointerEvents="none">` so the tap navigates | **CLOSED** (emulator + physical) |

**Fixture correction (not a product defect):** an early certification fixture advanced `booking.status`
directly via `service_role`, producing an internally-inconsistent booking (`in_progress` with no
provider/quote). The fixture was corrected via the normal admin-supported paths (assign provider +
`set_quote` + status advance). A **P3 hardening observation** remains logged (below), **not** a 4E.1
blocker.

### P3 observation (logged, not fixed here)
`service_role`/direct DB writes can create impossible booking states because the state-machine
invariant is enforced in app/RPC logic and the **provider** RLS `WITH CHECK` — not comprehensively at
the DB level (the `is_admin()` policy and `service_role` bypass it). Candidate for a future hardening
phase.

## 6. Certification Ledger — Android physical (S24 Ultra) unless noted

| Area | Result |
|---|---|
| Real Android FCM/Expo delivery | **PASS** |
| Foreground behavior (no OS banner by design; in-app refresh after fix #1) | **PASS** |
| Background OS delivery | **PASS** |
| Background tap route | **PASS** |
| Terminated/cold-start OS delivery | **PASS** |
| Warm tap routing | **PASS** |
| Cold-start tap routing (after fix #2) | **PASS (2/2)** |
| Customer push | **PASS** |
| Provider push | **PASS** |
| Customer/provider token ownership (single-account) | **PASS** |
| Logout token cleanup | **PASS** |
| Backend token claiming | **PASS** (API + physical) |
| Cross-account isolation | **PASS** |
| Role isolation (customer↔provider, provider-two not targeted) | **PASS** |
| Permission-denied behavior (usable, no false registration, no nag) | **PASS** |
| Payload privacy (no PII on lock screen; generic title/body + `{type,route}`) | **PASS** |
| Customer navigation retests (Browse providers, Favorites, Search, Preferences, Trust & Safety, tabs, back) | **PASS** |
| Search physical-device verification (Home bar → /search; Mechanic/Plumbing/House Cleaning/Electrical/Movers; suggestions; tap-to-book; clear) | **PASS** |
| **iOS physical remote push** | **NOT CERTIFIED** |
| **Production push** | **NOT CERTIFIED** |

### Token-ownership 16-step connected certification (physical) — PASS
Customer login → token Customer-only → logout → row removed → Provider login → token Provider-only,
Customer none → Customer notification `no_token` (not received on device) → Provider notification
received + taps to `/provider/job` → Provider logout → row removed → Customer re-login → token
reclaimed Customer-only. Provider Two never targeted (0 tokens, no notification).

## 7. QA Cleanup & Retained State

- **device_tokens:** 1 row retained — the persistent QA Customer's **S24 Ultra** registration
  (`ExponentPushToken[…kZbGn]`, provider `expo`, platform `android`). The emulator registered nothing
  (`Device.isDevice=false` on emulators).
- **Disposable P4E.1 data removed:** 5 test bookings deleted (cascade removed 19 notifications + 12
  activity rows); customer bookings = 0; P4E.1 test notifications = 0. No legitimate QA fixtures
  deleted (the 19-service catalogue, QA accounts, and pre-existing admin notifications remain).
- **QA push configuration (intended final state):** `private.push_config` remains **wired**
  (send-push URL + secret) and `PUSH_WEBHOOK_SECRET` remains set, so QA can continue to exercise the
  real trigger path. `register-device` v4 + `send-push` v3 on QA.

## 8. Production Preservation

CLI linked to **QA only** throughout; Production never linked, queried, or written. Production
`register-device` **v2** and `send-push` **v2** unchanged; no Production DB credentials loaded;
`.env.backup` (Production) never sourced. No Production push sent, no Production data mutated.

## 9. Validation

- Root **TypeScript**: clean. **Full Jest: 3008 pass** (229 suites). **Website Vitest: 102 pass**.
  Web + Android **Expo export**: no duplicate-route conflicts. **Secret scan**: clean. Lint is
  non-blocking in CI (pre-existing).
- New/updated regression tests: notifications refresh; cold-start response handling + dedupe + stale
  guard; unregister + signOut order/resilience; register-device token-claim + owner-only delete RLS;
  customer navigation architecture (root routes, not triggers, no `/(customer)` targets,
  `/browse-providers` collision-free, admin `/providers` separate, Home-bar `pointerEvents`);
  search source-of-truth (DB-backed suggestions/recommendations, exact-title search).

## 10. Changed Files & Commits (branch `qa/phase-4e1-android-physical-push`, 7 commits)

`42dba78` FCM via EAS file env var · `21b871a` notif refresh · `b642daa` cold-start routing ·
`ac428a5` token ownership (P1) · `c25f52e` orphan-route navigation · `5bdcded` /providers collision +
DB search suggestions · `b1e8d1b` Home search-bar tap fix.

Runtime: `app.config.js`, `.gitignore`, `src/lib/push.ts`, `src/auth/auth-context.tsx`,
`supabase/functions/register-device/index.ts`, `src/hooks/use-paginated-list.ts`,
`src/app/(customer)/{home,notifications,profile}.tsx`, `src/app/provider/(tabs)/notifications.tsx`,
`src/lib/search.ts`, `src/components/ui/search-suggestions.tsx`, and the moved screens
`src/app/{browse-providers,favorites,search,preferences,trust}.tsx` (out of `(customer)`).
Docs: this file. Tests: 12 suites added/updated. **No migration** (0037 not needed).

## 11. Outstanding non-blockers

- **P3** DB-level booking state-machine invariant (§5).
- **Enhancement (future):** richer search (keyword/alias/fuzzy) — explicitly out of scope; current
  title/subtitle/category substring matching is retained and verified.
- **Enhancement (future):** DB-derived "Popular searches" chips (currently static seed terms — not a
  catalogue inconsistency since they are search terms, not service claims).

## 12. Platform split & next phase

- **Android physical push: CERTIFIED** (S24 Ultra, QA).
- **iOS physical remote push: NOT CERTIFIED.** Android certification must not be read as iOS
  certification.

**Recommended next: Phase 4E.2 — iOS Push Notification Certification** (on user approval only). Scope:
iOS build/signing readiness; Apple Developer / provisioning; APNs/Expo push credential configuration;
physical iPhone install; permission; token registration; foreground/background/terminated delivery;
tap routing; logout/account switching; role isolation; permission-denied. Use the existing macOS/iOS
simulator CI for routing/regression tests where useful — but **do not** claim physical APNs delivery
from simulator evidence.

**Not claimed:** Full Platform Certification, iOS physical push, Production push.
