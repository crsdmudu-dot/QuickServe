# Data retention review — PROPOSED procedure, not yet approved or implemented

> **Status: DRAFT FOR OWNER APPROVAL.** Nothing in this document is in force. The responsible role
> and the cadence below are **proposals** and need the owner's decision before they mean anything.
> No retention period is asserted here: none has been established, and none may be published until
> the owner and legal confirm one.

## Why this exists

Account deletion (`0056_account_deletion.sql`) retains booking, payment, payout, support, safety
and audit records after a user deletes their account, and reduces the profile to a tombstone. The
public wording therefore has to say what happens to those records over time.

An earlier draft of `/delete-account` and the Privacy Policy said retained records "are deleted or
fully anonymised once that purpose and any applicable legal obligation no longer apply." **Nothing
performs that.** There is no scheduled job, no manual procedure and no assigned owner. That sentence
has been removed from both pages rather than left standing as an unbacked promise.

**Removing it does not settle the question.** The obligation to keep personal data no longer than
necessary does not go away because a page stops claiming compliance with it; taking the sentence
down only stops us asserting something untrue. What closes the gap is a retention schedule with
real periods, an owner, and actions that actually run. This document is the proposal for that, and
it is not yet approved.

Of the ten record categories in §4, **three can be actioned by hand today with no code change**,
and the rest are blocked by constraints named precisely in §6. The schema is not a wall; it is a
set of specific, addressable obstacles, one of which is a hazard that must be fixed before any
future deletion work, not after.

## 1. Responsible role — PROPOSED

| | |
|---|---|
| **Proposed owner** | Operations lead |
| **Proposed second pair of eyes** | Owner or a director, for any deletion that is irreversible |
| **Status** | **Unassigned.** No person or role has accepted this. |

The reviewer needs `service_role` database access, which today is the same credential used for
production support. Whether that is acceptable, or whether a narrower role should be created, is
part of the decision.

## 2. Cadence — PROPOSED

| | |
|---|---|
| **Proposed cadence** | Twice yearly |
| **Proposed trigger** | Calendar, plus an ad-hoc review whenever a legal hold is lifted |
| **Status** | **Not agreed.** |

Twice yearly is proposed because the review is manual and the volume is currently small. It is a
starting point, not a recommendation derived from any obligation.

## 3. Records in scope

Everything `delete_account` retains, plus the tombstone itself:

| Class | Where | Notes |
|---|---|---|
| Bookings | `bookings` | Address, notes, coordinates and access details already cleared for the deleted party |
| Payments and attempts | `payments`, `payment_attempts` | Payer phone already reduced to its last three digits |
| Provider money | `provider_earnings`, `provider_payouts`, `provider_earning_deductions` | |
| Wallet | `wallets`, `wallet_transactions` | |
| Booking photos | `booking_photos` + the `booking-photos` storage bucket | **Kept as uploaded.** May depict the person or their home |
| Support and safety | `support_cases`, `support_case_notes`, `support_case_events`, internal notes, account flags | Free text written by staff; may describe the person |
| Audit | `booking_activity`, `account_deletions`, M-PESA callback evidence | |
| Tombstone | `profiles` row with `deleted_at` set | Retains the original user UUID, role and aggregate ratings |

Out of scope: anything `delete_account` already deletes outright (device tokens, notification
preferences, notifications, saved addresses, favourites, provider locations, conduct acceptances).

## 4. Retention schedule — PROPOSED, periods UNRESOLVED

One row per record category. **No period is asserted.** Every period is marked
**`PENDING-KE-LEGAL`** and must be obtained from Kenyan counsel and the accountant before it is
written down here or anywhere public. Inventing a number would be worse than having none: it would
look authoritative, drive real deletions, and be wrong.

Where to obtain each one is named so the reviewer has somewhere to start, not so the period can be
guessed from it. The candidate sources are Kenya's Data Protection Act 2019 for storage limitation
and the rights that qualify it, the tax and company record-keeping obligations that bind the
business, and the limitation period for contract and tort claims. **Which of these applies to which
category, and for how long, is exactly the question for counsel.**

