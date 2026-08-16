# Phase 6H — KwikServe iOS Identity Migration + APNs Push Certification

> **Status:** AUTHORITATIVE / CANONICAL record for the `ke.co.hiredcorp.quickserve` →
> `ke.co.hiredcorp.kwikserve` iOS bundle-identifier migration and its physical APNs push
> certification on the registered iPhone.
>
> **Scope:** QA backend only (`wjvjuplooidctlxxozws`). No App Store Connect record, no TestFlight,
> no submission, no production push, no OTA, no Google Play, no Supabase production.
>
> **Companion record:** the Android counterpart is
> [`PHASE-5E-ANDROID-PACKAGE-MIGRATION-FCM-PUSH-CERTIFICATION.md`](./PHASE-5E-ANDROID-PACKAGE-MIGRATION-FCM-PUSH-CERTIFICATION.md).
> This report amends that document's follow-up **F1** (see §12); it does **not** alter its verdicts.

---

## 1. Executive certification verdict

> ## PHASE 6H — PASS — 14 gates, 0 FAIL, 0 open anomalies.

**APNs push delivery for the new iOS bundle identifier `ke.co.hiredcorp.kwikserve` is CERTIFIED on
the registered physical iPhone against the QA backend**, on preview build
`e062e892-bc3b-4dbb-a640-5e2be6bd9791` (commit `33b3685`).

Precisely what that does and does not mean:

- **14 gates executed (Steps 0–13, with Step 10 split into 10a/10b-P/10b-C). All PASS. 0 FAIL.
  0 open anomalies.**
- **Step 11 (permission-denied) is a clean PASS**, not PASS WITH ANOMALY. It was deliberately run
  **out of numerical order, before Step 10**, so that no account switch could confound it (§12).
- **One behavioural divergence** from the Phase 4E.2 baseline is logged, not suppressed: foreground
  delivery displayed a banner where 4E.2 recorded "silent by design" (§5).
- **One mid-certification evidence correction** was absorbed without invalidating any step: the iOS
  notification header is **not** a reliable discriminator between the two installed iOS apps (§6).
- **Two pre-existing, non-migration findings** are carried forward, not fixed here: the
  `/booking/address` missing Back control (§13) and the chat lock-screen preview (§11).

**This verdict does NOT extend to:** App Store / TestFlight readiness, production environment
configuration, production push, or the release of anything. iOS QA certification is not iOS
release readiness.

## 2. Evidence classes

| Label | Meaning |
|---|---|
| **VERIFIED NOW** | Machine-checked read-only during certification (git, `expo config`, EAS CLI, QA PostgREST, source inspection). |
| **USER-REPORTED PHYSICAL OBSERVATION** | Observable only by the operator on the physical iPhone. Not independently re-verifiable by tooling. |
| **INFERRED** | Conclusion drawn from evidence, not directly observed. Always labelled. |
| **NOT TESTED / DEFERRED** | Not exercised in this phase. |

## 3. Certified iOS identity, device, build and repo baseline

### Identity — VERIFIED NOW (resolved `expo config`, not raw file text)

| Attribute | Value |
|---|---|
| **iOS bundle identifier** | **`ke.co.hiredcorp.kwikserve`** |
| Previous iOS bundle identifier | `ke.co.hiredcorp.quickserve` — **preserved as rollback/legacy** |
| Android package | `ke.co.hiredcorp.kwikserve` — unchanged (Phase 5E) |
| Deep-link scheme | `quickserve` — **unchanged** |
| `ios.associatedDomains` | `["applinks:REPLACE_ME.quickserve.app"]` — **unchanged by decision** |
| App display name | `KwikServe` |
| Apple Team | **Hired Corp Ltd — `8586HL9NBM`** |
| Apple App ID | Registered Phase 6B.2 with **Push Notifications** + **Associated Domains** |
| EAS project / owner | `587f8663-a722-4882-ab56-9007413003ee` / `dalmarmudu` |

### Signing — reused, additive

| Asset | Value | Disposition |
|---|---|---|
| Distribution Certificate | serial `50527C8B6416C5CD6F38B92EAB2F929B`, EAS id `8G79CJ9GLK`, expires 2027-08-13 00:23:36 +0300 | **REUSED** — never regenerated or revoked |
| Provisioning Profile | Developer Portal ID **`X52D3PX26Y`**, Ad Hoc, active, expires 2027-08-13 00:23:36 +0300 | **NEW, additive** |
| APNs credential | **Push Key (.p8 token key)**, Key ID **`BWZ64T2KH4`** | **REUSED and assigned** — never rotated or revoked |
| Old identity's profile | `d8f64398-b714-46aa-806d-5368962cb514`, Valid | **Preserved untouched** |

The build log's own credential block corroborated this: the certificate read *"Updated 3 days ago"*
while the profile read *"Updated 10 hours ago"* — direct evidence that Phase 6D created the profile
**without touching the certificate**.

### Device

| | |
|---|---|
| Test device | iPhone, UDID `00008140-0009288C14D2801C`, team `8586HL9NBM` |
| Second app on the same device | old QuickServe iOS (`ke.co.hiredcorp.quickserve`), **deliberately kept installed** |

Both apps coexist as independent installations. The old app is the rollback identity and holds the
legacy iOS push token.

### Build / artifact — VERIFIED NOW via EAS

