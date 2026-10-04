/**
 * daraja.test.ts — Jest tests for the pure Daraja helper functions.
 *
 * The module lives at supabase/functions/_shared/daraja.ts.
 * We import it via a relative path so Jest can resolve it without any
 * special module mapping (the file uses no Deno-only APIs).
 *
 * Update 50 (live hardening) changed two old expectations ON PURPOSE:
 *   - an unset or unknown MPESA_MODE is now `disabled` (it used to be `mock`) — P1;
 *   - a fractional amount is now refused (it used to be rounded) — P3.
 * The new helpers (settings check, Production mock refusal, amount guard, OAuth reader and the
 * STK Push Query confirmation) are covered in the sections at the end of this file.
 */
import {
  darajaTimestamp,
  buildStkPassword,
  buildOAuthRequest,
  buildStkPushPayload,
  buildStkPushRequest,
  buildStkQueryRequest,
  parseStkCallback,
  normalizeKenyanPhone,
  isMsisdn,
  resolveMpesaMode,
  effectiveMpesaMode,
  isProductionProject,
  isMockMode,
  mockStkResult,
  checkDarajaSettings,
  isDarajaProductionUrl,
  darajaBaseUrl,
  checkMpesaAmount,
  externalAmountDue,
  readOAuthAnswer,
  interpretStkQuery,
  confirmStkSuccess,
  PRODUCTION_PROJECT_REF,
  REQUIRED_DARAJA_SETTINGS,
  STK_TRANSACTION_DESC,
  STK_TRANSACTION_DESC_MAX_LENGTH,
  STK_QUERY_MAX_TRIES,
  STK_QUERY_RETRY_DELAYS_MS,
  MPESA_MAX_AMOUNT_KES,
  type DarajaHttpResult,
} from '../../supabase/functions/_shared/daraja';

// ─── darajaTimestamp ──────────────────────────────────────────────────────────

describe('darajaTimestamp', () => {
  it('formats a UTC date as YYYYMMDDHHmmss', () => {
    const date = new Date(Date.UTC(2026, 0, 2, 3, 4, 5));
    expect(darajaTimestamp(date)).toBe('20260102030405');
  });

  it('zero-pads single-digit month, day, hour, minute, second', () => {
    const date = new Date(Date.UTC(2025, 0, 1, 1, 1, 1));
    expect(darajaTimestamp(date)).toBe('20250101010101');
  });
});

// ─── buildStkPassword ─────────────────────────────────────────────────────────

describe('buildStkPassword', () => {
  it('returns base64(shortcode + passkey + timestamp)', () => {
    const shortcode = '174379';
    const passkey = 'passkey';
    const timestamp = '20260102030405';
    const expected = btoa(`${shortcode}${passkey}${timestamp}`);
    expect(buildStkPassword(shortcode, passkey, timestamp)).toBe(expected);
  });
});

// ─── buildOAuthRequest ────────────────────────────────────────────────────────

describe('buildOAuthRequest', () => {
  const result = buildOAuthRequest('https://x', 'ck', 'cs');

  it('url ends with /oauth/v1/generate?grant_type=client_credentials', () => {
    expect(result.url).toMatch(/\/oauth\/v1\/generate\?grant_type=client_credentials$/);
  });

  it('method is GET', () => {
    expect(result.method).toBe('GET');
  });

  it('Authorization header is Basic base64(consumerKey:consumerSecret)', () => {
    expect(result.headers.Authorization).toBe('Basic ' + btoa('ck:cs'));
  });
});

// ─── buildStkPushPayload ──────────────────────────────────────────────────────

