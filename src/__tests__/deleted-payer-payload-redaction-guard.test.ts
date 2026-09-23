/**
 * deleted-payer-payload-redaction-guard.test.ts — static guards on migration 0058.
 *
 * Behaviour is proved by the connected certification
 * (qa/playwright/certification/deleted-payer-redaction.spec.ts) against the QA project. These
 * guards pin the SHAPE of the repair so a later edit cannot silently narrow it:
 *
 *   * both phone-bearing payload shapes are handled (Daraja callback metadata; mock top-level key);
 *   * masking is idempotent and preserves the last three digits only;
 *   * the write-time guard is BEFORE INSERT OR UPDATE on payment_attempts;
 *   * the deletion-time scrub fires on the profile tombstone, inside the deletion transaction;
 *   * neither apply_mpesa_callback (owner 0050) nor delete_account (owner 0056) is redefined;
 *   * no data is mutated at migration time — no backfill is performed;
 *   * the helpers are not executable by anon/authenticated.
 *
 * Offline; reads the migration text.
 */
import * as fs from 'fs';
import * as path from 'path';

const DIR = path.resolve(__dirname, '../../supabase/migrations');
const FILE = '0058_redact_deleted_payer_payment_payloads.sql';
const sql = fs.readFileSync(path.join(DIR, FILE), 'utf-8');
const lower = sql.toLowerCase();

/** Everything outside `$$ ... $$` bodies: the statements the migration runs directly. */
function topLevel(text: string): string {
  return text.replace(/\$\$[\s\S]*?\$\$/g, '$$body$$');
}

describe('0058: it exists once, at the next free number', () => {
  it('is the only 0058 and follows the reserved 0055/0057 gap', () => {
    const files = fs.readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
    expect(files.filter((f) => f.startsWith('0058_'))).toEqual([FILE]);
    expect(files.some((f) => f.startsWith('0057_'))).toBe(false);
    expect(files.some((f) => f.startsWith('0055_'))).toBe(false);
  });
});

