/**
 * use-paginated-list.test.ts
 *
 * Tests for the usePaginatedList hook.
 *
 * @/lib/net is mocked so:
 *   - withRetry is a passthrough (calls fn() once, returns the result)
 *   - friendlyError returns a predictable message
 */

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
  addEventListener: jest.fn(() => () => {}),
}));

jest.mock('@/lib/net', () => ({
  withRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
  friendlyError: jest.fn(() => 'Something went wrong. Please try again.'),
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { withRetry, friendlyError } from '@/lib/net';
import { usePaginatedList } from '@/hooks/use-paginated-list';

const mockWithRetry = withRetry as jest.MockedFunction<typeof withRetry>;
const mockFriendlyError = friendlyError as jest.MockedFunction<typeof friendlyError>;

beforeEach(() => {
  jest.clearAllMocks();
  // Default: withRetry is a passthrough
  mockWithRetry.mockImplementation((fn) => fn());
  mockFriendlyError.mockReturnValue('Something went wrong. Please try again.');
});

// ── Initial load ────────────────────────────────────────────────────────────

describe('usePaginatedList — initial load', () => {
  it('loads page 0 on mount and populates items', async () => {
    const fetchPage = jest.fn().mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);

    const { result } = renderHook(() => usePaginatedList(fetchPage, 25));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchPage).toHaveBeenCalledWith(0, 25);
    expect(result.current.items).toEqual([{ id: 'a1' }, { id: 'a2' }]);
  });

  it('sets hasMore=false when the first page has fewer items than pageSize', async () => {
    const fetchPage = jest.fn().mockResolvedValue([{ id: 'a1' }]); // 1 < 5

    const { result } = renderHook(() => usePaginatedList(fetchPage, 5));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasMore).toBe(false);
  });

  it('sets hasMore=true when the first page equals pageSize', async () => {
    const fetchPage = jest.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]);

    const { result } = renderHook(() => usePaginatedList(fetchPage, 2));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasMore).toBe(true);
  });
});

// ── loadMore ────────────────────────────────────────────────────────────────

describe('usePaginatedList — loadMore', () => {
  it('appends page 1 items to existing items', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'p0a' }, { id: 'p0b' }]) // page 0
      .mockResolvedValueOnce([{ id: 'p1a' }, { id: 'p1b' }]); // page 1

    const { result } = renderHook(() => usePaginatedList(fetchPage, 2));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toEqual([{ id: 'p0a' }, { id: 'p0b' }]);
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchPage).toHaveBeenCalledWith(1, 2);
    expect(result.current.items).toEqual([
      { id: 'p0a' },
      { id: 'p0b' },
      { id: 'p1a' },
      { id: 'p1b' },
    ]);
  });

  it('sets hasMore=false when a short page is returned', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'p0' }, { id: 'p0b' }]) // page 0 — full
      .mockResolvedValueOnce([{ id: 'p1' }]);                // page 1 — short

    const { result } = renderHook(() => usePaginatedList(fetchPage, 2));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasMore).toBe(false);
  });

  it('does not load more when hasMore is false', async () => {
    const fetchPage = jest.fn().mockResolvedValue([{ id: 'p0' }]); // short → hasMore=false

    const { result } = renderHook(() => usePaginatedList(fetchPage, 5));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(false);

    act(() => result.current.loadMore());

    // fetchPage should only have been called once (the initial page 0)
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

// ── reload ──────────────────────────────────────────────────────────────────

describe('usePaginatedList — reload', () => {
  it('resets items to page 0 on reload', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'p0a' }, { id: 'p0b' }]) // initial
      .mockResolvedValueOnce([{ id: 'p1a' }, { id: 'p1b' }]) // loadMore
      .mockResolvedValueOnce([{ id: 'fresh' }]);              // reload

    const { result } = renderHook(() => usePaginatedList(fetchPage, 2));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Now reload: should reset to page 0 only.
    // reload() is awaitable (returns Promise<void>) so callers like pull-to-refresh
    // can await completion; await it here so its state updates settle within act.
    await act(async () => {
      await result.current.reload();
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toEqual([{ id: 'fresh' }]);
    expect(result.current.hasMore).toBe(false);
  });
});

// ── error path ──────────────────────────────────────────────────────────────

describe('usePaginatedList — error handling', () => {
  it('sets error via friendlyError when fetchPage throws', async () => {
    const boom = new Error('network error');
    const fetchPage = jest.fn().mockRejectedValue(boom);
    mockFriendlyError.mockReturnValue('You appear to be offline. Check your connection and try again.');

    const { result } = renderHook(() => usePaginatedList(fetchPage, 5));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('You appear to be offline. Check your connection and try again.');
    expect(mockFriendlyError).toHaveBeenCalledWith(boom);
  });
});
