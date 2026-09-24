/**
 * deletion-work-migration-guard.test.ts — static guards on migration 0059 (durable deletion work).
 *
 * Behaviour is proved by the worker's behavioural tests against the documented contract and, for
 * the SQL itself, by the connected QA certification (unverified until it runs). These guards pin
 * the SHAPE of the migration so a later edit cannot silently weaken it:
 *
 *   * the next free numbers were used (0059 here, 0060 for delete_account) and 0055/0057 stay free;
 *   * every worker routine is SECURITY DEFINER, fixed search_path, service-role only;
 *   * internal helpers are not executable by ANY client role, service_role included;
 *   * one lock order everywhere: user advisory lock, then booking, then intent rows by id;
 *   * the destructive authorisation boundary is the 'destroying' transition and it is fenced;
 *   * results are decided from storage.objects reads, never from the API response alone;
 *   * a hold on a removed object is recorded as already_removed, not held;
 *   * the storage INSERT policy requires an active identity and a booking the uploader is party to;
 *   * no schedule is created and no credential is stored;
 *   * the only data mutation at migration time is the documented account_deletions backfill.
 *
 * Offline; reads the migration text.
 */
import * as fs from 'fs';
import * as path from 'path';

const DIR = path.resolve(__dirname, '../../supabase/migrations');
const FILE = '0059_deletion_work.sql';
const sql = fs.readFileSync(path.join(DIR, FILE), 'utf-8');
const lower = sql.toLowerCase();

/** Everything outside `$$ ... $$` bodies: the statements the migration runs directly. */
function topLevel(text: string): string {
  return text.replace(/\$\$[\s\S]*?\$\$/g, '$$body$$');
}

/** The body of one `create or replace function public.<name>(` definition, from its LATEST owner. */
const LATER_OWNERS: Record<string, string> = {
  list_cleanup_candidates: '0061_cleanup_state_reflects_unresolved_intents.sql',
  try_complete_cleanup: '0061_cleanup_state_reflects_unresolved_intents.sql',
};
function body(name: string): string {
  const text = LATER_OWNERS[name] ? fs.readFileSync(path.join(DIR, LATER_OWNERS[name]), 'utf-8') : sql;
  const start = text.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`definition of ${name} not found`);
  const open = text.indexOf('$$', start);
  const close = text.indexOf('$$;', open + 2);
  return text.slice(open, close);
}
const sql61 = fs.readFileSync(path.join(DIR, '0061_cleanup_state_reflects_unresolved_intents.sql'), 'utf-8');

describe('0059: numbering', () => {
  it('is the only 0059, 0060 exists, and the reserved 0055/0057 numbers stay free', () => {
    const files = fs.readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
    expect(files.filter((f) => f.startsWith('0059_'))).toEqual([FILE]);
    expect(files.filter((f) => f.startsWith('0060_'))).toHaveLength(1);
    expect(files.filter((f) => f.startsWith('0061_'))).toEqual(['0061_cleanup_state_reflects_unresolved_intents.sql']);
    expect(files.some((f) => f.startsWith('0055_'))).toBe(false);
    expect(files.some((f) => f.startsWith('0057_'))).toBe(false);
  });
});

describe('0059: independent state dimensions', () => {
  it('adds access, auth and cleanup states with their own lease and attempt bookkeeping', () => {
    expect(sql).toContain("check (access_state in ('active', 'revoked'))");
    expect(sql).toContain("check (auth_state in ('not_started', 'pending_retry', 'deleted', 'needs_operator'))");
    expect(sql).toContain("check (cleanup_state in ('not_started', 'pending', 'provisional', 'complete', 'complete_with_retained', 'needs_operator'))");
    for (const col of ['auth_lease_id', 'auth_leased_until', 'auth_next_attempt_at', 'cleanup_eligible_at', 'retained_exception_ref', 'closed_at']) {
      expect(sql).toContain(`add column if not exists ${col}`);
    }
  });

  it('intents carry the inventoried object id, a lease, attempts and a distinct outcome', () => {
    expect(sql).toContain('expected_object_id    uuid');
    expect(sql).toMatch(/state\s+text not null default 'planned' check \(state in\s+\('planned', 'held', 'destroying', 'object_removed', 'object_absent',\s+'verified', 'needs_operator'\)\)/);
    expect(sql).toContain("outcome               text check (outcome in ('removed', 'absent'))");
    expect(sql).toContain('unique (account_deletion_id, bucket_id, object_path)');
  });
});

