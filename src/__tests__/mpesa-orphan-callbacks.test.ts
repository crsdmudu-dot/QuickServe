/**
 * Durable orphan-callback evidence (migration 0054 + mpesa-callback Edge change).
 *
 * Invariant: once a callback has passed the callback-token check, QuickServe must not
 * acknowledge an otherwise unprocessable M-PESA callback without durable evidence of it — and
 * an orphan must never settle anything, however success-like its payload looks.
 *
 * Three layers are pinned:
 *   1. static guards on 0054 (table, dedup model, service-role insert path, admin review/read RPCs,
 *      alert on new evidence only, no financial writes, no client access);
 *   2. the Edge function source contract (auth → parse → classify → durable handling → ack, and
 *      a NON-200 response when durable handling fails);
 *   3. behavioural tests of the Deno-free helper the Edge function uses to classify and mask.
 * Database behaviour is exercised against QA by scripts/qa/mpesa-orphan-scenarios.sql.
 */
import fs from 'fs';
import path from 'path';

const MIGRATION = '0054_mpesa_callback_evidence.sql';
const dir = path.resolve(__dirname, '../../supabase/migrations');
const sql = fs.readFileSync(path.join(dir, MIGRATION), 'utf-8');
const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const lower = code.toLowerCase().replace(/[ 	]+/g, ' ');

function fn(name: string): string {
  const start = lower.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const ends = ['$$;', '$fn$;'].map((t) => lower.indexOf(t, start)).filter((i) => i > -1);
  return lower.slice(start, Math.min(...ends) + 3);
}

describe('0054 — placement and evidence table', () => {
  it('is the only migration after 0053', () => {
    const files = fs.readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
    expect(files[files.length - 1]).toBe(MIGRATION);
    expect(files.filter((f) => f.startsWith('0054'))).toHaveLength(1);
    expect(files.filter((f) => f.startsWith('0053'))).toHaveLength(1);
  });

  it('creates an append-oriented evidence table with the operational fields and no raw payload column', () => {
    expect(lower).toContain('create table if not exists public.mpesa_callback_events (');
    const t = lower.slice(lower.indexOf('create table if not exists public.mpesa_callback_events ('), lower.indexOf(');', lower.indexOf('create table if not exists public.mpesa_callback_events (')));
    for (const col of [
      'id uuid', 'classification text', 'merchant_request_id text', 'checkout_request_id text',
      'result_code integer', 'result_desc text', 'amount numeric', 'receipt text', 'transaction_date text',
      'phone_masked text', 'payload_sha256 text', 'seen_count integer', 'first_seen_at timestamptz',
      'last_seen_at timestamptz', 'matched_attempt_id uuid', 'reviewed_at timestamptz', 'reviewed_by uuid',
      'review_note text',
    ]) {
      expect(t).toContain(col);
    }
    expect(t).toMatch(/classification in \('unknown_checkout_request_id', ?'missing_checkout_request_id', ?'malformed_authenticated_callback'\)/);
    expect(t).not.toMatch(/raw_payload|raw_body|payload jsonb|raw_response/);
    expect(t).not.toMatch(/\bphone text\b/); // masked only
  });

  it('dedups identical redeliveries by payload fingerprint, never by CheckoutRequestID alone', () => {
    expect(lower).toMatch(/payload_sha256 text not null unique/);
    expect(lower).not.toMatch(/checkout_request_id text[^,]*unique/);
  });

  it('enables RLS with NO policies and revokes every client role (evidence is service-role/definer only)', () => {
    expect(lower).toContain('alter table public.mpesa_callback_events enable row level security;');
    expect(lower).not.toContain('create policy');
    expect(lower).toContain('revoke all on public.mpesa_callback_events from public, anon, authenticated;');
  });
});

