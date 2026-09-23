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
performs that.** There is no scheduled job, no manual procedure and no assigned owner, and the
schema actively prevents part of it (see *Dependency constraints*). That sentence has been removed
from both pages rather than left standing as an unbacked promise. It can go back once a procedure
exists and someone owns it.

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

## 4. Criteria for continued retention

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

- A legal hold is recorded **before** the review, names the matter and the records it covers, and
  suspends every criterion above. Held records are skipped and noted as held.
- A hold is lifted only in writing by whoever placed it. Lifting one triggers an ad-hoc review of
  just those records.
- If a dispute is open on *any* booking in a chain, the whole chain is retained. Deleting one side
  of a payment while the other survives would destroy the counterparty's evidence.

## 6. Actions, and what blocks them today

| Action | Feasible now? |
|---|---|
| Delete a candidate booking photo from storage and its `booking_photos` row | **Partly.** No routine exists. A reviewer can delete storage objects by hand, which is error-prone and unlogged. |
| Redact a support or safety note | **Manual only.** Free text; requires a human read. |
| Delete the tombstone `profiles` row | **Blocked by schema.** See below. |
| Delete or anonymise financial rows | **Blocked by design.** They are the counterparty's records too. |

### Dependency constraints

- **`account_deletions.user_id` references `profiles(id)` `ON DELETE RESTRICT`.** While a deletion
  audit row exists, the tombstone cannot be deleted. Since `delete_account` always writes that row,
  **every tombstone is permanent as the schema currently stands.**

  This is a constraint of the present design, **not** a law of the problem. Keeping an identifiable
  tombstone forever is *one* way to preserve deletion evidence; it is not the only one, and the
  options below have not been evaluated. Any of them would be a schema change and a decision for
  the owner:

  - Key the audit row by a **one-way digest** of the user id rather than a foreign key, so the
    deletion remains provable without an identifiable referent.
  - Relax the foreign key to `ON DELETE SET NULL` and keep the non-identifying audit fields
    (timestamps, role, status, attempt counts), which already carry most of the evidential weight.
  - Introduce an **anonymised** tombstone state distinct from deletion: strip the remaining
    identifying attributes and retain the row purely as a referential anchor.
  - Move the evidence to a separate append-only log that does not reference `profiles` at all.

  The reviewer must not record "cannot be deleted" as a permanent answer. It is an open design
  question.
- **Roughly thirty tables reference `profiles(id)`**, and `provider_payouts.earning_id` is
  `ON DELETE RESTRICT`. A tombstone with financial history cannot be removed without affecting
  other people's records, which is a genuine limit rather than a schema accident.
- **Booking photo access is correctly scoped.** An earlier draft of this document claimed the
  `booking-photos` storage policy allowed any authenticated user to read any object. **That was
  wrong**: it described the `0006` policy, which `0016_tighten_booking_photos_storage.sql`
  explicitly drops and replaces with one restricted to the booking's customer, its provider, or an
  admin, mirroring the `booking_photos` metadata policy. There is no finding here. The residual
  fact, which the public wording now discloses, is that a deleted user's photos stay readable by
  the surviving counterpart to that booking, which is the same scope as the booking itself.

## 7. Evidence recorded after each review

Proposed minimum, per review:

- Date, reviewer, and the period covered.
- Count of records examined, by class.
- For each candidate: the identifier, the criterion that *failed*, and the action taken or deferred.
- For each held record: the hold reference.
- Anything not actioned because of the constraints in section 6.
- Sign-off by the second reviewer where an irreversible deletion occurred.

**There is nowhere to put this today.** No table or document location exists for review evidence.
The simplest option is a dated file under `docs/pilot/retention-reviews/`; a database table would
be better if the review is ever automated.

## 8. What would need building

None of this is required to *run* the first manual review, but the procedure is weak without it:

1. **Candidate query.** A read-only `service_role` routine listing tombstones past a chosen age and
   the records attached to them. `profiles_deleted_at_idx` already supports the lookup.
2. **A decision on the audit-versus-deletion conflict** in section 6, which may require changing
   the `account_deletions` foreign key or adding an "anonymised" state distinct from deletion.
3. **A photo purge routine** that removes a storage object and its metadata row together, logged.
4. **An evidence store**, file-based or a table.
5. **A retention period**, from the owner and legal. Until it exists, criterion 1 has no threshold
   and the review can only catch records that fail *every* criterion outright.

## 9. Publication gate

The sentence removed from `/delete-account` and the Privacy Policy may be restored **only** once
items 1 to 5 of section 8 are resolved, an owner has accepted section 1, and a cadence is agreed.
Until then both pages describe the purpose limitation, which is true, and promise no deletion
event, which would not be.

## Related

- [Legal and support](legal-support.md) §8 — what deletion does, and the operator rule.
- [Operations](../engineering/operations/README.md) §5 — the runbook copy of the operator rule.
