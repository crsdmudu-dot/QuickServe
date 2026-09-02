/**
 * stk-ambiguity-remediation.test.ts
 *
 * Regression cover for the ambiguous-Daraja-response defect.
 *
 * Before this remediation `stkPush` returned only the parsed body, so an HTTP 5xx that happened
 * to carry a JSON payload reached `ResponseCode !== '0'` and was treated as a definitive
 * rejection — marking an externally-transmitted attempt FAILED, releasing the funding freeze
 * and permitting a retry while the customer could still be charged.
 *
 * Two layers are covered:
 *   1. BEHAVIOURAL — `stkPush` really executes here, so the transport contract is proven.
 *   2. SOURCE-CONTRACT — the handler imports `jsr:@supabase/supabase-js@2` and calls
 *      `Deno.serve`, neither of which resolves under Jest, so its decision table is asserted
 *      statically. See the limitation note in the second describe block.
 */

import fs from 'fs';
import path from 'path';

const CLIENT = '../../supabase/functions/_shared/daraja-client';

/**
 * Structural type for the Deno-only client.
 *
 * We deliberately do NOT write `typeof import('.../daraja-client')`: that is a static type
 * reference, and it would pull the module into the app TypeScript program even though
 * tsconfig `exclude` lists it (exclude filters the include globs, it does not stop an
 * imported/referenced file entering the program). The module uses Deno globals and a `.ts`
 * import extension, so it cannot type-check under the app tsconfig.
 */
type DarajaClient = {
  stkPush: (
    token: string,
    payload: Record<string, unknown>,
  ) => Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null }>;
};

const readFn = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/', f), 'utf-8');

/** Install a Deno.env shim and a scripted fetch, then load the client fresh. */
function loadClient(fetchImpl: jest.Mock) {
  jest.resetModules();
  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: { get: (k: string) => (k === 'DARAJA_BASE_URL' ? 'https://daraja.test' : 'x') },
  };
  (globalThis as unknown as { fetch: unknown }).fetch = fetchImpl;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(CLIENT) as DarajaClient;
}

/** Build a Response-like object with a scripted status and body parser. */
function httpResponse(status: number, json: () => unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => json() };
}

afterEach(() => {
  delete (globalThis as unknown as { Deno?: unknown }).Deno;
});

// ─── 1. Behavioural: the transport contract ──────────────────────────────────

describe('stkPush — surfaces HTTP transport status (behavioural)', () => {
  it('reports a 2xx acceptance with its parsed body', async () => {
    const f = jest.fn().mockResolvedValue(
      httpResponse(200, () => ({
        ResponseCode: '0',
        MerchantRequestID: 'M1',
        CheckoutRequestID: 'C1',
      })),
    );
    const { stkPush } = loadClient(f);
    const r = await stkPush('tok', { any: 'payload' });
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ResponseCode: '0',
      MerchantRequestID: 'M1',
      CheckoutRequestID: 'C1',
    });
  });

  it('does NOT hide a 5xx behind its JSON body — the status survives', async () => {
    // This is the exact shape that used to be mistaken for an application rejection.
    const f = jest.fn().mockResolvedValue(
      httpResponse(503, () => ({ requestId: 'r-1', errorMessage: 'Service Unavailable' })),
    );
    const { stkPush } = loadClient(f);
    const r = await stkPush('tok', {});
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ requestId: 'r-1', errorMessage: 'Service Unavailable' });
  });

  it('returns body null instead of throwing when the body is not JSON', async () => {
    const f = jest.fn().mockResolvedValue(
      httpResponse(200, () => {
        throw new SyntaxError('Unexpected token < in JSON');
      }),
    );
    const { stkPush } = loadClient(f);
    const r = await stkPush('tok', {});
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.body).toBeNull();
  });

  it('still throws on a network-level failure so the caller treats it as ambiguous', async () => {
    const f = jest.fn().mockRejectedValue(new TypeError('network error'));
    const { stkPush } = loadClient(f);
    await expect(stkPush('tok', {})).rejects.toThrow('network error');
  });

  it('never places the bearer token or any credential in the returned structure', async () => {
    const f = jest.fn().mockResolvedValue(httpResponse(200, () => ({ ResponseCode: '0' })));
    const { stkPush } = loadClient(f);
    const r = await stkPush('super-secret-token', {});
    expect(JSON.stringify(r)).not.toContain('super-secret-token');
    expect(Object.keys(r).sort()).toEqual(['body', 'ok', 'status']);
  });
});

