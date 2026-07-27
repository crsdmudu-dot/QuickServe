# QuickServe Launch Certification Suite

The connected, real-backend certification program (QA Slice 44A). Proves the platform's
launch-critical business rules against a **dedicated QA/staging Supabase project** — never
production, never mocked persistence.

Status legend: ✅ done · 🚧 in progress · ⛔ blocked (operator prerequisite) · ⚠️ product finding.

---

## 1. Product findings (honest — not mocked away)

### B1 — Provider job accept/reject → **intentional product constraint (NOT a blocker)**

Evidence:
- `docs/superpowers/specs/2026-06-21-admin-dispatch-provider-approval-design.md` (line 32):
  **"Admin Accept → `accepted`; Reject → `cancelled`."** Accept/reject is an **admin** booking action.
- `docs/superpowers/specs/2026-06-22-provider-experience-design.md`: the provider flow is deliberately
  designed as forward-only `provider_assigned → on_the_way → in_progress → completed`, and the provider UI
  "renders only the valid forward-transition buttons."
- Provider **account** approval (admin approves/rejects a provider application via `profiles.approval_status`)
  is a separate, existing accept/reject surface.

**Conclusion:** dispatch is intentionally admin-driven in v1. A provider cannot decline an assigned job by
design. This is a **documented product constraint**, not a missing feature. The certification suite therefore
tests the REAL accept/reject surfaces: **admin accept (`pending→accepted`) / admin reject (`→cancelled`)**,
**provider forward-only progression**, and **admin provider-account approve/reject** — not a non-existent
provider job-decline.

### B2 — Duplicate booking protection → **confirmed P0 production blocker**

Evidence:
- Client mitigation exists: `booking/review.tsx` disables the submit button while in flight
  (`disabled={!ready || submitting}`) — prevents a single rapid double-tap.
- **No server-side protection:** `createBooking` (`src/lib/bookings.ts`) is a plain `INSERT`; there is **no**
  unique constraint or idempotency key on `bookings` for `(customer_id, service_id, scheduled_for)` (the only
  booking-related unique constraints are `reviews.booking_id` and `payments.booking_id`).

**Impact:** duplicates are still possible via network retry, back-navigation + resubmit, concurrent
devices/tabs, or direct API calls. Per Decision C this is a **true P0 blocker**. The certification suite
includes a test that submits two identical bookings at the API level and asserts the CURRENT (buggy)
behavior — it will document the duplicate rather than hide it. **This must be fixed (client submit-lock is
insufficient; add a server-side unique/idempotency guard) or formally accepted in writing before launch.**

---

### F3 — Provider progression is forward-only but NOT single-step → **design finding (P2 hardening)**

The provider RLS (`bookings_update_provider`, migration 0004) enforces
`rank(new) > rank(old)` for `{on_the_way, in_progress, completed}`. Verified live:
it correctly **rejects** backward (`in_progress→on_the_way`), reopen
(`completed→in_progress`), and repeat (same-status) transitions — each returns
403, leaves state unchanged, and writes **no** `booking_activity` row. However it
**permits forward-skips** (e.g. `provider_assigned → completed`, `3 > 0`).

