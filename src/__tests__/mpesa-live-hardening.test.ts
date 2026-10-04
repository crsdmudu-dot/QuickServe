/**
 * mpesa-live-hardening.test.ts — BEHAVIOURAL tests of the two M-PESA Edge handlers (update 50).
 *
 * The handlers are Deno modules: they import `jsr:@supabase/supabase-js@2` and call `Deno.serve`.
 * They run here for real, with:
 *   - a VIRTUAL Jest mock for the `jsr:` import (a scripted fake Supabase client that records
 *     every table read and RPC);
 *   - a `Deno` shim whose `serve` captures the handler and whose `env` holds FAKE settings;
 *   - a scripted `fetch` standing in for Daraja (OAuth, STK Push, STK Push Query).
 * No network, no database, and no real setting value is used anywhere.
 *
 * What is proven (plan update 48 §7, lead-PM stage 40):
 *   mpesa-stk-push — P1 (fail closed, `disabled` before anything), S40-10 (no mock on Production),
 *     P2 (KwikServe), P3 (amount guard before and after the reservation), P5 (OAuth before the
 *     reservation), P6 (Paybill default, Till settings) and P7 (stable error codes).
 *   mpesa-callback — P4a with S40-2: a success is applied only when Safaricom confirms it; a
 *     definite "no" is refused; an indeterminate answer is retried and then left to the timeout
 *     path, never treated as a forgery; failure callbacks are never queried.
 * These are offline proofs of the code paths. The real Safaricom answer shapes still need the
 * QA sandbox certification (Q3, Q7).
 */

import fs from 'fs';
import path from 'path';

import { MPESA_ERROR_TEXTS } from '@/lib/mpesa-payment-status';
import {
  classifyAuthenticatedCallback,
  hasInvalidResultCode,
  resultCodeLiterals,
} from '../../supabase/functions/_shared/callback-evidence';
import { parseStkCallback } from '../../supabase/functions/_shared/daraja';

// ─── The fake Supabase client (virtual module) ───────────────────────────────

type RpcResult = { data?: unknown; error: { message: string } | null };
type FakeDb = {
  payment: Record<string, unknown> | null;
  booking: Record<string, unknown> | null;
  rpc: Record<string, RpcResult>;
};

/** Everything the handler did, in order: table reads, RPCs and Daraja requests. */
let mockEvents: string[] = [];
let mockRpcCalls: { name: string; args: Record<string, unknown> }[] = [];
let mockCreateClientCalls = 0;
let mockDb: FakeDb;

jest.mock(
  'jsr:@supabase/supabase-js@2',
  () => ({
    createClient: () => {
      mockCreateClientCalls += 1;
      return {
        from: (table: string) => {
          const chain = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => {
              mockEvents.push(`read:${table}`);
              return { data: table === 'payments' ? mockDb.payment : mockDb.booking, error: null };
            },
          };
          return chain;
        },
        rpc: (name: string, args: Record<string, unknown>) => {
          mockEvents.push(`rpc:${name}`);
          mockRpcCalls.push({ name, args });
          const result = mockDb.rpc[name] ?? { data: null, error: null };
          const promise = Promise.resolve(result);
          return { maybeSingle: () => promise, then: promise.then.bind(promise) };
        },
      };
    },
  }),
  { virtual: true },
);

// ─── Deno shim, scripted Daraja and handler loading ──────────────────────────

const PROD_URL = 'https://lkigkltvstlxfdztffds.supabase.co';
const QA_URL = 'https://qaprojectref0000000000.supabase.co';
const CALLBACK_SECRET = 'fake-callback-secret-for-tests';

/** Fake Daraja settings for live mode. None of these is a real value. */
const LIVE_ENV: Record<string, string> = {
  SUPABASE_URL: PROD_URL,
  SUPABASE_ANON_KEY: 'fake-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role',
  MPESA_MODE: 'live',
  DARAJA_BASE_URL: 'https://api.safaricom.co.ke',
  DARAJA_CONSUMER_KEY: 'fake-consumer-key',
  DARAJA_CONSUMER_SECRET: 'fake-consumer-secret',
  DARAJA_SHORTCODE: '600000',
  DARAJA_PASSKEY: 'fake-passkey',
  DARAJA_CALLBACK_URL: `https://example.test/functions/v1/mpesa-callback?token=${CALLBACK_SECRET}`,
  MPESA_CALLBACK_SECRET: CALLBACK_SECRET,
};

type Handler = (req: Request) => Promise<Response>;
type DarajaScript = {
  oauth?: () => Response;
  push?: () => Response;
  query?: (() => Response | Promise<Response>)[];
};

let darajaRequests: { url: string; body: Record<string, unknown> | null }[] = [];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const OAUTH_OK = () => jsonResponse(200, { access_token: 'fake-bearer', expires_in: '3599' });