describe('buildStkPushPayload', () => {
  const params = {
    shortcode: '174379',
    password: 'pw',
    timestamp: '20260102030405',
    amount: 1500,
    phone: '254712345678',
    callbackUrl: 'https://example.com/callback',
    accountReference: 'BK001',
    transactionDesc: 'Booking payment',
  };
  const payload = buildStkPushPayload(params);

  it('sends a whole-shilling Amount exactly as given', () => {
    expect(payload['Amount']).toBe(1500);
  });

  it('REFUSES a fractional amount instead of rounding it (P3)', () => {
    // Rounding charged the customer an amount that could never settle (exact-match rule).
    expect(() => buildStkPushPayload({ ...params, amount: 1500.7 })).toThrow(/not a whole number/);
    expect(() => buildStkPushPayload({ ...params, amount: 0 })).toThrow(/below KES 1/);
    expect(() => buildStkPushPayload({ ...params, amount: MPESA_MAX_AMOUNT_KES + 1 })).toThrow(/250,000/);
  });

  it('sets TransactionType to CustomerPayBillOnline', () => {
    expect(payload['TransactionType']).toBe('CustomerPayBillOnline');
  });

  it('sets PhoneNumber to the provided phone', () => {
    expect(payload['PhoneNumber']).toBe('254712345678');
  });

  it('sets PartyA to the provided phone', () => {
    expect(payload['PartyA']).toBe('254712345678');
  });

  it('sets CallBackURL', () => {
    expect(payload['CallBackURL']).toBe('https://example.com/callback');
  });

  it('sets BusinessShortCode and PartyB to shortcode', () => {
    expect(payload['BusinessShortCode']).toBe('174379');
    expect(payload['PartyB']).toBe('174379');
  });

  it('P6: a Till uses CustomerBuyGoodsOnline and its own PartyB; the shortcode stays the business code', () => {
    const till = buildStkPushPayload({
      ...params,
      transactionType: 'CustomerBuyGoodsOnline',
      partyB: '5566778',
    });
    expect(till['TransactionType']).toBe('CustomerBuyGoodsOnline');
    expect(till['PartyB']).toBe('5566778');
    expect(till['BusinessShortCode']).toBe('174379');
  });
});

// ─── buildStkPushRequest ──────────────────────────────────────────────────────

describe('buildStkPushRequest', () => {
  const testPayload = { a: 1 };
  const result = buildStkPushRequest('https://x', 'tok', testPayload);

  it('url ends with /mpesa/stkpush/v1/processrequest', () => {
    expect(result.url).toMatch(/\/mpesa\/stkpush\/v1\/processrequest$/);
  });

  it('method is POST', () => {
    expect(result.method).toBe('POST');
  });

  it('Authorization header is Bearer <token>', () => {
    expect(result.headers.Authorization).toBe('Bearer tok');
  });

  it('Content-Type header is application/json', () => {
    expect(result.headers['Content-Type']).toBe('application/json');
  });

  it('body is the provided payload', () => {
    expect(result.body).toBe(testPayload);
  });
});

// ─── parseStkCallback ─────────────────────────────────────────────────────────

describe('parseStkCallback', () => {
  it('parses a successful callback correctly', () => {
    const body = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'm',
          CheckoutRequestID: 'c',
          ResultCode: 0,
          ResultDesc: 'ok',
        },
      },
    };
    expect(parseStkCallback(body)).toEqual({
      merchantRequestId: 'm',
      checkoutRequestId: 'c',
      resultCode: 0,
      resultDesc: 'ok',
    });
  });

  it('parses a failure callback with ResultCode 1032', () => {
    const body = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'mr2',
          CheckoutRequestID: 'cr2',
          ResultCode: 1032,
          ResultDesc: 'Request cancelled by user',
        },
      },
    };
    const parsed = parseStkCallback(body);
    expect(parsed.resultCode).toBe(1032);
    expect(parsed.resultDesc).toBe('Request cancelled by user');
  });

  it('returns all nulls for an empty object', () => {
    expect(parseStkCallback({})).toEqual({
      merchantRequestId: null,
      checkoutRequestId: null,
      resultCode: null,
      resultDesc: null,
    });
  });

  it('returns all nulls for null input', () => {
    expect(parseStkCallback(null)).toEqual({
      merchantRequestId: null,
      checkoutRequestId: null,
      resultCode: null,
      resultDesc: null,
    });
  });
});

// ─── normalizeKenyanPhone ─────────────────────────────────────────────────────

describe('normalizeKenyanPhone', () => {
  it('normalizes 07XXXXXXXX to 254712345678', () => {
    expect(normalizeKenyanPhone('0712345678')).toBe('254712345678');
  });

  it('strips leading + and normalizes +254712345678', () => {
    expect(normalizeKenyanPhone('+254712345678')).toBe('254712345678');
  });

  it('returns null for short number 12345', () => {
    expect(normalizeKenyanPhone('12345')).toBeNull();
  });

  it('passes through an already-normalized international number', () => {
    expect(normalizeKenyanPhone('254712345678')).toBe('254712345678');
  });
});