describe('0058: both payload shapes are redacted, and only the phone', () => {
  it('handles the Daraja callback metadata shape', () => {
    expect(sql).toContain("'{Body,stkCallback,CallbackMetadata,Item}'");
    expect(sql).toContain("it ->> 'Name' = 'PhoneNumber'");
    expect(sql).toContain("jsonb_set(it, '{Value}'");
  });

  it('handles the top-level PhoneNumber key the mock STK acceptance writes', () => {
    expect(sql).toMatch(/foreach k in array array\['PhoneNumber'/);
    expect(sql).toContain('jsonb_set(v, array[k]');
  });

  it('accepts a numeric PhoneNumber as well as a string', () => {
    expect(sql).toContain("jsonb_typeof(v -> k) in ('string', 'number')");
    expect(sql).toContain("jsonb_typeof(it -> 'Value') in ('string', 'number')");
  });

  it('passes non-object JSON through unchanged, so malformed payloads never error', () => {
    expect(sql).toMatch(/if v is null or jsonb_typeof\(v\) <> 'object' then\s+return v;/);
  });

  it('masks to *** plus the last three digits, idempotently', () => {
    expect(sql).toContain("when p like '***%' then p");
    expect(sql).toContain("'***' || right(regexp_replace(p, '\\D', '', 'g'), 3)");
  });

  it('touches no amount, receipt, reference or status field', () => {
    for (const field of ['amount', 'settlement_reference', 'collected_amount', 'MpesaReceiptNumber', 'status', 'result_code', 'discrepancy']) {
      // These may be MENTIONED in comments; they must not be assigned anywhere.
      expect(sql).not.toMatch(new RegExp(`\\b${field}\\s*=\\s*`, 'i'));
    }
  });
});

describe('0058: the write-time guard', () => {
  it('is BEFORE INSERT OR UPDATE on payment_attempts, for each row', () => {
    expect(lower).toMatch(
      /create trigger trg_payment_attempts_redact_for_deleted_payer\s+before insert or update on public\.payment_attempts\s+for each row/,
    );
  });

  it('decides on the payer profile tombstone, read fresh inside the trigger', () => {
    const fn = sql.slice(
      sql.indexOf('create or replace function public.tg_payment_attempts_redact_for_deleted_payer'),
      sql.indexOf('drop trigger if exists trg_payment_attempts_redact_for_deleted_payer'),
    );
    expect(fn).toContain('select (p.deleted_at is not null)');
    expect(fn).toContain('join public.profiles p on p.id = pm.customer_id');
    expect(fn).toContain('new.raw_response := public.redact_mpesa_phone(new.raw_response)');
    expect(fn).toContain('new.phone := public.mask_msisdn(new.phone)');
  });
});

describe('0058: the deletion-time scrub', () => {
  it('fires AFTER UPDATE OF deleted_at on profiles, for each row', () => {
    expect(lower).toMatch(
      /create trigger trg_profiles_redact_payer_attempts_on_tombstone\s+after update of deleted_at on public\.profiles\s+for each row/,
    );
  });

  it('acts only on the transition into a tombstone, so repeat deletion is a no-op', () => {
    expect(sql).toContain('if new.deleted_at is not null and old.deleted_at is distinct from new.deleted_at then');
  });

  it("redacts exactly the tombstoned payer's attempts, joined through their payments", () => {
    const fn = sql.slice(
      sql.indexOf('create or replace function public.tg_profiles_redact_payer_attempts_on_tombstone'),
      sql.indexOf('drop trigger if exists trg_profiles_redact_payer_attempts_on_tombstone'),
    );
    expect(fn).toContain('update public.payment_attempts pa');
    expect(fn).toContain('from public.payments pm');
    expect(fn).toContain('where pa.payment_id = pm.id');
    expect(fn).toContain('and pm.customer_id = new.id');
  });
});

describe('0058: redefines nothing it must not', () => {
  it('leaves apply_mpesa_callback owned by 0050', () => {
    expect(lower).not.toContain('create or replace function public.apply_mpesa_callback(');
  });

  it('leaves delete_account owned by 0056', () => {
    expect(lower).not.toContain('create or replace function public.delete_account(');
    expect(lower).not.toContain('create or replace function public.complete_account_deletion(');
  });

  it('adds no column, drops nothing, and alters no existing table', () => {
    const top = topLevel(lower);
    expect(top).not.toMatch(/\balter table\b/);
    expect(top).not.toMatch(/\bdrop table\b|\bdrop column\b/);
  });
});

describe('0058: performs no data mutation at migration time', () => {
  it('has no top-level insert, update, delete or truncate', () => {
    const top = topLevel(lower);
    expect(top).not.toMatch(/^\s*(insert|update|delete|truncate)\b/m);
  });

  it('provides a read-only dry-run inventory instead of a backfill', () => {
    const fn = sql.slice(sql.indexOf('create or replace function public.deleted_payer_attempts_needing_redaction'));
    expect(fn).toMatch(/language sql\s+stable/);
    expect(fn).not.toMatch(/\b(update|delete|insert)\b\s+(public\.)?payment_attempts/);
  });
});

describe('0058: least privilege on every new routine', () => {
  it.each([
    'public.mask_msisdn(text)',
    'public.redact_mpesa_phone(jsonb)',
    'public.tg_payment_attempts_redact_for_deleted_payer()',
    'public.tg_profiles_redact_payer_attempts_on_tombstone()',
    'public.deleted_payer_attempts_needing_redaction()',
  ])('revokes EXECUTE on %s from public, anon and authenticated', (sig) => {
    const esc = sig.replace(/[()]/g, '\\$&');
    expect(sql).toMatch(new RegExp(`revoke execute on function ${esc}\\s+from public, anon, authenticated;`));
  });

  it('grants only service_role, and only on the callable helpers', () => {
    expect(sql).toMatch(/grant\s+execute on function public\.mask_msisdn\(text\)\s+to service_role;/);
    expect(sql).toMatch(/grant\s+execute on function public\.redact_mpesa_phone\(jsonb\)\s+to service_role;/);
    expect(sql).toMatch(/grant\s+execute on function public\.deleted_payer_attempts_needing_redaction\(\)\s+to service_role;/);
    expect(sql).not.toMatch(/grant\s+execute[^\n]*tg_/);
  });
});
