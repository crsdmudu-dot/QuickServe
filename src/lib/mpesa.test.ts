import {
  normalizeKenyanPhone,
  isValidKenyanPhone,
  initiateStkPushMock,
} from '@/lib/mpesa';

describe('normalizeKenyanPhone', () => {
  it('normalizes 07XXXXXXXX to 2547XXXXXXXX', () => {
    expect(normalizeKenyanPhone('0712345678')).toBe('254712345678');
  });

  it('normalizes 01XXXXXXXX to 2541XXXXXXXX', () => {
    expect(normalizeKenyanPhone('0112345678')).toBe('254112345678');
  });

  it('strips leading + and keeps 254 prefix intact', () => {
    expect(normalizeKenyanPhone('+254712345678')).toBe('254712345678');
  });

  it('returns 254XXXXXXXXX as-is when already normalized', () => {
    expect(normalizeKenyanPhone('254712345678')).toBe('254712345678');
  });

  it('strips internal spaces before normalizing', () => {
    expect(normalizeKenyanPhone('0712 345 678')).toBe('254712345678');
  });

  it('returns null for a short number', () => {
    expect(normalizeKenyanPhone('12345')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(normalizeKenyanPhone('')).toBeNull();
  });

  it('returns null for a number that is too long (070012345678)', () => {
    expect(normalizeKenyanPhone('070012345678')).toBeNull();
  });

  it('returns null for an invalid 2nd digit (0812345678)', () => {
    expect(normalizeKenyanPhone('0812345678')).toBeNull();
  });
});

describe('isValidKenyanPhone', () => {
  it('returns true for a valid Kenyan number', () => {
    expect(isValidKenyanPhone('0712345678')).toBe(true);
  });

  it('returns false for an invalid number', () => {
    expect(isValidKenyanPhone('12345')).toBe(false);
  });
});

describe('initiateStkPushMock', () => {
  const params = { phone: '254712345678', amount: 1500, accountReference: 'BK1' };

  it('returns ok === true', () => {
    expect(initiateStkPushMock(params).ok).toBe(true);
  });

  it('returns externalReference starting with MOCK-', () => {
    const result = initiateStkPushMock(params);
    expect(result.externalReference).toMatch(/^MOCK-/);
  });

  it('returns a raw object with ResponseCode === "0"', () => {
    const result = initiateStkPushMock(params);
    expect(typeof result.raw).toBe('object');
    expect(result.raw.ResponseCode).toBe('0');
  });

  it('does not throw and returns synchronously (no promise)', () => {
    let result: ReturnType<typeof initiateStkPushMock> | undefined;
    expect(() => {
      result = initiateStkPushMock(params);
    }).not.toThrow();
    // must be a plain object, not a Promise
    expect(result).not.toBeInstanceOf(Promise);
  });
});