// ─── isMsisdn ─────────────────────────────────────────────────────────────────

describe('isMsisdn', () => {
  it('returns true for a valid normalized MSISDN', () => {
    expect(isMsisdn('254712345678')).toBe(true);
  });

  it('returns false for a local-format number (not normalized)', () => {
    expect(isMsisdn('0712345678')).toBe(false);
  });

  it('returns false for an invalid number', () => {
    expect(isMsisdn('12345')).toBe(false);
  });
});

// ─── resolveMpesaMode ─────────────────────────────────────────────────────────

describe('resolveMpesaMode (P1: fail closed)', () => {
  it('returns disabled when value is undefined (it used to be mock)', () => {
    expect(resolveMpesaMode(undefined)).toBe('disabled');
  });

  it('returns disabled when value is empty', () => {
    expect(resolveMpesaMode('')).toBe('disabled');
  });

  it('returns disabled when value is "disabled"', () => {
    expect(resolveMpesaMode('disabled')).toBe('disabled');
  });

  it('returns mock when value is "mock"', () => {
    expect(resolveMpesaMode('mock')).toBe('mock');
  });

  it('returns sandbox when value is "sandbox"', () => {
    expect(resolveMpesaMode('sandbox')).toBe('sandbox');
  });

  it('returns live when value is "live"', () => {
    expect(resolveMpesaMode('live')).toBe('live');
  });

  it('returns disabled for an unrecognised value (it used to be mock)', () => {
    expect(resolveMpesaMode('bogus')).toBe('disabled');
  });

  it.each(['Live', 'LIVE', ' live', 'live ', 'lve', 'Mock', 'production'])(
    'returns disabled for the near-miss %p, never mock or live',
    (v) => {
      expect(resolveMpesaMode(v)).toBe('disabled');
    },
  );
});

// ─── effectiveMpesaMode (S40-10: no mock on Production) ───────────────────────

describe('effectiveMpesaMode (S40-10)', () => {
  const PROD = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
  const QA = 'https://qaprojectref0000000000.supabase.co';

  it('the Production ref is the one the plan names', () => {
    expect(PRODUCTION_PROJECT_REF).toBe('lkigkltvstlxfdztffds');
  });

  it('turns mock into disabled on the Production project', () => {
    expect(effectiveMpesaMode('mock', PROD)).toBe('disabled');
  });

  it('matches the Production ref whatever the case or trailing slash', () => {
    expect(effectiveMpesaMode('mock', PROD.toUpperCase() + '/')).toBe('disabled');
  });

  it('turns mock into disabled when SUPABASE_URL is missing (cannot prove it is not Production)', () => {
    expect(effectiveMpesaMode('mock', undefined)).toBe('disabled');
    expect(effectiveMpesaMode('mock', '')).toBe('disabled');
  });

  it('keeps mock on a non-Production project (QA, local)', () => {
    expect(effectiveMpesaMode('mock', QA)).toBe('mock');
    expect(effectiveMpesaMode('mock', 'http://127.0.0.1:54321')).toBe('mock');
  });

  it('leaves live, sandbox and disabled unchanged on Production', () => {
    expect(effectiveMpesaMode('live', PROD)).toBe('live');
    expect(effectiveMpesaMode('sandbox', PROD)).toBe('sandbox');
    expect(effectiveMpesaMode('disabled', PROD)).toBe('disabled');
  });

  it('still fails closed for an unknown value anywhere', () => {
    expect(effectiveMpesaMode('bogus', QA)).toBe('disabled');
    expect(effectiveMpesaMode(undefined, PROD)).toBe('disabled');
  });

  it('isProductionProject is true only for the Production ref', () => {
    expect(isProductionProject(PROD)).toBe(true);
    expect(isProductionProject(QA)).toBe(false);
    expect(isProductionProject(undefined)).toBe(false);
  });
});

// ─── isMockMode ───────────────────────────────────────────────────────────────

describe('isMockMode', () => {
  it('returns true when mode is mock', () => {
    expect(isMockMode('mock')).toBe(true);
  });

  it('returns false when mode is live', () => {
    expect(isMockMode('live')).toBe(false);
  });

  it('returns false when mode is sandbox', () => {
    expect(isMockMode('sandbox')).toBe(false);
  });
});

// ─── mockStkResult ────────────────────────────────────────────────────────────

