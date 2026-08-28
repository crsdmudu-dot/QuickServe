# Phase 7D — Supabase RLS Tenant-Isolation Certification (data-layer)

> **Status:** AUTHORITATIVE / CANONICAL record for the direct **runtime** certification of two
> Supabase Row Level Security controls on `public.bookings`:
>
> - **§11.7 — Cross-customer booking `SELECT`** → **PASS / CERTIFIED — CLOSED**
> - **§11.8 — Non-admin admin-mutation enforcement** → **PASS / CERTIFIED**
>
> **Scope:** QA backend only (`wjvjuplooidctlxxozws`). **Data-layer only** — no app build, no
> device, no Android, no iOS, no push, no repository code change.
>
> **Companions:** [7A](PHASE-7A-SERVICE-DETAILS-V16-ANDROID-PHYSICAL-CERTIFICATION.md) (Android) ·
> [7B](PHASE-7B-SERVICE-DETAILS-V16-IOS-PHYSICAL-CERTIFICATION.md) (iOS) ·
> [7C](PHASE-7C-ITEM-M-SCHEME-REMEDIATION-IOS-J-CERTIFICATION.md) (item M + iOS J). **This phase
> supersedes the UNPROVEN status of §11.7 and §11.8 in 7C's register; it changes nothing else.**

---

## 0. Evidence classes

| Label | Meaning |
|---|---|
| **VERIFIED NOW** | Machine-obtained during this gate: migration/policy inspection, and live PostgREST/Auth HTTP responses captured verbatim. |
| **VERIFIED IN DURABLE ARTIFACT** | Recovered from git history or prior phase reports. |
| **INFERRED** | Drawn from evidence rather than observed. Always labelled, never promoted to a verdict. |
| **NOT TESTED / DEFERRED** | Never exercised. |

> **Unlike Phases 7A–7C, this phase has NO user-reported physical component.** Every assertion here
> is a machine-captured HTTP exchange against the QA database. That makes it the **strongest**
> evidence class in the campaign — but also the narrowest: it certifies **only the exact policy
> paths probed** (§7).

---

## 1. Executive verdict

**Both tested RLS controls are enforced at runtime on the deployed QA database.**

- **§11.7 Cross-customer booking `SELECT` = PASS / CERTIFIED — CLOSED**
- **§11.8 Non-admin admin-mutation enforcement = PASS / CERTIFIED**

**Why this phase mattered.** Phase 7A recorded that the native `/admin` route guard is *"defence in
depth and correct UX — **NOT** a replacement for RLS, which remains the authoritative data-layer
control."* Phases 7A–7C then certified that guard on hardware, on both platforms, in both
directions. **The authoritative control behind it had never been tested.** Certifying the door while
never testing the lock is precisely the asymmetry that produces false confidence. §7 addresses it.

**No security defect was found.**

---

## 2. Policy preflight — intended behaviour — **VERIFIED NOW** (migration source)

`alter table public.bookings enable row level security` (0002). **Six policies, all PERMISSIVE
(default), therefore OR-combined:**

| Policy | Cmd | Predicate | Migration |
|---|---|---|---|
| `bookings_insert_own` | INSERT | `auth.uid() = customer_id` | 0002 |
| `bookings_select_own` | SELECT | `auth.uid() = customer_id` | 0002 |
| `bookings_select_admin` | SELECT | `public.is_admin()` | 0003 |
| `bookings_update_admin` | UPDATE | `is_admin()` / check `is_admin()` | 0003 |
| `bookings_select_provider` | SELECT | `assigned_provider_id = auth.uid()` | 0004 |
| `bookings_update_provider` | UPDATE | assigned provider; column-pinned; forward-only status | 0038 (current) |

**Two structural absences, confirmed by search across all 38 migrations:**

- **No customer UPDATE policy on `bookings`.**
- **No DELETE policy on `bookings` for any role.**

`is_admin()` — `security definer stable`, `select exists(... profiles.role='admin')`, defined once
in 0003 and never redefined.

**Enforcement shape:** `bookings_update_admin` is **row-predicate only**; column-level pinning
exists **only** in `bookings_update_provider`, which fixes `customer_id`, `service_id`, `address`,
`scheduled_for`, `notes`, `assigned_provider_id`, `assigned_provider_name`,
`assigned_provider_phone`, `admin_notes` and `service_details` to their stored values.

**Triggers:** seven on `bookings` (0005, 0007 ×2, 0010, 0015, 0020 ×2). **All are `AFTER`
INSERT/UPDATE — none is `BEFORE`**, so none can permit or rewrite a statement RLS has already
blocked. Several fire on status change, which is why §5 deliberately avoided `status`.