describe('0054 — record_mpesa_callback_event()', () => {
  const body = () => fn('record_mpesa_callback_event');
  it('is service-role only, security definer, pinned search_path', () => {
    expect(body()).toContain('security definer');
    expect(body()).toContain('set search_path = public');
    expect(lower).toContain('revoke execute on function public.record_mpesa_callback_event(text, text, text, integer, text, jsonb, text) from public, anon, authenticated;');
    expect(lower).toContain('grant execute on function public.record_mpesa_callback_event(text, text, text, integer, text, jsonb, text) to service_role;');
  });
  it('fingerprints the whole payload, masks the phone, parses Amount fail-closed, and never stores raw', () => {
    const b = body();
    // canonical jsonb text for parseable bodies; the Edge-computed SHA-256 of the raw bytes for unparseable ones
    expect(b).toMatch(/v_sha := coalesce\(p_raw_sha256, encode\(sha256\(convert_to\(coalesce\(p_raw::text, 'null'\), 'utf8'\)\), 'hex'\)\)/);
    expect(b).toMatch(/p_raw_sha256 !~ '\^\[0-9a-f\]\{64\}\$'/);
    expect(b).toMatch(/p_raw_sha256 is not null and \(p_raw is not null or p_classification <> 'malformed_authenticated_callback'\)/);
    expect(b).toMatch(/'\*\*\*' \|\| right\(/);
    expect(b).toContain("invalid_text_representation or numeric_value_out_of_range");
    expect(b).not.toMatch(/insert into public\.mpesa_callback_events[\s\S]*p_raw[\s\S]*\)\s*values/);
  });
  it('upserts on the fingerprint (seen_count + last_seen_at) and alerts admins only for NEW evidence', () => {
    const b = body();
    expect(b).toMatch(/on conflict \(payload_sha256\) do update[\s\S]*seen_count\s*=\s*public\.mpesa_callback_events\.seen_count \+ 1[\s\S]*last_seen_at\s*=\s*now\(\)/);
    expect(b).toContain("'admin_mpesa_orphan_callback'");
    expect(b).toMatch(/if v_is_new then[\s\S]*perform public\.notify_admins\(/);
    expect(b).toMatch(/v_id::text \|\| ':admin_mpesa_orphan_callback'/);
  });
  it('keeps evidence durable when the alert fails: notify_admins runs in its own exception block AFTER the insert, and the result reports alert_sent', () => {
    const b = body();
    const insertAt = b.indexOf('insert into public.mpesa_callback_events');
    const alertBlock = b.indexOf('if v_is_new then');
    expect(insertAt).toBeGreaterThan(-1);
    expect(alertBlock).toBeGreaterThan(insertAt);
    expect(b).toMatch(/if v_is_new then\s*begin\s*perform public\.notify_admins\([\s\S]*?v_alert_sent := true;\s*exception when others then[\s\S]*?end;\s*end if;/);
    expect(b).toMatch(/'alert_sent', v_alert_sent/);
    // the failure path must not re-raise (that would roll the evidence back) and must not log payload content
    const exc = b.slice(b.indexOf('exception when others then', alertBlock), b.indexOf('end if;', alertBlock));
    expect(exc).not.toMatch(/\braise (exception|notice)/);
    expect(exc).not.toMatch(/p_raw|sqlerrm|phone/);
  });
  it('never touches payments, attempts or earnings and never calls the settlement RPCs', () => {
    const b = body();
    expect(b).not.toMatch(/update\s+public\.(payments|payment_attempts|provider_earnings)/);
    expect(b).not.toMatch(/insert\s+into\s+public\.(payments|payment_attempts|provider_earnings)/);
    expect(b).not.toContain('confirm_payment_attempt');
    expect(b).not.toContain('apply_mpesa_callback');
  });
});

describe('0054 — apply_or_record_mpesa_callback()', () => {
  const body = () => fn('apply_or_record_mpesa_callback');
  it('is the single service-role entry point: known id → certified apply path, else durable record', () => {
    expect(lower).toContain('revoke execute on function public.apply_or_record_mpesa_callback(text, text, integer, text, jsonb) from public, anon, authenticated;');
    expect(lower).toContain('grant execute on function public.apply_or_record_mpesa_callback(text, text, integer, text, jsonb) to service_role;');
    const b = body();
    expect(b).toMatch(/where checkout_request_id = p_checkout_request_id/);
    expect(b).toMatch(/perform public\.apply_mpesa_callback\(p_checkout_request_id, p_merchant_request_id, p_result_code, p_result_desc, p_raw\)/);
    expect(b).toMatch(/public\.record_mpesa_callback_event\('unknown_checkout_request_id'/);
  });
  it('does not redefine apply_mpesa_callback (the certified settlement path stays 0050)', () => {
    expect(lower).not.toContain('create or replace function public.apply_mpesa_callback(');
    expect(lower).not.toContain('drop function if exists public.apply_mpesa_callback(');
  });
});

describe('0054 — admin read/review RPCs', () => {
  it('admin_mpesa_callback_events(): admin-only, exact match by CheckoutRequestID only, high urgency for unmatched success with collection evidence', () => {
    const b = fn('admin_mpesa_callback_events');
    expect(b).toContain('security definer');
    expect(b).toContain('set search_path = public');
    expect(b).toMatch(/if not public\.is_admin\(\) then/);
    expect(lower).toContain('revoke execute on function public.admin_mpesa_callback_events() from public, anon;');
    expect(lower).toContain('grant execute on function public.admin_mpesa_callback_events() to authenticated;');
    expect(b).toMatch(/a\.checkout_request_id = e\.checkout_request_id/);
    expect(b).not.toMatch(/a\.phone|amount\s*=\s*e\.amount/); // never match on phone/amount
    expect(b).toMatch(/e\.result_code = 0 and \(e\.amount is not null or e\.receipt is not null\)[\s\S]*then 'high'/);
    expect(b).toContain('needs_review');
    expect(b).not.toContain('raw');
  });
  it('review_mpesa_callback_event(): admin-only, note required, records reviewer/time, mutates nothing else', () => {
    const b = fn('review_mpesa_callback_event');
    expect(b).toMatch(/if not public\.is_admin\(\) then/);
    expect(b).toMatch(/review note required/);
    expect(b).toMatch(/reviewed_at\s*=\s*now\(\)/);
    expect(b).toMatch(/reviewed_by\s*=\s*auth\.uid\(\)/);
    expect(b).not.toMatch(/delete\s+from/);
    expect(b).not.toMatch(/update\s+public\.(payments|payment_attempts)/);
    expect(lower).toContain('revoke execute on function public.review_mpesa_callback_event(uuid, text) from public, anon;');
    expect(lower).toContain('grant execute on function public.review_mpesa_callback_event(uuid, text) to authenticated;');
  });
});

// ── Edge function source contract ──────────────────────────────────────────

describe('mpesa-callback Edge function — durable-before-ack contract', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/mpesa-callback/index.ts'), 'utf-8');
  const codeOnly = src.split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*')).join('\n');

  it('keeps the constant-time token gate first and returns 401 before any database access', () => {
    const gate = codeOnly.indexOf("if (expected.length === 0 || !safeEqual(token, expected))");
    const db = codeOnly.indexOf('createClient(');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(db);
  });

  it('routes every authenticated callback through the service-role entry points (known → apply, else record)', () => {
    expect(codeOnly).toContain("admin.rpc('apply_or_record_mpesa_callback'");
    expect(codeOnly).toContain("admin.rpc('record_mpesa_callback_event'");
    expect(codeOnly).not.toContain("admin.rpc('apply_mpesa_callback'");
    expect(codeOnly).toContain("classifyAuthenticatedCallback(");
  });

  it('acknowledges with 200 only after durable handling succeeded; an RPC error yields a non-200 so Safaricom retries', () => {
    expect(codeOnly).toMatch(/if \(error\)[\s\S]*,\s*500\)/);
    // the success ack must be reachable only after the error check
    expect(codeOnly.indexOf(', 500)')).toBeLessThan(codeOnly.indexOf("ResultDesc: 'Accepted'"));
  });

  it('reads the raw bytes and parses JSON itself, so a syntactically invalid body is distinguishable from a valid-but-malformed one', () => {
    expect(codeOnly).toContain('await req.text()');
    expect(codeOnly).not.toContain('req.json()');
    expect(codeOnly).toContain('parseJsonBody(');
  });

  it('retains evidence of an unparseable authenticated body as the SHA-256 of its raw bytes (no raw body, p_raw null)', () => {
    // the hash is computed before the RPC call and passed as p_raw_sha256 with p_raw null
    expect(codeOnly).toMatch(/const rawSha = [^\n]*sha256Hex\(/);
    expect(codeOnly).toMatch(/p_raw_sha256: rawSha/);
    expect(codeOnly).toMatch(/p_raw: rawSha \? null : body/);
    // the raw text itself never reaches the database
    const rpcArgs = codeOnly.match(/admin\.rpc\([\s\S]*?\}\)/g) ?? [];
    expect(rpcArgs.length).toBeGreaterThan(0);
    for (const args of rpcArgs) expect(args).not.toContain('rawText');
  });

  it('refuses the ACK (non-2xx, before any database access) when the body bytes cannot even be read', () => {
    const unreadable = codeOnly.indexOf("'Callback body unreadable; retry'");
    expect(unreadable).toBeGreaterThan(-1);
    expect(codeOnly.slice(unreadable - 200, unreadable)).toMatch(/catch/);
    expect(unreadable).toBeLessThan(codeOnly.indexOf('createClient('));
    expect(codeOnly.slice(unreadable, unreadable + 80)).toMatch(/,\s*500\)/);
  });

  it('never logs the callback body, the phone or the token', () => {
    expect(codeOnly).not.toMatch(/console\.(log|info|debug|warn|error)\([^)]*(body|token|phone|p_raw|rawText)/);
  });

  it('keeps verify_jwt=false (Daraja cannot present a Supabase JWT)', () => {
    const toml = fs.readFileSync(path.resolve(__dirname, '../../supabase/config.toml'), 'utf-8');
    const seg = toml.slice(toml.indexOf('[functions.mpesa-callback]'));
    expect(seg.slice(0, 200)).toMatch(/verify_jwt\s*=\s*false/);
  });
});