| # | Category | Purpose that justifies keeping it | Proposed period | Basis to confirm | Review trigger | Disposal action |
|---|---|---|---|---|---|---|
| 1 | Bookings (`bookings`) | Service record behind a payment; dispute evidence | `PENDING-KE-LEGAL` | Limitation period for a contract claim; accounting linkage to the payment | Age since `completed_at`, checked each cycle | Already scrubbed at deletion. Remaining action is deletion of the row once **both** its payment and its booking photos have gone |
| 2 | Payments and attempts (`payments`, `payment_attempts`) | Accounting; M-PESA reconciliation; chargeback and dispute evidence | `PENDING-KE-LEGAL` | Tax and company record-keeping obligations | Age since settlement, plus "no open dispute" | Delete, or reduce to a non-identifying accounting summary. **Not** feasible today, see §6 |
| 3 | Provider money (`provider_earnings`, `provider_payouts`, `provider_earning_deductions`) | Evidence of what was owed and paid to a provider | `PENDING-KE-LEGAL` | Same accounting basis as row 2, plus employment/contractor record rules if they apply | Age since payout settled | As row 2 |
| 4 | Wallet (`wallets`, `wallet_transactions`) | Ledger of customer credit and its movements | `PENDING-KE-LEGAL` | Accounting; unclaimed-balance rules if any apply | Age since last movement **and** zero balance | As row 2. Note the cascade hazard in §6 |
| 5 | M-PESA callback evidence | Proof of what Safaricom reported, for reconciliation disputes | `PENDING-KE-LEGAL` | Payment-reconciliation window; counterparty retention | Age since callback | Delete once the payment it evidences is out of scope |
| 6 | **Booking photos** (`booking_photos` + storage objects) | Evidence of work done or an issue raised | `PENDING-KE-LEGAL`, and likely the **shortest** of any row here | Dispute window only; no accounting basis | Age since booking completed, plus "no open dispute or safety case" | **Delete the storage object and its metadata row.** The highest-value action in this schedule: photos carry the most personal information and have the weakest justification for long retention |
| 7 | Support and safety (`support_cases`, `support_case_notes`, `support_case_events`, internal notes, account flags, `provider_quality_actions`) | Incident investigation; repeat-behaviour detection; duty of care | `PENDING-KE-LEGAL` | Safety and fraud-prevention necessity; any incident-reporting duty | Case closed **and** aged past the window; flags lifted | Redact free text in place (a human must read it), or delete the case once closed and aged |
| 8 | Booking activity / audit trail (`booking_activity`) | Showing what happened and when | `PENDING-KE-LEGAL` | Dispute window | Age since the booking left scope | Delete with its booking |
| 9 | Deletion audit (`account_deletions`) | Proving a deletion request was handled correctly | `PENDING-KE-LEGAL` | Accountability under the Data Protection Act | Age since `auth_deleted_at` | Delete, or re-key to a non-identifying digest. **It does not block anything — see §6** |
| 10 | **The tombstone** (`profiles` row with `deleted_at` set) | Referent for every row above; keeps aggregate ratings meaningful | Outlives the longest of rows 1–9 **by construction** | Derived, not independent | When every referencing record is out of scope | Further in-place anonymisation now; row deletion only once nothing references it |

**Row 10 is the one to understand, and it is easy to state too strongly.** The tombstone has no
retention period of its own and none is proposed here.

What is true today is narrower than a rule: **under the current implementation** the profile row
remains for as long as records still reference it, because 33 foreign keys refuse the delete while
they do. That is a property of how the schema is wired, **not an approved retention decision and
not a justification for keeping the record**. Those references can be deliberately removed as their
own categories age out, or redesigned so the profile is no longer the join target. Both are open
options in §8.

So row 10's period is not "as long as the longest of rows 1–9". It is: **for as long as we choose
to leave the references in place.** Setting the other periods makes the question answerable; it
does not answer it, and it does not make indefinite retention of the row correct.

## 4A. Criteria for continued retention

A record stays only while at least one of these is true. The reviewer records which one.

1. **Accounting.** The record evidences money received or paid and is still within the period the
   business must keep accounting records for. *The period is not stated here — it is exactly what
   the owner and legal must establish.*
2. **Payment reconciliation.** An M-PESA transaction the record evidences is still reconcilable or
   reversible, or an unresolved discrepancy references it.
3. **Dispute.** An open or reasonably anticipated dispute, chargeback or complaint touches it.
4. **Safety or fraud.** It forms part of a safety record, a fraud pattern, or an account flag that
   is still operationally relevant.
5. **Legal obligation or hold.** A statutory duty, regulator request, or instruction from counsel
   requires it.

If none applies, the record is a **deletion or anonymisation candidate**. Candidate status is a
finding, not an action: nothing is deleted in the same pass that identifies it.

## 5. Disputes and legal holds

- A hold is recorded **before** the review, names the matter and the records it covers, and
  suspends every criterion above. Held records are skipped and noted as held.
- A hold is lifted only in writing by whoever placed it. Lifting one triggers an ad-hoc review of
  just those records.
- If a dispute is open on **any** booking in a chain, the whole chain is retained. Deleting one side
  of a payment while the other survives would destroy the counterparty's evidence.
