/**
 * src/app/(admin-web)/reviews/index.tsx — Web Admin Reviews Moderation
 *
 * Loads all reviews via adminGetAllReviews() on mount and displays them in a
 * DataTable. Each row shows rating stars, comment, id-based context refs
 * (provider, customer, booking), hidden status, date, and a Hide/Unhide button.
 *
 * Ratings 2.0 additions (Slice 25):
 *   - Prefetches private feedback for every review (admin RLS allows it) into a
 *     privateMap and displays it in a dedicated column (providers never see this).
 *   - New compact columns: Categories, Recommend, Tags, Private feedback.
 *   - Low-rated-only toggle above the table (rating ≤ 2).
 *
 * Pressing Hide/Unhide calls setReviewHidden() and updates the local row on
 * success — no page reload needed.
 *
 * Context refs use id slices only (no name lookup) to stay reuse-only.
 *
 * Wrapped by AdminShell via the (admin-web)/_layout.tsx — this screen only
 * needs to return its content (no Shell wrapper here).
 */

import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { PageMeta } from '@/components/admin-web/page-meta';
import { RatingStars } from '@/components/ui/rating-stars';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  adminGetAllReviews,
  getReviewPrivateFeedback,
  setReviewHidden,
  REVIEW_TAGS,
  type Review,
} from '@/lib/reviews';

// ── Column definitions ─────────────────────────────────────────────────────

/**
 * Builds the category string from a review row.
 * Only includes non-null ratings, abbreviated as Q / P / C / Pr / V.
 * Returns "—" when no category ratings are present.
 */
function formatCategories(row: Review): string {
  const parts: string[] = [];
  if (row.quality_rating != null) parts.push(`Q${row.quality_rating}`);
  if (row.punctuality_rating != null) parts.push(`P${row.punctuality_rating}`);
  if (row.communication_rating != null) parts.push(`C${row.communication_rating}`);
  if (row.professionalism_rating != null) parts.push(`Pr${row.professionalism_rating}`);
  if (row.value_rating != null) parts.push(`V${row.value_rating}`);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

/**
 * Maps tag keys to their human-readable labels from REVIEW_TAGS.
 * Returns "—" when the review has no tags.
 */
function formatTags(keys: string[]): string {
  if (!keys || keys.length === 0) return '—';
  return keys
    .map((k) => REVIEW_TAGS.find((t) => t.key === k)?.label ?? k)
    .join(', ');
}

function buildColumns(
  onToggleHidden: (id: string, currentHidden: boolean) => void,
  privateMap: Record<string, string | null>,
): Column<Review>[] {
  return [
    {
      key: 'rating',
      header: 'Rating',
      render: (row) => <RatingStars value={row.rating} />,
      width: 110,
    },
    {
      key: 'comment',
      header: 'Comment',
      render: (row) => (
        <Text variant="caption" color="text">
          {row.comment ?? '—'}
        </Text>
      ),
      width: 200,
    },
    {
      key: 'categories',
      header: 'Categories',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {formatCategories(row)}
        </Text>
      ),
      width: 160,
    },
    {
      key: 'recommend',
      header: 'Recommend',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {row.would_recommend === true ? '👍' : row.would_recommend === false ? '👎' : '—'}
        </Text>
      ),
      width: 90,
    },
    {
      key: 'tags',
      header: 'Tags',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {formatTags(row.tags)}
        </Text>
      ),
      width: 180,
    },
    {
      key: 'private_feedback',
      header: 'Private feedback',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {privateMap[row.id] ?? '—'}
        </Text>
      ),
      width: 200,
    },
    {
      key: 'provider',
      header: 'Provider',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {`#${row.provider_id.slice(0, 8)}`}
        </Text>
      ),
      width: 100,
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {`#${row.customer_id.slice(0, 8)}`}
        </Text>
      ),
      width: 100,
    },
    {
      key: 'booking',
      header: 'Booking',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {`#${row.booking_id.slice(0, 8)}`}
        </Text>
      ),
      width: 100,
    },
    {
      key: 'hidden',
      header: 'Hidden',
      render: (row) => (
        <Text variant="caption" color={row.is_hidden ? 'error' : 'textSecondary'}>
          {row.is_hidden ? 'Yes' : 'No'}
        </Text>
      ),
      width: 70,
    },
    {
      key: 'date',
      header: 'Date',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {new Date(row.created_at).toLocaleDateString()}
        </Text>
      ),
      width: 110,
    },
    {
      key: 'actions',
      header: 'Action',
      render: (row) => (
        <View>
          <Button
            label={row.is_hidden ? 'Unhide' : 'Hide'}
            variant="ghost"
            size="md"
            onPress={() => onToggleHidden(row.id, row.is_hidden)}
          />
        </View>
      ),
      width: 90,
    },
  ];
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function AdminWebReviewsScreen() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [privateMap, setPrivateMap] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState('');
  // When true, only show reviews with rating ≤ 2
  const [lowRatedOnly, setLowRatedOnly] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    setLoading(true);
    try {
      const rows = await adminGetAllReviews();
      setReviews(rows);

      // Prefetch private feedback for all reviews in parallel.
      // Admin RLS permits this; providers never access this admin table.
      const pairs = await Promise.all(
        rows.map(async (r) => {
          const result = await getReviewPrivateFeedback(r.id);
          return [r.id, result?.feedback ?? null] as [string, string | null];
        }),
      );
      setPrivateMap(Object.fromEntries(pairs));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggleHidden(id: string, currentHidden: boolean) {
    setActionError('');
    const result = await setReviewHidden(id, !currentHidden);
    if (result.ok) {
      setReviews((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_hidden: !currentHidden } : r)),
      );
    } else {
      setActionError(result.error ?? 'Could not update review.');
    }
  }

  // Apply the low-rated filter when the toggle is on
  const visibleRows = lowRatedOnly ? reviews.filter((r) => r.rating <= 2) : reviews;

  const columns = buildColumns(handleToggleHidden, privateMap);

  return (
    <>
      <PageMeta title="Reviews" />
      {actionError ? (
        <Text variant="caption" color="error">
          {actionError}
        </Text>
      ) : null}
      {/* Low-rated filter toggle */}
      <Button
        label={lowRatedOnly ? 'All ratings' : 'Low-rated only'}
        variant="ghost"
        size="md"
        onPress={() => setLowRatedOnly((v) => !v)}
      />
      <DataTable
        columns={columns}
        rows={visibleRows}
        keyExtractor={(r) => r.id}
        loading={loading}
        error={loadError}
        onRetry={load}
        emptyLabel="No reviews yet."
      />
    </>
  );
}
