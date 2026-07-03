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

import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { PageMeta } from '@/components/admin-web/page-meta';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
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
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    setLoading(true);
    try {
      const all = await getMyNotifications();
      // Keep only operational/system rows (admin fan-out: bookings, payments, etc.)
      setNotifications(all.filter((n) => n.category === 'system'));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Mark read locally + navigate to route when present. */
  async function handleOpen(row: AppNotification) {
    await markNotificationRead(row.id);
    // Update local row to is_read: true
    setNotifications((prev) =>
      prev.map((n) => (n.id === row.id ? { ...n, is_read: true } : n)),
    );
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
        error={loadError}
        onRetry={load}
        emptyLabel="No notifications yet."
      />
    </>
  );
}
