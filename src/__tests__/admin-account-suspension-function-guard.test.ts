/**
 * admin-account-suspension-function-guard.test.ts — static guards on the suspension Edge Function (F5.6b).
 *
 * Behaviour is proved in `admin-account-suspension-handler.test.ts`. These tests pin the SHAPE of the source so a
 * refactor cannot silently weaken a property behaviour alone would not reveal: which key signs which client, which
 * client runs which database call, that nothing is logged, that ADMIN_ORIGIN is the only CORS source, and that no
 * decision leaks into the Deno file where no test can reach it.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const FN = 'supabase/functions/admin-account-suspension';
const handler = fs.readFileSync(path.join(ROOT, FN, 'handler.ts'), 'utf-8');
const edge = fs.readFileSync(path.join(ROOT, FN, 'index.ts'), 'utf-8');
const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf-8');
/** Code only: comments removed, so prose cannot satisfy or trip a check. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('admin-account-suspension: gateway and configuration', () => {
  it('is gated by the gateway JWT check', () => {
    expect(config).toMatch(/\[functions\.admin-account-suspension\]\s*\r?\n\s*verify_jwt = true/);
  });

  it('takes CORS only from ADMIN_ORIGIN, through parseAdminOrigin, and never a wildcard', () => {
    expect(code(edge)).toContain("parseAdminOrigin(Deno.env.get('ADMIN_ORIGIN'))");
    expect(code(edge)).not.toMatch(/Access-Control-Allow-Origin/);
    expect(code(handler)).not.toMatch(/['"]\*['"]/);
    expect(code(edge)).not.toMatch(/['"]\*['"]/);
  });
});

describe('admin-account-suspension: keys and clients', () => {
  it('signs exactly one client with the service key, and the caller client with the anon key plus the caller header', () => {
    const e = code(edge);
    expect(e.match(/SUPABASE_SERVICE_ROLE_KEY/g)).toHaveLength(1);
    expect(e.match(/createClient\(supabaseUrl, serviceKey/g)).toHaveLength(1);
    expect(e).toMatch(/createClient\(supabaseUrl, anonKey, \{\s*global: \{ headers: \{ Authorization: authHeader \} \}/);
  });

  it('runs suspend and lift with the caller client, and only reads, the ban and its record with the service role', () => {
    const e = code(edge);
    expect(e).toContain("client.rpc('admin_suspend_account', args)");
    expect(e).toContain("client.rpc('admin_lift_account_suspension', args)");
    expect(e).not.toMatch(/service\.rpc\('admin_(suspend|lift)/);
    expect(e.match(/service\.rpc\(/g)).toHaveLength(1);
    expect(e).toContain("service.rpc('set_suspension_ban_state'");
    expect(e).toContain('service.auth.admin.updateUserById(uid, { ban_duration: banDuration })');
    expect(e).not.toMatch(/deleteUser|signInWithPassword|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });
});

describe('admin-account-suspension: no decisions or logging in the wrong place', () => {
  it('logs nothing, in either file', () => {
    for (const s of [handler, edge]) expect(code(s)).not.toMatch(/console\.|Deno\.stdout|Deno\.stderr/);
  });

  it('keeps the handler free of Deno, imports and globals', () => {
    const h = code(handler);
    expect(h).not.toMatch(/\bDeno\b/);
    expect(h).not.toMatch(/^\s*import\s/m);
    expect(h).not.toMatch(/\bfetch\(|process\.env/);
  });

  it('keeps every decision in the handler: the Deno file has no role, status or origin logic of its own', () => {
    const e = code(edge);
    expect(e).not.toMatch(/\brole\b.*===|approval_status\s*===|deleted_at\s*[!=]==/);
    expect(e).not.toMatch(/if \(/);
    expect(e.match(/status: 500/g)).toHaveLength(1);
  });

  it('reads no acting admin from the request body', () => {
    const bodyType = handler.match(/let body: \{([^}]*)\}/)?.[1] ?? '';
    expect(bodyType).toBeTruthy();
    expect(bodyType).not.toMatch(/admin|suspended_by|lifted_by|actor/i);
    expect(code(handler)).not.toMatch(/body\.(admin|p_admin|suspended_by|actor)/);
  });

  it('checks the admin before reading the target', () => {
    const h = code(handler);
    const gate = h.indexOf("me.role !== 'admin'");
    const target = h.indexOf('deps.service.readProfile(target)');
    expect(gate).toBeGreaterThan(-1);
    expect(target).toBeGreaterThan(gate);
  });
});