/** Load one handler fresh, with the given settings and a scripted Daraja. */
function loadHandler(fn: 'mpesa-stk-push' | 'mpesa-callback', env: Record<string, string | undefined>, daraja: DarajaScript = {}): Handler {
  jest.resetModules();
  let handler: Handler | null = null;
  (globalThis as unknown as { Deno: unknown }).Deno = {
    serve: (h: Handler) => {
      handler = h;
    },
    env: { get: (k: string) => env[k] },
  };
  const queryScript = [...(daraja.query ?? [])];
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { body?: string }) => {
    darajaRequests.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    if (url.includes('/oauth/v1/generate')) {
      mockEvents.push('daraja:oauth');
      return (daraja.oauth ?? OAUTH_OK)();
    }
    if (url.includes('/mpesa/stkpush/v1/processrequest')) {
      mockEvents.push('daraja:stkpush');
      if (!daraja.push) throw new Error('unexpected STK push');
      return daraja.push();
    }
    if (url.includes('/mpesa/stkpushquery/v1/query')) {
      mockEvents.push('daraja:query');
      const next = queryScript.shift();
      if (!next) throw new Error('unexpected STK query');
      return next();
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(`../../supabase/functions/${fn}/index.ts`);
  if (!handler) throw new Error('handler not registered');
  return handler;
}

let warn: jest.SpyInstance;
let error: jest.SpyInstance;

beforeEach(() => {
  mockEvents = [];
  mockRpcCalls = [];
  mockCreateClientCalls = 0;
  darajaRequests = [];
  mockDb = {
    payment: { id: 'pay-1', amount: 1500, wallet_applied: 0, promo_discount: 0, booking_id: 'booking-0123456789abcdef', status: 'pending' },
    booking: { id: 'booking-0123456789abcdef', status: 'completed' },
    rpc: {
      reserve_mpesa_attempt: { data: { attempt_id: 'att-1', amount: 1500 }, error: null },
      mark_attempt_accepted: { error: null },
      mark_attempt_failed: { error: null },
      apply_or_record_mpesa_callback: { data: { handled: 'applied' }, error: null },
      record_mpesa_callback_event: { data: { is_new: true }, error: null },
    },
  };
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  delete (globalThis as unknown as { Deno?: unknown }).Deno;
  warn.mockRestore();
  error.mockRestore();
  jest.useRealTimers();
});

/** Every console line the handler wrote, joined, to prove no setting value leaks. */
function logged(): string {
  return [...warn.mock.calls, ...error.mock.calls].map((c) => c.join(' ')).join('\n');
}

function expectNoSecretInLogs() {
  const text = logged();
  for (const value of Object.values(LIVE_ENV)) {
    if (value === 'live' || value.startsWith('https://api.')) continue; // a mode word and a public host
    expect(text).not.toContain(value);
  }
  expect(text).not.toContain('254712345678');
}

// ─── mpesa-stk-push ───────────────────────────────────────────────────────────

const PAY_REQUEST = () =>
  new Request('https://fn.test/mpesa-stk-push', {
    method: 'POST',
    headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment_id: 'pay-1', phone: '254712345678' }),
  });

async function pay(env: Record<string, string | undefined>, daraja: DarajaScript = {}) {
  const res = await loadHandler('mpesa-stk-push', env, daraja)(PAY_REQUEST());
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const ACCEPTED = () =>
  jsonResponse(200, { ResponseCode: '0', MerchantRequestID: 'mr-live-1', CheckoutRequestID: 'ws_CO_live_1', ResponseDescription: 'ok' });

describe('mpesa-stk-push — P1: fails closed, and disabled creates nothing (Q1)', () => {
  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['disabled', 'disabled'],
    ['a typo', 'lvie'],
    ['a capitalised word', 'Live'],
  ])('MPESA_MODE %s → 503 payments_unavailable, before any read, RPC or Daraja call', async (_label, mode) => {
    const r = await pay({ ...LIVE_ENV, MPESA_MODE: mode });
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ ok: false, code: 'payments_unavailable' });
    expect(mockEvents).toEqual([]);
    expect(mockCreateClientCalls).toBe(0);
    expect(darajaRequests).toEqual([]);
  });

  it('answers 503 even for a malformed request body (the mode is read first)', async () => {
    const handler = loadHandler('mpesa-stk-push', { ...LIVE_ENV, MPESA_MODE: 'disabled' });
    const res = await handler(new Request('https://fn.test/x', { method: 'POST', body: 'not json' }));
    expect(res.status).toBe(503);
  });

  it.each([
    ['live with the sandbox host', { MPESA_MODE: 'live', DARAJA_BASE_URL: 'https://sandbox.safaricom.co.ke' }],
    ['live with a missing passkey', { MPESA_MODE: 'live', DARAJA_PASSKEY: '' }],
    ['live with a missing callback URL', { MPESA_MODE: 'live', DARAJA_CALLBACK_URL: undefined }],
    ['sandbox with the production host', { MPESA_MODE: 'sandbox' }],
    ['an unknown DARAJA_TRANSACTION_TYPE', { DARAJA_TRANSACTION_TYPE: 'Till' }],
  ])('%s → 503 payments_unavailable and no attempt', async (_label, override) => {
    const r = await pay({ ...LIVE_ENV, ...override });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('payments_unavailable');
    expect(mockEvents).toEqual([]);
    expect(darajaRequests).toEqual([]);
    // the log names the problem by setting name, never by value
    expect(logged()).toMatch(/payments unavailable \(.*DARAJA_/);
    expectNoSecretInLogs();
  });
});

