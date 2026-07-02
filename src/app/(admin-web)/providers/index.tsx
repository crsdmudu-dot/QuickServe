/**
 * src/app/(admin-web)/providers/index.tsx — Web Admin Providers List
 *
 * Loads pending and approved providers on mount and displays them in a
 * DataTable. Pending rows have inline Approve / Reject buttons that call
 * setProviderApproval and update local state on success. Tapping a row
 * navigates to the provider detail screen.
 *
 * Wrapped by AdminShell via (admin-web)/_layout.tsx — no Shell wrapper here.
 *
 * RN/RN-web safe — no DOM-only APIs.
 */

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  getPendingProviders,
  getApprovedProviders,
  setProviderApproval,
  type ProviderProfile,
} from '@/lib/providers';

// ── Table columns ──────────────────────────────────────────────────────────

/**
 * Build columns. We pass setProviders so Approve/Reject buttons can update
 * the list in place without a full reload.
 */
function buildColumns(
  setProviders: React.Dispatch<React.SetStateAction<ProviderProfile[]>>,
): Column<ProviderProfile>[] {
  return [
    {
      key: 'full_name',
      header: 'Name',
      render: (row) => (
        <Text variant="label" color="text">
          {row.full_name ?? '—'}
        </Text>
      ),
      width: '25%',
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {row.phone ?? '—'}
        </Text>
      ),
      width: '20%',
    },
    {
      key: 'is_verified',
      header: 'Verified',
      render: (row) => (
        <Text variant="caption" color={row.is_verified ? 'primary' : 'textTertiary'}>
          {row.is_verified ? 'Yes' : 'No'}
        </Text>
      ),
      width: '12%',
    },
    {
      key: 'approval_status',
      header: 'Status',
      render: (row) => (
        <Text
          variant="caption"
          color={
            row.approval_status === 'approved'
              ? 'primary'
              : row.approval_status === 'rejected'
                ? 'error'
                : 'textSecondary'
          }>
          {row.approval_status.charAt(0).toUpperCase() + row.approval_status.slice(1)}
        </Text>
      ),
      width: '15%',
    },
    {
      key: 'completed_jobs_count',
      header: 'Jobs',
      render: (row) => (
        <Text variant="caption" color="textSecondary">
          {row.completed_jobs_count}
        </Text>
      ),
      width: '10%',
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => {
        if (row.approval_status !== 'pending') return null;
        return (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Button
              label="Approve"
              variant="primary"
              onPress={async () => {
                const result = await setProviderApproval(row.id, 'approved');
                if (result.ok) {
                  setProviders((prev) =>
                    prev.map((p) =>
                      p.id === row.id ? { ...p, approval_status: 'approved' } : p,
                    ),
                  );
                }
              }}
            />
            <Button
              label="Reject"
              variant="ghost"
              onPress={async () => {
                const result = await setProviderApproval(row.id, 'rejected');
                if (result.ok) {
                  setProviders((prev) =>
                    prev.map((p) =>
                      p.id === row.id ? { ...p, approval_status: 'rejected' } : p,
                    ),
                  );
                }
              }}
            />
          </View>
        );
      },
      width: '18%',
    },
  ];
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function AdminWebProvidersScreen() {
  const [providers, setProviders] = useState<ProviderProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([getPendingProviders(), getApprovedProviders()]).then(
      ([pending, approved]) => {
        if (!active) return;
        // Show pending first, then approved — combined into one list.
        setProviders([...pending, ...approved]);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const columns = buildColumns(setProviders);

  return (
    <DataTable
      columns={columns}
      rows={providers}
      keyExtractor={(p) => p.id}
      loading={loading}
      emptyLabel="No providers found."
      onRowPress={(p) => router.push(`/(admin-web)/providers/${p.id}` as Href)}
    />
  );
}
