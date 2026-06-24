import { normalizeKenyanPhone, isValidKenyanPhone } from '@/lib/mpesa';

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