describe('mockStkResult', () => {
  const result = mockStkResult({ phone: '254712345678', amount: 1500 });

  it('responseCode is always "0"', () => {
    expect(result.responseCode).toBe('0');
  });

  it('checkoutRequestId starts with "ws_CO_"', () => {
    expect(result.checkoutRequestId).toMatch(/^ws_CO_/);
  });

  it('raw is a plain object', () => {
    expect(typeof result.raw).toBe('object');
    expect(result.raw).not.toBeNull();
  });

  it('raw has ResponseCode "0"', () => {
    expect(result.raw['ResponseCode']).toBe('0');
  });

  it('merchantRequestId is a non-empty string', () => {
    expect(typeof result.merchantRequestId).toBe('string');
    expect(result.merchantRequestId.length).toBeGreaterThan(0);
  });
});

// ─── STK description (P2) ─────────────────────────────────────────────────────

describe('STK_TRANSACTION_DESC (P2)', () => {
  it('is the new brand, KwikServe', () => {
    expect(STK_TRANSACTION_DESC).toBe('KwikServe');
  });

  it('fits the Daraja 13-character TransactionDesc limit', () => {
    expect(STK_TRANSACTION_DESC_MAX_LENGTH).toBe(13);
    expect(STK_TRANSACTION_DESC.length).toBeLessThanOrEqual(STK_TRANSACTION_DESC_MAX_LENGTH);
  });
});

// ─── checkDarajaSettings (P1, P6) ─────────────────────────────────────────────

