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
 *
 * Update 50 (live hardening) adds, still in the same two layers:
 *   - P5 BEHAVIOURAL: `getOAuthToken` checks the HTTP status and the token, and never caches a
 *     failure; `stkQuery` (P4a) surfaces its transport result the same way `stkPush` does;
 *   - the handler now takes the OAuth token BEFORE the reservation (P5) and has a second,
 *     pre-Daraja `mark_attempt_failed` call that releases an attempt whose reserved amount
 *     M-PESA cannot take (P3). The source-contract assertions below were updated for both.
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
type HttpResult = { ok: boolean; status: number; body: Record<string, unknown> | null };
type DarajaClient = {
  stkPush: (token: string, payload: Record<string, unknown>) => Promise<HttpResult>;
  getOAuthToken: () => Promise<string>;
  stkQuery: (checkoutRequestId: string) => Promise<HttpResult>;
};

const readFn = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/', f), 'utf-8');

/**
 * Install a Deno.env shim and a scripted fetch, then load the client fresh (a fresh module also
 * means an empty OAuth cache). `env` overrides single settings; every other setting reads 'x'.
 */
function loadClient(fetchImpl: jest.Mock, env: Record<string, string | undefined> = {}) {
  jest.resetModules();
  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: {
      get: (k: string) =>
        k in env ? env[k] : k === 'DARAJA_BASE_URL' ? 'https://daraja.test' : 'x',
    },
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

// ─── 1b. Behavioural: OAuth hardening (P5) ───────────────────────────────────

describe('getOAuthToken — checks the answer and never caches a failure (P5, behavioural)', () => {
  const tokenAnswer = (token: unknown, expires_in: unknown = '3599') =>
    httpResponse(200, () => ({ access_token: token, expires_in }));

  it('returns the token from a 2xx answer and caches it', async () => {
    const f = jest.fn().mockResolvedValue(tokenAnswer('tok-1'));
    const { getOAuthToken } = loadClient(f);
    await expect(getOAuthToken()).resolves.toBe('tok-1');
    await expect(getOAuthToken()).resolves.toBe('tok-1');
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe('https://daraja.test/oauth/v1/generate?grant_type=client_credentials');
  });

  it.each([400, 401, 403, 500, 503])('throws on HTTP %p, even with a token-shaped body', async (status) => {
    const f = jest.fn().mockResolvedValue(httpResponse(status, () => ({ access_token: 'looks-real' })));
    const { getOAuthToken } = loadClient(f);
    await expect(getOAuthToken()).rejects.toThrow(`OAuth refused (HTTP ${status})`);
  });

  it('throws when the 2xx answer has no token (the old code cached undefined for ~59 minutes)', async () => {
    const f = jest.fn().mockResolvedValue(httpResponse(200, () => ({ errorMessage: 'Invalid credentials' })));
    const { getOAuthToken } = loadClient(f);
    await expect(getOAuthToken()).rejects.toThrow('OAuth answer had no access token');
  });

  it('throws when the 2xx answer is not JSON', async () => {
    const f = jest.fn().mockResolvedValue(
      httpResponse(200, () => {
        throw new SyntaxError('Unexpected token <');
      }),
    );
    const { getOAuthToken } = loadClient(f);
    await expect(getOAuthToken()).rejects.toThrow('OAuth answer was not JSON');
  });

  it('never caches a failure: the next call asks Daraja again and can succeed', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(httpResponse(401, () => ({})))
      .mockResolvedValueOnce(tokenAnswer(''))
      .mockResolvedValueOnce(tokenAnswer('tok-good'));
    const { getOAuthToken } = loadClient(f);
    await expect(getOAuthToken()).rejects.toThrow();
    await expect(getOAuthToken()).rejects.toThrow();
    await expect(getOAuthToken()).resolves.toBe('tok-good');
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('still throws on a network-level failure', async () => {
    const f = jest.fn().mockRejectedValue(new TypeError('network error'));
    const { getOAuthToken } = loadClient(f);
    await expect(getOAuthToken()).rejects.toThrow('network error');
  });

  it('never puts the consumer key or secret in an error message', async () => {
    const f = jest.fn().mockResolvedValue(httpResponse(401, () => ({ errorMessage: 'bad' })));
    const { getOAuthToken } = loadClient(f, {
      DARAJA_CONSUMER_KEY: 'fake-key-value',
      DARAJA_CONSUMER_SECRET: 'fake-secret-value',
    });
    const err = await getOAuthToken().catch((e: Error) => e);
    expect(String(err)).not.toContain('fake-key-value');
    expect(String(err)).not.toContain('fake-secret-value');
  });
});

// ─── 1c. Behavioural: the STK Push Query transport (P4a) ─────────────────────

describe('stkQuery — asks Daraja about one request and surfaces the transport result (P4a, behavioural)', () => {
  const oauthOk = httpResponse(200, () => ({ access_token: 'tok-q', expires_in: '3599' }));

  it('fetches a token, then posts the query with our CheckoutRequestID and the same shortcode', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(oauthOk)
      .mockResolvedValueOnce(httpResponse(200, () => ({ ResponseCode: '0', ResultCode: '0' })));
    const { stkQuery } = loadClient(f, { DARAJA_SHORTCODE: '174379', DARAJA_PASSKEY: 'pk' });
    const r = await stkQuery('ws_CO_q1');
    expect(r).toEqual({ ok: true, status: 200, body: { ResponseCode: '0', ResultCode: '0' } });
    const [url, init] = f.mock.calls[1];
    expect(url).toBe('https://daraja.test/mpesa/stkpushquery/v1/query');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok-q');
    const sent = JSON.parse(init.body);
    expect(sent.CheckoutRequestID).toBe('ws_CO_q1');
    expect(sent.BusinessShortCode).toBe('174379');
    expect(sent.Password).toBe(btoa(`174379pk${sent.Timestamp}`));
  });

  it('returns a non-2xx answer with its status instead of throwing', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(oauthOk)
      .mockResolvedValueOnce(httpResponse(500, () => ({ errorCode: '500.001.1001' })));
    const { stkQuery } = loadClient(f);
    await expect(stkQuery('ws_CO_q2')).resolves.toEqual({
      ok: false,
      status: 500,
      body: { errorCode: '500.001.1001' },
    });
  });

  it('returns body null when the answer is not JSON', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(oauthOk)
      .mockResolvedValueOnce(
        httpResponse(502, () => {
          throw new SyntaxError('html');
        }),
      );
    const { stkQuery } = loadClient(f);
    await expect(stkQuery('ws_CO_q3')).resolves.toEqual({ ok: false, status: 502, body: null });
  });

  it('throws (so the caller treats it as indeterminate) when OAuth fails', async () => {
    const f = jest.fn().mockResolvedValueOnce(httpResponse(401, () => ({})));
    const { stkQuery } = loadClient(f);
    await expect(stkQuery('ws_CO_q4')).rejects.toThrow('OAuth refused');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('throws before any request when a setting is missing', async () => {
    const f = jest.fn();
    const { stkQuery } = loadClient(f, { DARAJA_PASSKEY: '' });
    await expect(stkQuery('ws_CO_q5')).rejects.toThrow('settings are missing');
    expect(f).not.toHaveBeenCalled();
  });

  it('throws on a network-level failure of the query itself', async () => {
    const f = jest.fn().mockResolvedValueOnce(oauthOk).mockRejectedValueOnce(new TypeError('network error'));
    const { stkQuery } = loadClient(f);
    await expect(stkQuery('ws_CO_q6')).rejects.toThrow('network error');
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

  it('has exactly two executable mark_attempt_failed call sites: the P3 release and the definitive rejection', () => {
    expect(code.match(/mark_attempt_failed/g) ?? []).toHaveLength(2);
    // The first (P3) releases an attempt whose reserved amount M-PESA cannot take. It must sit
    // after the reservation and BEFORE the request is sent, so it can never fail a sent request.
    const release = code.indexOf('mark_attempt_failed');
    expect(release).toBeGreaterThan(code.indexOf("rpc('reserve_mpesa_attempt'"));
    expect(release).toBeLessThan(code.indexOf('stkPush('));
    expect(code.slice(code.lastIndexOf('if (!reservedCheck.ok)', release), release)).not.toContain('stkPush(');
  });

  it('refuses to conclude anything from a non-2xx response before inspecting the body', () => {
    const okGuard = code.indexOf('if (!result.ok)');
    const bodyRead = code.indexOf('const resp = result.body');
    const failAt = code.lastIndexOf('mark_attempt_failed');
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
    // After the request is sent, the only failure route is the last call site.
    const failIdx = code.lastIndexOf('mark_attempt_failed');
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

  it('still reserves before sending the STK request and sends the reserved amount', () => {
    const reserveAt = code.indexOf("rpc('reserve_mpesa_attempt'");
    expect(reserveAt).toBeGreaterThan(-1);
    // P5: the OAuth token (which moves no money) is now fetched BEFORE the reservation, so a
    // credential failure creates no attempt. The STK request itself still follows the reservation.
    expect(code.indexOf('getOAuthToken(')).toBeGreaterThan(-1);
    expect(code.indexOf('getOAuthToken(')).toBeLessThan(reserveAt);
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