| Field | Value |
|---|---|
| Build ID | `e062e892-bc3b-4dbb-a640-5e2be6bd9791` |
| Status | **FINISHED** |
| appIdentifier | `ke.co.hiredcorp.kwikserve` |
| Profile / distribution | `preview` / **INTERNAL** (Ad Hoc) |
| `isForIosSimulator` | **`false`** — real device build |
| appVersion / buildVersion | `1.0.0` / `1` · Expo SDK `56.0.0` |
| Duration | 2026-08-16 08:57:12Z → 09:01:34Z |
| IPA artifact | `https://expo.dev/artifacts/eas/hN9lIF5hv2OBZIRnB7nf80n2bCLlKIeFQeR88asBQI8.ipa` |
| **Artifact expiry** | **2026-08-30T08:57Z** |

Built with `--non-interactive` deliberately, so EAS would **fail rather than prompt-and-generate**
if any credential were missing. No prompt occurred; `✔ Using remote iOS credentials (Expo server)`.
EAS did **not** authenticate to Apple.

### Repo baseline — VERIFIED NOW

```
branch  chore/kwikserve-identity
commit  33b3685a875ff2e14eac4f80ae67fd193ea24fb1
        "chore(ios): migrate KwikServe bundle identifier"
tree    clean · in sync with origin
```

### Push architecture

`notifications` INSERT → DB webhook → `send-push` Edge Function → **Expo Push Service → APNs** →
device. FCM is the **Android** transport only; **no Firebase iOS integration exists or is required**
(no `GoogleService-Info.plist` anywhere, `ios.googleServicesFile` unset, no `@react-native-firebase`).

---

## 4. Token fingerprint key

Fingerprints are redacted to 3 leading + 4 trailing characters of the token's inner value. **No full
Expo push token appears in this report.**

| Fingerprint | Platform | Installation |
|---|---|---|
| `55o…HkbW]` | ios | **new KwikServe iOS** — certification subject |
| `7-V…YiCY]` | ios | old QuickServe iOS (same iPhone) |
| `Si2…wFqV]` | android | new KwikServe Android (S24, Phase 5E) |
| `qWZ…ZbGn]` | android | old QuickServe Android (S24) |

`device_tokens` has **no package/app column** (`id, user_id, platform, provider, push_token,
native_push_token, device_name, last_seen_at, created_at`), and both iOS rows share
`device_name = "iPhone"`. Installation attribution is therefore **behavioural**, established by
controlled experiment (§7 Steps 1 and 7), **not** a schema fact. Same standard as Phase 5E.

---

## 5. Steps 0–13 — expected vs observed

### Step 0 — Baseline `device_tokens` — **PASS**

- **Purpose:** capture pre-certification state. **Action:** read-only query.
- **Expected:** 3 pre-existing rows plus one new iOS row from the Phase 6G login.
- **Observed (VERIFIED NOW):** **4 rows, all customer-owned.** `qWZ…ZbGn]` (created 2026-08-10),
  `7-V…YiCY]` (2026-08-13), `Si2…wFqV]` (2026-08-15), **`55o…HkbW]` (created 2026-08-16 09:32:49Z)**.
  No duplicates, no synthetic residue.
- `55o…HkbW]` was created ~31 minutes after build `e062e892` finished, coincident with the Phase 6G
  Stage 2 login.

### Step 1 — New iOS token identification — **PASS**

- **Purpose:** positively identify the KwikServe iOS token.
- **Required state:** force-close → **cold relaunch** while signed in. A mere foreground would not
  suffice: registration fires **only** on a `signedIn` transition (`src/app/_layout.tsx:35–37`).
- **Expected:** one row advances; three stay frozen.
- **Observed:** `55o…HkbW]` `last_seen_at` **09:47:20Z → 11:19:50Z**. `7-V…YiCY]`, `Si2…wFqV]`,
  `qWZ…ZbGn]` **frozen to the millisecond.**
- **Evidence class:** the causal link is **direct**; mapping it to the bundle identifier is
  **INFERRED** (no schema column exists).

### Step 2 — Foreground push — **PASS** *(with logged divergence)*

