/**
 * src/app/(admin-web)/operations/index.tsx — Operations Portal: Cases List
 *
 * Displays all support/dispute cases in a paginated DataTable.
 * Filter row (chips) lets admins narrow by preset: open, urgent, assigned to
 * me, unresolved (default), or disputes. Reloads from the server on filter
 * change by remounting the hook via a React key.
 *
 * Wrapped by AdminShell via the (admin-web)/_layout.tsx — no Shell wrapper needed.
 *
 * Admin-web only. Operations data is never exposed to customer/provider apps.
 */

import { useState } from 'react';
import { router, type Href } from 'expo-router';
import { View, StyleSheet } from 'react-native';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { PageMeta } from '@/components/admin-web/page-meta';
import { CaseStatusBadge } from '@/components/admin-web/operations/case-status-badge';
import { CasePriorityBadge } from '@/components/admin-web/operations/case-priority-badge';
import { Button } from '@/components/ui/button';
import { LoadMoreButton } from '@/components/ui/load-more-button';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import {
  CASE_TYPES,
  type CaseFilter,
  type SupportCase,
} from '@/constants/operations';
import { usePaginatedList } from '@/hooks/use-paginated-list';
import { getSupportCases } from '@/lib/operations';

// ── Filter definitions ─────────────────────────────────────────────────────

const FILTER_LABELS: { key: CaseFilter; label: string }[] = [
  { key: 'open',           label: 'Open'           },
  { key: 'urgent',         label: 'Urgent'         },
  { key: 'assigned_to_me', label: 'Assigned to me' },
  { key: 'unresolved',     label: 'Unresolved'     },
  { key: 'disputes',       label: 'Disputes'       },
];

// ── Table columns ──────────────────────────────────────────────────────────

const COLUMNS: Column<SupportCase>[] = [
  {
    key: 'subject',
    header: 'Subject',
    render: (row) => (
      <Text variant="label" color="text">
        {row.subject}
      </Text>
    ),
    width: '25%',
  },
  {
    key: 'case_type',
    header: 'Type',
    render: (row) => (
      <Text variant="caption" color="textSecondary">
        {CASE_TYPES.find((t) => t.id === row.case_type)?.label ?? row.case_type}
      </Text>
    ),
    width: '10%',
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <CaseStatusBadge status={row.status} />,
    width: '15%',
  },
  {
    key: 'priority',
    header: 'Priority',
    render: (row) => <CasePriorityBadge priority={row.priority} />,
    width: '12%',
  },
  {
    key: 'assigned_to',
    header: 'Assignee',
    render: (row) => (
      <Text variant="caption" color="textSecondary">
        {row.assigned_to ? `#${row.assigned_to.slice(0, 8)}` : 'Unassigned'}
      </Text>
    ),
    width: '18%',
  },
  {
    key: 'updated_at',
    header: 'Updated',
    render: (row) => (
      <Text variant="caption" color="textSecondary">
        {new Date(row.updated_at).toLocaleDateString()}
      </Text>
    ),
    width: '15%',
  },
];

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  newCaseRow: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
    alignItems: 'flex-start',
  },
});

// ── Inner list — keyed on filter so hook resets on filter change ───────────

type CasesListProps = { filter: CaseFilter };

function CasesList({ filter }: CasesListProps) {
  const {
    items: cases,
    loading,
    error,
    hasMore,
    loadMore,
    reload,
  } = usePaginatedList((p, s) => getSupportCases(filter, p, s));

  return (
    <>
      <DataTable
        columns={COLUMNS}
        rows={cases}
        keyExtractor={(c) => c.id}
        loading={loading}
        error={!!error}
        onRetry={reload}
        emptyLabel="No cases found."
        onRowPress={(c) =>
          router.push(`/(admin-web)/operations/${c.id}` as Href)
        }
      />
      <LoadMoreButton onPress={loadMore} loading={loading} hasMore={hasMore} />
    </>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function AdminWebOperationsScreen() {
  const [filter, setFilter] = useState<CaseFilter>('unresolved');

  return (
    <>
      <PageMeta title="Operations" />

      {/* Filter row */}
      <View style={styles.filterRow}>
        {FILTER_LABELS.map(({ key, label }) => (
          <Button
            key={key}
            label={label}
            variant={filter === key ? 'secondary' : 'ghost'}
            onPress={() => setFilter(key)}
          />
        ))}
      </View>

      {/* New case button */}
      <View style={styles.newCaseRow}>
        <Button
          label="New case"
          variant="primary"
          onPress={() => router.push('/(admin-web)/operations/new' as Href)}
        />
      </View>

      {/* List — re-keyed on filter so pagination resets on filter change */}
      <CasesList key={filter} filter={filter} />
    </>
  );
}
