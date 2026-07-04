/**
 * src/app/(admin-web)/notifications/index.tsx — Admin Operational Notifications Feed
 *
 * Loads own notifications via getMyNotifications() on mount, then filters to
 * category === 'system' (admin/operational fan-out rows: new bookings,
 * provider-pending, failed payments, cancellations, rejections). Displays them
 * in a DataTable with unread emphasis, observability fields, and an "Open"
 * action that marks the row read and navigates to its route.
 *
 * Wrapped by AdminShell via the (admin-web)/_layout.tsx — this screen only
 * needs to return its content (no Shell wrapper here).
 *
 * Reuses Task-4 helpers: getMyNotifications, markNotificationRead, AppNotification.
 * No RLS/schema/Edge/trigger change — owner-only via existing RLS.
 */

import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { PageMeta } from '@/components/admin-web/page-meta';
import { Button } from '@/components/ui/button';
import { LoadMoreButton } from '@/components/ui/load-more-button';
import { Text } from '@/components/ui/text';
import { usePaginatedList } from '@/hooks/use-paginated-list';
import {
  getMyNotifications,
  markNotificationRead,
  type AppNotification,
} from '@/lib/notifications';

// ── Column definitions ─────────────────────────────────────────────────────

function buildColumns(
  onOpen: (row: AppNotification) => void,
): Column<AppNotification>[] {
  return [
    {
      key: 'notification',
      header: 'Notification',
      render: (row) => (
        <View style={{ gap: 2 }}>
          <Text
            variant="label"
            color="text"
            weight={row.is_read ? 'medium' : 'semibold'}>
            {row.title}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {row.body}
          </Text>
        </View>
      ),
      width: 260,
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {row.type ?? '—'}
        </Text>
      ),
      width: 120,
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {row.category ?? '—'}
        </Text>
      ),
      width: 100,
    },
    {
      key: 'push',
      header: 'Push',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {row.push_status ?? '—'}
        </Text>
      ),
      width: 90,
    },
    {
      key: 'created',
      header: 'Created',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {new Date(row.created_at).toLocaleString()}
        </Text>
      ),
      width: 160,
    },
    {
      key: 'actions',
      header: 'Action',
      render: (row) => (
        <View>
          <Button
            label="Open"
            variant="ghost"
            size="md"
            onPress={() => onOpen(row)}
          />
        </View>
      ),
      width: 80,
    },
  ];
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function AdminWebNotificationsScreen() {
  const [localReadIds, setLocalReadIds] = useState<Set<string>>(new Set());

  const {
    items: allNotifications,
    loading,
    error: loadError,
    hasMore,
    loadMore,
    reload,
  } = usePaginatedList((p, s) => getMyNotifications(p, s));

  // Keep only operational/system rows
  const notifications = allNotifications
    .filter((n) => n.category === 'system')
    .map((n) => (localReadIds.has(n.id) ? { ...n, is_read: true } : n));

  /** Mark read locally + navigate to route when present. */
  async function handleOpen(row: AppNotification) {
    await markNotificationRead(row.id);
    // Update local read state
    setLocalReadIds((prev) => new Set(prev).add(row.id));
    if (row.route) {
      router.push(row.route as never);
    }
  }

  const columns = buildColumns(handleOpen);

  return (
    <>
      <PageMeta
        title="Notifications"
        description="Operational alerts for admins."
      />
      <DataTable
        columns={columns}
        rows={notifications}
        keyExtractor={(n) => n.id}
        loading={loading}
        error={!!loadError}
        onRetry={reload}
        emptyLabel="No notifications yet."
      />
      <LoadMoreButton onPress={loadMore} loading={loading} hasMore={hasMore} />
    </>
  );
}