describe('checkDarajaSettings (P1, P6)', () => {
  // Obviously fake values; the point is that none of them may appear in a `problem` text.
  const LIVE: Record<string, string> = {
    DARAJA_BASE_URL: 'https://api.safaricom.co.ke',
    DARAJA_CONSUMER_KEY: 'fake-consumer-key-value',
    DARAJA_CONSUMER_SECRET: 'fake-consumer-secret-value',
    DARAJA_SHORTCODE: '600000',
    DARAJA_PASSKEY: 'fake-passkey-value',
    DARAJA_CALLBACK_URL: 'https://example.test/functions/v1/mpesa-callback?token=fake-callback-value',
  };
  const SANDBOX: Record<string, string> = { ...LIVE, DARAJA_BASE_URL: 'https://sandbox.safaricom.co.ke' };
  const reader = (settings: Record<string, string | undefined>) => (name: string) => settings[name];

  it('accepts live with every setting and the production host', () => {
    const r = checkDarajaSettings('live', reader(LIVE));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.settings.baseUrl).toBe('https://api.safaricom.co.ke');
      expect(r.settings.shortcode).toBe('600000');
    }
  });

  it('accepts the production host with a trailing slash and strips it', () => {
    const r = checkDarajaSettings('live', reader({ ...LIVE, DARAJA_BASE_URL: 'https://api.safaricom.co.ke/' }));
    expect(r.ok && r.settings.baseUrl).toBe('https://api.safaricom.co.ke');
  });

  it.each([
    ['the sandbox host', 'https://sandbox.safaricom.co.ke'],
    ['plain http', 'http://api.safaricom.co.ke'],
    ['a look-alike host', 'https://api.safaricom.co.ke.example.test'],
    ['a path', 'https://api.safaricom.co.ke/v1'],
    ['a port', 'https://api.safaricom.co.ke:8443'],
    ['garbage', 'not a url'],
  ])('refuses live with %s', (_label, url) => {
    const r = checkDarajaSettings('live', reader({ ...LIVE, DARAJA_BASE_URL: url }));
    expect(r).toEqual({ ok: false, problem: 'live mode needs DARAJA_BASE_URL to be the production host' });
  });

  it('accepts sandbox with the sandbox host', () => {
    expect(checkDarajaSettings('sandbox', reader(SANDBOX)).ok).toBe(true);
  });

  it.each(['https://api.safaricom.co.ke', 'https://api.safaricom.co.ke/', 'http://api.safaricom.co.ke/x'])(
    'refuses sandbox with the production host %p',
    (url) => {
      const r = checkDarajaSettings('sandbox', reader({ ...SANDBOX, DARAJA_BASE_URL: url }));
      expect(r).toEqual({ ok: false, problem: 'sandbox mode refuses the production host in DARAJA_BASE_URL' });
    },
  );

  it.each(REQUIRED_DARAJA_SETTINGS.map((name) => [name]))('refuses live when %s is missing or blank', (name) => {
    for (const value of [undefined, '', '   ']) {
      const r = checkDarajaSettings('live', reader({ ...LIVE, [name]: value }));
      expect(r).toEqual({ ok: false, problem: `missing setting ${name}` });
    }
  });

  it('lists every missing setting by name', () => {
    const r = checkDarajaSettings('sandbox', reader({}));
    expect(r).toEqual({ ok: false, problem: `missing setting ${REQUIRED_DARAJA_SETTINGS.join(', ')}` });
  });

  it('never puts a setting value into the problem text', () => {
    const problems = [
      checkDarajaSettings('live', reader({ ...LIVE, DARAJA_BASE_URL: 'https://sandbox.safaricom.co.ke' })),
      checkDarajaSettings('live', reader({ ...LIVE, DARAJA_PASSKEY: '' })),
      checkDarajaSettings('live', reader({ ...LIVE, DARAJA_TRANSACTION_TYPE: 'fake-type-value' })),
      checkDarajaSettings('sandbox', reader({ ...LIVE })),
    ].map((r) => (r.ok ? '' : r.problem));
    for (const problem of problems) {
      expect(problem).not.toBe('');
      for (const value of [...Object.values(LIVE), 'fake-type-value', 'sandbox.safaricom']) {
        expect(problem).not.toContain(value);
      }
    }
  });

  it('P6 defaults: with no Till settings the Paybill behaviour is unchanged', () => {
    const r = checkDarajaSettings('live', reader(LIVE));
    expect(r.ok && r.settings.transactionType).toBe('CustomerPayBillOnline');
    expect(r.ok && r.settings.partyB).toBe('600000');
  });

  it('P6 defaults: blank Till settings behave as unset', () => {
    const r = checkDarajaSettings('live', reader({ ...LIVE, DARAJA_TRANSACTION_TYPE: ' ', DARAJA_PARTY_B: '' }));
    expect(r.ok && r.settings.transactionType).toBe('CustomerPayBillOnline');
    expect(r.ok && r.settings.partyB).toBe('600000');
  });

  it('P6: a Till reads the transaction type and PartyB from settings', () => {
    const r = checkDarajaSettings(
      'live',
      reader({ ...LIVE, DARAJA_TRANSACTION_TYPE: 'CustomerBuyGoodsOnline', DARAJA_PARTY_B: '5566778' }),
    );
    expect(r.ok && r.settings.transactionType).toBe('CustomerBuyGoodsOnline');
    expect(r.ok && r.settings.partyB).toBe('5566778');
    expect(r.ok && r.settings.shortcode).toBe('600000');
  });

  it('P6: an explicit CustomerPayBillOnline is accepted', () => {
    const r = checkDarajaSettings('live', reader({ ...LIVE, DARAJA_TRANSACTION_TYPE: 'CustomerPayBillOnline' }));
    expect(r.ok && r.settings.transactionType).toBe('CustomerPayBillOnline');
  });

  it('P6: an unknown transaction type is refused (payments unavailable, never a guess)', () => {
    const r = checkDarajaSettings('live', reader({ ...LIVE, DARAJA_TRANSACTION_TYPE: 'CustomerBuyGoods' }));
    expect(r).toEqual({ ok: false, problem: 'DARAJA_TRANSACTION_TYPE is not a known transaction type' });
  });
});

describe('isDarajaProductionUrl / darajaBaseUrl', () => {
  it('recognises only the exact production origin', () => {
    expect(isDarajaProductionUrl('https://api.safaricom.co.ke')).toBe(true);
    expect(isDarajaProductionUrl(' https://api.safaricom.co.ke/ ')).toBe(true);
    expect(isDarajaProductionUrl('https://sandbox.safaricom.co.ke')).toBe(false);
    expect(isDarajaProductionUrl('https://user:pw@api.safaricom.co.ke')).toBe(false);
    expect(isDarajaProductionUrl('https://api.safaricom.co.ke?x=1')).toBe(false);
    expect(isDarajaProductionUrl(undefined)).toBe(false);
  });

  it('trims spaces and trailing slashes', () => {
    expect(darajaBaseUrl(' https://sandbox.safaricom.co.ke// ')).toBe('https://sandbox.safaricom.co.ke');
    expect(darajaBaseUrl(undefined)).toBe('');
  });
});

