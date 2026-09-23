/**
 * delete-account-function-guard.test.ts — static guards on the delete-account Edge Function.
 *
 * The connected certification (qa/playwright/certification/account-deletion.spec.ts) proves the
 * behaviour end to end against the certified QA project. These tests pin the SECURITY PROPERTIES
 * of the source so a refactor cannot silently weaken them: identity from the token only, admins
 * refused, credential re-proof throttled and server-side, no logging of anything personal, and the
 * two-phase structure (database tombstone before auth deletion). Offline; reads the source text.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/delete-account/index.ts'), 'utf-8');
const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf-8');

describe('delete-account: identity', () => {
  it('derives the target from the verified bearer token only', () => {
    expect(src).toContain('caller.auth.getUser()');
    expect(src).toContain('const uid = user.id;');
  });

  it('accepts no user id from the request body', () => {
    const bodyType = src.match(/type Body = \{([^}]*)\}/)?.[1] ?? '';
    expect(bodyType).not.toMatch(/user_?id|uid|id\b/i);
    expect(src).not.toMatch(/body\.(user_?id|uid|id)\b/);
  });

  it('is gated by the gateway JWT check', () => {
    expect(config).toMatch(/\[functions\.delete-account\]\s*\n\s*verify_jwt = true/);
  });

  it('refuses admin identities with 403', () => {
    expect(src).toMatch(/role === 'admin'[\s\S]{0,200}403/);
  });

  it('handles a non-password identity explicitly rather than failing silently', () => {
    expect(src).toContain("'unsupported_identity'");
    expect(src).toContain("identities.includes('email')");
  });
});

describe('delete-account: credential re-proof', () => {
  it('throttles BEFORE verifying the password, and records failures', () => {
    const check = src.indexOf("p_outcome: 'check'");
    const verify = src.indexOf('signInWithPassword');
    const failure = src.indexOf("p_outcome: 'failure'");
    expect(check).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(check);
    expect(failure).toBeGreaterThan(verify);
    expect(src).toContain('429');
  });

  it('verifies the password server-side with the ANON client, never the service key', () => {
    const verifier = src.slice(src.indexOf('const verifier = createClient('), src.indexOf('signInWithPassword'));
    expect(verifier).toContain('anonKey');
    expect(verifier).not.toContain('serviceKey');
  });

  it('checks that the proven identity is the caller (no cross-user proof)', () => {
    expect(src).toContain('proof?.user?.id !== uid');
  });
});

describe('delete-account: two phases and safe failure', () => {
  it('runs the database tombstone (delete_account) before touching auth', () => {
    const db = src.indexOf("admin.rpc('delete_account'");
    const auth = src.indexOf('admin.auth.admin.deleteUser(uid)');
    expect(db).toBeGreaterThan(-1);
    expect(auth).toBeGreaterThan(db);
  });

  it('bans the auth identity before attempting deletion, so a failed delete still revokes refresh', () => {
    const ban = src.indexOf('ban_duration');
    const del = src.indexOf('admin.auth.admin.deleteUser(uid)');
    expect(ban).toBeGreaterThan(-1);
    expect(ban).toBeLessThan(del);
  });

  it('reports 202 pending_auth_delete on auth failure and records it, instead of pretending success', () => {
    expect(src).toContain("record_auth_deletion_failure");
    expect(src).toMatch(/status: 'pending_auth_delete' \}, 202\)/);
  });

  it('returns 409 with blockers and 200 deleted', () => {
    expect(src).toMatch(/status: 'blocked'[\s\S]{0,120}409/);
    expect(src).toContain("complete_account_deletion");
  });

  it('skips the credential check ONLY for an already-tombstoned identity (idempotent retry)', () => {
    expect(src).toContain("profile?.deletion_status === 'pending_auth_delete'");
  });
});

describe('delete-account: nothing personal reaches the logs', () => {
  it('never logs at all', () => {
    expect(src).not.toMatch(/console\.(log|error|warn|info|debug)/);
  });

  it('never echoes the password, token, email or body in a response', () => {
    // Responses are built only from fixed strings, status codes and blocker codes. The word
    // "password" legitimately appears INSIDE fixed user-facing strings ("Enter your password."),
    // so the check is for the IDENTIFIERS being interpolated or passed through, not the word.
    for (const ident of ['password', 'authHeader', 'body', 'user.email', 'user']) {
      expect(src).not.toContain('${' + ident + '}');
      // property shorthand or value pass-through inside a response object, e.g. `json({ password`
      // or `error: password` — the identifier followed by `,` `}` or preceded by `: `.
      expect(src).not.toMatch(new RegExp('json\\(\\{[^}]*(\\{|,)\\s*' + ident.replace('.', '\\.') + '\\s*[,}]'));
      expect(src).not.toMatch(new RegExp('json\\(\\{[^}]*:\\s*' + ident.replace('.', '\\.') + '\\s*[,}]'));
    }
  });
});
