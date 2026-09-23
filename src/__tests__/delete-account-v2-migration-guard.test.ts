/**
 * delete-account-v2-migration-guard.test.ts — static guards on migration 0060 and on the
 * migrations it must not disturb.
 *
 *   * 0056 and 0058 are applied to QA and must stay byte-identical: their hashes are pinned.
 *   * 0060 is the LATEST owner of delete_account, complete_account_deletion and
 *     record_auth_deletion_failure across every migration file. A later migration that redefines
 *     any of them must update this guard deliberately.
 *   * delete_account inventories intents INSIDE its transaction, after the tombstone and before
 *     the return, and initialises the state dimensions; cleanup is 'pending' even with no photos
 *     (settling window + second sweep).
 *   * The 0056 business rules are carried over verbatim: blockers re-checked, the same deletes
 *     and the same anonymisation statements.
 *
 * Offline; reads migration text.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const DIR = path.resolve(__dirname, '../../supabase/migrations');
const FILE = '0060_delete_account_durable_work.sql';
const sql = fs.readFileSync(path.join(DIR, FILE), 'utf-8');
const v1 = fs.readFileSync(path.join(DIR, '0056_account_deletion.sql'), 'utf-8');

function sha256Normalised(file: string): string {
  const text = fs.readFileSync(path.join(DIR, file), 'utf-8').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(text).digest('hex');
}

function body(text: string, name: string): string {
  const start = text.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`definition of ${name} not found`);
  const open = text.indexOf('$$', start);
  const close = text.indexOf('$$;', open + 2);
  return text.slice(open, close);
}

describe('applied migrations are untouched', () => {
  it('0056 has the hash recorded when it was applied to QA', () => {
    expect(sha256Normalised('0056_account_deletion.sql')).toBe(
      '5f0db140a2c106c14d45d61a75c8592d9bd80e9310667b4f20136d08194510c3',
    );
  });
  it('0058 has the hash recorded when it was applied to QA', () => {
    expect(sha256Normalised('0058_redact_deleted_payer_payment_payloads.sql')).toBe(
      '0afd7a77df0aa0a7cd08db38676e591c8c1108670607de8f3bd669328291b634',
    );
  });
});

describe('0060 is the latest owner of the deletion routines', () => {
  const files = fs.readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  it.each(['delete_account(uuid)', 'complete_account_deletion(uuid)', 'record_auth_deletion_failure(uuid)'])(
    'the last migration defining %s is 0060',
    (sig) => {
      const name = sig.replace(/\(.*/, '');
      const owners = files.filter((f) =>
        fs.readFileSync(path.join(DIR, f), 'utf-8').toLowerCase().includes(`create or replace function public.${name}(`),
      );
      expect(owners[owners.length - 1]).toBe(FILE);
      expect(owners).toContain('0056_account_deletion.sql');
    },
  );
});

describe('0060 delete_account: durable work inside the transaction', () => {
  const b = body(sql, 'delete_account');

  it('inventories intents after the tombstone and before returning, then initialises the dimensions', () => {
    const tombstone = b.indexOf("deletion_status   = 'pending_auth_delete'");
    const inventory = b.indexOf('v_intents := public._deletion_inventory(v_deletion_id, p_user);');
    const init = b.indexOf("cleanup_state       = 'pending'");
    const ret = b.lastIndexOf('return jsonb_build_object(');
    expect(tombstone).toBeGreaterThan(-1);
    expect(inventory).toBeGreaterThan(tombstone);
    expect(init).toBeGreaterThan(inventory);
    expect(ret).toBeGreaterThan(init);
    expect(b).toContain("access_state        = 'revoked'");
    expect(b).toContain("auth_state          = 'not_started'");
    expect(b).toContain("cleanup_eligible_at = now() + interval '5 minutes'");
    expect(b).toContain("cleanup_boundary_at = now() + interval '24 hours'");
    expect(b).not.toContain('cleanup_watch_until');
  });

  it('reports cleanup as pending even when the inventory is empty (no "complete" shortcut)', () => {
    expect(b).not.toMatch(/case when v_intents\s*=\s*0/);
    expect(b).toContain("'cleanup_state', 'pending'");
  });

  it('reports the recorded work state on idempotent re-entry instead of a fresh claim', () => {
    expect(b).toContain("if p.deletion_status in ('deleted', 'pending_auth_delete') then");
    expect(b).toContain("'cleanup_state', (select d.cleanup_state from public.account_deletions d where d.id = v_deletion_id)");
  });

  it('keeps every 0056 delete and anonymisation statement verbatim', () => {
    const v1Body = body(v1, 'delete_account');
    const statements = [
      'delete from public.device_tokens            where user_id = p_user;',
      'delete from public.notification_preferences where user_id = p_user;',
      'delete from public.notifications            where user_id = p_user;',
      'delete from public.customer_addresses       where customer_id = p_user;',
      'delete from public.favorite_providers       where customer_id = p_user or provider_id = p_user;',
      'delete from public.favorite_services        where customer_id = p_user;',
      'delete from public.provider_locations       where provider_id = p_user;',
      'delete from public.provider_conduct_acceptances where provider_id = p_user;',
      "full_name         = 'Deleted user',",
      "address        = '[deleted]',",
      "assigned_provider_name  = 'Deleted provider',",
      "update public.booking_messages set message_text = '[deleted]' where sender_id = p_user;",
      'update public.reviews set comment = null where customer_id = p_user;',
      "update public.payment_attempts pa set phone = '***' || right(pa.phone, 3)",
      'v_blockers := public.account_deletion_blockers(p_user);',
      "raise exception 'admin accounts cannot be self-deleted' using errcode = '42501';",
    ];
    for (const s of statements) {
      expect(v1Body).toContain(s);
      expect(b).toContain(s);
    }
  });

  it('adopts no retention rule that is still an owner decision (review rows, aggregates, feedback untouched)', () => {
    expect(b).not.toMatch(/delete from public\.reviews/);
    expect(b).not.toMatch(/review_private_feedback/);
    expect(b).not.toMatch(/average_rating\s*=/);
    expect(b).not.toMatch(/booking_activity/);
  });
});

describe('0060 completion and failure keep auth_state truthful', () => {
  it('complete_account_deletion sets auth_state deleted and closes only when cleanup is terminal', () => {
    const b = body(sql, 'complete_account_deletion');
    expect(b).toContain("auth_state = 'deleted'");
    expect(b).toContain("closed_at = case when cleanup_state in ('complete', 'complete_with_retained')");
  });
  it('record_auth_deletion_failure moves to pending_retry with backoff and escalates at the ceiling', () => {
    const b = body(sql, 'record_auth_deletion_failure');
    expect(b).toContain("auth_state = case when auth_attempts + 1 >= 10 then 'needs_operator' else 'pending_retry' end");
    expect(b).toContain('auth_next_attempt_at = now() + public._deletion_backoff(auth_attempts + 1)');
  });
  it.each(['public.delete_account(uuid)', 'public.complete_account_deletion(uuid)', 'public.record_auth_deletion_failure(uuid)'])(
    '%s stays service-role only',
    (sig) => {
      const esc = sig.replace(/[()]/g, '\\$&');
      expect(sql).toMatch(new RegExp(`revoke execute on function ${esc} from public, anon, authenticated;`));
      expect(sql).toMatch(new RegExp(`grant execute on function ${esc} to service_role;`));
    },
  );
});