// ─── checkMpesaAmount / externalAmountDue (P3) ────────────────────────────────

describe('checkMpesaAmount (P3)', () => {
  it.each([1, 10, 1500, 250000])('accepts the whole amount %p', (amount) => {
    expect(checkMpesaAmount(amount)).toEqual({ ok: true });
  });

  it.each([0.5, 1500.7, 999.99, 1000.0000001, NaN, Infinity, -Infinity])(
    'refuses %p as not whole',
    (amount) => {
      const r = checkMpesaAmount(amount);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.reason).toBe('not_whole');
    },
  );

  it.each([0, -1, -250])('refuses %p as below the minimum', (amount) => {
    const r = checkMpesaAmount(amount);
    expect(!r.ok && r.reason).toBe('below_minimum');
  });

  it.each([250001, 1000000])('refuses %p as above the per-transaction limit', (amount) => {
    const r = checkMpesaAmount(amount);
    expect(!r.ok && r.reason).toBe('above_limit');
    expect(!r.ok && r.message).toContain('250,000');
  });

  it('uses the KES 250,000 per-transaction limit', () => {
    expect(MPESA_MAX_AMOUNT_KES).toBe(250000);
  });
});

describe('externalAmountDue (P3 early check only)', () => {
  it('is amount minus wallet credit minus promo discount', () => {
    expect(externalAmountDue({ amount: 1500, wallet_applied: 200, promo_discount: 300 })).toBe(1000);
  });

  it('works in cents, so decimal parts that add up to whole shillings stay whole', () => {
    expect(externalAmountDue({ amount: 1000, wallet_applied: 0.1, promo_discount: 0.9 })).toBe(999);
  });

  it('keeps a real fraction (a percentage promo) so the guard can refuse it', () => {
    const due = externalAmountDue({ amount: 1499, promo_discount: 149.9 });
    expect(due).toBe(1349.1);
    expect(checkMpesaAmount(due).ok).toBe(false);
  });

  it('accepts numeric strings and missing parts', () => {
    expect(externalAmountDue({ amount: '800', wallet_applied: null })).toBe(800);
  });
});

// ─── readOAuthAnswer (P5) ─────────────────────────────────────────────────────

describe('readOAuthAnswer (P5)', () => {
  it('returns the token and its lifetime from a 2xx answer', () => {
    expect(readOAuthAnswer({ ok: true, status: 200, body: { access_token: 'tok', expires_in: '3599' } })).toEqual({
      ok: true,
      token: 'tok',
      expiresInSeconds: 3599,
    });
  });

  it('falls back to one hour when expires_in is missing or unusable', () => {
    for (const expires_in of [undefined, 'soon', '30', -5]) {
      const r = readOAuthAnswer({ ok: true, status: 200, body: { access_token: 'tok', expires_in } });
      expect(r.ok && r.expiresInSeconds).toBe(3600);
    }
  });

  it('refuses a non-2xx answer even when it carries a token-shaped body', () => {
    expect(readOAuthAnswer({ ok: false, status: 400, body: { access_token: 'tok' } })).toEqual({
      ok: false,
      problem: 'OAuth refused (HTTP 400)',
    });
  });

  it('refuses a body that is not JSON', () => {
    expect(readOAuthAnswer({ ok: true, status: 200, body: null })).toEqual({
      ok: false,
      problem: 'OAuth answer was not JSON',
    });
  });

  it.each([{}, { access_token: '' }, { access_token: '  ' }, { access_token: 42 }])(
    'refuses a 2xx body without a usable token: %p',
    (body) => {
      expect(readOAuthAnswer({ ok: true, status: 200, body })).toEqual({
        ok: false,
        problem: 'OAuth answer had no access token',
      });
    },
  );
});

// ─── STK Push Query (P4a, S40-2) ──────────────────────────────────────────────

describe('buildStkQueryRequest (P4a)', () => {
  const r = buildStkQueryRequest('https://x', 'tok', {
    shortcode: '174379',
    password: 'pw',
    timestamp: '20260102030405',
    checkoutRequestId: 'ws_CO_1',
  });

  it('posts to /mpesa/stkpushquery/v1/query with the bearer token', () => {
    expect(r.url).toBe('https://x/mpesa/stkpushquery/v1/query');
    expect(r.method).toBe('POST');
    expect(r.headers.Authorization).toBe('Bearer tok');
    expect(r.headers['Content-Type']).toBe('application/json');
  });

  it('sends exactly the four documented fields', () => {
    expect(r.body).toEqual({
      BusinessShortCode: '174379',
      Password: 'pw',
      Timestamp: '20260102030405',
      CheckoutRequestID: 'ws_CO_1',
    });
  });
});

