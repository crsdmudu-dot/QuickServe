/**
 * net.test.ts
 *
 * Tests for withRetry, isTransient, friendlyError, and useOnline.
 * Mocks @react-native-community/netinfo so no native module is required.
 */

import { renderHook, act } from '@testing-library/react-native';

// Mock NetInfo before importing the module under test
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
  addEventListener: jest.fn(() => () => {}),
}));

import NetInfo from '@react-native-community/netinfo';
import { isTransient, withRetry, friendlyError, useOnline } from '@/lib/net';

const mockNetInfo = NetInfo as unknown as {
  fetch: jest.Mock;
  addEventListener: jest.Mock;
};

// ── isTransient ───────────────────────────────────────────────────────────────

describe('isTransient', () => {
  it('returns true for a "network" error message', () => {
    expect(isTransient(new Error('network error'))).toBe(true);
  });

  it('returns true for a "timeout" error message', () => {
    expect(isTransient(new Error('request timeout'))).toBe(true);
  });

  it('returns true for a status 503 error', () => {
    const err = Object.assign(new Error('service unavailable'), { status: 503 });
    expect(isTransient(err)).toBe(true);
  });

  it('returns true for a status 500 error', () => {
    const err = Object.assign(new Error('internal server error'), { status: 500 });
    expect(isTransient(err)).toBe(true);
  });

  it('returns false for a plain business error message', () => {
    expect(isTransient(new Error('Insufficient wallet balance'))).toBe(false);
  });

  it('returns false for a status 400 error', () => {
    const err = Object.assign(new Error('bad request'), { status: 400 });
    expect(isTransient(err)).toBe(false);
  });

  it('returns false for a status 404 error', () => {
    const err = Object.assign(new Error('not found'), { status: 404 });
    expect(isTransient(err)).toBe(false);
  });

  it('returns false for a non-Error value with no status', () => {
    expect(isTransient('some string error')).toBe(false);
  });
});

// ── withRetry ─────────────────────────────────────────────────────────────────

describe('withRetry', () => {
  it('resolves when a transient error occurs twice then succeeds (3 total calls)', async () => {
    let callCount = 0;
    const fn = jest.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) throw new Error('network error');
      return 'success';
    });

    const result = await withRetry(fn, { retries: 3, baseMs: 0 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after retries+1 calls when fn always throws a transient error', async () => {
    const retries = 3;
    const fn = jest.fn().mockRejectedValue(new Error('network error'));

    await expect(withRetry(fn, { retries, baseMs: 0 })).rejects.toThrow('network error');
    // attempt 0, 1, 2, 3 → retries+1 calls
    expect(fn).toHaveBeenCalledTimes(retries + 1);
  });

  it('throws immediately (1 call) for a non-transient error', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Insufficient wallet balance'));

    await expect(withRetry(fn, { retries: 3, baseMs: 0 })).rejects.toThrow(
      'Insufficient wallet balance',
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ── friendlyError ─────────────────────────────────────────────────────────────

describe('friendlyError', () => {
  it('returns offline message for a transient error', () => {
    expect(friendlyError(new Error('network error'))).toBe(
      'You appear to be offline. Check your connection and try again.',
    );
  });

  it('returns generic message for a non-transient error', () => {
    expect(friendlyError(new Error('Insufficient wallet balance'))).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('returns offline message for a 503 status error', () => {
    const err = Object.assign(new Error('service unavailable'), { status: 503 });
    expect(friendlyError(err)).toBe(
      'You appear to be offline. Check your connection and try again.',
    );
  });
});

// ── useOnline ─────────────────────────────────────────────────────────────────

describe('useOnline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNetInfo.fetch.mockResolvedValue({ isConnected: true });
    mockNetInfo.addEventListener.mockImplementation(() => () => {});
  });

  it('calls NetInfo.addEventListener with a callback', () => {
    renderHook(() => useOnline());
    expect(mockNetInfo.addEventListener).toHaveBeenCalledWith(expect.any(Function));
  });

  it('returns true by default (initial state)', () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
  });

  it('returns false when addEventListener emits { isConnected: false }', async () => {
    let capturedCallback: ((state: { isConnected: boolean | null }) => void) | undefined;

    // fetch returns null-connected so it doesn't fight the listener
    mockNetInfo.fetch.mockResolvedValue({ isConnected: null });
    mockNetInfo.addEventListener.mockImplementation(
      (cb: (state: { isConnected: boolean | null }) => void) => {
        capturedCallback = cb;
        return () => {};
      },
    );

    const { result } = renderHook(() => useOnline());

    await act(async () => {
      // Flush the fetch() promise, then emit false via the listener
      await Promise.resolve();
      capturedCallback!({ isConnected: false });
    });

    expect(result.current).toBe(false);
  });

  it('calls the returned unsubscribe on unmount', () => {
    const unsub = jest.fn();
    mockNetInfo.addEventListener.mockReturnValue(unsub);

    const { unmount } = renderHook(() => useOnline());
    unmount();

    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