### 2.1 The limit of source inspection — stated before any verdict

> **Migration and policy inspection predicts *intended* behaviour. It does not prove *deployed*
> enforcement.** The deployed database could diverge from the migration history — through a manual
> dashboard edit, a partially applied migration, or drift.
>
> **§2 is therefore preflight, not evidence.** The verdicts in §1 rest exclusively on the live
> runtime probes in §5 and §7.

---

## 3. Actors and method

| Actor | `sub` (partially redacted) | Role | Use |
|---|---|---|---|
| **Customer A** | `df214443-…965b` | customer | owner of both test bookings |
| **Customer B** | `41c1625c-…9628` | customer | §7 decisive actor |
| provider1 | `20ffb0c8-…8960` | provider | §4 adjacent evidence |
| provider2 | `7cd6741c-…6aa1` | provider | §4 adjacent evidence |
| admin | — | admin | **deliberately never used** — privileged, invalid as RLS evidence |

**Every request that produced evidence used the anon API key plus the actor's own authenticated user
JWT** (`role` claim `authenticated`). **Never used as evidence:** service-role key · admin JWT ·
provider JWT for customer-scoped claims · SQL/dashboard bypass · database superuser.

**Refusal semantics, pre-committed before results were read:** PostgREST returns **`200` with an
empty body** for rows filtered out by RLS. **Zero rows is the correct refusal signal; `403` is not
expected.** A non-empty result would be the leak.

---

## 4. Adjacent provider read evidence — **SUPPORTING ONLY**

Executed **before** a second customer existed, against the protected Customer A booking
`f9b7fb18-fc25-413a-ad27-81182ebab53a`:

| Actor | Request | Result |
|---|---|---|
| provider1 | `GET /bookings?id=eq.f9b7fb18…` | `200`, **0 rows** |
| provider1 | unfiltered `GET /bookings` | `200`, **0 rows** |
| provider2 | `GET /bookings?id=eq.f9b7fb18…` | `200`, **0 rows** |
| provider2 | unfiltered `GET /bookings` | `200`, **0 rows** |
| **Customer A (owner control)** | `GET /bookings?id=eq.f9b7fb18…` | `200`, **1 row** |

> **CLASSIFICATION: ADJACENT SUPPORTING EVIDENCE. This is NOT the evidence that closed §11.7.**
>
> These actors are **providers**, not customers. At the time they were run, §11.7 was explicitly
> kept **UNPROVEN** rather than being declared closed on their strength — because the stated item
> concerns a *second customer*, and substituting a different role would have been claiming a test
> that had not been run.
>
> They retain value as corroboration: combined with §7, **four distinct non-owner identities across
> two roles were all refused the same row.**

---

## 5. §11.8 — Non-admin admin-mutation enforcement

### 5.1 The security question

> **Can an authenticated customer — even the owner of a booking — modify an admin-controlled field
> on that booking?**

The owner was chosen deliberately as the **strongest** form of the test: a non-owner would be
refused by row predicate alone and would prove less. If even the owner cannot write an admin field,
the control is sound.

### 5.2 Actor and target

**Actor:** authenticated QA customer · **booking owner** · non-admin · non-provider · anon API key +
own user JWT (`role` claim `authenticated`) · **no service-role, admin, provider or superuser
bypass**.

**Target:** `d8b9dd38-e10a-4ab3-96f5-432a900d513a` — a disposable QA booking. **Deliberately not**
`f9b7fb18…`, which is certification evidence in 7A/7B/7C.

**Field choice — `admin_notes`.** Unambiguously admin-controlled (added 0003); no customer policy
permits writing it; the provider policy explicitly pins it; baseline value `null`, so rollback would
be a single restore; and **it fires no trigger**. `status` was rejected as a target precisely because
it would trigger notifications, push, payments and the completed-jobs bump — converting a security
probe into a cascade.

### 5.3 Baseline — **VERIFIED NOW**

```
target id is the approved booking      OK
customer_id === authenticated sub      OK
admin_notes is exactly null            OK
target is NOT a protected booking      OK

status: pending · assigned_provider_id: null · service_id: house-cleaning
scheduled_for: 2026-08-12T12:45:16.566+00:00 · created_at: 2026-08-12T12:46:02.038145+00:00
```

Immutable identifiers were captured so the post-probe row could be proven to be the same booking.

### 5.4 The single probe — **VERIFIED NOW**