// ── Deno-free helper behaviour ────────────────────────────────────────────

type Helper = {
  classifyAuthenticatedCallback: (body: unknown, parsed: { checkoutRequestId: string | null }) => 'apply' | 'missing_checkout_request_id' | 'malformed_authenticated_callback';
  maskMsisdn: (v: unknown) => string | null;
  parseJsonBody: (text: string) => { ok: true; body: unknown } | { ok: false };
  sha256Hex: (bytes: Uint8Array) => Promise<string>;
};
function loadHelper(): Helper {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.resolve(__dirname, '../../supabase/functions/_shared/callback-evidence.ts')) as Helper;
}

describe('callback-evidence helper', () => {
  const { classifyAuthenticatedCallback, maskMsisdn } = loadHelper();

  it('classifies a callback with a CheckoutRequestID as apply (the DB decides known vs unknown)', () => {
    expect(classifyAuthenticatedCallback({ Body: { stkCallback: {} } }, { checkoutRequestId: 'ws_CO_1' })).toBe('apply');
  });
  it('classifies a well-formed body without CheckoutRequestID as missing_checkout_request_id', () => {
    expect(classifyAuthenticatedCallback({ Body: { stkCallback: { ResultCode: 0 } } }, { checkoutRequestId: null })).toBe('missing_checkout_request_id');
  });
  it('classifies null / non-object / non-Daraja bodies as malformed_authenticated_callback', () => {
    expect(classifyAuthenticatedCallback(null, { checkoutRequestId: null })).toBe('malformed_authenticated_callback');
    expect(classifyAuthenticatedCallback('text', { checkoutRequestId: null })).toBe('malformed_authenticated_callback');
    expect(classifyAuthenticatedCallback({ hello: 'world' }, { checkoutRequestId: null })).toBe('malformed_authenticated_callback');
  });
  it('masks MSISDNs to the last three digits and returns null for unusable values', () => {
    expect(maskMsisdn(254700000399)).toBe('***399');
    expect(maskMsisdn('254700000399')).toBe('***399');
    expect(maskMsisdn('07')).toBeNull();
    expect(maskMsisdn(null)).toBeNull();
  });
});

describe('callback-evidence helper — raw-body handling', () => {
  const { parseJsonBody, sha256Hex } = loadHelper();

  it('distinguishes syntactically invalid JSON from valid JSON with missing M-PESA fields', () => {
    expect(parseJsonBody('{"Body":{"stkCallback":{}}}')).toEqual({ ok: true, body: { Body: { stkCallback: {} } } });
    expect(parseJsonBody('null')).toEqual({ ok: true, body: null });
    expect(parseJsonBody('{"Body":')).toEqual({ ok: false });
    expect(parseJsonBody('')).toEqual({ ok: false });
    expect(parseJsonBody('<xml/>')).toEqual({ ok: false });
  });

  it('hashes raw bytes to lowercase SHA-256 hex (known vectors), so unparseable bodies get a stable, content-free fingerprint', async () => {
    const enc = new TextEncoder();
    await expect(sha256Hex(enc.encode(''))).resolves.toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    await expect(sha256Hex(enc.encode('abc'))).resolves.toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