describe('mpesa-stk-push — S40-10: mock is refused in code on Production', () => {
  it('mock on the Production project → 503 payments_unavailable, nothing read or written', async () => {
    const r = await pay({ ...LIVE_ENV, SUPABASE_URL: PROD_URL, MPESA_MODE: 'mock' });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('payments_unavailable');
    expect(mockEvents).toEqual([]);
    expect(darajaRequests).toEqual([]);
    expect(logged()).toContain('MPESA_MODE=mock is refused on Production');
  });

  it('mock with no SUPABASE_URL → 503 (cannot prove it is not Production)', async () => {
    const r = await pay({ ...LIVE_ENV, SUPABASE_URL: undefined, MPESA_MODE: 'mock' });
    expect(r.status).toBe(503);
    expect(mockEvents).toEqual([]);
  });

  it('mock on a non-Production project still works (QA): reserved, mock-accepted, no Daraja call', async () => {
    const r = await pay({ ...LIVE_ENV, SUPABASE_URL: QA_URL, MPESA_MODE: 'mock' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, status: 'pending' });
    expect(String(r.body.checkoutRequestId)).toMatch(/^ws_CO_MOCK-/);
    expect(darajaRequests).toEqual([]);
    expect(mockEvents).toEqual(['read:payments', 'read:bookings', 'rpc:reserve_mpesa_attempt', 'rpc:mark_attempt_accepted']);
  });
});

describe('mpesa-stk-push — P3: an amount M-PESA cannot take never reaches Safaricom (Q4, Q5)', () => {
  it.each([
    ['a fractional due (percentage promo)', { amount: 1499, promo_discount: 149.9 }],
    ['a due below KES 1', { amount: 100, wallet_applied: 100 }],
    ['a due above KES 250,000 (Q5)', { amount: 300000 }],
  ])('%s → 422 amount_not_payable BEFORE the reservation: no attempt, no OAuth, no STK', async (_label, row) => {
    mockDb.payment = { ...(mockDb.payment as Record<string, unknown>), ...row };
    const r = await pay(LIVE_ENV, { push: ACCEPTED });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('amount_not_payable');
    expect(mockEvents).toEqual(['read:payments', 'read:bookings']);
    expect(darajaRequests).toEqual([]);
  });

  it('a reserved amount that is not whole → the attempt is released as failed and nothing is sent (Q4)', async () => {
    mockDb.rpc.reserve_mpesa_attempt = { data: { attempt_id: 'att-frac', amount: 999.5 }, error: null };
    const r = await pay(LIVE_ENV, { push: ACCEPTED });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('amount_not_payable');
    expect(mockEvents).toEqual([
      'read:payments',
      'read:bookings',
      'daraja:oauth',
      'rpc:reserve_mpesa_attempt',
      'rpc:mark_attempt_failed',
    ]);
    const release = mockRpcCalls.find((c) => c.name === 'mark_attempt_failed');
    expect(release?.args).toMatchObject({ p_attempt_id: 'att-frac', p_raw: null });
    expect(String(release?.args.p_reason)).toContain('M-PESA was not contacted');
    expect(darajaRequests.some((d) => d.url.includes('stkpush/v1'))).toBe(false);
  });

  it('a reserved amount above the limit is released the same way (Q5)', async () => {
    mockDb.rpc.reserve_mpesa_attempt = { data: { attempt_id: 'att-big', amount: 250001 }, error: null };
    const r = await pay(LIVE_ENV, { push: ACCEPTED });
    expect(r.status).toBe(422);
    expect(mockRpcCalls.map((c) => c.name)).toEqual(['reserve_mpesa_attempt', 'mark_attempt_failed']);
  });
});

describe('mpesa-stk-push — P5: a credential failure creates no attempt (Q6)', () => {
  it.each([
    ['HTTP 400 (bad credentials)', () => jsonResponse(400, { errorMessage: 'Invalid Authentication passed' })],
    ['HTTP 500', () => jsonResponse(500, {})],
    ['a 2xx with no token', () => jsonResponse(200, { expires_in: '3599' })],
  ])('OAuth %s → 503 payments_unavailable, no reservation, no STK', async (_label, oauth) => {
    const r = await pay(LIVE_ENV, { oauth, push: ACCEPTED });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('payments_unavailable');
    expect(mockEvents).toEqual(['read:payments', 'read:bookings', 'daraja:oauth']);
    expect(mockRpcCalls).toEqual([]);
    expectNoSecretInLogs();
  });

  it('the OAuth request comes before the reservation, and the STK request after it', async () => {
    await pay(LIVE_ENV, { push: ACCEPTED });
    expect(mockEvents).toEqual([
      'read:payments',
      'read:bookings',
      'daraja:oauth',
      'rpc:reserve_mpesa_attempt',
      'daraja:stkpush',
      'rpc:mark_attempt_accepted',
    ]);
  });
});