```http
PATCH /rest/v1/bookings?id=eq.d8b9dd38-e10a-4ab3-96f5-432a900d513a
Prefer: return=representation
{ "admin_notes": "RLS-PROBE-<timestamp>" }          ← exactly one field
```

```
HTTP 200 OK
body: []
returned/matched rows: 0
```

### 5.5 Decisive post-attempt verification — **VERIFIED NOW**

```
Fresh owner read → HTTP 200
admin_notes AFTER  : null
probe string present: false

11 captured fields compared before vs after:
  id · customer_id · service_id · address · scheduled_for · status
  admin_notes · assigned_provider_id · assigned_provider_name
  assigned_provider_phone · created_at
fields changed: 0
```

> **`HTTP 200` was NOT treated as the verdict.** PostgREST returns success for a statement that
> matched zero rows, so status alone is ambiguous between "written" and "refused". **The decisive
> evidence is the pair: zero matched rows in the empty representation, plus a fresh read by the
> owner showing no state change across all 11 fields.**

### 5.6 Verdict

> **§11.8 Non-admin admin-mutation enforcement = PASS / CERTIFIED**

**No actual database mutation occurred. No rollback was necessary and none was performed.**

The result matches the §2 structural prediction — there is no customer UPDATE policy to match — and
that agreement is itself the finding: **the deployed database behaves as the migration history
says it should.**

---

## 6. Customer B provisioning — recorded without overclaiming

**Exactly one** second QA customer was created, solely to make the literal §11.7 test possible.

| Step | Outcome |
|---|---|
| Service-role admin API | **`401 Invalid API key`** — **no account created** (see §8) |
| Public signup, `@example.com` | **`400 email_address_invalid`** — **no account created** |
| **Public signup, validated domain** | **`200`** — user `41c1625c-…9628` created; **no session returned** |
| First sign-in attempt | **`400 email_not_confirmed`** — no JWT; gate declared **INCONCLUSIVE**, not PASS |
| **Later sign-in attempt** | **`200` — authenticated session obtained** |

**Provisioning used the public signup endpoint with the anon key** — *less* privileged than the
service-role provisioning that had been authorised. No `role` metadata was sent, so
`handle_new_user()` (0001) assigns `role='customer'`.

**Server-side confirmation succeeded.** That is established directly: a normal password grant
returned `HTTP 200` with a valid session, which the Auth server would refuse for an unconfirmed
user.

### 6.1 The failed confirmation page — causality NOT claimed

The operator reported that the confirmation link "did not work". **Server-side confirmation
nevertheless succeeded**, so what failed was something after verification, not verification itself.

**Two explanations are consistent with the evidence, and neither is established:**

- **INFERRED (not proven):** the post-verification **redirect target** was unusable. `signUp` in
  `src/auth/auth-context.tsx:106` passes **no `emailRedirectTo`** — confirmed, and
  `emailRedirectTo`/`redirectTo` appear nowhere in `src/` or `qa/` — so the redirect falls back to
  the project's dashboard Site URL, which `docs/pilot/backend-readiness.md:60` expects to be a
  custom scheme a desktop browser cannot open.
- **INFERRED (not proven):** an email security scanner pre-fetched the single-use link and consumed
  it, confirming the account before the human click.

**Distinguishing them would require the email headers and the dashboard Site URL value, neither of
which was inspected.** This report therefore records **that confirmation succeeded server-side** and
**does not assert which explanation caused the visible failure.**

---

## 7. §11.7 — Cross-customer booking `SELECT` — the literal test

**Target:** `f9b7fb18-fc25-413a-ad27-81182ebab53a` — **SELECT only, never mutated.**

### 7.1 Actor verification — **VERIFIED NOW**

```
Customer A  sub df214443-…965b   jwt role claim: authenticated
Customer B  sub 41c1625c-…9628   jwt role claim: authenticated
subs differ: true
```

**Customer B's profile was read with B's own non-privileged JWT** (via `profiles_select_own`,
`id = auth.uid()`) and returned `role=customer`, `approval_status=approved`. **Observed, not
inferred** — and incidentally a second demonstration that the `profiles` policy scopes correctly.

**B is not admin. B is not the assigned provider** — the target's `assigned_provider_id` is `null`.

### 7.2 Owner control — **VERIFIED NOW**

```
GET /rest/v1/bookings?id=eq.f9b7fb18…            [Customer A JWT]
HTTP 200 · rows 1 · customer_id === Customer A sub : true
```

