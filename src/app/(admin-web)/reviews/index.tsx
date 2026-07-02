/**
 * src/app/(admin-web)/reviews/index.tsx — Web Admin Reviews Moderation
 *
 * Loads all reviews via adminGetAllReviews() on mount and displays them in a
 * DataTable. Each row shows rating stars, comment, id-based context refs
 * (provider, customer, booking), hidden status, date, and a Hide/Unhide button.
 *
 * Pressing Hide/Unhide calls setReviewHidden() and updates the local row on
 * success — no page reload needed.
 *
 * Context refs use id slices only (no name lookup) to stay reuse-only.
 *
 * Wrapped by AdminShell via the (admin-web)/_layout.tsx — this screen only
 * needs to return its content (no Shell wrapper here).
 */

import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { PageMeta } from '@/components/admin-web/page-meta';
import { RatingStars } from '@/components/ui/rating-stars';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { adminGetAllReviews, setReviewHidden, type Review } from '@/lib/reviews';

// ── Column definitions ─────────────────────────────────────────────────────

function buildColumns(
  onToggleHidden: (id: string, currentHidden: boolean) => void,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    adminGetAllReviews().then((rows) => {
      if (!active) return;
      setReviews(rows);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  async function handleToggleHidden(id: string, currentHidden: boolean) {
    setError('');
    const result = await setReviewHidden(id, !currentHidden);
    if (result.ok) {
      setReviews((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_hidden: !currentHidden } : r)),
      );
    } else {
      setError(result.error ?? 'Could not update review.');
    }
  }

  const columns = buildColumns(handleToggleHidden);

  return (
    <>
      <PageMeta title="Reviews" />
      {error ? (
        <Text variant="caption" color="error">
          {error}
        </Text>
      ) : null}
      <DataTable
        columns={columns}
        rows={reviews}
        keyExtractor={(r) => r.id}
        loading={loading}
        emptyLabel="No reviews yet."
      />
    </>
  );
}