- A safety or fraud matter holds the support and safety category (row 7) and any booking photo it
  relies on (row 6), even where the booking itself is out of scope.

## 6. Can a controlled manual procedure actually do this today?

Assessed against the current schema rather than assumed. **Partly — three of the ten rows are
actionable by hand now, and the rest are blocked by specific, nameable constraints.**

### What the schema actually says

Counted from the migrations: `profiles(id)` is referenced by **44 foreign keys** — **33** with the
default `NO ACTION`, **9** with `ON DELETE CASCADE`, and **2** with `ON DELETE RESTRICT`.

### Actionable by a careful operator today, no code change

| Row | Action | Why it is safe |
|---|---|---|
| 6 | Delete booking photos — **both parts**, see the note below | `booking_photos` is a **leaf**: no foreign key references it, so deleting a row breaks nothing. `service_role` bypasses RLS, so both the object and the row are reachable |
| 7 | Redact free text in support and safety notes in place | Plain `UPDATE` on text columns. No referential effect |
| 9 | Delete a deletion-audit row | `account_deletions` is also a **leaf** — nothing references it |

These three need only a written procedure, an operator, and evidence capture. They also happen to
cover the categories carrying the most personal information, which makes them the sensible first
increment.

#### Booking-photo disposal is a two-part operation, in this order

A photo exists in **two places**, and disposing of one is not disposal:

1. The **storage object** in the `booking-photos` bucket — the image itself, the part that actually
   contains the personal information.
2. The **`booking_photos` metadata row** — which records the booking, the uploader, the type and the
   object path.

**Check applicable holds before touching either.** A legal hold, an open dispute on the booking, or
an open safety or fraud case that relies on the photo all suspend disposal, per §5 — including where
the booking itself is otherwise out of scope. The hold check comes first, not after the object is
already gone.

Then, and only then:

- **Delete the storage object first, the metadata row second.** In that order a failure between the
  two leaves a metadata row pointing at a missing object, which is visible, diagnosable and
  re-runnable. The reverse order leaves an **orphaned image with nothing recording that it exists**,
  which is the worse outcome and the harder one to find.
- **Deleting only the row is not disposal.** The image survives in the bucket. It is also then
  unreachable through the application's own read policy, which joins through `booking_photos`, so
  it becomes an orphan that no product surface will ever show and no audit will notice.
- **Deleting only the object is not disposal either.** The metadata row still records who uploaded
  what, against which booking.
- **Record both halves in the review evidence**, per §7: object path and row identifier, not just a
  count.

This is exactly why §8 item 3 proposes a routine that does both together and logs them. Until that
exists the operation is a hand sequence, and a hand sequence that is half-completed is the failure
mode to design against.

### Blocked, and precisely why

- **Deleting a tombstone (row 10) is blocked by the 33 `NO ACTION` references**, not by the audit
  key. While a single booking, payment, earning or support case still points at the profile, the
  delete is refused. Clearing the audit row first does not change this.
- **A cascade hazard exists, but only for a hard delete of a profile row that does not happen
  today.** It is not a live defect: the 33 `NO ACTION` references prevent the delete, so nothing
  cascades. It matters only if future work ever makes profile deletion possible, and it should be
  handled then, as part of that work.

  Nine foreign keys cascade from `profiles(id)`, across eight tables. **They are not equivalent and
  must not be changed as a block.** Seven point at categories `delete_account` already deletes
  outright, so a cascade would find nothing left to destroy and no retained record is at risk:

  | Cascading table | Already deleted at account deletion? | Retained record at risk? |
  |---|---|---|
  | `device_tokens` | yes | no |
  | `customer_addresses` | yes | no |
  | `notification_preferences` | yes | no |
  | `favorite_providers` (customer_id and provider_id) | yes | no |
  | `favorite_services` | yes | no |
  | `provider_conduct_acceptances` | yes | no |
  | **`wallets`** | **no — retained** | **yes** |
  | **`provider_quality_actions`** | **no — retained** | **yes** |

  **Two relationships warrant individual assessment**, and only these two:

  - **`wallets.customer_id`.** `wallet_transactions.wallet_id` cascades from `wallets`, so a profile
    delete would remove the wallet and its whole transaction ledger. That ledger is row 4 of the
    schedule, a retained accounting record. Worth assessing on its own terms: the wallet is arguably
    the customer's own record rather than shared, so the right answer may be to age it out with row
    4 rather than to re-point the key.
  - **`provider_quality_actions.provider_id`.** These are safety records, row 7. A profile delete
    would remove them silently. Here the record has a safety purpose that may outlive the account,
    which points more clearly towards decoupling than towards cascade.

  Neither is being changed under the current approval. The point of recording them is that whoever
  later makes profile deletion possible must resolve these two first, having assessed each on its
  own merits, rather than discovering them afterwards.