**This is what makes B's result evidence rather than an artefact:** it proves the row exists and is
readable by its owner, so zero rows for B is **refusal**, not absence.

### 7.3 Decisive request — **VERIFIED NOW**

```http
GET /rest/v1/bookings?id=eq.f9b7fb18-fc25-413a-ad27-81182ebab53a
apikey: <anon>
Authorization: Bearer <Customer B user JWT>
```

```
HTTP 200
body: []
row count: 0
protected data returned: NO
```

The request explicitly selected `customer_id`, `status`, `service_id`, `address`, `notes`,
`admin_notes`, `assigned_provider_id` and **`service_details`** — the full snapshot. **Nothing was
returned.**

### 7.4 Corroborating enumeration test — **VERIFIED NOW**

```
GET /rest/v1/bookings                             [Customer B JWT]
HTTP 200 · rows 0 · rows belonging to other customers: 0
```

Confirms the refusal is not an artefact of the `id` filter: **B cannot enumerate other customers'
bookings either.**

### 7.5 Verdict

> **§11.7 Cross-customer booking `SELECT` = PASS / CERTIFIED — CLOSED**

**This is the literal test**, run with a second authenticated, confirmed, non-admin, non-provider
**customer** — not the adjacent provider substitute of §4.

---

## 8. QA ENVIRONMENT / CREDENTIAL MAINTENANCE FINDING

> **The `QA_SERVICE_ROLE_KEY` in the local `qa/.env` is rejected by the QA Supabase server.**

**Evidence — VERIFIED NOW:** `POST /auth/v1/admin/users` returned **`401 {"message":"Invalid API
key"}`**. The value decodes as a legacy JWT whose `role` claim is `service_role`, so it is
structurally a service-role key, but the server does not accept it — consistent with rotation or
invalidation. The anon key from the same file is valid and served every request in this gate.

**Consequence:** local helpers depending on that credential — including the setup-verification and
booking-cleanup operations in `qa/native/backend.mjs` — **would fail if run locally today**.

**CI is NOT established to be affected.** The workflows supply `QA_SERVICE_ROLE_KEY` from repository
secrets, which are managed separately from this local file, and CI runs have used it successfully.
**That does not prove the CI value is current — only that the stale local value does not establish a
CI failure.** No CI run was performed to check.

**Classification: QA ENVIRONMENT / CREDENTIAL MAINTENANCE FINDING.** It is **separate from the RLS
certification verdicts** and does not qualify them: no privileged credential was used for any
evidence in §4, §5 or §7. **The key was not repaired, rotated, or printed.**

---

## 9. Security interpretation — and its limits

**What is now established, in two layers:**

| Layer | Control | Status |
|---|---|---|
| **UI / router** | native `/admin` role guard | **defence in depth and correct UX** — certified on hardware (7A, 7C) |
| **Data layer** | RLS on `public.bookings` | **the authoritative control** — now certified at runtime (§5, §7) |

**Direct runtime evidence now exists for both directions tested:** unauthorised cross-customer
**READ** isolation, and unauthorised customer **WRITE** isolation for an admin-controlled field.

### 9.1 What this does NOT certify

> **This is NOT a claim that "all RLS is certified" or that "the database is secure."**
> **Certification is limited to the exact policy paths probed above.**

Specifically **not** certified by this phase:

- **`bookings_update_admin` is row-predicate based** and permits an authorised admin to update
  booking columns per that policy. **Phase 7D does not certify column-level restraint for
  authenticated admins** — no such restraint exists on that path by design.
- Any policy on any of the other ~29 RLS-protected tables — `payments`, `profiles`, `reviews`,
  `booking_messages`, `device_tokens`, `customer_addresses`, storage objects, and the rest.
- INSERT and DELETE paths on `bookings`.
- Provider UPDATE column pinning (`bookings_update_provider`) — inspected in §2, **never probed**.
- Edge Function authorisation, RPC `SECURITY DEFINER` surfaces, or storage bucket policies.

---

## 10. Customer B state

**Customer B remains a QA customer and was NOT deleted**, per instruction, so it is available for
any further read-only security control. **No booking was created under Customer B**, and its
unfiltered booking list returns zero rows.

**Not exposed anywhere in this report or its source evidence:** email address · password · JWT ·
API keys · confirmation token · full confirmation URL. Credentials are persisted only in
`qa/.env`, which is **gitignored and untracked**.

---

## 11. Open-items register — updated

**Only §11.7 and §11.8 change. Every other item is carried forward unaltered.**