describe('0059: one lock order everywhere', () => {
  it('the lock helper takes the user lock before the booking lock', () => {
    const b = body('_deletion_lock');
    expect(b.indexOf("'deletion:user:'")).toBeGreaterThan(-1);
    expect(b.indexOf("'deletion:user:'")).toBeLessThan(b.indexOf("'deletion:booking:'"));
  });

  it.each(['authorize_destroy', 'record_destroy_result', 'finish_intent', 'record_auth_result', 'try_complete_cleanup', 'apply_hold', 'release_hold', '_deletion_inventory', 'tg_support_case_hold'])(
    '%s takes the advisory locks before any row lock',
    (name) => {
      const b = body(name);
      const lock = b.indexOf('perform public._deletion_lock(');
      expect(lock).toBeGreaterThan(-1);
      const rowLock = b.indexOf('for update');
      if (rowLock > -1) expect(lock).toBeLessThan(rowLock);
    },
  );

  it('hold application and inventory lock intent rows in id order', () => {
    expect(body('apply_hold')).toMatch(/order by x\.id\s+for update/);
    expect(body('release_hold')).toMatch(/order by x\.id\s+for update/);
    expect(body('_deletion_inventory')).toMatch(/order by x\.b\s+loop/);
  });
});

describe('0059: the destructive authorisation boundary', () => {
  it('authorize_destroy is fenced by the lease and refuses on hold, absence and identity mismatch before committing destroying', () => {
    const b = body('authorize_destroy');
    expect(b).toContain('if i.lease_id is distinct from p_lease or i.leased_until is null or i.leased_until < now() then');
    expect(b).toContain("return jsonb_build_object('authorized', false, 'reason', 'held')");
    expect(b).toContain("return jsonb_build_object('authorized', false, 'reason', 'absent')");
    expect(b).toContain("return jsonb_build_object('authorized', false, 'reason', 'identity_mismatch')");
    expect(b).toContain('if i.expected_object_id is null or v_obj <> i.expected_object_id then');
    const destroying = b.indexOf("set state = 'destroying'");
    expect(destroying).toBeGreaterThan(b.indexOf("'identity_mismatch'"));
  });

  it('claim eligibility excludes live leases and pending backoff and uses skip locked', () => {
    const b = body('claim_deletion_work');
    expect(b).toContain("i.state in ('planned', 'destroying', 'object_removed', 'object_absent')");
    expect(b).toContain('(i.leased_until is null or i.leased_until < now())');
    expect(b).toContain('(i.next_attempt_at is null or i.next_attempt_at <= now())');
    expect(b).toContain('for update skip locked');
  });

  it('every state transition is fenced by the lease it was claimed with', () => {
    for (const name of ['record_destroy_result', 'finish_intent']) {
      expect(body(name)).toContain('if i.lease_id is distinct from p_lease then');
    }
    expect(body('record_auth_result')).toContain('if d.auth_lease_id is distinct from p_lease then');
  });
});

