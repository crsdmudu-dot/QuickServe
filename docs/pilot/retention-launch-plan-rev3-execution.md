# Retention and launch plan, Revision 3 — execution record

> **Status: engineering record of Phase A, plus the Phase B assessment and launch matrix the
> Revision 3 brief asked for.** It records what was built, what was proved, what was not, and
> what still needs a decision or an authorisation. Nothing here adopts a policy, deploys
> anything, disposes of data, or claims store acceptance.
>
> **Brief followed:** `KwikServe-retention-and-launch-plan.md`, Revision 3, 23 September 2026.
> **Written against:** PR #27 head `5c79d22e892d7dee52302cd5e5f1b4fdd9111e75`. The commit that adds
> this record and the Phase A files is identified in the session report, not here.
> **Evidence preserved unchanged:** the full `qa:release` gate result belongs to
> `e85c3764ff027dc60b91b59aa49edc02c70b8303` and to that SHA alone; the `delete-account` v2
> certification at `81de534`; both in
> [2026-09-23-ACCOUNT-DELETION-V2-QA-CERTIFICATION.md](../qa/2026-09-23-ACCOUNT-DELETION-V2-QA-CERTIFICATION.md).
> **No new "full gate passed" claim is made.** The gate has not run on the revised code.

---

## 1. Reconciliation of Revision 3 against the repository

Done first, as the brief required. Each row is checked at the current head.

| Revision 3 states | Repository shows | Effect |
|---|---|---|
| Deletion leaves a full phone in `payment_attempts.raw_response` | **Confirmed.** The scrub in `0056` masks the `phone` column only. | Phase A target. |
| The `0045` contradictory-evidence JSON may also carry the phone | **Not so.** The `discrepancy` array is built by `apply_mpesa_callback` (0050) from structured fields — amount, receipt, codes, request ids — never from the body. `mpesa_callback_events` (0054) stores a masked phone and a payload hash, never the body. | Neither needs repair. Recorded so no one repairs a problem that does not exist. |
| Audit the writers and JSON formats | **Done. A second shape was found.** In mock mode, which QA and Production both run, `mark_attempt_accepted` stores the mock STK acceptance result, and `mockStkResult` (`_shared/daraja.ts`) puts `PhoneNumber` at the **top level**. Real Daraja acceptance carries no phone; the mock does. | The repair handles both shapes. A fix that only knew the Daraja callback shape would have missed the one Production actually produces today. |
| Payment attempts are not leaves; derive the graph | **Confirmed.** `mpesa_callback_events.matched_attempt_id` references `payment_attempts(id)`. Revision 2 called attempts a leaf; that was wrong. | Retention row 4 must account for it before any attempt row is deleted. Not touched in Phase A. |
| Supabase documents custom Storage roles | **Confirmed.** `docs/guides/storage/schema/custom-roles` gives the SQL and a JWT minted with the project `JWT_SECRET`. Revision 2 called this under-documented; that was wrong. | The permission model in the retention recommendation should be revised to treat this as documented, with the caveat that it depends on the legacy JWT secret. |
| Apple expects deletion of associated data including user-generated photos, text and reviews; support-only flows are not adequate | **Confirmed from the source.** Quoted: "Offer to delete the entire account record, along with associated personal data"; "This includes user-generated content that's shared with others, such as photos, video, text posts, and reviews"; "Apps not operating in highly regulated industries should not require people to make a phone call, send an email, or go through other support flows"; "only offering to temporarily deactivate or disable an account is insufficient"; and "If local laws or regulations require that you maintain some data, let your users know." | Drives the Phase B photo and review decisions (§3). |
| Play closed-testing rule for new personal accounts | **Confirmed from the source:** "a minimum of 12 testers who have been opted in continuously for at least 14 days", for "personal developer accounts created after November 13, 2023", before applying for production. | The owner must state the Play account's creation date and type; it is not in the repository. |
| Existing certification does not certify new code | **Agreed and applied.** Phase A adds a migration; the connected certification for it is written but **has not run**, because 0058 is not on QA. | §2.4. |

Two further facts the brief could not know:

