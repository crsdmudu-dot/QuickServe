/**
 * daraja.test.ts — Jest tests for the pure Daraja helper functions.
 *
 * The module lives at supabase/functions/_shared/daraja.ts.
 * We import it via a relative path so Jest can resolve it without any
 * special module mapping (the file uses no Deno-only APIs).
 */
import {
  darajaTimestamp,
  buildStkPassword,
  buildOAuthRequest,
  buildStkPushPayload,
  buildStkPushRequest,
  parseStkCallback,
  normalizeKenyanPhone,
  isMsisdn,
  resolveMpesaMode,
  isMockMode,
  mockStkResult,
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
  const payload = buildStkPushPayload({
    shortcode: '174379',
    password: 'pw',
    timestamp: '20260102030405',
    amount: 1500.7,
    phone: '254712345678',
    callbackUrl: 'https://example.com/callback',
    accountReference: 'BK001',
    transactionDesc: 'Booking payment',
  });

  it('rounds Amount to nearest integer', () => {
    expect(payload['Amount']).toBe(1501);
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

describe('resolveMpesaMode', () => {
  it('returns mock when value is undefined', () => {
    expect(resolveMpesaMode(undefined)).toBe('mock');
  });

  it('returns sandbox when value is "sandbox"', () => {
    expect(resolveMpesaMode('sandbox')).toBe('sandbox');
  });

  it('returns live when value is "live"', () => {
    expect(resolveMpesaMode('live')).toBe('live');
  });

  it('returns mock for an unrecognised value', () => {
    expect(resolveMpesaMode('bogus')).toBe('mock');
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