- **Deleting financial rows (rows 2, 3, 4) is not a schema problem but a correctness one.** They are
  the counterparty's records as much as the deleted user's. Deleting the customer's side of a
  payment destroys the provider's evidence of being paid. This needs a designed partial-anonymisation
  or summarisation step, not a delete.

### Correcting an earlier claim in this document

An earlier draft said `account_deletions.user_id` being `ON DELETE RESTRICT` made every tombstone
permanent. **That was wrong, and it pointed at the wrong constraint.** The audit row is a leaf and
a `service_role` operator can delete it, so the restrict clause can always be cleared first. The
binding constraints are the 33 `NO ACTION` references and the cascade hazard above. The audit key
is not a reason to keep identifiable data indefinitely, and should not be cited as one.

### Anonymising the tombstone further — available now, and worth doing

What survives on a tombstone after the deletion scrub: the row's `id` (the original user UUID),
`role`, `approval_status`, `created_at`, `availability_status`, and the aggregates
`completed_jobs_count`, `average_rating`, `review_count`, plus `deleted_at` and `deletion_status`.
None of these is a direct identifier. **The residual linkage is the UUID**, which is what every
retained record joins on.

A manual `UPDATE` can clear the remaining behavioural fields today without any schema change. It
cannot change the UUID: it is the primary key that 44 foreign keys point at, and none of them is
`ON UPDATE CASCADE`. Re-keying is therefore a schema change, and a large one.

## 7. Evidence recorded after each review

Proposed minimum, per review:

- Date, reviewer, and the period covered.
- Count of records examined, by category, against the numbering in §4.
- For each candidate: the identifier, the criterion that **failed**, and the action taken or
  deferred.
- For each held record: the hold reference.
- Anything not actioned because of the constraints in §6, named by constraint.
- Sign-off by a second reviewer where an irreversible deletion occurred.

**There is nowhere to put this today.** No table or document location exists for review evidence.
The simplest option is a dated file under `docs/pilot/retention-reviews/`; a database table would be
better if the review is ever automated.

## 8. What needs code or schema work, in dependency order

Separated so the manual increment is not held hostage to the larger items.

**Needs nothing — can start once §1, §2 and the §4 periods are settled**

1. The manual procedure for rows 6, 7 and 9, plus the evidence file.

**Needs code only, no schema change**

2. **A candidate query.** Read-only `service_role` routine listing tombstones past a chosen age with
   the records attached to each. `profiles_deleted_at_idx` already supports the lookup.
3. **A photo purge routine** that checks holds, removes the storage object and its metadata row
   **together**, and logs both halves, so row 6 stops being a hand sequence that can half-complete.
   This is the single highest-value piece of code in the list.
4. **A deeper tombstone scrub** clearing the residual behavioural fields named in §6.

**Needs a schema change**

5. **Re-point the nine cascades** away from `profiles(id)`, at minimum for `wallets` and
   `provider_quality_actions`, so that a future tombstone deletion cannot destroy retained records.
   **This must precede any work that makes tombstone deletion possible.**
6. **Re-key or decouple the audit trail** if the deletion record should outlive the tombstone: key
   `account_deletions` by a one-way digest, or relax its foreign key. Not urgent, and explicitly
   **not** a blocker on anything else.
7. **Tombstone removal** once the records that reference it have gone — only meaningful after item 5
   and after the §4 periods exist.

**Needs a decision, not code**

8. **The periods themselves**, from Kenyan counsel and the accountant. Until they exist, criterion 1
   in §4A has no threshold and a review can only catch records that fail **every** criterion
   outright.

## 9. Publication gate

The deletion-or-anonymisation sentence may be restored to `/delete-account` and the Privacy Policy
**only** when all four of these hold:

1. The §4 periods exist, confirmed by Kenyan counsel and the accountant. No `PENDING-KE-LEGAL` left.
2. An owner has accepted §1 and a cadence is agreed in §2.
3. At least the manual increment in §8 item 1 is written down and has run once, with evidence.
4. §8 item 5, re-pointing the cascades, is done **or** the restored wording is scoped to the
   categories the procedure can actually action. Promising deletion of records we cannot yet touch
   would repeat the original error.

Until then both pages state the purpose limitation, which is true, and promise no deletion event,
which would not be. Note that this gate governs **the public promise**, not the obligation: the
duty to avoid keeping personal data longer than necessary applies whether or not a page mentions
it.

## Related

- [Legal and support](legal-support.md) §8 — what deletion does, and the operator rule.
- [Operations](../engineering/operations/README.md) §5 — the runbook copy of the operator rule.
