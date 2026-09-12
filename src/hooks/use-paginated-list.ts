/**
 * use-paginated-list.ts — Generic pagination hook for heavy list screens.
 *
 * Wraps each page fetch in withRetry (transient-error retry) and maps errors
 * to friendlyError messages. Guards against concurrent page loads.
 *
 * Usage:
 *   const { items, loading, error, hasMore, loadMore, reload } =
 *     usePaginatedList((page, size) => getAllBookings(page, size));
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { withRetry, friendlyError } from '@/lib/net';

export function usePaginatedList<T>(
  fetchPage: (page: number, pageSize: number) => Promise<T[]>,
  pageSize = 25,
): {
  items: T[];
  loading: boolean;
  error: string;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => Promise<void>;
} {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // hasMore starts true so the first page always loads; set false once a short page returns.
  const [hasMore, setHasMore] = useState(true);
  // Tracks the NEXT page to load (0-based).
  const nextPageRef = useRef(0);
  // Guard: prevents concurrent fetches.
  const loadingRef = useRef(false);

  /**
   * Loads a single page and either replaces (page 0) or appends (page > 0) items.
   */
  const loadPage = useCallback(
    async (page: number) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      setError('');
      try {
        const rows = await withRetry(() => fetchPage(page, pageSize), { baseMs: 0 });
        if (page === 0) {
          setItems(rows);
        } else {
          setItems((prev) => [...prev, ...rows]);
        }
        setHasMore(rows.length === pageSize);
        nextPageRef.current = page + 1;
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    // fetchPage identity changes if the caller doesn't memoize — keep pageSize stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageSize],
  );

  /** Reset to page 0 and reload. Returns a promise so callers (e.g. pull-to-refresh) can await completion. */
  const reload = useCallback(() => {
    nextPageRef.current = 0;
    setHasMore(true);
    return loadPage(0);
  }, [loadPage]);

  /** Load the next page and append results. */
  const loadMore = useCallback(() => {
    if (!hasMore || loadingRef.current) return;
    void loadPage(nextPageRef.current);
  }, [hasMore, loadPage]);

  // Load page 0 on mount.
  useEffect(() => {
    void loadPage(0);
    // Only run once on mount; reload() is the explicit refresh path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { items, loading, error, hasMore, loadMore, reload };
}