describe('mpesa-stk-push — P2 and P6: what Safaricom receives (Q3)', () => {
  it('a Paybill request (defaults): KwikServe, CustomerPayBillOnline, PartyB = shortcode, exact amount', async () => {
    const r = await pay(LIVE_ENV, { push: ACCEPTED });
    expect(r).toEqual({ status: 200, body: { ok: true, checkoutRequestId: 'ws_CO_live_1', status: 'pending' } });
    const sent = darajaRequests.find((d) => d.url.endsWith('/mpesa/stkpush/v1/processrequest'))?.body;
    expect(sent).toMatchObject({
      BusinessShortCode: '600000',
      TransactionType: 'CustomerPayBillOnline',
      Amount: 1500,
      PartyA: '254712345678',
      PartyB: '600000',
      PhoneNumber: '254712345678',
      TransactionDesc: 'KwikServe',
      AccountReference: 'booking-0123',
    });
    expect(String(sent?.TransactionDesc).length).toBeLessThanOrEqual(13);
    expect(String(sent?.AccountReference).length).toBeLessThanOrEqual(12);
    expect(darajaRequests[0].url).toBe('https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials');
  });

  it('a Till request: CustomerBuyGoodsOnline with the Till as PartyB', async () => {
    await pay({ ...LIVE_ENV, DARAJA_TRANSACTION_TYPE: 'CustomerBuyGoodsOnline', DARAJA_PARTY_B: '5566778' }, { push: ACCEPTED });
    const sent = darajaRequests.find((d) => d.url.includes('stkpush/v1'))?.body;
    expect(sent).toMatchObject({ BusinessShortCode: '600000', TransactionType: 'CustomerBuyGoodsOnline', PartyB: '5566778' });
  });

  it('sandbox mode reaches the sandbox host', async () => {
    await pay({ ...LIVE_ENV, MPESA_MODE: 'sandbox', DARAJA_BASE_URL: 'https://sandbox.safaricom.co.ke/' }, { push: ACCEPTED });
    expect(darajaRequests.map((d) => d.url)).toEqual([
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
    ]);
  });
});