- **No local database exists on this machine.** `psql` is absent, Docker is not running, and `supabase status` cannot reach a container. Behavioural proof of SQL therefore has exactly one venue: the QA project, through the connected certification. Local proof is limited to static guards on the migration text.
- **No historical row needs a backfill.** QA's certification baseline records zero tombstones, and account deletion is not deployed to Production. The read-only inventory function in 0058 exists so that claim can be re-checked before any Production activation, and so a backfill, if ever needed, starts from a dry run.

---

## 2. Phase A — the bounded phone-data repair

### 2.1 What was built

`supabase/migrations/0058_redact_deleted_payer_payment_payloads.sql`, next free number (`0055`
reserved, `0057` spoken for by the privilege-hardening branch; verified on every local and remote
branch). Four objects, **no redefinition of any existing function**:

| Object | Purpose |
|---|---|
| `mask_msisdn(text)`, `redact_mpesa_phone(jsonb)` | Pure, `IMMUTABLE`, idempotent. Both payload shapes. Non-object JSON passes through unchanged. Every non-phone field preserved byte for byte. |
| Trigger **B**, `BEFORE INSERT OR UPDATE` on `payment_attempts` | If the payer's profile is tombstoned, the incoming `raw_response` is redacted and `phone` masked at write time. Covers late, duplicate, contradictory and reconciliation writes, any direct service-role write, and any future writer. |
| Trigger **C**, `AFTER UPDATE OF deleted_at` on `profiles` | When a profile becomes tombstoned, the payer's existing attempt rows are redacted **inside the same transaction** as `delete_account`'s profile update. Atomic with the deletion. |
| `deleted_payer_attempts_needing_redaction()` | Read-only dry-run inventory. Performs no write. Expected empty. |

Every routine has `EXECUTE` revoked from `public`, `anon` and `authenticated`.

### 2.2 Why triggers rather than editing the functions

Two existing guards forbid the obvious approach. `mpesa-certified-outcomes.test.ts` asserts the
**last migration that re-creates `apply_mpesa_callback` is 0050**, so the certified settlement
contract cannot drift. `account-deletion-migration-guard.test.ts` pins `delete_account`'s text in
`0056`. Re-creating either function in 0058 would have broken those guards or forced them to be
weakened. Triggers repair both the deletion-time scrub and every write path without touching
either function, and they also cover writers that do not exist yet.

### 2.3 Race safety, as designed and as recorded in the migration header

Under `READ COMMITTED`, every writer locks the payment row and then the attempt row `for update`.
Trigger C's `UPDATE` takes the same attempt-row locks inside the deletion transaction. Either the
writer holds the row first, writes, commits, and C then rewrites it redacted; or the deletion
holds it first, the writer blocks, and when it proceeds trigger B's profile read — in a `VOLATILE`
function, so it sees data committed after the outer statement began — observes the tombstone and
redacts. A writer cannot land an unredacted phone after the deletion has committed. This is
asserted behaviourally by the concurrency case in §2.4, not only argued.

### 2.4 Tests

**Static, run locally, all green.** `src/__tests__/deleted-payer-payload-redaction-guard.test.ts`
(25 cases) plus every guard on this branch that constrains migrations: 132 tests across seven
suites, including the two that pin `apply_mpesa_callback` to 0050 and the order-aware storage
replay that reads every migration. Root `tsc` clean. The three delete-account suites unchanged at
65 passing.

**Connected, written, NOT RUN.** `qa/playwright/certification/deleted-payer-redaction.spec.ts`,
eleven cases, tagged `@certification @connected`, discovered by Playwright under the chromium
project. It seeds disposable subjects, settles a payment **through the real callback writer** so
the stored payload is exactly what Production would hold, merges the mock top-level shape onto the
same row, and proves:

1. Deletion masks the phone in both shapes and the phone column, and changes nothing else — every
   non-phone field, the payment, the earning and the provider profile are byte-identical.
2. A control payer who did not delete keeps their full payload.
3. A late duplicate success callback after deletion is a no-op and reintroduces nothing.
4. A contradictory callback after deletion appends evidence without the phone.
5. A late failure callback after deletion appends evidence without the phone.
6. A direct service-role write of a full phone to a deleted payer's attempt is redacted at write
   time, proving trigger B independently of any writer.