describe('0059: outcomes are decided from storage.objects, not from the API response', () => {
  it('record_destroy_result re-reads the object and distinguishes removed, absent, ambiguous, permission and mismatch', () => {
    const b = body('record_destroy_result');
    expect(b).toMatch(/select so\.id into v_obj\s+from storage\.objects so/);
    expect(b).toContain("if p_result = 'api_permission' then");
    expect(b).toContain("if p_result = 'api_transient' then");
    expect(b).toContain("case when p_result = 'api_ok_item' then 'object_removed' else 'object_absent' end");
    expect(b).toContain("last_error_class = 'ambiguous'");
    expect(b).toContain("last_error_class = 'identity_mismatch'");
    expect(b).toContain('if v_attempts >= 10 then');
  });

  it('finish_intent verifies both the object and the metadata row are gone before verified', () => {
    const b = body('finish_intent');
    expect(b).toContain('delete from public.booking_photos where id = i.photo_id and photo_url = i.object_path');
    expect(b).toContain("return jsonb_build_object('verified', false, 'reason', 'object_present')");
    expect(b).toContain("return jsonb_build_object('verified', false, 'reason', 'row_present')");
    expect(b.indexOf("set state = 'verified'")).toBeGreaterThan(b.indexOf("'row_present'"));
  });

  it('the inventory reads owned objects by owner_id as well as metadata rows', () => {
    const b = body('_deletion_inventory');
    expect(b).toContain('so.owner_id = p_user::text');
    expect(b).toContain('on conflict (account_deletion_id, bucket_id, object_path) do nothing');
  });

  it('completion waits for the settling window, requires no open work, sweeps again, and escalates uninventoried owned data', () => {
    const b = body('try_complete_cleanup');
    expect(b).toContain("'reason', 'settling'");
    expect(b).toContain("'reason', 'work_pending'");
    expect(b).toContain('v_new := public._deletion_inventory(p_deletion, d.user_id);');
    expect(b).toContain("'reason', 'uninventoried_owned_data'");
    expect(b.indexOf('_deletion_inventory')).toBeLessThan(b.indexOf("v_state := case when v_refs is not null then 'complete_with_retained' else 'complete' end"));
  });
});