| # | Item | Status |
|---|---|---|
| ~~11.7~~ | **Cross-customer booking `SELECT`** | ✅ **PASS / CERTIFIED — CLOSED (this phase)** |
| ~~11.8~~ | **Non-admin admin-mutation enforcement** | ✅ **PASS / CERTIFIED (this phase)** |
| 11.1 | **Item M overall** | **NOT CLOSED** — legacy `quickserve` retained |
| 11.2 | Admin admission via `kwikserve://admin` | **NOT EXERCISED** |
| 11.3 | Focused simulator gate (S1/S2/S3) | **AUTHORED, NOT RUN** — automation/platform |
| 11.4 | APNs / push on `003a0369` | **NOT CERTIFIED** |
| 11.5 | **Android item L** | **NOT CLOSED** |
| 11.6 | Provider physical route guard | **NOT RUN** |
| 11.9 | Substitution `substitute` / `skip` branches | **NOT CERTIFIED** |
| 11.10 | Android FCM / push on `fa138be5` | **NOT CERTIFIED** |
| 11.11 | Build A 20-checkpoint campaign | **NOT RE-RUN** |
| 11.12 | Item **C** — Maestro `commands.json` hygiene | **OPEN, process** |
| 11.13 | Item **D** — `customer-search.test.tsx` flake | **OPEN, test infrastructure** |
| 11.14 | Item **K** — `/admin` redirect flicker | **OPEN, cosmetic** |
| 11.15 | Home-screen safe area | **OPEN (Android)** |
| 11.16 | Service Details V1.6 physical iPhone | **NOT FULLY CERTIFIED** |
| 11.17 | Production anything | **NOT IN SCOPE** |
| **NEW** | **Stale local `QA_SERVICE_ROLE_KEY`** (§8) | **OPEN — QA environment / credential maintenance** |
| **NEW** | Provider UPDATE column pinning | **NOT PROBED** (§9.1) |
| **NEW** | RLS on the other ~29 tables | **NOT PROBED** (§9.1) |

### 11.1 Certifications preserved unchanged

**Item M runtime remediation = PASS / CERTIFIED** · **J-customer physical iPhone = PASS /
CERTIFIED** · **J-admin physical iPhone = PASS** · **J overall physical iPhone = PASS / CERTIFIED**
· **Item M overall = NOT CLOSED** · **Android item L = NOT CLOSED** · G / H / Mobile Admin V1.4
remain historical verdicts on `a3e699c2`.

---

## 12. Protected / untouched systems

Production Supabase · production environment · App Store · TestFlight · Google Play · Android and
iOS identities, credentials and builds · **RLS policies, migrations and DB functions (inspected
only, never modified)** · Supabase Auth configuration · redirect/Site URL configuration · the
service-role credential (**not repaired or rotated**) · Phases 5E, 6H, 7A, 7B, 7C · product code ·
tests · Maestro flows · CI workflows · `app.json` / `eas.json` / package files · `.env` files
(**read only; `qa/.env` credential append predates this documentation phase**).

**QA data:** `f9b7fb18…` and `d8b9dd38…` are unchanged — all four customer-visible bookings remain
`pending` with `admin_notes = null`. **No booking created, modified or deleted.** The only Auth state
change was the single authorised Customer B account.

---

## 13. GO / NO-GO matrix

| Item | Verdict |
|---|---|
| **§11.7 Cross-customer booking `SELECT`** | **GO — PASS / CERTIFIED, CLOSED** |
| **§11.8 Non-admin admin-mutation enforcement** | **GO — PASS / CERTIFIED** |
| Adjacent provider read evidence | **SUPPORTING ONLY** — did not close §11.7 |
| Column-level restraint for authenticated admins | **NOT CERTIFIED** (by design) |
| Provider UPDATE column pinning | **NOT PROBED** |
| RLS on other tables · INSERT/DELETE paths · Edge Functions · storage | **NOT PROBED** |
| Stale local `QA_SERVICE_ROLE_KEY` | **OPEN** — environment finding, separate from the verdicts |
| Production anything | **NOT IN SCOPE** |

---

## 14. Final repository / QA state proof

| Item | State |
|---|---|
| Branch | `feat/service-details-v1` |
| HEAD at authoring | `dadc98b9af536f5aca2bccc6b1984ec124800ee5` |
| Local = remote, ahead/behind | `0 / 0` |
| Working tree before this report | **clean** |
| Product code / tests / flows / config / migrations | **unchanged** |
| QA bookings | 4, all `pending`, all `admin_notes = null` |
| Production | untouched — never contacted |

---

*End of Phase 7D.*