7. **Concurrency:** four subjects, two rounds, `delete_account` and a full-phone write fired
   together; no unmasked phone survives and settlement references are intact.
8. Malformed and non-object payloads neither error nor change.
9. Repeat deletion is idempotent; one audit row; the tombstone timestamp is unchanged.
10. The deleted payer is denied their rows on a still-valid token.
11. The dry-run inventory reports zero rows.

Cleanup mirrors the deletion suite exactly and asserts delta-zero on totals, now including a
tombstone count.

**It cannot pass until 0058 is applied to QA, by design.** Running it before that would fail at
the first redaction assertion, and it must not be readable as a pass on a project that lacks the
repair.

### 2.5 Explicitly not done in Phase A

- No backfill of historical rows. None exist (§1). A backfill is a separately authorised,
  dry-run-first operation.
- No reduction of `raw_response` to structured evidence. That is retention row 5, not release
  repair. The phone is removed; receipt, amounts, codes and timestamps stay.
- No change to `0056`, `0050`, `0045` or any applied migration.
- No QA deployment. Applying 0058 to QA and running the certification are the prepared actions in
  §6.

---

## 3. Phase B — category-by-category deletion decision (Android and iOS)

Assessed against Apple's quoted guidance and Play's, for what happens **to the deleting user's own
data** at deletion time. Ordinary expiry for everyone is the retention schedule's job, not this
table's. **These are recommendations for the owner; none is implemented.**

| Category | Today at deletion (SOURCE) | Apple / Play reading | Recommendation | Code needed |
|---|---|---|---|---|
| **Login** | Auth identity and sessions deleted | Required | Keep | None |
| **Profile fields** | Name, phone, photo, bio, skills, experience cleared; row kept with role, aggregates, statuses | Apple: "delete the entire account record" unless law requires retention | Keep the row only because retained financial records reference it; **clear the behavioural fields** (ratings totals, job counts, approval, availability) — no purpose survives deletion. Disclose the record's survival, as the pages now do. | Small migration (retention plan Phase 5) |
| **Booking photos the user uploaded** | **Kept as uploaded** | Apple: user-generated photos are expected to be deleted; retention only where law requires, with notice | **Delete the deleting user's own uploads at deletion** (object then row) unless a documented hold exists on that booking. Keep the counterparty's uploads: they are the other person's content. **No legal basis has been identified for keeping a deleted user's photos**, and the only argued basis, future dispute evidence, is the open question Q5. | `delete_account` extension or a companion trigger, plus a Storage delete performed by the Edge Function, since SQL cannot remove the object. |
| **Public review comment** | Comment nulled, rating kept | Apple names reviews as user-generated content expected deleted | Keep as is: the text is gone; an anonymous star rating is not personal data and other users rely on it. Record that reading for review. | None |
| **Private review feedback (author deletes)** | **Not touched** | As above | **Clear the text at deletion**, consistent with the public comment; structured category ratings on `reviews` carry the quality signal. | Migration (retention plan Phase 1) |
| **Private review feedback (subject provider deletes)** | Not touched | It is a quality record *about* the provider, authored by someone else | Keep under the support/safety tier, redact later. Not the provider's own content. | Retention tooling |
| **Chat messages the user sent** | Replaced with "[deleted]" | Text posts expected deleted | Keep as is. Note: the counterparty's messages can still contain the deleted person's details; that is the counterparty's record and is disclosed. | None |
| **Booking activity `message`/`metadata`** | **Kept** | Free text and JSON can identify | Redact `message` and `metadata` for the deleted user's bookings at deletion; keep `event_type` and timestamps. | Migration |
| **Raw payment payloads** | **Repaired in Phase A**: phone masked | Play permits retention for regulatory compliance with disclosure | Keep the reduced payload for the accounting period. | Done |
| **Support notes, flags, quality actions** | Kept | Retention for safety and fraud is a recognised legitimate reason, with disclosure | Keep under the tiers; redact later. Disclosed. | Retention tooling |
| **Deletion audit row** | Kept, no PII | Accountability | Keep. | None |