describe('0059: holds', () => {
  it('a hold on a removed object is recorded as already_removed and never flips state', () => {
    const b = body('apply_hold');
    expect(b).toContain("when i.state = 'object_removed' then 'already_removed'");
    expect(b).toContain("when i.state = 'destroying' then 'authorized_before_hold'");
    expect(b).toMatch(/if i\.state in \('planned', 'needs_operator'\) then[\s\S]*?set state = 'held'/);
    // Exactly one state write in the routine, and it is the guarded one above.
    expect(b.match(/set state = '/g)).toHaveLength(1);
  });

  it('support cases apply and release holds through the same routine', () => {
    const b = body('tg_support_case_hold');
    expect(b).toContain("perform public.apply_hold('booking', new.booking_id, null, 'case'");
    expect(b).toContain('perform public.release_hold(v_hold, null');
    expect(lower).toMatch(/create trigger trg_support_case_hold\s+after insert or update of status, booking_id on public\.support_cases/);
  });
});

describe('0059: least privilege', () => {
  it.each([
    'public.claim_deletion_work(integer)',
    'public.authorize_destroy(uuid, uuid)',
    'public.record_destroy_result(uuid, uuid, text, text)',
    'public.finish_intent(uuid, uuid)',
    'public.claim_auth_work(integer)',
    'public.record_auth_result(uuid, uuid, text, text)',
    'public.list_cleanup_candidates(integer)',
    'public.try_complete_cleanup(uuid)',
    'public.apply_hold(text, uuid, uuid, text, text, uuid, uuid)',
    'public.release_hold(uuid, uuid, text)',
    'public.deletion_work_health()',
    'public.deletion_worker_tick()',
    'public.deletion_object_exists(text, text)',
  ])('%s is revoked from public/anon/authenticated and granted to service_role only', (sig) => {
    const esc = sig.replace(/[()]/g, '\\$&');
    expect(sql).toMatch(new RegExp(`revoke execute on function ${esc} from public, anon, authenticated;`));
    expect(sql).toMatch(new RegExp(`grant execute on function ${esc} to service_role;`));
  });

  it.each([
    'public._deletion_lock(uuid, uuid)',
    'public._deletion_active_hold(uuid, uuid)',
    'public._deletion_backoff(integer)',
    'public._deletion_inventory(uuid, uuid)',
    'public.tg_support_case_hold()',
  ])('%s is not executable by any client role, service_role included', (sig) => {
    const esc = sig.replace(/[()]/g, '\\$&');
    expect(sql).toMatch(new RegExp(`revoke execute on function ${esc} from public, anon, authenticated, service_role;`));
    expect(sql).not.toMatch(new RegExp(`grant execute on function ${esc}`));
  });

  it('admin wrappers check is_admin inside and are the only routines granted to authenticated', () => {
    expect(body('place_legal_hold')).toContain("if not public.is_admin() then raise exception 'Admin only'; end if;");
    expect(body('release_legal_hold')).toContain("if not public.is_admin() then raise exception 'Admin only'; end if;");
    // deletion_path_frozen is granted to the client roles too, but it is a boolean read used by the
    // storage policies, not a wrapper: asserted separately in the replacement-safety block.
    const grants = sql.match(/grant execute on function public\.[a-z_]+\([^)]*\) to authenticated, service_role;/g) ?? [];
    expect(grants.map((g) => g.replace(/\(.*/, ''))).toEqual([
      'grant execute on function public.place_legal_hold',
      'grant execute on function public.release_legal_hold',
    ]);
  });

  it('every routine is SECURITY DEFINER with a fixed search_path', () => {
    const defs = sql.match(/create or replace function public\.[a-z_]+\([\s\S]*?\nas \$\$/g) ?? [];
    expect(defs.length).toBeGreaterThanOrEqual(20);
    for (const d of defs) {
      if (/_deletion_backoff/.test(d)) continue; // pure immutable helper, no table access
      expect(d).toContain('security definer');
      expect(d).toMatch(/set search_path = public(, private)?, pg_temp/);
    }
  });

  it('new tables have RLS enabled and no client policies', () => {
    for (const t of ['legal_holds', 'legal_hold_items', 'deletion_photo_intents']) {
      expect(sql).toContain(`alter table public.${t} enable row level security;`);
      expect(sql).not.toMatch(new RegExp(`create policy [^\\n]* on public\\.${t}\\b`));
    }
  });
});

describe('0059: replacement safety (retired paths, finding 1)', () => {
  it('REGRESSION: a path with ANY intent row is retired for every state, including verified', () => {
    const b = body('deletion_path_frozen');
    expect(b).toContain('where i.bucket_id = p_bucket and i.object_path = p_name');
    expect(b).not.toMatch(/state\s*<>\s*'verified'/);
    expect(b).not.toMatch(/\bstate\b/);
    expect(sql).toContain('grant execute on function public.deletion_path_frozen(text, text) to anon, authenticated, service_role;');
  });

  it('the lease exceeds the platform wall-clock limit and is returned to the worker for its budget check', () => {
    const b = body('claim_deletion_work');
    expect(b).toContain("leased_until = now() + interval '10 minutes'");
    expect(b).toContain('returning i.id, i.lease_id, i.leased_until,');
    expect(sql).toMatch(/intent_id uuid, lease_id uuid, leased_until timestamptz, state text/);
    expect(body('claim_auth_work')).toContain("auth_leased_until = now() + interval '10 minutes'");
  });

  it('INSERT and DELETE on the bucket both refuse a retired path', () => {
    const insert = sql.slice(sql.indexOf('create policy "booking_photos_obj_insert"'));
    expect(insert.slice(0, insert.indexOf(');'))).toContain("and not public.deletion_path_frozen('booking-photos', storage.objects.name)");
    expect(sql).toContain('drop policy if exists "booking_photos_obj_delete" on storage.objects;');
    const del = sql.slice(sql.indexOf('create policy "booking_photos_obj_delete"'));
    const delText = del.slice(0, del.indexOf(');'));
    expect(delText).toContain('for delete to authenticated using (');
    expect(delText).toContain('and public.is_admin()');
    expect(delText).toContain("and not public.deletion_path_frozen('booking-photos', storage.objects.name)");
  });

  it('no migration ever creates an UPDATE or ALL policy on storage.objects, so move, rename and upsert stay denied', () => {
    const files = fs.readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f));
    for (const f of files) {
      const text = fs.readFileSync(path.join(DIR, f), 'utf-8').toLowerCase();
      const policies = text.match(/create policy [^\n]* on storage\.objects[\s\S]*?;/g) ?? [];
      for (const p of policies) {
        expect(p).not.toMatch(/\bfor update\b/);
        expect(p).not.toMatch(/\bfor all\b/);
      }
    }
  });

  it('the header enumerates every write path into the bucket and states the retirement lifetime', () => {
    for (const way of ['upload (POST /object, standard or resumable)', 'x-upsert, move, rename', 'copy INTO the path', 'delete then re-create (admins)', 'service role, database superuser, direct S3']) {
      expect(sql).toContain(way);
    }
    expect(sql).toContain('RETIRED for every RLS-governed');
    expect(sql).toContain('for the lifetime of its intent row');
  });
});

describe('0059: uploads in flight — provisional until the boundary, final sweep required (finding 2)', () => {
  it('adds the boundary and final-sweep columns; the boundary is measured from db_completed_at', () => {
    expect(sql).toContain('add column if not exists cleanup_boundary_at timestamptz');
    expect(sql).toContain('add column if not exists final_sweep_at timestamptz');
    expect(sql).toContain("cleanup_boundary_at = coalesce(db_completed_at, now()) + interval '24 hours'");
    expect(sql).not.toContain('cleanup_watch_until');
  });
  it('provisional accounts are candidates on every run once the boundary has passed, hourly before it; completed accounts never', () => {
    const b = body('list_cleanup_candidates');
    expect(b).toContain("d.cleanup_state = 'provisional'");
    expect(b).toContain('(d.cleanup_boundary_at is null or d.cleanup_boundary_at <= now()');
    expect(b).toContain("or d.last_sweep_at is null or d.last_sweep_at < now() - interval '1 hour')");
    expect(b).not.toMatch(/cleanup_state in \('complete'/);
  });
  it('REGRESSION: every path through completion sweeps AND runs the uncovered-object check; complete requires the boundary and sets final_sweep_at', () => {
    const b = body('try_complete_cleanup');
    const sweep = b.indexOf('v_new := public._deletion_inventory(p_deletion, d.user_id);');
    const uncovered = b.indexOf("'reason', 'uninventoried_owned_data'");
    const provisional = b.indexOf("'reason', 'awaiting_boundary'");
    const final = b.indexOf('final_sweep_at = now()');
    expect(sweep).toBeGreaterThan(-1);
    expect(uncovered).toBeGreaterThan(sweep);
    expect(provisional).toBeGreaterThan(uncovered);
    expect(final).toBeGreaterThan(provisional);
    expect(b).toContain('if d.cleanup_boundary_at is null or d.cleanup_boundary_at > now() then');
    expect(b).toContain("if d.cleanup_state = 'complete' then\n    return jsonb_build_object('complete', true, 'cleanup_state', d.cleanup_state);");
    // complete_with_retained is NOT terminal here: a hold release may have emptied it (finding 2).
    expect(b).not.toContain("if d.cleanup_state in ('complete', 'complete_with_retained') then");
    expect(b).toMatch(/set cleanup_state = 'pending', cleanup_settled_at = null, final_sweep_at = null, closed_at = null/);
    // closed only in the final branch, only when auth is done
    expect(b.slice(final)).toContain("closed_at = case when auth_state = 'deleted' then coalesce(closed_at, now()) end");
    expect(b.slice(provisional, final)).not.toContain('closed_at');
  });
  it('the header states the boundary as a documented figure, not a proven one', () => {
    expect(sql).toContain('This is a documented figure, not something these tests prove');
    expect(sql).toContain('A worker outage across the boundary delays finalisation');
  });
});

describe('0059: orphan inventory parses paths safely (finding 4)', () => {
  it('associates a booking only for a strict UUID prefix that names an EXISTING booking; the cast is guarded by CASE', () => {
    const b = body('_deletion_booking_of_path');
    expect(b).toContain("~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'");
    expect(b).toMatch(/where b\.id = \(case when split_part\(coalesce\(p_name, ''\), '\/', 1\)/);
    expect(b).toContain('from public.bookings b');
    expect(sql).toContain('revoke execute on function public._deletion_booking_of_path(text) from public, anon, authenticated, service_role;');
  });
  it('the inventory uses the safe helper everywhere and never casts a path fragment itself', () => {
    const b = body('_deletion_inventory');
    expect(b.match(/public\._deletion_booking_of_path\(so\.name\)/g)).toHaveLength(2);
    expect(b).not.toContain("split_part(so.name, '/', 1)::uuid");
    expect(b).not.toContain('[0-9a-fA-F-]{36}');
    expect(b).not.toMatch(/split_part\([^)]*\)\s*~/); // no regex on a path fragment outside the helper
  });
});

describe('0059: support-case holds follow the case (finding 6)', () => {
  it('reconciles on booking or status change: releases a hold on the old booking, applies one on the new, under ascending booking locks', () => {
    const b = body('tg_support_case_hold');
    expect(b).toContain("if tg_op = 'UPDATE' and new.booking_id is not distinct from old.booking_id and new.status = old.status then");
    expect(b).toContain('select distinct b from unnest(array[v_old_booking, new.booking_id]) as b where b is not null order by b');
    expect(b).toContain('if v_hold is not null and (not v_open or v_hold_booking is distinct from new.booking_id) then');
    expect(b).toContain("case when not v_open then 'case ' || new.status else 'case reassigned' end");
    expect(b).toContain('if v_open and new.booking_id is not null and v_hold is null then');
    expect(b).not.toContain('if new.booking_id is null then return new; end if;');
    expect(b.indexOf('perform public._deletion_lock(null, v_b)')).toBeLessThan(b.indexOf('perform public.release_hold('));
  });
});

describe('0059: lock order is acyclic (review finding 2)', () => {
  it('REGRESSION: release_hold never writes account_deletions (booking lock → account row was the inverted edge)', () => {
    const b = body('release_hold');
    expect(b).not.toMatch(/update public\.account_deletions/);
    expect(b).toContain('Deliberately NO account_deletions write here');
  });
  it('apply_hold and the support-case trigger never touch account_deletions either', () => {
    expect(body('apply_hold')).not.toMatch(/account_deletions/);
    expect(body('tg_support_case_hold')).not.toMatch(/account_deletions/);
  });
  it('account-level routines take the user lock, then the account row, before any booking lock', () => {
    for (const name of ['try_complete_cleanup', 'record_auth_result']) {
      const b = body(name);
      const userLock = b.indexOf('perform public._deletion_lock(d.user_id, null);');
      const rowLock = b.indexOf('for update');
      expect(userLock).toBeGreaterThan(-1);
      expect(rowLock).toBeGreaterThan(userLock);
      expect(b).not.toMatch(/_deletion_lock\([^)]*,\s*(?!null)[a-z_.]+\)/); // no booking lock taken directly here
    }
    const tc = body('try_complete_cleanup');
    expect(tc.indexOf('for update')).toBeLessThan(tc.indexOf('public._deletion_inventory(p_deletion, d.user_id)'));
  });
  it('a released hold reopens the account lazily: candidates select settled accounts with open intents and try_complete reopens them', () => {
    const c = body('list_cleanup_candidates');
    expect(c).toContain("d.cleanup_state in ('provisional', 'complete_with_retained')");
    expect(c).toContain("i.state in ('planned', 'destroying', 'object_removed', 'object_absent',\n                                       'needs_operator'))");
    // 0061 replaced "no held intent remains" with "recorded reference differs from the holds still holding intents".
    expect(c).toContain('or d.retained_exception_ref is distinct from');
    const t = body('try_complete_cleanup');
    expect(t).toContain("if d.cleanup_state in ('provisional', 'complete_with_retained') then\n      update public.account_deletions\n         set cleanup_state = 'pending', cleanup_settled_at = null, final_sweep_at = null, closed_at = null");
    expect(t).toContain("if d.cleanup_state = 'complete' then\n    return jsonb_build_object('complete', true, 'cleanup_state', d.cleanup_state);");
  });
  it('the header documents the complete order including row locks', () => {
    expect(sql).toContain('(2) account_deletions row, FOR UPDATE');
    expect(sql).toContain('NEVER touch an\n--     account_deletions row');
  });
});

describe('0059: authoritative absence read for certification (review finding 1)', () => {
  it('deletion_object_exists is service-role only and returns only a boolean', () => {
    const b = body('deletion_object_exists');
    expect(b).toContain('select exists (select 1 from storage.objects so where so.bucket_id = p_bucket and so.name = p_name)');
    expect(sql).toContain('revoke execute on function public.deletion_object_exists(text, text) from public, anon, authenticated;');
    expect(sql).toContain('grant execute on function public.deletion_object_exists(text, text) to service_role;');
  });
});

describe('0059: recovery without endless cycles', () => {
  it('a dependency refusal while objects are retained under a hold goes to the operator immediately', () => {
    const b = body('record_auth_result');
    expect(b).toContain("if p_result = 'dependency'\n     and (d.cleanup_state = 'complete_with_retained'\n          or (d.cleanup_state = 'provisional'");
    expect(b.indexOf("d.cleanup_state = 'complete_with_retained'")).toBeLessThan(b.indexOf("if p_result = 'permission' or v_attempts >= 10 then"));
    expect(b).toContain("i.state in ('planned', 'destroying', 'object_removed', 'object_absent')))) then");
  });
  it('held intents are never claimable and needs_operator ACCOUNTS are never cleanup candidates', () => {
    expect(body('claim_deletion_work')).not.toContain("'held'");
    const c = body('list_cleanup_candidates');
    expect(c).not.toMatch(/d\.cleanup_state[^\n]*'needs_operator'/); // account state never selected
    expect(c).toContain("'needs_operator'))"); // but an INTENT in needs_operator does select a settled account (0061)
  });
});

describe('0059: upload controls', () => {
  it('replaces the open storage INSERT policy with an active-identity, booking-party predicate', () => {
    expect(sql).toContain('drop policy if exists "booking_photos_obj_insert" on storage.objects;');
    const policy = sql.slice(sql.indexOf('create policy "booking_photos_obj_insert"'));
    const end = policy.indexOf(');');
    const text = policy.slice(0, end);
    expect(text).toContain('for insert to authenticated with check (');
    expect(text).toContain("bucket_id = 'booking-photos'");
    expect(text).toContain('and public.is_active_user()');
    expect(text).toContain("b.id::text = split_part(storage.objects.name, '/', 1)");
    expect(text).toContain('b.customer_id = auth.uid() or b.assigned_provider_id = auth.uid() or public.is_admin()');
  });

  it('does not touch the select policy (0016 scoping stays as it is)', () => {
    expect(lower).not.toContain('drop policy if exists "booking_photos_obj_select"');
  });
});

describe('0059: schedules disabled, credentials absent', () => {
  it('creates no cron job and stores no secret; the tick is a no-op until configured', () => {
    const top = topLevel(lower.replace(/--[^\n]*/g, ''));
    expect(top).not.toMatch(/\bcron\.schedule\s*\(/);
    expect(sql).toContain('insert into private.deletion_worker_config (id) values (1) on conflict (id) do nothing;');
    expect(body('deletion_worker_tick')).toContain('if v_url is null or v_secret is null then');
    const code = sql.replace(/--[^\n]*/g, ''); // operator instructions live in comments only
    expect(code).not.toMatch(/secret\s*=\s*'[^']+'/);
    expect(code).not.toMatch(/worker_url\s*=\s*'/);
  });

  it('the only top-level data mutation is the documented account_deletions backfill', () => {
    const top = topLevel(lower);
    const mutations = top.match(/^\s*(insert|update|delete|truncate)\b[^\n]*/gm) ?? [];
    expect(mutations.map((m) => m.trim())).toEqual([
      'update public.account_deletions set',
      'insert into private.deletion_worker_config (id) values (1) on conflict (id) do nothing;',
    ]);
    expect(sql).toContain("where status in ('pending_auth_delete', 'deleted')");
  });
});

describe('gateway configuration for the worker (finding 3)', () => {
  const toml = fs.readFileSync(path.resolve(__dirname, '../../supabase/config.toml'), 'utf-8');
  it('verify_jwt is false for deletion-worker only; delete-account keeps gateway JWT verification', () => {
    const block = (name: string) => {
      const m = toml.match(new RegExp(`\\[functions\\.${name}\\]\\s*\\n\\s*verify_jwt\\s*=\\s*(true|false)`));
      return m ? m[1] : null;
    };
    expect(block('deletion-worker')).toBe('false');
    expect(block('delete-account')).toBe('true');
  });
  it('the worker index documents that the handler secret is the only authentication and fails closed', () => {
    const index = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/deletion-worker/index.ts'), 'utf-8');
    expect(index).toContain('verify_jwt = false');
    expect(index).toContain("req.headers.get('x-worker-secret')");
    expect(index).toContain("Deno.env.get('DELETION_WORKER_SECRET') ?? null");
    expect(index).toContain('AbortSignal.timeout(STORAGE_TIMEOUT_MS)');
  });
});

describe('0061: account-level state reflects unresolved intents after a partial hold release (review finding)', () => {
  it('REGRESSION: a settled account is a candidate when any intent is needs_operator', () => {
    const c = body('list_cleanup_candidates');
    expect(c).toContain("and i.state in ('planned', 'destroying', 'object_removed', 'object_absent',\n                                       'needs_operator'))");
  });
  it('REGRESSION: a settled account is a candidate when its recorded retained reference no longer matches the holds that still hold intents', () => {
    const c = body('list_cleanup_candidates');
    expect(c).toContain('or d.retained_exception_ref is distinct from');
    expect(c).toContain("where i.account_deletion_id = d.id and i.state = 'held'))");
  });
  it('try_complete_cleanup escalates on a needs_operator intent BEFORE the uncovered-object check, with its own reason', () => {
    const t = body('try_complete_cleanup');
    const needs = t.indexOf("'reason', 'intent_needs_operator'");
    const uncovered = t.indexOf("'reason', 'uninventoried_owned_data'");
    expect(needs).toBeGreaterThan(-1);
    expect(needs).toBeLessThan(uncovered);
    expect(t.match(/i\.state = 'needs_operator'\) then/g)).toHaveLength(1);
  });
  it('0061 re-creates only the two routines, keeps them service-role only, and writes no account row from any hold routine', () => {
    const defs = sql61.match(/create or replace function public\.[a-z_]+\(/g) ?? [];
    expect(defs).toEqual(['create or replace function public.list_cleanup_candidates(', 'create or replace function public.try_complete_cleanup(']);
    expect(sql61).toContain('revoke execute on function public.list_cleanup_candidates(integer) from public, anon, authenticated;');
    expect(sql61).toContain('grant execute on function public.try_complete_cleanup(uuid) to service_role;');
    const code61 = sql61.replace(/--[^\n]*/g, ''); // the header comment names the hold routines it must not touch
    expect(code61).not.toMatch(/release_hold|apply_hold|tg_support_case_hold/);
  });
});
