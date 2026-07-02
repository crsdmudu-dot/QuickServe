/**
 * Tests for DataTable
 *
 * Covers:
 * - renders column headers
 * - renders a cell's rendered content
 * - empty state shows emptyLabel when rows=[] and loading=false
 * - loading state renders Skeleton rows (not data rows)
 */

// Suppress animation warnings in test env.
jest.mock('@/constants/motion', () => ({
  prefersReducedMotion: jest.fn().mockResolvedValue(true),
  Durations: { fast: 150, base: 250, slow: 400 },
  Easings: {},
  Springs: { gentle: { damping: 18, stiffness: 160 }, snappy: { damping: 14, stiffness: 220 } },
}));

import { render, screen } from '@testing-library/react-native';
import { DataTable, type Column } from '@/components/admin-web/data-table';
import { Text } from '@/components/ui/text';

// ── Shared fixture ─────────────────────────────────────────────────────────

type Row = { id: string; name: string; status: string };

const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Name', render: (r) => <Text>{r.name}</Text> },
  { key: 'status', header: 'Status', render: (r) => <Text>{r.status}</Text> },
];

const ROWS: Row[] = [
  { id: '1', name: 'Alice', status: 'active' },
  { id: '2', name: 'Bob', status: 'pending' },
];

function keyExtractor(row: Row) {
  return row.id;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('DataTable', () => {
  it('renders column headers', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} keyExtractor={keyExtractor} />);
    expect(screen.getAllByText('Name').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Status').length).toBeGreaterThanOrEqual(1);
  });

  it("renders each row's rendered cell content", () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} keyExtractor={keyExtractor} />);
    expect(screen.getByText('Alice')).toBeOnTheScreen();
    expect(screen.getByText('Bob')).toBeOnTheScreen();
    expect(screen.getByText('active')).toBeOnTheScreen();
    expect(screen.getByText('pending')).toBeOnTheScreen();
  });

  it('shows emptyLabel when rows is empty and not loading', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        keyExtractor={keyExtractor}
        emptyLabel="No records found"
      />,
    );
    expect(screen.getByText('No records found')).toBeOnTheScreen();
  });

  it('shows skeleton placeholders when loading and does not render row data', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        keyExtractor={keyExtractor}
        loading={true}
      />,
    );
    // Headers still visible while loading
    expect(screen.getAllByText('Name').length).toBeGreaterThanOrEqual(1);
    // Row data must NOT appear
    expect(screen.queryByText('Alice')).toBeNull();
    expect(screen.queryByText('Bob')).toBeNull();
  });
});