**Blockers (Revision 3 §2D).** Today a deletion is refused while an earning is unpaid, a wallet
holds a balance, a booking is not terminal, a payment or attempt is open, a support case is open,
or a flag is active. Assessment: money-related blockers protect a concrete obligation and are
right to refuse; but a flag with no review date can refuse forever. **Recommendation:** every
active flag gets an owner and a review date; the refusal message names the next step and the
support route; and a design is prepared for **closing access while narrowly required records
remain** — revoke the login and tombstone the profile even when a payout is pending, so the person
stops being able to act while the ledger stays intact. Never forfeit a balance silently. Not
implemented; needs a design decision.

**External request route (Revision 3 §2D, Apple §3).** The `/delete-account` page routes a person
who cannot sign in to email, and Apple accepts a website link "directly to the page ... where they
can complete the process". Today that page describes the email route; the deletion itself is then
performed by an operator with the service credential after identity verification by reply to the
registered address. **Gap:** that operator procedure is described on the public page but not
written down as a runbook step with the verification standard and the exact commands. It must not
require the app or a password. Recommendation: a runbook entry, Phase B.

---

## 4. Full-platform launch matrix, with the evidence available to this session

"Unknown" means the evidence has to be obtained, not that it is failing. Nothing below was assumed
from a config file.