This matches the provider-experience design spec ("blocks moving backwards,
reopening, cancelling, or jumping outside the chain") — single-step progression is
a **UI-only** convention (`PROVIDER_NEXT_STATUSES` renders one button), not a
backend rule. Only the legitimately-assigned provider can do it (no privilege
escalation). **Severity P2 (optional hardening), not a launch blocker:** a
custom/buggy provider client could mark a job complete without passing through
`on_the_way`/`in_progress`, skipping tracking/evidence steps. To enforce
single-step, change the rank check to `rank(new) = rank(old) + 1`. Certified as
ACTUAL behavior (no faked rejection).

### Idempotency (repeat same-status) — observed behavior

A provider re-submitting the current status is **rejected (403)** by the same
forward-only rank check and creates **no duplicate** `booking_activity` row. The
backend is not idempotent-accepting; it safely refuses the no-op. No defect.

### Cleanup baseline note (notifications)

The certification suite leaves **zero of its own artifacts** — all booking-linked
rows (bookings, `booking_activity`, booking-linked notifications) cascade-delete
on booking teardown, verified 0 after every run and **non-accumulating** across
runs. Two residual `notifications` rows (`admin_provider_pending`,
`booking_id = null`) are a fixed **provisioning baseline** created when the
provider accounts were first made (before approval); they are unrelated to
certification and intentionally left untouched (Decision: do not modify the QA
environment).

## 2. Connected architecture (Decision A — dedicated QA project)

- The suite targets a **dedicated QA/staging Supabase project** via a separate `QA_*` env namespace
  (`qa/playwright/support/connected/qa-accounts.ts`). It **never** reads the app's
  `EXPO_PUBLIC_SUPABASE_URL`, and `assertNotProduction()` fails loudly if the two hosts match.
- Four **persistent** accounts (Decision B) are provisioned once and reused:
  Customer, Admin, Provider 1, Provider 2.
- Certification tests gate on `certificationConfigured()` and **skip cleanly** when the QA project +
  accounts are absent — they never fall back to production.
- **Proof standard:** every connected test asserts REAL DB state (rows created, statuses advanced, RLS
  denials). Mocked persistence is never presented as backend proof.
- **Execution model:** certification runs **serially** (`--workers=1`) and **caches one session per role
  per worker**. Supabase Auth rate-limits the token endpoint, so re-authenticating on every parallel
  test throttles and produces intermittent empty reads (an infra artifact, not a product defect —
  verified by an isolated serial diagnostic). Serial + session cache keeps runs deterministic; the small
  suite stays fast (~30s).
- **Cleanup:** the service-role context is used ONLY for teardown (bookings has no DELETE RLS policy).
  Each test deletes the rows it created in `afterEach` (even on failure); an `afterAll` marker-prefix
  sweep guarantees repeated runs leave the DB clean. Verified: 0 residual rows after runs.

---

## 3. Operator setup runbook (one-time)

Live certification requires two things only the operator can provide (Decisions A & B):

1. **Create a dedicated QA/staging Supabase project** (separate from production). Apply all migrations
   (`supabase db push`) so the schema/RLS matches production.
2. **Set the QA env vars** (never commit them) — see `qa/.env.example`:
   ```
   QA_SUPABASE_URL=https://<qa-project>.supabase.co
   QA_SUPABASE_ANON_KEY=<qa anon key>
   QA_SERVICE_ROLE_KEY=<qa service-role key>   # provisioning only; never in tests
   QA_CUSTOMER_EMAIL=… QA_CUSTOMER_PASSWORD=…
   QA_ADMIN_EMAIL=…    QA_ADMIN_PASSWORD=…
   QA_PROVIDER1_EMAIL=… QA_PROVIDER1_PASSWORD=…
   QA_PROVIDER2_EMAIL=… QA_PROVIDER2_PASSWORD=…
   ```
3. **Provision the four persistent accounts** (idempotent; run from repo root):
   ```
   node qa/scripts/provision-accounts.mjs
   ```
4. **Run the web app against the QA backend** for connected runs — start Expo web with
   `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` set to the QA project (so the app under test
   talks to the QA backend, not production).
5. **Run the certification suite** (added incrementally; see §4).

Until steps 1–4 are done, the certification suite skips with a clear reason and **no production data is ever
touched**.

---

## 4. Certification suite build status

| Milestone | Scope | Status |
|---|---|---|
| Infra + gating (`qa-accounts.ts`, `assertNotProduction`) | connected config | ✅ |
| Provisioning script (auto-loads `qa/.env`) | 4 persistent accounts | ✅ (operator-run) |
| Findings (B1, B2) | product truth | ✅ |
| **M2: connected client + backend smoke** | auth (4 accounts) + RLS, **run green vs real QA backend** | ✅ |
| **M3: customer booking** | real create + persistence read-back + tenant isolation + deterministic cleanup, **green vs real QA backend** | ✅ |
| **M4: admin dispatch** | queue → assign P1 → reassign P2 + provider access transfer (RLS) + accept/reject + invalid-value rejection + booking_activity audit, **green vs real QA backend** | ✅ |
| **M5: provider progression** | assigned-job visibility + forward path + auth negatives + backward/reopen/repeat rejection + idempotency + forward-skip design finding, **green vs real QA backend** | ✅ |
| Cross-role golden path | X1–X5 | 🚧 next |
| Admin visibility/dispatch | A1–A9 | 🚧 |
| Provider progression | P1–P7 | 🚧 |
| Cross-role consistency | X1–X5 | 🚧 |
| Security / integrity | S1–S7 | 🚧 |
| Live certification run | full P0 gate | ⛔ pending operator QA project + accounts |

The full test inventory, launch gate, and manual checklist live in
`docs/superpowers/specs/2026-07-26-qa-slice-44-launch-critical-e2e-design.md`.