describe('interpretStkQuery — every branch (P4a, S40-2)', () => {
  const ID = 'ws_CO_query_synthetic';
  const answer = (body: Record<string, unknown> | null, status = 200): DarajaHttpResult => ({
    ok: status >= 200 && status < 300,
    status,
    body,
  });
  const final = (resultCode: unknown, extra: Record<string, unknown> = {}) =>
    answer({
      ResponseCode: '0',
      ResponseDescription: 'The service request has been accepted successfully',
      MerchantRequestID: 'mr-1',
      CheckoutRequestID: ID,
      ResultCode: resultCode,
      ResultDesc: 'synthetic',
      ...extra,
    });

  it('success: ResultCode "0" for our CheckoutRequestID', () => {
    expect(interpretStkQuery(final('0'), ID)).toBe('success');
  });

  it('success: a numeric ResultCode 0 and ResponseCode 0 are read the same way', () => {
    expect(interpretStkQuery(final(0, { ResponseCode: 0 }), ID)).toBe('success');
  });

  it.each(['1032', '1037', '1', '2001', '1019', 1032])('not_successful (definite): ResultCode %p', (code) => {
    expect(interpretStkQuery(final(code), ID)).toBe('not_successful');
  });

  it('unknown_request (definite): HTTP 400, 400.002.02, "Invalid CheckoutRequestID"', () => {
    const r = answer({ requestId: 'r', errorCode: '400.002.02', errorMessage: 'Bad Request - Invalid CheckoutRequestID' }, 400);
    expect(interpretStkQuery(r, ID)).toBe('unknown_request');
  });

  // Everything below is INDETERMINATE: retried, then the timeout path — never a forgery.
  it('indeterminate: still processing on a 2xx (ResultCode 4999)', () => {
    expect(interpretStkQuery(final('4999'), ID)).toBe('indeterminate');
  });

  it('indeterminate: still processing as a 500 (500.001.1001)', () => {
    const r = answer({ requestId: 'r', errorCode: '500.001.1001', errorMessage: 'The transaction is being processed' }, 500);
    expect(interpretStkQuery(r, ID)).toBe('indeterminate');
  });

  it('indeterminate: rate-limited (429) and spike arrest', () => {
    expect(interpretStkQuery(answer({ errorMessage: 'Too Many Requests' }, 429), ID)).toBe('indeterminate');
    expect(interpretStkQuery(answer({ errorCode: '500.003.02', errorMessage: 'Spike arrest violation' }, 500), ID)).toBe(
      'indeterminate',
    );
  });

  it.each([401, 403, 404, 500, 502, 503, 504])('indeterminate: any other non-2xx (%p)', (status) => {
    expect(interpretStkQuery(answer({ errorMessage: 'x' }, status), ID)).toBe('indeterminate');
  });

  it('indeterminate: a 400 about something else (for example an invalid shortcode)', () => {
    const r = answer({ errorCode: '400.002.02', errorMessage: 'Bad Request - Invalid BusinessShortCode' }, 400);
    expect(interpretStkQuery(r, ID)).toBe('indeterminate');
  });

  it('indeterminate: a 400 naming the CheckoutRequestID but with another error code', () => {
    const r = answer({ errorCode: '400.008.01', errorMessage: 'Invalid CheckoutRequestID' }, 400);
    expect(interpretStkQuery(r, ID)).toBe('indeterminate');
  });

  it('indeterminate: a non-2xx with no JSON body', () => {
    expect(interpretStkQuery(answer(null, 400), ID)).toBe('indeterminate');
  });

  it('indeterminate: a 2xx with no JSON body', () => {
    expect(interpretStkQuery(answer(null), ID)).toBe('indeterminate');
  });

  it('indeterminate: the query itself was not accepted (ResponseCode not 0, or missing)', () => {
    expect(interpretStkQuery(final('0', { ResponseCode: '1' }), ID)).toBe('indeterminate');
    expect(interpretStkQuery(final('0', { ResponseCode: undefined }), ID)).toBe('indeterminate');
  });

  it('indeterminate: the answer is about another CheckoutRequestID, or names none', () => {
    expect(interpretStkQuery(final('0', { CheckoutRequestID: 'ws_CO_other' }), ID)).toBe('indeterminate');
    expect(interpretStkQuery(final('1032', { CheckoutRequestID: undefined }), ID)).toBe('indeterminate');
  });

  it.each([undefined, null, '', 'abc', '-1', '1.5', {}])('indeterminate: an unusable ResultCode %p', (code) => {
    expect(interpretStkQuery(final(code), ID)).toBe('indeterminate');
  });
});

