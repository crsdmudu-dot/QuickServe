# Prepared QA run — revised `delete-account` Edge Function

> **Status: PREPARED, NOT RUN.** Nothing in this document has been executed. The previous QA
> personal access token was revoked, and no attempt to authenticate has been made. Run it only
> when QA access is deliberately restored.

## What changed, and why re-certification is required

`delete-account` was restructured and given a fail-closed profile gate:

- Decision flow moved to `supabase/functions/delete-account/handler.ts`; `index.ts` is now Deno
  wiring only.
- The profile lookup no longer discards its error. A read failure returns 500, a missing profile
  returns 403, and neither reaches password verification, data mutation, the ban or the auth
  deletion.
- Client wiring is type-checked against the real SDK with no casts (`deno check`, see §5).

The function's previous certification covered a different source. **It does not carry forward.**

## 1. Preconditions

| Check | Requirement |
|---|---|
| Migration `0056` | **Already applied to QA. Do NOT reapply.** No `db push`, no `migration repair`, no `--include-all`. This run touches functions only. |
| Migration `0055` | Must not exist in this branch. It is reserved; see the migration-numbering note in the operations runbook. |
| QA fixtures | `qa/.env` already holds `QA_SUPABASE_URL`, `QA_SUPABASE_ANON_KEY`, `QA_SERVICE_ROLE_KEY` and the fixed accounts. Nothing to add. |
| Other functions | Deploy **only** `delete-account`. Leave every other function at its current version. |
| Shared QA policies | Do not alter RLS, storage policies or fixed accounts. Other certifications depend on them. |

## 2. The one access still needed

Everything above is already local. The only missing credential is a **Supabase CLI personal access
token**, used solely for `supabase functions deploy`.

**Authenticate locally, never in chat.** In this session, type the command with a leading `!` so it
runs in your shell and its output stays here:

```
! npx supabase login
```

That opens a browser, and the token is stored by the CLI. If you prefer a non-interactive shell,
export `SUPABASE_ACCESS_TOKEN` in your own terminal before running the deploy. **Do not paste a
token into the conversation**, and do not add one to any file in this repository.

Confirm it took, without printing anything sensitive:

```
npx supabase projects list
```

## 3. Deploy only the revised function

The project ref is the subdomain of `QA_SUPABASE_URL` in `qa/.env`. Pass it explicitly so no
linked-project default can redirect the deploy.

```
npx supabase functions deploy delete-account --project-ref <QA-ref>
```

Both files ship together: Supabase bundles the function directory, so `handler.ts` travels with
`index.ts`. The relative import `./handler.ts` is the one thing `deno check` proves locally but
only a real deploy exercises end to end.

Verify the new version is live before certifying:

```
npx supabase functions list --project-ref <QA-ref>
```

## 4. Certify

Record the baseline, run the full certification, and confirm the baseline is restored. The spec
does the delta-zero comparison itself, but capture the numbers so a failure is diagnosable.

```
npm --prefix qa run qa:test:certification
```

The existing certification already covers the paths that matter here:

| Path | Where |
|---|---|
| Anonymous request refused, nothing changes | `account-deletion.spec.ts` |
| Wrong password, zero mutation, throttled | same |
| Admin refused with 403 | same |
| Cross-user deletion impossible | same |
| Every blocker returns 409 with zero mutation | same |
| Customer deletion: tombstone, scrubbed booking, retained money | same |
| Provider deletion: earnings and payouts retained | same |
| **Forced auth-deletion failure, then retry completes** | same, the `pending_auth_delete` path |
| Repeat request on a fully deleted identity is idempotent | same |

**Baseline and cleanup.** The spec records fixed-account totals in `beforeAll`, removes every
disposable identity and seeded row in `afterAll`, and asserts the totals return to baseline with
delta zero. Treat a cleanup failure as a run failure: it leaves residue that will corrupt the next
certification. If `afterAll` throws, stop and clear the residue before re-running.

## 5. What the two new refusal paths need, and what they must not get

Profile-read failure and missing profile cannot be induced in QA without breaking the schema or the
RLS that other certifications depend on. **Do not add a fault-injection endpoint, query parameter,
header or environment flag to the deployed function.** Anything that can force a failure in QA can
be reached in production.

They are already covered where they can be covered safely and completely, by dependency injection
in `src/__tests__/delete-account-handler.test.ts`: the real control flow runs against recording
fakes, so the absence of a destructive call is asserted directly. Four causes are exercised for the
read failure (missing column, missing relation, RLS denial, transport failure), each proving no
password verification, no data mutation, no ban and no auth deletion. Reverting the gate fails
twelve of those tests.

If an end-to-end variant is ever wanted, the only safe shape is a **disposable** user in a
**throwaway** QA project, never the certified one.

## 6. Local validation already completed

| Check | Result |
|---|---|
| `deno check` on the real entry point, real jsr SDK | **pass**, zero casts |
| Handler behavioural tests | 26 passed, mutation-checked, 12 fail when the gate is reverted |
| Edge Function source guards | 21 passed |
| Booking-photo storage scope, migration-order replay | 11 passed, fails when a later migration re-broadens |
| `tsc --noEmit` | exit 0 |
| Website suite and static build | 165 passed, 18 pages |

## 7. Rollback

The previous function version remains in the Supabase dashboard's function history. If the
certification fails, redeploy the prior version from `1e5bc71` and re-run. **Do not** attempt any
migration rollback: nothing in this run changes the schema.

## 8. On completion

Record the result as a dated certification under `docs/qa/`, and only then remove the
"NOT CERTIFIED AGAINST QA" note from the account-deletion release items in the operations runbook.
