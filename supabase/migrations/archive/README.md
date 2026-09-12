# Archived migrations — quarantined, not deleted

Files in this directory are **excluded from the executable migration set**. The Supabase CLI
globs `supabase/migrations/*.sql` (flat), so nothing here is ever applied by `supabase db push`.

Nothing in this directory may be edited. Contents are preserved **byte-for-byte** so the
historical record stays intact and auditable.

---

## `0034_provider_terminal_states.sql`

**Quarantined:** 2026-08-17 · **Reason:** duplicate local migration version collision.

### What happened

Two migrations were committed with the same `0034` version prefix:

| File | Introduced | Commit |
|---|---|---|
| `0034_provider_terminal_states.sql` | 2026-07-28 | `e99c85f` — *RC1 F4 (P1) cancellation-not-terminal* |
| `0034_booking_idempotency_key.sql` | 2026-08-12 | `a0037c1` — *precise submission idempotency* |

The Supabase CLI keys migration history on the **4-digit version prefix**, not the filename, and
`supabase_migrations.schema_migrations` records a **single `0034` row**. With two local files
claiming one version, the CLI could not reconcile local with remote:

```
$ supabase db push --dry-run
LegacyDbPushMissingRemoteError: Found local migration files to be inserted
before the last migration on remote database.
  supabase/migrations/0034_provider_terminal_states.sql
```

`db push` **failed closed** — it applied nothing, but it also blocked every later migration,
including `0037_booking_service_details.sql`.

### Why quarantining this file is safe

**Its effect is already live in QA.** A read-only `pg_policy` query on 2026-08-17 confirmed the
live `bookings_update_provider` `WITH CHECK` expression contains the F4/P1 terminal-state guard
this migration introduced:

```sql
(SELECT b.status FROM bookings b WHERE b.id = bookings.id)
  = ANY (ARRAY['provider_assigned', 'on_the_way', 'in_progress'])
```

**How it came to be applied is UNKNOWN** and deliberately not guessed — the shared `0034` history
row cannot attribute provenance. It is present; that is what matters.

**It is superseded.** `0038_provider_service_details_immutable.sql` recreates the same policy —
the live expression verbatim — plus one additional conjunct pinning `service_details`. Applying
0038 therefore preserves everything this file established.

### What was NOT done

- The SQL was **not edited** — SHA-256 `188dbcd77fcbe6a8fa78057486b2512c8782093afdfa4a62f433a0e5720de522`,
  unchanged across the move (`git mv`, so history follows the file).
- `0034_booking_idempotency_key.sql` was **not renamed or modified**.
- Remote migration history was **not** altered — no `supabase migration repair`, no hand-edited
  `schema_migrations` row.
- No `--include-all` push was used.

### If you ever need to re-apply it

Don't apply this file. Apply `0038_provider_service_details_immutable.sql`, which contains the
same policy plus the `service_details` pin. This file exists for the historical record only.

### Production consequence of the version collision — verified 2026-08-29

The note above establishes the collision's effect **in QA**, where the terminal-state policy is
live and the booking-idempotency schema is also present. **Production differs, and the difference
was not visible in migration history.**

A read-only `pg_dump` of Production (`lkigkltvstlxfdztffds`, schema-only, explicit `--project-ref`,
no relink) established that its recorded `0034` corresponds to the **earlier terminal-state
migration**, and that the later booking-idempotency changes are absent:

| Object | QA | Production |
|---|---|---|
| `bookings.idempotency_key` | present | **absent** |
| `bookings_idempotency_key_uidx` | present | **absent** |
| `bookings_active_dedup` | dropped | **still present** |

Both environments report `0034` as applied, so `supabase migration list` cannot surface this —
the version row is shared, the contents are not.

Because version `0034` is already recorded remotely, **normal migration application can never
deliver `0034_booking_idempotency_key.sql` to Production**; `db push` skips the version.

**Forward reconciliation:** `0039_reconcile_booking_idempotency.sql` reproduces that migration's
effective schema through the normal path, guarded so it is a no-op wherever the schema already
exists. `supabase migration repair` was **deliberately not used**, for the same reason recorded
above — it is version-keyed and cannot distinguish two files sharing `0034`.

**Status: `0039` is AUTHORED and NOT APPLIED.** Production has not been reconciled. Neither
historical `0034` file was renamed, moved, edited, or retroactively corrected by this note.
