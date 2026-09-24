/**
 * delete-account-function-guard.test.ts — static guards on the delete-account Edge Function.
 *
 * Behaviour is proved in `delete-account-handler.test.ts`, which runs the real control flow against
 * recording fakes. These tests pin the SHAPE of the source so a refactor cannot silently weaken a
 * security property that behaviour alone would not reveal: which key signs which client, that
 * nothing is logged, and that no decision leaks back into the Deno file where no test can reach it.
 *
 * Two files now: `handler.ts` holds every decision and is importable; `index.ts` holds only Deno
 * wiring. Assertions are aimed at whichever file owns the property.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const FN = 'supabase/functions/delete-account';
const handler = fs.readFileSync(path.join(ROOT, FN, 'handler.ts'), 'utf-8');
/** The function body only. The type declarations above it name the same methods. */
const body = handler.slice(handler.indexOf('export async function handleDeleteAccount'));
const edge = fs.readFileSync(path.join(ROOT, FN, 'index.ts'), 'utf-8');
const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf-8');

describe('delete-account: identity', () => {
  it('derives the target from the verified bearer token only', () => {
    expect(handler).toContain('.auth.getUser()');
    expect(handler).toContain('const uid = user.id;');
  });

  it('accepts no user id from the request body', () => {
    const bodyType = handler.match(/let body: \{([^}]*)\}/)?.[1] ?? '';
    expect(bodyType).toBeTruthy();
    expect(bodyType).not.toMatch(/user_?id|uid/i);
    expect(handler).not.toMatch(/body\.(user_?id|uid|id)\b/);
  });

  it('is gated by the gateway JWT check', () => {
    expect(config).toMatch(/\[functions\.delete-account\]\s*\n\s*verify_jwt = true/);
  });

  it('refuses admin identities with 403', () => {
    expect(handler).toMatch(/role === 'admin'[\s\S]{0,200}403/);
  });

  it('fails closed when the profile cannot be read or does not exist', () => {
    // The error must be destructured, not discarded; both causes must return before anything else.
    expect(handler).toContain('error: profileError');
    const gate = handler.indexOf('if (profileError)');
    const missing = handler.indexOf('if (!profile)');
    const admin = handler.indexOf("profile.role === 'admin'");
    const throttle = handler.indexOf("p_outcome: 'check'");
    expect(gate).toBeGreaterThan(-1);
    expect(missing).toBeGreaterThan(gate);
    expect(admin).toBeGreaterThan(missing);
    expect(throttle).toBeGreaterThan(admin);
  });

  it('handles a non-password identity explicitly rather than failing silently', () => {
    expect(handler).toContain("'unsupported_identity'");
    expect(handler).toContain("identities.includes('email')");
  });
});

describe('delete-account: credential re-proof', () => {
  it('throttles BEFORE verifying the password, and records failures', () => {
    const check = body.indexOf("p_outcome: 'check'");
    const verify = body.indexOf('signInWithPassword');
    const failure = body.indexOf("p_outcome: 'failure'");
    expect(check).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(check);
    expect(failure).toBeGreaterThan(verify);
    expect(handler).toContain('429');
  });

  it('verifies the password with an ANON client, never the service key', () => {
    // Client construction lives in the edge file; the handler only asks for `verifier()`.
    const verifier = edge.slice(edge.indexOf('verifier: () =>'), edge.indexOf('};', edge.indexOf('verifier: () =>')));
    expect(verifier).toContain('anonKey');
    expect(verifier).not.toContain('serviceKey');
    expect(body).toMatch(/deps\s*\.verifier\(\)/);
  });

  it('gives the service key to exactly one client, and never to the caller or verifier', () => {
    // The service key must reach one createClient call and no other.
    const serviceUses = [...edge.matchAll(/createClient<[^>]*>\([^)]*serviceKey/g)];
    expect(serviceUses).toHaveLength(1);

    const callerLine = edge.match(/caller: \(authHeader[\s\S]*?\}\),/)?.[0] ?? '';
    expect(callerLine).toContain('anonKey');
    expect(callerLine).not.toContain('serviceKey');

    const verifierLine = edge.match(/verifier: \(\) =>[^\n]*/)?.[0] ?? '';
    expect(verifierLine).toContain('anonKey');
    expect(verifierLine).not.toContain('serviceKey');
  });

  it('hides no client mismatch behind a cast', () => {
    // `as unknown as` silenced a real incompatibility here once: PostgREST returns a thenable, not
    // a Promise, and the casts made that type-check anyway. `deno check` only catches it while the
    // casts are absent.
    expect(edge).not.toMatch(/as unknown as/);
    expect(edge).not.toMatch(/\bas any\b/);
    expect(edge).not.toMatch(/@ts-(ignore|expect-error|nocheck)/);
  });

  it('checks that the proven identity is the caller (no cross-user proof)', () => {
    expect(handler).toContain('proof?.user?.id !== uid');
  });
});

