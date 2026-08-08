/**
 * mpesa-callback-grants.test.ts
 *
 * Phase 4D P1 regression — static assertions on the migration grants for
 * public.apply_mpesa_callback. Reads the migration files as TEXT (fs); no live DB.
 *
 * Bug (baseline): migration 0012 revoked EXECUTE from anon + authenticated but
 * NOT from PUBLIC, so anon/authenticated (members of PUBLIC) retained EXECUTE and
 * could call the RPC directly via PostgREST, bypassing the mpesa-callback token
 * gate and settling payments. Proven in QA: an anon /rest/v1/rpc/apply_mpesa_callback
 * call moved a pending payment to paid.
 *
 * Fix (0035): revoke EXECUTE from PUBLIC (and re-assert anon/authenticated), then
 * grant EXECUTE only to service_role. The behavioural denial is proven by a connected
 * QA authorization test (qa/web-journeys/mpesa-callback-authz.spec.ts); this offline
 * test guards the migration content so the fix cannot silently regress in CI.
 */
import * as fs from 'fs';
import * as path from 'path';

const FN = 'public.apply_mpesa_callback(text, text, int, text, jsonb)';
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/', f), 'utf-8');
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();

describe('apply_mpesa_callback EXECUTE grants (Phase 4D P1 fix)', () => {
  let m35: string;
  let m12: string;
  beforeAll(() => {
    m35 = norm(read('0035_lock_apply_mpesa_callback_grants.sql'));
    m12 = norm(read('0012_mpesa_callback.sql'));
  });

  const fn = norm(FN);

  it('0035 revokes EXECUTE from PUBLIC (the missing revoke that caused the bypass)', () => {
    expect(m35).toContain(`revoke execute on function ${fn} from public`);
  });

  it('0035 revokes EXECUTE from anon and authenticated', () => {
    expect(m35).toContain(`revoke execute on function ${fn} from anon`);
    expect(m35).toContain(`revoke execute on function ${fn} from authenticated`);
  });

  it('0035 grants EXECUTE only to service_role', () => {
    expect(m35).toContain(`grant execute on function ${fn} to service_role`);
    // No broad re-grant back to public/anon/authenticated.
    expect(m35).not.toContain(`grant execute on function ${fn} to public`);
    expect(m35).not.toContain(`grant execute on function ${fn} to anon`);
    expect(m35).not.toContain(`grant execute on function ${fn} to authenticated`);
  });

  it('documents the baseline gap: 0012 did NOT revoke EXECUTE from public', () => {
    // The historical migration only revoked from anon/authenticated — the root cause.
    expect(m12).toContain('revoke execute on function');
    expect(m12).not.toContain(`revoke execute on function ${fn} from public`);
  });
});
