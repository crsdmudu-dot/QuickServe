/**
 * register-device-token-claim.test.ts
 *
 * Phase 4E.1 P1 regression — static assertions guarding the device-token OWNERSHIP
 * invariant: a single physical push_token belongs to at most ONE account at a time
 * (push_token -> max one user; a user may still have many devices).
 *
 * Baseline bug: logout did not unregister the device token, and register-device only
 * upserted (user_id, push_token) — so the same physical token could stay attached to
 * multiple accounts across an account switch, leaking one account's push to another.
 *
 * Two-layer fix guarded here:
 *  - Backend claim (register-device): a service-role delete removes the token from
 *    OTHER accounts before the caller's user-scoped upsert. user_id is always taken
 *    from the verified JWT; the claim is scoped to (push_token, user_id != caller).
 *  - RLS: ordinary clients can only delete their OWN device_tokens rows, so no client
 *    can claim/delete another user's token (proven behaviorally in the connected QA
 *    cert; guarded structurally here).
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf-8');
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();

describe('register-device token claim (Phase 4E.1 P1)', () => {
  let src: string;
  let n: string;
  beforeAll(() => {
    src = read('supabase/functions/register-device/index.ts');
    n = norm(src);
  });

  it('derives user_id from the verified JWT, never from the request body', () => {
    expect(n).toContain('user_id: user.id');
    expect(src).not.toMatch(/body\.user_id/);
  });

  it('claims the token from other accounts via a service-role delete', () => {
    expect(src).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(n).toContain('.delete()');
  });

  it('scopes the claim to THIS token AND OTHER users only (never the caller / other tokens)', () => {
    expect(n).toContain(".eq('push_token', push_token)");
    expect(n).toContain(".neq('user_id', user.id)");
  });

  it('runs the claim delete BEFORE the caller-scoped upsert', () => {
    const claimIdx = src.indexOf('.neq(');
    const upsertIdx = src.indexOf(".from('device_tokens').upsert");
    expect(claimIdx).toBeGreaterThan(-1);
    expect(upsertIdx).toBeGreaterThan(-1);
    expect(claimIdx).toBeLessThan(upsertIdx);
  });

  it('writes the user row through the RLS (anon + JWT) client, not service-role', () => {
    expect(n).toContain("client.from('device_tokens').upsert");
    expect(src).toContain('SUPABASE_ANON_KEY');
  });
});

describe('device_tokens delete RLS is owner-only (Phase 4E.1 — H/I)', () => {
  it('a client can delete only its OWN token rows (user_id = auth.uid())', () => {
    const m = norm(read('supabase/migrations/0014_device_tokens.sql'));
    expect(m).toContain('for delete using (user_id = auth.uid())');
    // No delete path references is_admin / other-user access.
    expect(m).not.toMatch(/for delete[^;]*is_admin/);
  });
});