| Surface | Evidence required | Current position, with source |
|---|---|---|
| Account deletion and retention | Repaired phone paths; justified retained data; request handling; expiry process; disclosures | **Phone repair built and statically proven; connected proof pending 0058 on QA.** Disclosures corrected at `5c79d22`. Retention schedule not adopted. Photo and private-feedback decisions in §3 not implemented. |
| Production backend | Explicit targeting; reviewed rollout; auth/RLS; no QA config; failure monitoring | **`0056` and the function are not deployed** (Production migration history ends at 0054 per the last recorded inspection; this session did not contact Production). |
| Android | New AAB from the final commit; package/signing; device flows; Play requirements | **Build 6 (`6f566e5d`) was built from `4c6ce2b`, before the feature. Not a candidate.** Play account type and creation date **unknown** — the 12-tester rule may apply. |
| iOS | Bundle identity, team, signing, ASC, TestFlight, device tests; deletion assessment | **No release evidence in this session.** Deletion assessment: §3. |
| Admin | Post-merge smoke, roles, operations, sign-out | Cloudflare recovery and smoke passed 2026-09-22 (PR #26). Workers Builds deploys on every merge to `main`; the admin bundle references no 0056 object. New smoke required after merge. |
| Payments and payouts | Production mode and credentials; live payment; callback; refund; payout | **`MPESA_MODE=mock` on Production per the last recorded state; live state unverified this session.** |
| Auth and notifications | Production reset email, redirect, deep links, push | **Unverified this session.** Last recorded: Production Site URL and mailer not configured (2026-09-19). |
| Website | HTTPS legal pages, identity, monitored request route | Source exists and builds (18 pages). **Public publication and domain not established.** |
| Store declarations | Inventory matches Data safety and Apple privacy answers | **Console evidence required.** Raw-payload phone repair changes the honest answer to "is phone number deleted on request". |
| Business operations | Onboarding, area, pricing, disputes, reconciliation, support, incident contact | **Owner to confirm and demonstrate.** |
| Business and legal records | Company and payment arrangements; DPA registration, transfer and processor obligations; retention | **Questions 1–4 in Revision 3 §8 not yet sent.** |
| Recovery and security | Backup configuration, restore drill, access control, alerts | **Backup plan and window unknown.** No restore drill recorded. |

---

## 5. Production run sheet for the deletion feature — PREPARED, NOT AUTHORISED

For when the owner authorises Production activation. Every step names what it needs.

**Preconditions**
- Owner authorisation for Production, in writing, naming the exact SHAs below.
- Phase A connected certification **passed on QA** with 0058 applied (§6, prepared action 3).
- Phase B decisions on photos and private feedback taken, and either implemented and certified or
  explicitly deferred with the disclosure adjusted.
- The Production backup plan and window recorded; a restore into a **disposable** project drilled
  once, with the post-restore replay procedure exercised (retention recommendation §7.2).
- Play Data safety and Apple privacy answers updated for the corrected retention facts.

**Order and versions**
1. `supabase migration list --linked` against Production: expect `0001–0054`, no `0055`. Stop if
   anything differs.
2. Dry-run the push, expecting exactly `0056` and `0058` to be applied, in that order.
3. Apply `0056`, then `0058`. `0056` is the one that changes foreign keys; it fails closed if any
   booking's customer lacks a profile, which is the intended safety.
4. Deploy `delete-account` at the certified source (the two-file split at `81de534`, unchanged
   since). Record the resulting version and digest.
5. Run the dry-run inventory `deleted_payer_attempts_needing_redaction()`: expect zero rows.
6. Smoke: create one disposable Production identity under an agreed marker, delete it through the
   app path, verify tombstone, denial and redaction, then remove the identity and its audit row
   under the same authorisation. **This is a Production write and needs its own explicit go.**

**Rollback limits**
- Functions can be redeployed at a prior version.
- `0058` can be reversed by dropping its triggers and functions; redacted values cannot be restored.
- `0056` changes foreign keys and cannot be undone by a migration without a reverse migration that
  does not exist; a database restore is not a routine rollback once real deletions or payments have
  occurred after the point in time.

---

## 6. Prepared actions that each need an authorisation

| # | Action | Exact command or step | Why it is not done |
|---|---|---|---|
| 1 | Commit Phase A locally | one focused commit, four files | Done in this session if the report says so; otherwise pending |
| 2 | Push `feat/account-deletion` | `git push origin feat/account-deletion` (fast-forward) | Push has been gated per-commit all session |
| 3 | Apply 0058 to QA | `npx supabase db push --linked --dry-run` then `npx supabase db push --linked`; expect **only** `0058`. Verify the linked project is the QA reference first, exactly as on 2026-09-23. | QA schema change |
| 4 | Run the connected certification | `npx playwright test playwright/certification/deleted-payer-redaction.spec.ts --project=chromium --workers=1` from `qa/`, with before/after baseline capture | Needs 3 |
| 5 | Re-run the deletion certification | `account-deletion.spec.ts`, to prove 0058 changed nothing there | Needs 3 |
| 6 | Update PR #27 | banner: Phase A built, certified once 3–5 pass; **no new gate claim** | After 4–5 |
| 7 | Production | §5 | Not authorised |

---

## 7. Unresolved decisions, each with a recommendation

1. **Photos at deletion.** Recommend: delete the deleting user's own uploads unless held. Apple's
   text is the driver; no legal basis for keeping them has been identified.
2. **Private feedback, author deletes.** Recommend: clear the text at deletion.
3. **Profile behavioural fields.** Recommend: clear at deletion.
4. **Booking activity free text.** Recommend: redact at deletion for the deleted user's bookings.
5. **Blockers.** Recommend: review dates on flags; design "close access, retain narrow records".
6. **Play account type and creation date.** Owner to state; determines the 12-tester rule.
7. **Production backup plan.** Owner to state; determines the restore window and the public
   wording about backups.
8. **Retention schedule adoption and periods.** Still Revision 3 §3; nothing here changes it.
9. **The four professional questions** in Revision 3 §8. Not yet sent.

---

## 8. Sources verified in this session

- Apple, Offering account deletion in your app — https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Google Play, app account deletion requirements — https://support.google.com/googleplay/android-developer/answer/13327111
- Google Play, testing requirements for new personal developer accounts — https://support.google.com/googleplay/android-developer/answer/14151465
- Supabase, custom Storage roles — https://supabase.com/docs/guides/storage/schema/custom-roles
- Supabase, database backups — https://supabase.com/docs/guides/platform/backups
- Repository: migrations `0011`, `0012`, `0045`, `0050`, `0053`, `0054`, `0056`; `supabase/functions/mpesa-stk-push`, `mpesa-callback`, `_shared/daraja.ts`; `qa/playwright/certification/*`.