describe('mpesa-stk-push — P7: every refusal carries a stable code', () => {
  it('bad body → invalid_request', async () => {
    const handler = loadHandler('mpesa-stk-push', LIVE_ENV);
    const res = await handler(new Request('https://fn.test/x', { method: 'POST', body: JSON.stringify({ payment_id: 'p', phone: '07' }) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'invalid_request' });
  });

  it('payment not pending → not_payable', async () => {
    mockDb.payment = { ...(mockDb.payment as Record<string, unknown>), status: 'paid' };
    expect((await pay(LIVE_ENV)).body.code).toBe('not_payable');
  });

  it('booking not completed → job_not_completed', async () => {
    mockDb.booking = { id: 'b', status: 'in_progress' };
    expect((await pay(LIVE_ENV)).body.code).toBe('job_not_completed');
  });

  it('an open attempt → 409 payment_in_progress; any other reservation error → could_not_start', async () => {
    mockDb.rpc.reserve_mpesa_attempt = { data: null, error: { message: 'Payment has an open external attempt' } };
    const open = await pay(LIVE_ENV, { push: ACCEPTED });
    expect(open.status).toBe(409);
    expect(open.body.code).toBe('payment_in_progress');

    mockDb.rpc.reserve_mpesa_attempt = { data: null, error: { message: 'No external amount due' } };
    expect((await pay(LIVE_ENV, { push: ACCEPTED })).body.code).toBe('could_not_start');
  });

  it('a non-2xx STK answer → 502 status_unknown and the attempt is NOT failed', async () => {
    const r = await pay(LIVE_ENV, { push: () => jsonResponse(503, { errorMessage: 'busy' }) });
    expect(r.status).toBe(502);
    expect(r.body.code).toBe('status_unknown');
    expect(mockRpcCalls.map((c) => c.name)).toEqual(['reserve_mpesa_attempt']);
  });

  it('a definitive STK rejection → request_rejected and the attempt is failed (retry allowed)', async () => {
    const r = await pay(LIVE_ENV, { push: () => jsonResponse(200, { ResponseCode: '1', ResponseDescription: 'Rejected' }) });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('request_rejected');
    expect(mockRpcCalls.map((c) => c.name)).toEqual(['reserve_mpesa_attempt', 'mark_attempt_failed']);
  });

  it('acceptance not saved → 500 not_recorded, no retry and no failure', async () => {
    mockDb.rpc.mark_attempt_accepted = { error: { message: 'db down' } };
    const r = await pay(LIVE_ENV, { push: ACCEPTED });
    expect(r.status).toBe(500);
    expect(r.body.code).toBe('not_recorded');
    expect(darajaRequests.filter((d) => d.url.includes('stkpush/v1'))).toHaveLength(1);
    expect(mockRpcCalls.map((c) => c.name)).toEqual(['reserve_mpesa_attempt', 'mark_attempt_accepted']);
  });

  it('the app has a text for exactly the codes the function can send', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/mpesa-stk-push/index.ts'), 'utf-8');
    const sent = new Set([...src.matchAll(/fail\(\s*'([a-z_]+)'/g)].map((m) => m[1]));
    const declared = new Set([...(src.match(/type StkErrorCode =([\s\S]*?);/)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
    expect(sent.size).toBeGreaterThan(5);
    expect([...sent].sort()).toEqual([...declared].sort());
    expect(Object.keys(MPESA_ERROR_TEXTS).sort()).toEqual([...declared].sort());
  });
});

// ─── mpesa-callback (P4a, S40-2) ──────────────────────────────────────────────

const CHECKOUT_ID = 'ws_CO_callback_synthetic';

function callbackBody(resultCode: unknown, checkoutRequestId: string | null = CHECKOUT_ID) {
  const stk: Record<string, unknown> = { MerchantRequestID: 'mr-cb', ResultCode: resultCode, ResultDesc: 'synthetic' };
  if (checkoutRequestId) stk.CheckoutRequestID = checkoutRequestId;
  if (resultCode === 0) {
    stk.CallbackMetadata = {
      Item: [
        { Name: 'Amount', Value: 1500 },
        { Name: 'MpesaReceiptNumber', Value: 'SYNTHETIC01' },
      ],
    };
  }
  return { Body: { stkCallback: stk } };
}

async function callback(body: unknown, daraja: DarajaScript, env: Record<string, string | undefined> = LIVE_ENV, token = CALLBACK_SECRET) {
  const handler = loadHandler('mpesa-callback', env, daraja);
  const res = await handler(
    new Request(`https://fn.test/mpesa-callback?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const queryAnswer = (resultCode: string, checkoutRequestId = CHECKOUT_ID) => () =>
  jsonResponse(200, { ResponseCode: '0', CheckoutRequestID: checkoutRequestId, ResultCode: resultCode, ResultDesc: 'synthetic' });
const STILL_PROCESSING = () => jsonResponse(500, { errorCode: '500.001.1001', errorMessage: 'The transaction is being processed' });
const UNKNOWN_REQUEST = () => jsonResponse(400, { errorCode: '400.002.02', errorMessage: 'Bad Request - Invalid CheckoutRequestID' });

describe('mpesa-callback — P4a: a success is applied only when Safaricom confirms it (Q7)', () => {
  it('confirmed success → the certified database path runs and the callback is acknowledged', async () => {
    const r = await callback(callbackBody(0), { query: [queryAnswer('0')] });
    expect(r).toEqual({ status: 200, body: { ResultCode: 0, ResultDesc: 'Accepted' } });
    expect(mockEvents).toEqual(['daraja:oauth', 'daraja:query', 'rpc:apply_or_record_mpesa_callback']);
    expect(mockRpcCalls[0].args).toMatchObject({ p_checkout_request_id: CHECKOUT_ID, p_result_code: 0 });
    // the query asked about exactly this request, with the same shortcode
    const asked = darajaRequests.find((d) => d.url.endsWith('/mpesa/stkpushquery/v1/query'))?.body;
    expect(asked).toMatchObject({ CheckoutRequestID: CHECKOUT_ID, BusinessShortCode: '600000' });
  });

  it('FORGED success (Safaricom says the request failed) → 409, nothing applied, no database call', async () => {
    const r = await callback(callbackBody(0), { query: [queryAnswer('1032')] });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ ResultCode: 1, ResultDesc: 'Success not confirmed by M-PESA; not applied' });
    // not recorded either: no 0054 classification fits "a known request that failed"
    expect(mockRpcCalls).toEqual([]);
    expect(logged()).toContain('M-PESA answered not_successful');
  });

  it('S43-1(a): FORGED success for an ID Safaricom does not know → recorded ONCE as unknown_checkout_request_id, then 409, never settled', async () => {
    const body = callbackBody(0);
    const r = await callback(body, { query: [UNKNOWN_REQUEST] });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ ResultCode: 1, ResultDesc: 'Success not confirmed by M-PESA; not applied' });
    // order: Safaricom's verdict first, then the recording (the 409 is the answer above)
    expect(mockEvents).toEqual(['daraja:oauth', 'daraja:query', 'rpc:record_mpesa_callback_event']);
    // exactly one database call: the evidence recording, never a settle call
    expect(mockRpcCalls).toHaveLength(1);
    expect(mockRpcCalls[0]).toEqual({
      name: 'record_mpesa_callback_event',
      args: {
        p_classification: 'unknown_checkout_request_id',
        p_checkout_request_id: CHECKOUT_ID,
        p_merchant_request_id: 'mr-cb',
        p_result_code: 0,
        p_result_desc: 'synthetic',
        p_raw: body,
        p_raw_sha256: null,
      },
    });
    expect(mockRpcCalls.map((c) => c.name)).not.toContain('apply_or_record_mpesa_callback');
    expect(logged()).toContain('M-PESA answered unknown_request; recorded as evidence');
  });

  it('S43-1(a): if that recording fails → 500 (a redelivery can record it), still never settled', async () => {
    mockDb.rpc.record_mpesa_callback_event = { data: null, error: { message: 'db down' } };
    const r = await callback(callbackBody(0), { query: [UNKNOWN_REQUEST] });
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ ResultCode: 1, ResultDesc: 'Callback not durably handled; retry' });
    expect(mockRpcCalls.map((c) => c.name)).toEqual(['record_mpesa_callback_event']);
  });

  it('a definite answer is not retried', async () => {
    await callback(callbackBody(0), { query: [queryAnswer('1037')] });
    expect(mockEvents.filter((e) => e === 'daraja:query')).toHaveLength(1);
  });
});

describe('mpesa-callback — S40-2: an indeterminate answer is retried, then left to the timeout path', () => {
  it('still processing ×3 → 500 (Safaricom may redeliver), nothing applied, never a 409', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    const pending = callback(callbackBody(0), { query: [STILL_PROCESSING, STILL_PROCESSING, STILL_PROCESSING] });
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(4000);
    const r = await pending;
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ ResultCode: 1, ResultDesc: 'Success not yet confirmed with M-PESA; retry' });
    expect(mockEvents.filter((e) => e === 'daraja:query')).toHaveLength(3);
    expect(mockRpcCalls).toEqual([]);
    expect(logged()).not.toContain('refused');
  });

  it('rate-limited, then confirmed → applied on the second try', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    const pending = callback(callbackBody(0), { query: [() => jsonResponse(429, {}), queryAnswer('0')] });
    await jest.advanceTimersByTimeAsync(2000);
    const r = await pending;
    expect(r.status).toBe(200);
    expect(mockRpcCalls.map((c) => c.name)).toEqual(['apply_or_record_mpesa_callback']);
  });

  it('a network error, then a 4999 "still under processing", then confirmed → applied on the third try', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    const pending = callback(callbackBody(0), {
      query: [
        () => {
          throw new TypeError('network error');
        },
        queryAnswer('4999'),
        queryAnswer('0'),
      ],
    });
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(4000);
    const r = await pending;
    expect(r.status).toBe(200);
    expect(mockRpcCalls.map((c) => c.name)).toEqual(['apply_or_record_mpesa_callback']);
  });

  it('OAuth failing on every try → 500, nothing applied, never a 409', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    const pending = callback(callbackBody(0), { oauth: () => jsonResponse(401, {}), query: [] });
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(4000);
    const r = await pending;
    expect(r.status).toBe(500);
    expect(mockEvents.filter((e) => e === 'daraja:oauth')).toHaveLength(3);
    expect(mockRpcCalls).toEqual([]);
  });

  it('missing Daraja settings in the callback function → 500 (timeout path), never a 409', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    const pending = callback(callbackBody(0), { query: [] }, { ...LIVE_ENV, DARAJA_PASSKEY: undefined });
    await jest.advanceTimersByTimeAsync(6000);
    const r = await pending;
    expect(r.status).toBe(500);
    expect(darajaRequests).toEqual([]);
    expect(mockRpcCalls).toEqual([]);
  });
});

describe('mpesa-callback — everything that cannot settle is unchanged (no query)', () => {
  it.each([1032, 1037, 1])('a failure callback (ResultCode %p) goes straight to the database, unqueried', async (code) => {
    const r = await callback(callbackBody(code), {});
    expect(r.status).toBe(200);
    expect(darajaRequests).toEqual([]);
    expect(mockRpcCalls.map((c) => c.name)).toEqual(['apply_or_record_mpesa_callback']);
  });

  it('a success-shaped body without a CheckoutRequestID is recorded as evidence, unqueried', async () => {
    const r = await callback(callbackBody(0, null), {});
    expect(r.status).toBe(200);
    expect(darajaRequests).toEqual([]);
    expect(mockRpcCalls.map((c) => c.name)).toEqual(['record_mpesa_callback_event']);
  });

  it('a wrong token → 401 before any query or database access', async () => {
    const r = await loadHandler('mpesa-callback', LIVE_ENV, { query: [queryAnswer('0')] })(
      new Request('https://fn.test/mpesa-callback?token=wrong', { method: 'POST', body: JSON.stringify(callbackBody(0)) }),
    );
    expect(r.status).toBe(401);
    expect(darajaRequests).toEqual([]);
    expect(mockCreateClientCalls).toBe(0);
  });

  it('never reads MPESA_MODE: with payments disabled, a confirmed success still settles', async () => {
    const r = await callback(callbackBody(0), { query: [queryAnswer('0')] }, { ...LIVE_ENV, MPESA_MODE: 'disabled' });
    expect(r.status).toBe(200);
    expect(mockRpcCalls.map((c) => c.name)).toEqual(['apply_or_record_mpesa_callback']);
  });

  it('logs no setting value, token, phone or body', async () => {
    await callback(callbackBody(0), { query: [queryAnswer('1032')] });
    expectNoSecretInLogs();
    expect(logged()).not.toContain('SYNTHETIC01');
  });
});

// ─── S43-2: a non-integer ResultCode is malformed evidence ────────────────────

/** Send the callback as exact raw text, so number forms such as 1e0 or 0.0 reach the handler. */
async function callbackRaw(rawText: string, daraja: DarajaScript = {}) {
  const handler = loadHandler('mpesa-callback', LIVE_ENV, daraja);
  const res = await handler(
    new Request(`https://fn.test/mpesa-callback?token=${encodeURIComponent(CALLBACK_SECRET)}`, {
      method: 'POST',
      body: rawText,
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** A success-looking callback (with collection evidence) whose ResultCode is written as `literal`. */
const rawSuccessWith = (literal: string) =>
  `{"Body":{"stkCallback":{"MerchantRequestID":"mr-cb","CheckoutRequestID":"${CHECKOUT_ID}","ResultCode":${literal},` +
  `"ResultDesc":"synthetic","CallbackMetadata":{"Item":[{"Name":"Amount","Value":1500},{"Name":"MpesaReceiptNumber","Value":"SYNTHETIC01"}]}}}}`;

/** The one evidence call a malformed body must produce: the existing malformed path. */
function expectRecordedAsMalformed() {
  expect(mockRpcCalls).toHaveLength(1);
  expect(mockRpcCalls[0].name).toBe('record_mpesa_callback_event');
  expect(mockRpcCalls[0].args).toMatchObject({
    p_classification: 'malformed_authenticated_callback',
    p_checkout_request_id: null,
    p_result_code: null,
    p_raw_sha256: null,
  });
  expect(mockRpcCalls.map((c) => c.name)).not.toContain('apply_or_record_mpesa_callback');
  expect(darajaRequests).toEqual([]);
}

describe('mpesa-callback — S43-2: a non-integer ResultCode is malformed evidence, never applied', () => {
  it('the existing malformed path (a JSON body that is not Daraja-shaped), for comparison', async () => {
    const r = await callback({ hello: 'world' }, {});
    expect(r).toEqual({ status: 200, body: { ResultCode: 0, ResultDesc: 'Accepted' } });
    expectRecordedAsMalformed();
    expect(mockRpcCalls[0].args.p_raw).toEqual({ hello: 'world' });
  });

  it('ResultCode 0.4 with collection evidence → recorded as malformed, not applied, no settle call, no query', async () => {
    const r = await callbackRaw(rawSuccessWith('0.4'), { query: [queryAnswer('0')] });
    expect(r).toEqual({ status: 200, body: { ResultCode: 0, ResultDesc: 'Accepted' } });
    expectRecordedAsMalformed();
    // the body still travels as evidence, but its ResultCode is never passed as a result code
    expect((mockRpcCalls[0].args.p_raw as { Body: { stkCallback: { ResultCode: unknown } } }).Body.stkCallback.ResultCode).toBe(0.4);
  });

  it.each(['1.5', '-0.5', '1e-7', '0.0', '1.0', '1e0', '0e0', '-0.0', '"0"', '"0.0"', '"1e0"', 'true', 'null', '{}', '[0]'])(
    'ResultCode written as %s → malformed evidence, never applied',
    async (literal) => {
      const r = await callbackRaw(rawSuccessWith(literal), { query: [queryAnswer('0')] });
      expect(r.status).toBe(200);
      expectRecordedAsMalformed();
    },
  );

  it('a plain 0 is still a success candidate (queried, then applied) — control', async () => {
    const r = await callbackRaw(rawSuccessWith('0'), { query: [queryAnswer('0')] });
    expect(r.status).toBe(200);
    expect(mockEvents).toEqual(['daraja:oauth', 'daraja:query', 'rpc:apply_or_record_mpesa_callback']);
    expect(mockRpcCalls[0].args).toMatchObject({ p_result_code: 0 });
  });

  it('a plain failure code is still applied unqueried — control', async () => {
    const r = await callbackRaw(rawSuccessWith('1032'), {});
    expect(r.status).toBe(200);
    expect(darajaRequests).toEqual([]);
    expect(mockRpcCalls.map((c) => c.name)).toEqual(['apply_or_record_mpesa_callback']);
    expect(mockRpcCalls[0].args).toMatchObject({ p_result_code: 1032 });
  });

  it('an ABSENT ResultCode keeps its certified 0054 route (apply; the database decides) — unchanged', async () => {
    const r = await callbackRaw(`{"Body":{"stkCallback":{"MerchantRequestID":"mr-cb","CheckoutRequestID":"${CHECKOUT_ID}"}}}`);
    expect(r.status).toBe(200);
    expect(darajaRequests).toEqual([]);
    expect(mockRpcCalls.map((c) => c.name)).toEqual(['apply_or_record_mpesa_callback']);
    expect(mockRpcCalls[0].args).toMatchObject({ p_result_code: null });
  });
});

describe('S43-2 pure helpers: parser and classifier', () => {
  const cb = (ResultCode: unknown) => ({ Body: { stkCallback: { CheckoutRequestID: 'ws_CO_1', ResultCode } } });

  it('the parser only returns a whole-number ResultCode; anything else is null', () => {
    expect(parseStkCallback(cb(0)).resultCode).toBe(0);
    expect(parseStkCallback(cb(1032)).resultCode).toBe(1032);
    for (const v of [0.4, 1.5, -0.5, 1e-7, NaN, Infinity, '0', '0.0', true, null, {}]) {
      expect(parseStkCallback(cb(v)).resultCode).toBeNull();
    }
  });

  it('hasInvalidResultCode: a present non-integer value is invalid; an absent one is not', () => {
    for (const v of [0.4, 1.5, '0', '0.0', '1e0', true, null, {}, []]) expect(hasInvalidResultCode(cb(v))).toBe(true);
    for (const v of [0, 1, 1032, -1]) expect(hasInvalidResultCode(cb(v))).toBe(false);
    expect(hasInvalidResultCode({ Body: { stkCallback: { CheckoutRequestID: 'x' } } })).toBe(false);
    expect(hasInvalidResultCode({ hello: 'world' })).toBe(false);
  });

  it('hasInvalidResultCode: with the raw text, an integer written as 1e0 / 0.0 / 1.0 is invalid too', () => {
    for (const lit of ['1e0', '0.0', '1.0', '0e0', '-0.0', '1E0']) {
      const raw = `{"Body":{"stkCallback":{"CheckoutRequestID":"x","ResultCode":${lit}}}}`;
      expect(hasInvalidResultCode(JSON.parse(raw), raw)).toBe(true);
    }
    for (const lit of ['0', '1', '1032', '-1']) {
      const raw = `{"Body":{"stkCallback":{"CheckoutRequestID":"x","ResultCode":${lit}}}}`;
      expect(hasInvalidResultCode(JSON.parse(raw), raw)).toBe(false);
    }
  });

  it('a duplicated ResultCode key is judged on every written value (JSON keeps only the last)', () => {
    const raw = '{"Body":{"stkCallback":{"CheckoutRequestID":"x","ResultCode":0.4,"ResultCode":0}}}';
    expect(resultCodeLiterals(raw)).toEqual(['0.4', '0']);
    expect(hasInvalidResultCode(JSON.parse(raw), raw)).toBe(true);
  });

  it('classify: invalid ResultCode → malformed even with a CheckoutRequestID; the 0054 routes are unchanged', () => {
    expect(classifyAuthenticatedCallback(cb(0.4), { checkoutRequestId: 'ws_CO_1' })).toBe('malformed_authenticated_callback');
    expect(classifyAuthenticatedCallback(cb(0), { checkoutRequestId: 'ws_CO_1' })).toBe('apply');
    expect(classifyAuthenticatedCallback({ Body: { stkCallback: {} } }, { checkoutRequestId: 'ws_CO_1' })).toBe('apply');
    expect(classifyAuthenticatedCallback({ Body: { stkCallback: { ResultCode: 0 } } }, { checkoutRequestId: null })).toBe(
      'missing_checkout_request_id',
    );
    expect(classifyAuthenticatedCallback({ Body: { stkCallback: { ResultCode: '0' } } }, { checkoutRequestId: null })).toBe(
      'malformed_authenticated_callback',
    );
    expect(classifyAuthenticatedCallback(null, { checkoutRequestId: null })).toBe('malformed_authenticated_callback');
  });
});

// ─── S43-1(a): the recording path cannot settle anything (static, from the migrations) ─

describe('S43-1(a): record_mpesa_callback_event only records evidence and alerts (migration proof)', () => {
  const dir = path.resolve(__dirname, '../../supabase/migrations');
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf-8').toLowerCase();
  const lastDefining = (name: string) =>
    files.filter((f) => read(f).includes(`create or replace function public.${name}(`)).pop() as string;
  /** The body of the LAST definition of a function: from its create to the next `end; $…$;`. */
  const body = (name: string) => {
    const text = read(lastDefining(name));
    const start = text.lastIndexOf(`create or replace function public.${name}(`);
    return text.slice(start, text.indexOf('end; $', start));
  };

  it('is still defined only by 0054, with both classifications this code uses', () => {
    expect(lastDefining('record_mpesa_callback_event')).toMatch(/^0054_/);
    const b = body('record_mpesa_callback_event');
    expect(b).toContain("'unknown_checkout_request_id'");
    expect(b).toContain("'malformed_authenticated_callback'");
  });

  it('writes only the evidence table, and never touches an attempt or a payment', () => {
    const b = body('record_mpesa_callback_event');
    expect(b.match(/insert into public\.[a-z_]+/g)).toEqual(['insert into public.mpesa_callback_events']);
    expect(b).not.toMatch(/update public\.(payments|payment_attempts)|delete from|insert into public\.(payments|payment_attempts)/);
    expect(b).not.toMatch(/apply_mpesa_callback|confirm_payment_attempt|mark_attempt_|reconcile_|override_payment/);
    // it only READS payment_attempts, to note an exact CheckoutRequestID match
    expect(b).toContain('select id into v_match from public.payment_attempts');
  });

  it('its only side call is the admin alert, whose chain writes notifications and a push only', () => {
    expect(body('record_mpesa_callback_event')).toMatch(/perform public\.notify_admins\(/);
    for (const fn of ['notify_admins', 'notify_user', 'notify_send_push']) {
      const b = body(fn);
      expect(b).not.toMatch(/payments|payment_attempts|mpesa_callback_events/);
    }
  });

  it('no trigger is attached to mpesa_callback_events in any migration', () => {
    for (const f of files) expect(read(f)).not.toMatch(/on (public\.)?mpesa_callback_events\s+for each/);
    for (const f of files) expect(read(f)).not.toMatch(/trigger[^;]*on (public\.)?mpesa_callback_events/);
  });
});