describe('confirmStkSuccess — bounded retry (P4a, S40-2)', () => {
  const ID = 'ws_CO_confirm_synthetic';
  const ok = (resultCode: string): DarajaHttpResult => ({
    ok: true,
    status: 200,
    body: { ResponseCode: '0', CheckoutRequestID: ID, ResultCode: resultCode },
  });
  const processing: DarajaHttpResult = {
    ok: false,
    status: 500,
    body: { errorCode: '500.001.1001', errorMessage: 'The transaction is being processed' },
  };
  const unknown: DarajaHttpResult = {
    ok: false,
    status: 400,
    body: { errorCode: '400.002.02', errorMessage: 'Bad Request - Invalid CheckoutRequestID' },
  };

  /** Run with a scripted list of query outcomes (an Error entry is thrown). */
  async function run(script: (DarajaHttpResult | Error)[]) {
    const query = jest.fn(async () => {
      const next = script.shift();
      if (next === undefined) throw new Error('queried more often than scripted');
      if (next instanceof Error) throw next;
      return next;
    });
    const sleep = jest.fn(async (_ms: number) => undefined);
    const result = await confirmStkSuccess({ query, checkoutRequestId: ID, sleep });
    return { result, query, sleep };
  }

  it('uses 3 tries with 2 s and 4 s pauses', () => {
    expect(STK_QUERY_MAX_TRIES).toBe(3);
    expect(STK_QUERY_RETRY_DELAYS_MS).toEqual([2000, 4000]);
  });

  it('success on the first try: returned at once, no pause', async () => {
    const { result, query, sleep } = await run([ok('0')]);
    expect(result).toEqual({ verdict: 'success', tries: 1 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('a definite not_successful is returned at once and never retried', async () => {
    const { result, query, sleep } = await run([ok('1032')]);
    expect(result).toEqual({ verdict: 'not_successful', tries: 1 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('a definite unknown_request is returned at once and never retried', async () => {
    const { result, query } = await run([unknown]);
    expect(result).toEqual({ verdict: 'unknown_request', tries: 1 });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('still processing, then success: retried after 2 s', async () => {
    const { result, sleep } = await run([processing, ok('0')]);
    expect(result).toEqual({ verdict: 'success', tries: 2 });
    expect(sleep.mock.calls).toEqual([[2000]]);
  });

  it('network error, timeout, then success: 2 s then 4 s', async () => {
    const { result, sleep } = await run([new TypeError('network'), new Error('timeout'), ok('0')]);
    expect(result).toEqual({ verdict: 'success', tries: 3 });
    expect(sleep.mock.calls).toEqual([[2000], [4000]]);
  });

  it('an OAuth failure (thrown) then a definite not_successful', async () => {
    const { result } = await run([new Error('Daraja OAuth refused (HTTP 401)'), ok('1037')]);
    expect(result).toEqual({ verdict: 'not_successful', tries: 2 });
  });

  it('rate-limited, then still processing (4999), then unknown_request', async () => {
    const { result } = await run([{ ok: false, status: 429, body: null }, ok('4999'), unknown]);
    expect(result).toEqual({ verdict: 'unknown_request', tries: 3 });
  });

  it('indeterminate on every try: gives up as INDETERMINATE after exactly 3 tries, never a refusal', async () => {
    const { result, query, sleep } = await run([processing, new Error('network'), { ok: true, status: 200, body: null }]);
    expect(result).toEqual({ verdict: 'indeterminate', tries: 3 });
    expect(query).toHaveBeenCalledTimes(3);
    // two pauses between three tries, none after the last one
    expect(sleep.mock.calls).toEqual([[2000], [4000]]);
  });
});