// ─── 2. Source-contract: the handler decision table ──────────────────────────

describe('mpesa-stk-push — ambiguity never becomes failure (source contract)', () => {
  // LIMITATION: the handler cannot be imported under Jest (jsr: specifier + Deno.serve), so the
  // decision table is asserted against the source. A runtime QA gate must certify behaviour.
  let src: string;
  let code: string;

  beforeAll(() => {
    src = readFn('mpesa-stk-push/index.ts');
    code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  });

  it('has exactly one executable mark_attempt_failed call site', () => {
    expect(code.match(/mark_attempt_failed/g) ?? []).toHaveLength(1);
  });

  it('refuses to conclude anything from a non-2xx response before inspecting the body', () => {
    const okGuard = code.indexOf('if (!result.ok)');
    const bodyRead = code.indexOf('const resp = result.body');
    const failAt = code.indexOf('mark_attempt_failed');
    expect(okGuard).toBeGreaterThan(-1);
    expect(okGuard).toBeLessThan(bodyRead);
    expect(okGuard).toBeLessThan(failAt);
  });

  it('guards an unparseable 2xx body before inspecting ResponseCode', () => {
    const bodyGuard = code.indexOf('if (!resp)');
    const codeRead = code.indexOf('const rawCode = resp.ResponseCode');
    expect(bodyGuard).toBeGreaterThan(-1);
    expect(bodyGuard).toBeLessThan(codeRead);
  });

  it('treats a missing or malformed ResponseCode as ambiguous, not as a rejection', () => {
    // The normalisation must yield null (never a rejection) when the field is absent.
    expect(code).toContain("typeof rawCode === 'string' || typeof rawCode === 'number'");
    expect(code).toContain('? String(rawCode)');
    expect(code).toContain(': null');
    // and the failure predicate must require a non-null code.
    expect(code).toContain("responseCode !== null && responseCode !== '0'");
  });

  it('marks failed ONLY under an explicit non-zero code on a 2xx response', () => {
    const failIdx = code.indexOf('mark_attempt_failed');
    const guardIdx = code.indexOf("responseCode !== null && responseCode !== '0'");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(failIdx);
    // No bare ResponseCode comparison may survive — that was the defective predicate.
    expect(code).not.toContain("resp.ResponseCode !== '0'");
  });

  it('requires BOTH provider identifiers before recording acceptance', () => {
    expect(code).toContain('if (!merchantRequestId || !checkoutRequestId)');
    const idGuard = code.indexOf('if (!merchantRequestId || !checkoutRequestId)');
    const accept = code.indexOf('mark_attempt_accepted');
    expect(idGuard).toBeLessThan(accept);
  });

  it('does not mark failed or resubmit when acceptance cannot be recorded', () => {
    const tail = code.slice(code.indexOf('acceptError'));
    expect(tail).not.toContain('mark_attempt_failed');
    expect(tail).not.toContain('stkPush(');
    expect(src).toContain('Payment started but could not be recorded.');
  });

  it('still reserves before contacting the provider and sends the reserved amount', () => {
    const reserveAt = code.indexOf("rpc('reserve_mpesa_attempt'");
    expect(reserveAt).toBeGreaterThan(-1);
    expect(reserveAt).toBeLessThan(code.indexOf('getOAuthToken('));
    expect(reserveAt).toBeLessThan(code.indexOf('stkPush('));
    expect(code).toContain(
      'const amountDue = Number((reservation as { amount: number | string }).amount)',
    );
    expect(code).toContain('amount: amountDue,');
  });

  it('still creates no payment_attempts row directly', () => {
    expect(src).not.toContain('payment_attempts');
  });
});