describe('delete-account: two phases and safe failure', () => {
  it('runs the database tombstone (delete_account) before touching auth', () => {
    const db = handler.indexOf("admin.rpc('delete_account'");
    const auth = handler.indexOf('admin.auth.admin.deleteUser(uid)');
    expect(db).toBeGreaterThan(-1);
    expect(auth).toBeGreaterThan(db);
  });

  it('bans the auth identity before attempting deletion, so a failed delete still revokes refresh', () => {
    const ban = handler.indexOf('ban_duration');
    const del = handler.indexOf('admin.auth.admin.deleteUser(uid)');
    expect(ban).toBeGreaterThan(-1);
    expect(ban).toBeLessThan(del);
  });

  it('reports 202 pending_auth_delete on auth failure and records it, instead of pretending success', () => {
    expect(handler).toContain('record_auth_deletion_failure');
    expect(handler).toMatch(/status: 'pending_auth_delete', \.\.\.work\('pending_retry'\) \}, 202\)/);
  });

  it('returns 409 with blockers and 200 deleted', () => {
    expect(handler).toMatch(/status: 'blocked'[\s\S]{0,120}409/);
    expect(handler).toContain('complete_account_deletion');
  });

  it('skips the credential check ONLY for an already-tombstoned identity (idempotent retry)', () => {
    expect(handler).toContain("profile.deletion_status === 'pending_auth_delete'");
  });
});

describe('delete-account: the edge file stays free of decisions', () => {
  // Anything decided in index.ts is unreachable from Jest, which is how the discarded profile
  // error survived review. Keep the Deno file a wiring shim.
  it('names no database routine', () => {
    for (const fn of [
      'delete_account',
      'complete_account_deletion',
      'record_auth_deletion_failure',
      'throttle_account_deletion',
      'profiles',
    ]) {
      expect(edge).not.toContain(`'${fn}'`);
    }
  });

  it('makes no authorization or role decision', () => {
    expect(edge).not.toMatch(/role\s*===|'admin'|deletion_status|signInWithPassword|ban_duration/);
  });

  it('delegates to the tested handler', () => {
    expect(edge).toContain('handleDeleteAccount');
    expect(edge).toContain("from './handler.ts'");
  });
});

describe('delete-account: nothing personal reaches the logs', () => {
  it('never logs at all', () => {
    for (const source of [handler, edge]) {
      expect(source).not.toMatch(/console\.(log|error|warn|info|debug)/);
    }
  });

  it('never echoes the password, token, email or body in a response', () => {
    // Responses are built only from fixed strings, status codes and blocker codes. The word
    // "password" legitimately appears INSIDE fixed user-facing strings ("Enter your password."),
    // so the check is for the IDENTIFIERS being interpolated or passed through, not the word.
    for (const ident of ['password', 'authHeader', 'body', 'user.email', 'user']) {
      expect(handler).not.toContain('${' + ident + '}');
      const escaped = ident.replace('.', '\\.');
      expect(handler).not.toMatch(new RegExp('result\\(\\{[^}]*(\\{|,)\\s*' + escaped + '\\s*[,}]'));
      expect(handler).not.toMatch(new RegExp('result\\(\\{[^}]*:\\s*' + escaped + '\\s*[,}]'));
    }
  });
});