- **Notification:** `12bbade0-6d54-4f0e-bf94-f2c4fc210432` — `KWIK-IOS-FG1 Foreground Test`.
- **Server evidence:** `push_status=sent`, `push_attempts=1`, no error, **4 rows, no prune**.
- **Observed (USER-REPORTED):** in-app Notifications list updated **automatically** (no pull-to-refresh
  needed — the Phase 4E.1 defect-#1 fix working on the new identity); app stable; **a system banner
  appeared while the app was visibly foregrounded.**

#### 5.1 Foreground-banner divergence — recorded, root cause NOT claimed

**Phase 4E.2 (2026-08-13) certified iOS foreground behaviour as "silent by design."** The
certification prediction was therefore *no banner*. **A banner appeared.** The prediction was wrong;
the observation stands and is recorded as-is.

**What was verified (VERIFIED NOW):**

- **No foreground presentation handler exists anywhere in `src/`** — zero matches for
  `setNotificationHandler`, `shouldShowAlert`, `shouldShowBanner`, `shouldPlaySound`. That part of the
  4E.2 description remains accurate for the current code.
- Runtime: **`expo-notifications` 56.0.18**, Expo SDK **56.0.12** (`expo: ~56.0.12`).

**What was NOT established:** the cause. It originates **below the application layer** — plausibly a
default foreground-presentation change in `expo-notifications` at this version, or a difference in
iOS behaviour or device state versus the 4E.2 run three days earlier. **These candidates were not
distinguished, and no root cause is claimed.**

**Assessment:** the migration changed a bundle identifier; it cannot alter how iOS or
`expo-notifications` decides to present a foreground notification. **Not shown to be caused by the
bundle-identifier migration**, and not a regression — a visible banner is strictly more useful than
silence. Logged as a platform/library behavioural observation.

### Step 3 — Background push — **PASS**

- **Notification:** `42dc474a-a2e8-4c75-be59-56ef2507bcba` — `KWIK-IOS-BG1 Background Test`.
- **Required state:** backgrounded via Home gesture, **not** force-closed.
- **Server evidence:** `sent`, 1 attempt, no error, 4 rows, no prune.
- **Observed (USER-REPORTED):** iOS system banner appeared while backgrounded; **title and body
  exactly correct**; prompt arrival; no crash. The same notification also arrived on KwikServe
  Android (S24) — expected user-scoped fan-out.
- In-app list check deliberately skipped to preserve the notification for later use.

### Step 4 — Notification-tap routing — **PASS**

- **Notification:** `842ae8f3-b6be-44bd-8971-d4ba70787c1c` — `KWIK-IOS-TAP Booking Notification`,
  `type=booking_assigned`, `category=booking`, `booking_id=71d019e5-1773-481f-b100-30c4c34207d0`,
  `route=/booking/71d019e5-…`.
- **Design note:** Steps 2 and 3 used the generic `notify` helper, which writes **routeless** rows
  (`route=null`). This was detected read-only **before** Step 4, so a purpose-built booking-linked
  notification was used instead — the same approach as Android Step 4, and against the **same
  booking**, making the two platforms directly comparable.
- **Server evidence:** `sent`, 1 attempt, no error, 4 rows, no prune.
- **Observed (USER-REPORTED):** tap opened KwikServe → routed to the correct Booking Detail → booking
  data loaded → **visible `← Back` present** → Back returned to Notifications → no wrong route, blank
  screen, duplicate stack, or crash.

### Step 5 — Terminated-state delivery — **PASS**

- **Notification:** `ad273fe1-201e-4e96-b378-70e1de966af6` — `KWIK-IOS-TERM Terminated Test`,
  booking-linked to the same booking so Step 6 could test **routing**, not merely launch.
- **Required state:** KwikServe fully terminated (swiped from the app switcher).
- **Server evidence:** `sent`, 1 attempt, no error, 4 rows, no prune.
- **Observed (USER-REPORTED):** notification appeared while terminated, title/body exactly correct,
  and **delivery did not force-launch the app**. Left untapped for Step 6.

### Step 6 — Cold-start tap routing — **PASS**

- **Action:** no new push — the Step 5 notification was reused. Pure device observation.
- **Significance:** this path produced a **P2 defect on Android** (Phase 4E.1 defect #2 — the launch
  tap arrives via `getLastNotificationResponseAsync()`, not the live listener, and was being missed).
  A fresh install made this the cleanest possible test: the AsyncStorage stale-guard key had never
  been written on this installation.
- **Observed (USER-REPORTED):** cold-started from fully terminated → routed to the correct Booking
  Detail → data loaded → **no black/blank screen** → visible `← Back` working → Back returned to
  Notifications → app usable afterwards.

### Step 7 — Repeated cold launch / stale-tap safety — **PASS**

- **Action:** two cycles of force-close → reopen **from the app icon**. No push.
- **Purpose:** verify the stale-guard written by Step 6's tap prevents replay.
- **Observed (USER-REPORTED):** both launches landed on **Home**; **no stale replay** into Booking
  Detail; no black/blank screen; stable both times.
- **Token side evidence (VERIFIED NOW):** `55o…HkbW]` `last_seen_at` advanced 11:19:50Z → **13:32:16Z**;
  other three frozen. **Second independent confirmation of token attribution**, and confirmation that
  two consecutive registrations produce **one upsert, no duplicate row**.

### Step 8 — Logout token cleanup — **PASS**

- **Action:** in-app logout. Read-only query **before any login**.
- **Expected:** only the KwikServe iOS token removed.
- **Observed (VERIFIED NOW):** **4 → 3 rows.** `55o…HkbW]` **REMOVED**; `7-V…YiCY]`, `Si2…wFqV]`,
  `qWZ…ZbGn]` all unchanged to the millisecond.
- **Why this is stronger than the Android equivalent:** the deletion was correctly scoped across
  **three dimensions at once** — by app (two iOS apps on one device; only the KwikServe token went),
  by device, and by user (RLS scopes the delete to `user_id = auth.uid()` for that exact token).
- **No manual deletion was performed.** This was the app's own `unregisterForPushNotifications()`
  (`src/auth/auth-context.tsx:135`).

### Step 9 — Re-login / token restoration — **PASS**

- **Observed (VERIFIED NOW):** **3 → 4 rows.** `55o…HkbW]` returned, **customer-owned**, with
  `created_at` **13:54:30.374Z** and `last_seen_at` **13:54:30.341Z** — 33 ms apart.
- **Key evidence:** `created_at` **moved** (was 09:32:49Z). The row was genuinely **deleted at logout
  and newly created at re-login** — not a stale row re-touched.
- **Token value unchanged (`55o…HkbW]`), and that is correct.** The Expo token is bound to the
  device's APNs registration for this installation, which survives logout. Logout removes the
  *database association*, not the platform registration. **A returning fingerprint is not a stale
  row**; the fresh `created_at` proves genuine re-registration. Same as Android Step 9.
- **No duplicate at any point.**

### Step 11 — Permission-denied behaviour — **PASS (clean)** *(executed before Step 10)*

Run **out of numerical order, deliberately**, so that no account switch could confound it — this is
the isolated re-test that Phase 5E follow-up **F1** called for. **Precondition: signed in as the QA
customer throughout; no account switch at any point.**

**Gate 11a — permission OFF:**

- **Observed (USER-REPORTED):** app fully usable, navigation works, no crash, no black/blank screen,
  no logout.
- **Observed (VERIFIED NOW):** the token table was **byte-for-byte identical** to the Step 9 baseline.
  `55o…HkbW]` present, customer-owned, `created_at` **unchanged**, `last_seen_at` **unchanged**.
  **No replacement token, no duplicate, no garbage token. Zero database writes.**
- This matches `registerForPushNotifications()` exactly: it returns `null` on denied permission
  **before** reaching `register-device`, so nothing is written and nothing is removed.

**Gate 11b — permission ON + cold launch:**

- **Observed (VERIFIED NOW):** `created_at` **unchanged** at 13:54:30.374Z; `last_seen_at` advanced to
  **14:17:10.096Z**. Exactly one field in the entire table moved.
- **`created_at` holding while `last_seen_at` advances is the decisive signature:** `register-device`
  **upserted the existing row** rather than deleting and re-inserting. **Nothing had to be restored,
  because nothing was lost** — a materially better outcome than Android, where `created_at` moved
  because the row genuinely had to be re-created.

### Step 10 — Account claim / isolation — **PASS** (10a, 10b-P, 10b-C)

**Step 10a — ownership move.** Logged out of the customer, logged in as **provider1**.

- **Observed (VERIFIED NOW):** `55o…HkbW]` now owned by **`QA Provider One`**
  (`20ffb0c8-5af2-4f28-b8aa-59258abba960`) — confirmed by **profile name**, not merely role, so it is
  provider1 and not provider2. `created_at` **reset to 14:21:33.514Z**; `last_seen_at` 14:21:33.472Z.
  Token value unchanged. **Customer owns no KwikServe iOS token.** No duplicate. Other three rows
  untouched.
- **Explicit finding:** the normal account switch **deleted the customer-owned row and created a new
  provider1-owned row.** An in-place ownership update would have preserved `created_at`; it reset.
- **Mechanism attribution:** Step 10a alone proves the net effect, not which mechanism fired first
  (logout `unregister` vs `register-device`'s token-claim). **Step 8 settles it separately** — it
  queried after logout with **no subsequent login** and observed 4 → 3.
- **Observed (USER-REPORTED):** provider1 auth succeeded, expected provider experience loaded, no
  black/blank screen, no crash, no residual customer-state UI.

**Step 10b-P — provider-targeted push.**

- Pre-send verification (VERIFIED NOW): provider1 owned **exactly one** token, `55o…HkbW]`.
- **Notification:** `22adad15-1fc3-490d-b56f-a94922528133` — `KWIK-IOS-ISO-PROV Provider Isolation`.
  `sent`, 1 attempt, no error, **1 token targeted**, no prune.
- **Observed (USER-REPORTED):** **exactly 1** notification on the iPhone; tapping it opened **new
  KwikServe**; provider1 remained signed in; app stable.

**Step 10b-C — customer-targeted push (the negative half).**

- Pre-send verification (VERIFIED NOW): customer owned **exactly three** tokens — `Si2…wFqV]`,
  `qWZ…ZbGn]`, `7-V…YiCY]`. `55o…HkbW]` was **not** in that set.
- **Notification:** `c2ecbcf2-9524-4f81-a6e0-33652c9dace3` — `KWIK-IOS-ISO-CUST Customer Isolation`.
  `sent`, 1 attempt, no error, **3 tokens targeted**, no prune.
- **Structural proof (VERIFIED NOW):** `send-push` selects recipients with
  `device_tokens WHERE user_id = <recipient>` (`send-push/index.ts:134`, `162–163`). The
  provider-owned token **could not** enter the customer recipient set.
- **Direct query (VERIFIED NOW):** rows titled `KWIK-IOS-ISO-CUST` owned by provider1: **0**.

## 6. Evidence correction — dual iOS delivery and header attribution

**Discovered mid-certification, after Step 9. The original observations are preserved, not erased.**

**Original observation (Step 2, as recorded at the time):** the operator reported that the old
QuickServe iOS app did **not** receive the notification. At the time this was flagged as ambiguous —
"observation gap vs genuine non-delivery" — and explicitly left unresolved.

**Correction (operator, after Step 9):** the old QuickServe iOS installation **had in fact been
receiving notifications throughout**. The operator had believed otherwise because **both**
notifications appeared under a visible header reading **"KwikServe"**; tapping one of them opened the
**old QuickServe app**. Therefore **the notification header is NOT a reliable discriminator between
the two installed iOS apps.**

**Independent corroboration (VERIFIED NOW), stronger than the header observation:** `send-push`
deletes any token Expo flags `DeviceNotRegistered` (`send-push/index.ts:145–146`, `173–175`). Across
**six** Phase 6H sends it pruned **nothing**, and `7-V…YiCY]` survived every one. A dead or
uninstalled app's token would have been pruned on the first send. **Dual delivery is therefore
confirmed on server-side evidence alone, independent of anything visible on the device.**

**A recorded tension, left unresolved rather than explained away.** The installed builds carry
*different* display names — the old app was built at commit `b3365e4` where `expo.name` was
`"QuickServe"`; the new app at `33b3685` where it is `"KwikServe"`. The brand rename (`c0b8987`)
post-dates every old-identity iOS build, and no iOS build with the old bundle identifier has been
produced since. iOS derives the notification header from the bundle display name, so the old app's
notifications would be expected to read "QuickServe". The Phase 6G Stage 6 observation also found the
two apps **listed separately by name** in Settings → Notifications. **The most probable
reconciliation — INFERRED, not established — is misidentification in a grouped notification stack,
since both apps ship the identical icon asset (`./assets/expo.icon`) and near-identical UI.**

**Standing decision:** for all Phase 6H purposes the notification header is treated as
**NON-DISCRIMINATING**, regardless of what build metadata implies. This is the conservative position
and costs nothing.

**Consequence for method:** Step 10b was **redesigned** to remove any dependence on visual
identification. Header-based attribution was superseded by:

1. **Server-side ownership** — recipient resolution by `user_id` makes the isolation assertion
   provable from the token table plus `push_status`, with no device observation at all.
2. **Notification counts per device** — because both iOS tokens were customer-owned through Step 6,
   every customer send produced **two** notifications on the iPhone. After the ownership move the
   predicted counts change, and **counting requires no identification of which app produced which
   banner**.
3. **In-app notification lists** — each app renders its own signed-in user's rows.

**Steps affected and their disposition.** Steps 2, 3 and 5 record delivery to the old app that was
originally reported as absent; **none of their certification criteria depended on the old app**, so
all verdicts stand. **Steps 4 and 6 carry a qualified attribution:** both apps received
identically-titled notifications, so which app opened rested on visual identification. **Mitigating
evidence (VERIFIED NOW):** `7-V…YiCY]` remained frozen at 2026-08-13T17:25:53.031Z throughout
Steps 0–9, while `55o…HkbW]` advanced three times. Step 6 required a cold start; had the tapped
notification belonged to the old app, that app would have cold-launched and — if signed in —
advanced its timestamp. It never moved. **Residual uncertainty, stated:** this holds only if the old
app is signed in. That was subsequently confirmed at Step 10b-C, when the operator tapped the
`ISO-CUST` notification and the **old QuickServe app opened**, demonstrating it is signed in as the
QA customer and rendering notifications.

## 7. Observed four-installation isolation matrix

| Installation | Token | Owner | `ISO-PROV` (→ provider1) | `ISO-CUST` (→ customer) |
|---|---|---|---|---|
| **new KwikServe iOS** (iPhone) | `55o…HkbW]` | **provider1** | ✅ **received** | ❌ **NOT received** |
| old QuickServe iOS (iPhone) | `7-V…YiCY]` | customer | ❌ not received | ✅ received |
| new KwikServe Android (S24) | `Si2…wFqV]` | customer | ❌ not received | ✅ received |
| old QuickServe Android (S24) | `qWZ…ZbGn]` | customer | ❌ not received | ✅ received |

**Observed device counts (USER-REPORTED PHYSICAL OBSERVATION):**

| | iPhone | S24 |
|---|---|---|
| **`ISO-PROV`** | **1** | **0** |
| **`ISO-CUST`** | **1** | **2** |

- The `ISO-CUST` notification on the iPhone was **tapped and opened the old QuickServe app**.
- The **provider1 session in new KwikServe contained `ISO-PROV` and did not contain `ISO-CUST`.**

**Four independent lines of evidence agree, none relying on the notification header:** server-side
structural proof; count discrimination (1 / 0 / 1 / 2, exactly as ownership predicted); the in-app
list observed on-device **and** confirmed by direct query (0 `ISO-CUST` rows owned by provider1); and
the tap destination.

**This is a stronger isolation result than the Android equivalent**, which had only one app per
device. Here the same physical iPhone runs two installations under two different accounts, and
isolation held cleanly in both directions.

## 8. Token lifecycle summary

```
09:32:49  register  (Phase 6G login)          created=09:32:49  owner=customer
11:19:50  cold launch  (Step 1)               last_seen -> 11:19:50
13:32:16  cold launch ×2  (Step 7)            last_seen -> 13:32:16   [one upsert, no duplicate]
   —      LOGOUT  (Step 8)                    ROW DELETED             [4 -> 3 rows]
13:54:30  re-login  (Step 9)                  created=13:54:30 (NEW)  [3 -> 4 rows]
   —      permission OFF  (Step 11a)          NO CHANGE, zero writes
14:17:10  permission ON + cold launch (11b)   last_seen -> 14:17:10   [created unchanged = upsert]
14:21:33  ACCOUNT SWITCH -> provider1 (10a)   created=14:21:33 (NEW)  owner=provider1
```

**No duplicate row was created at any point in this sequence.**

## 9. Terminated / cold-start routing and stale-response protection

- **Terminated delivery (Step 5):** notification arrived while the process was fully terminated;
  delivery did **not** force-launch the app.
- **Cold-start routing (Step 6):** tapping from terminated cold-started the app and routed to the
  correct Booking Detail with no black/blank screen. This is the path that produced Android's P2
  defect #2; it passes clean on iOS on the new identity.
- **Stale-response protection (Step 7):** the AsyncStorage stale-guard written by Step 6's tap
  prevented replay — two subsequent icon launches landed on Home with no auto-jump into Booking
  Detail. Exercised for the first time ever on this installation.

## 10. Registration lifecycle (confirmed four times)

Registration fires **only on a `signedIn` transition** — `src/app/_layout.tsx:35–37`:

```js
useEffect(() => { if (signedIn) void registerForPushNotifications(); }, [signedIn]);
```

There is no AppState listener and no permission-change listener. Confirmed at Steps 1, 7, 9 and 11b:
cold launch while authenticated registers; foregrounding an already-running signed-in process does
not. **This is pre-existing behaviour shared with Android and is not migration-related.** It is the
same lifecycle note recorded in Phase 5E §A10.2, and it remains an open product consideration
(enabling notification permission mid-session does not re-register until the next cold launch or
login).

## 11. Payload privacy (Step 12) — **PASS**

Read-only source inspection; no push sent, nothing modified.

**Outbound payload shape** — `buildExpoMessages` (`supabase/functions/_shared/notifications.ts:253–264`)
is the **sole** constructor, and it emits exactly five fields:

```ts
{ to: token, title: spec.title, body: spec.body, data: spec.data, sound: 'default' }
```

`data` is **statically typed as a closed shape** — `NotificationSpec` (`notifications.ts:14–19`)
declares `data: { type: string; route: string }`. A third key would be a TypeScript error.

| Category | On the wire |
|---|---|
| **Visible fields** | `title`, `body` — compile-time string literals for every booking/quote/payment template ("New job assigned", "Booking accepted", "Your provider is on the way", "Work has started", "You have a new quote", "Payment confirmed"). **No interpolation of names, phones, addresses, or amounts.** |
| **Routing fields** | `data.type` (enum-like literal) and `data.route` (internal path, **UUID only**) |
| **Server-side only — NOT sent** | `recipientUserId`, `user_id`, role/profile data, `category`, `notification_preferences`, `push_status`/`push_attempts`/`push_error`, `customer_id`, `assigned_provider_id`, `sender_id`, `PUSH_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` |

**`recipientUserId` is the sharpest demonstration:** it sits in the same `NotificationSpec` object as
`title`/`body`/`data`, yet `buildExpoMessages` copies only four of the five properties. **No user ID
reaches the wire.**

**`booking_id` is not sent as a field.** The booking UUID travels **only as a path segment inside
`route`**, and it is **strictly required** — `routeForNotificationData` (`src/lib/push.ts:20–27`)
reads `data.route` and nothing else, which is exactly what Steps 4 and 6 certified. **The UUID
embedded in the required route is NOT unnecessary leakage**; it is the minimum information needed for
the certified tap-routing behaviour, carried in the most minimal possible form.

**Expo push tokens** appear only as `to:` — the required transport address. Never in `title`, `body`,
or `data`.

**No arbitrary field copying.** `specFromNotificationRow` (`:235–244`) explicitly whitelists five
named fields and constructs a fresh two-key `data` object. **There is no spread of the source record**
— a row could gain fifty columns and none would reach the wire.

**Minimization assessment:** `to`, `title`, `body`, `data.route` are necessary. `data.type` is **not
strictly required** for the certified behaviour (the client routes purely off `route`) and `sound` is
UX metadata — both classified **harmless metadata, not privacy or security concerns**, being a fixed
vocabulary of literals with no PII or identifiers.

**Conclusion:** the outbound push is **minimized to the required transport, display, and routing
information**.

### 11.1 Chat lock-screen preview — carried forward, unchanged

`notifications.ts:195–196` places up to **80 characters of user-typed message text** into `body` for
chat notifications, which renders on the lock screen. It is the only path by which user content
reaches a lock screen.

**Classification: PRE-EXISTING PRODUCT/PRIVACY CONSIDERATION — NOT AN iOS MIGRATION DEFECT.** The
same shared templates served `com.quickserve.app` and `ke.co.hiredcorp.quickserve`; nothing about the
bundle-identifier change introduced or altered it. Recorded identically in Phase 5E §A10.3.

**Optional future mitigation, NOT implemented:** gate the preview behind a "hide message content"
notification preference. The `notification_preferences` gate at `send-push/index.ts:128` already
provides the hook. **No implementation change was made in Phase 6H or 6I.**

**Second observation, informational:** `title`, `body` and `route` are operator-controlled — whatever
is written to a `notifications` row is transmitted faithfully. All production templates are safe; the
exposure is theoretical and applies to future callers. Payload safety depends on callers writing safe
content, not on the transport sanitising it.

## 12. Amendment to Phase 5E follow-up F1

**The historical Android Step 11 verdict is PRESERVED as `PASS WITH ANOMALY`. It is NOT rewritten to
a clean PASS.** The anomaly was real and observed. Only the **causation assessment** is amended.

**Why Android could not resolve it.** Android Step 11 had **two variables moving at once** — a
provider1→customer account switch *and* a permission toggle. Causation could not be assigned, so
Phase 5E **correctly** recorded *"unexpected token disappearance observed; causation not proven"*,
with the account-switch logout as the leading **inferred** explanation.

**What Phase 6H established:**

| # | Finding | Established by |
|---|---|---|
| 1 | **Permission OFF left the valid token untouched and produced no database write** | Step 11a — byte-identical table, `created_at` and `last_seen_at` both unchanged |
| 2 | **Permission ON + cold launch upserted the same existing row** — `created_at` unchanged, `last_seen_at` advanced | Step 11b |
| 3 | **Logout deletes the token on its own** | Step 8 — queried after logout with **no subsequent login**; 4 → 3, only the KwikServe iOS row removed |
| 4 | **Re-login cleanly re-creates the row** | Step 9 — `created_at` reset, no duplicate |
| 5 | **The account switch performs delete + re-creation under the new owner** | Step 10a — `created_at` reset, owner changed |

**Therefore:**

- **Permission denial is experimentally EXCLUDED as the deletion cause** in the isolated iOS
  experiment.
- **Account-switch logout is now the SUPPORTED explanation** for the Android token disappearance.

**Supporting negative check:** had deletion been caused only by the token-claim at the *next*
registration, then with permission off no registration ran, so no claim occurred — and the token
should have survived **under provider1**. On Android it was gone from **every** account. Only
logout-deletion explains that.

**Explicit limitation, preserved:**

> **The isolated permission experiment was NOT re-run on Android.** The inference carries because the
> delete/register logic is entirely **shared TypeScript** (`src/lib/push.ts`, `src/app/_layout.tsx`,
> `src/auth/auth-context.tsx`) with no platform-specific path — but it was not directly reproduced on
> the S24. **The historical Android Step 11 verdict therefore remains `PASS WITH ANOMALY`; only the
> explanation has become substantially better supported.**

## 13. Carried-forward finding — `/booking/address` missing Back control

From **Phase 6G**, preserved unchanged and **not fixed in Phase 6H or 6I**:

| Aspect | Determination |
|---|---|
| Route / component | `/booking/address` — `src/app/booking/address.tsx`, Step 1 of 4 of the booking flow |
| Symptom | **No visible Back control.** The native header renders titled "Book a service" with no arrow |
| Root cause | It is the **first route of the nested `booking` Stack**, entered via `router.push('/booking/address')` from `home.tsx:56`, `search.tsx:74`, `favorites.tsx:106` — all in the **parent root Stack**. A native stack draws a back arrow only when a previous route exists within the same stack |
| Same as a known defect | Identical architecture to the Booking Detail defect fixed in `b3365e4`, which covered **only** `[id]` |
| Pre-existing? | **Yes, definitively.** `33b3685` touched no `src/app/`, `_layout`, or component file. `booking/_layout.tsx` last changed at `b3365e4`; `address.tsx` at `142fc0b` |
| **iOS swipe-back** | **Works** — edge-swipe returns to the previous screen. **The user is not trapped** |
| Android | Same arrow-less header, but system back always provides an escape |
| **Severity** | **LOW** — discoverability/affordance gap, not a dead end |
| Remediation | Copy the `b3365e4` pattern: in-content ghost `← Back` with `canGoBack() ? back() : replace('/home')`, plus `<Stack.Screen name="address" options={{ headerShown: false }} />`, plus Jest + Maestro regression. **Also audit siblings** `schedule.tsx` / `notes.tsx` / `review.tsx` |

**Status: OUTSTANDING product/navigation item requiring a SEPARATE IMPLEMENTATION GATE.** It needs a
code change, a commit **and a rebuild** — see the operational constraints in §16.

**Unresolved diagnostic:** whether **Step 2 / Schedule** shows a native back arrow. It determines
whether the fix scope is `address.tsx` alone or its siblings too.

## 14. Final token state (Step 13) — **PASS**, no cleanup performed

**Account state preserved deliberately: KwikServe iOS remains signed in as provider1.** The state was
**not** reverted to mirror Android; the current distribution is valid certification evidence in its
own right.

| Token | Platform | Owner | `created_at` | `last_seen_at` | Installation | Disposition |
|---|---|---|---|---|---|---|
| `qWZ…ZbGn]` | android | customer | 2026-08-10 09:00:57 | 2026-08-14 15:45:25 | old QuickServe Android | ✅ **KEEP** |
| `7-V…YiCY]` | ios | customer | 2026-08-13 17:25:53 | 2026-08-13 17:25:53 | old QuickServe iOS | ✅ **KEEP** |
| `Si2…wFqV]` | android | customer | 2026-08-15 09:56:12 | 2026-08-15 09:56:12 | new KwikServe Android | ✅ **KEEP** |
| `55o…HkbW]` | ios | **provider1** | 2026-08-16 14:21:33 | 2026-08-16 14:21:33 | new KwikServe iOS | ✅ **KEEP** |

```
4 rows · platform split {android: 2, ios: 2} · ownership customer 3 / provider1 1
0 INVESTIGATE · 0 REMOVE · 0 duplicates · 0 orphans
```

### 14.1 Old `last_seen_at` does NOT establish staleness

**This distinction is load-bearing and must not be lost.**

`last_seen_at` updates **only** when `register-device` runs, which happens **only** on a `signedIn`
transition. It measures **app-launch recency**, not **token validity**.

**Both legacy-package tokens demonstrated successful delivery during Phase 6H:**

- `qWZ…ZbGn]` (old QuickServe Android) — one of the **two** `ISO-CUST` notifications observed on the S24.
- **`7-V…YiCY]` (old QuickServe iOS) — the decisive case.** Its `last_seen_at` has not moved since
  **2026-08-13**, the oldest in the table — yet it **received `ISO-CUST` on 2026-08-16, and tapping
  that notification opened the old QuickServe app.** A three-day-old timestamp on a demonstrably live,
  delivering token.

**Registration recency and token validity must not be conflated.** No token is classified stale merely
for belonging to the old package.

### 14.2 No invalid-token evidence

**No token produced `DeviceNotRegistered` or any equivalent at any point in Phase 6H.** `send-push`
prunes automatically on that error (`send-push/index.ts:145–146`, `173–175`); across **six** sends the
row count never dropped below its expected value and **zero prunes occurred**. Expo accepted every
token every time — the strongest available validity evidence, and it is server-side.

**Unrelated observation, recorded to avoid future confusion:** three `notifications` rows carry
`push_status = no_token` — all titled *"New booking"*, all owned by **QA Admin**, all created
2026-08-12/13, **before Phase 6H began**. `no_token` means *the recipient had zero registered devices*,
not that a token was invalid; the admin account is web-only and has never registered a device. **Not
stale-token evidence, not a Phase 6H artifact, no action.**

### 14.3 Cleanup status

**NO CLEANUP IS AUTHORIZED AND NONE WAS PERFORMED**, despite every token being KEEP. **No token
warrants deletion on evidence** — all four are valid, live, correctly owned, non-duplicate, and each
demonstrably delivered or was correctly excluded. Cleanup requires separate explicit authorization.

## 15. Retained certification evidence

**13 certification notification rows retained across both platforms. NONE deleted.**

### Phase 6H — iOS (6 rows), all `push_status = sent`, 1 attempt, no push error

| Id | Title | Owner | Route |
|---|---|---|---|
| `12bbade0…` | `KWIK-IOS-FG1 Foreground Test` | customer | — |
| `42dc474a…` | `KWIK-IOS-BG1 Background Test` | customer | — |
| `842ae8f3…` | `KWIK-IOS-TAP Booking Notification` | customer | `/booking/71d019e5-…` |
| `ad273fe1…` | `KWIK-IOS-TERM Terminated Test` | customer | `/booking/71d019e5-…` |
| `22adad15…` | `KWIK-IOS-ISO-PROV Provider Isolation` | **provider1** | — |
| `c2ecbcf2…` | `KWIK-IOS-ISO-CUST Customer Isolation` | customer | — |

**Isolation evidence ownership is correct: `ISO-PROV` → provider1, `ISO-CUST` → QA customer, with
zero cross-ownership** (verified by direct query: 0 `ISO-CUST` rows owned by provider1).

### Phase 5E — Android (7 rows), all `push_status = sent`

`d958bc5b…` `KWIK-QA-FG` · `16afe12d…` `KWIK-QA-FG2` · `19485bb4…` `KWIK-QA-BG` ·
`0bee48e5…` `KWIK-QA-TAP` · `2b32911f…` `KWIK-QA-TERM` · `89779531…` `KWIK-QA-ISO-PROV` ·
`465ec892…` `KWIK-QA-ISO-CUST`

## 16. Operational constraints

Recorded for scheduling. **Neither authorizes a code change or rebuild.**

| Constraint | Detail |
|---|---|
| **Artifact expiry** | iOS build `e062e892` IPA expires **2026-08-30T08:57Z** |
| **EAS build credits** | Reported at **93%** of the billing period's included credits on 2026-08-16. The CLI states: *"You won't be able to start new builds once you reach the limit."* **Builds are BLOCKED at the limit, not billed as overage** — this supersedes the general Expo usage-based-pricing documentation, which was cited earlier in this migration and does not match this account's behaviour |

Both bear on the `/booking/address` remediation (§13), which requires a rebuild.

## 17. Untouched / not certified

| System | State |
|---|---|
| **Old iOS identity `ke.co.hiredcorp.quickserve`** | **Preserved.** App ID, credential record, certificate, Push Key, and profile `d8f64398-…` all intact and Valid. App still installed and functioning on the iPhone |
| **App Store Connect** | **No record created.** The irreversible bundle-locking gate has not been approached |
| **TestFlight / App Store** | **Not touched.** No submission, no upload |
| **Apple credentials** | No certificate or Push Key created, revoked, rotated, or replaced |
| **Android / Phase 5E** | **Untouched.** `android.package` unchanged; build `c59c7ac1` and its certification record intact |
| **Google Play** | Untouched — no app, no AAB, no App Signing, no service account |
| **Supabase production** | Untouched. All traffic targeted QA `wjvjuplooidctlxxozws` |
| **Production environment / push** | **Not configured, not certified.** The `production` EAS environment holds **zero** variables |
| **Deep-link scheme** | Unchanged — `quickserve` |
| **Universal Links / `associatedDomains`** | Unchanged inert placeholder. Cleanup is a separate later phase |
| **PR #15 / `main`** | Untouched — PR #15 OPEN at `b3365e4`; `main` at `203fd0f` |

## 18. Final verdict

> ## PHASE 6H — PASS — 14 gates, 0 FAIL, 0 open anomalies.

| Step | Result |
|---|---|
| 0 — Baseline | **PASS** |
| 1 — New iOS token identification | **PASS** |
| 2 — Foreground push | **PASS** *(banner divergence logged, §5.1)* |
| 3 — Background push | **PASS** |
| 4 — Tap routing | **PASS** |
| 5 — Terminated-state delivery | **PASS** |
| 6 — Cold-start tap routing | **PASS** |
| 7 — Repeated cold launch / stale-tap safety | **PASS** |
| 8 — Logout token cleanup | **PASS** |
| 9 — Re-login restoration | **PASS** |
| 10a — Ownership move | **PASS** |
| 10b-P — Provider isolation push | **PASS** |
| 10b-C — Customer isolation push | **PASS** |
| 11 — Permission-denied *(run isolated, before Step 10)* | **PASS (clean)** |
| 12 — Payload privacy | **PASS** *(chat preview note carried forward, §11.1)* |
| 13 — Duplicate / stale token inspection | **PASS** |

*(14 gates = Steps 0–13, with Step 10 counted once across its three sub-gates.)*

**Stronger than the Android certification in three respects:** Step 11 is a clean PASS rather than
PASS WITH ANOMALY; isolation was proven on the harder two-apps-one-device configuration; and the
Android Step 11 causation question was resolved (§12).

---

*Certified 2026-08-16 against QA. Physical device observations are operator-reported and not
independently re-verifiable by tooling; all server-side, source, git, and EAS evidence was
machine-verified read-only. No full Expo push token, private key, API key, or password appears in
this report.*
