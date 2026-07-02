/**
 * Tests for DataTable
 *
 * Covers:
 * - renders column headers
 * - renders a cell's rendered content
 * - empty state shows emptyLabel when rows=[] and loading=false
 * - loading state renders Skeleton rows (not data rows)
 * - error state renders inline error text and fires onRetry on Retry press
 * - loading wins over error (both true → skeleton, not error)
 * - right-aligned column has textAlign:'right' on header text
 */

// Suppress animation warnings in test env.
jest.mock('@/constants/motion', () => ({
  prefersReducedMotion: jest.fn().mockResolvedValue(true),
  Durations: { fast: 150, base: 250, slow: 400 },
  Easings: {},
  Springs: { gentle: { damping: 18, stiffness: 160 }, snappy: { damping: 14, stiffness: 220 } },
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { DataTable, type Column } from '@/components/admin-web/data-table';
import { Text } from '@/components/ui/text';

// ── Shared fixture ─────────────────────────────────────────────────────────

type Row = { id: string; name: string; status: string; amount: string };

const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Name', render: (r) => <Text>{r.name}</Text> },
  { key: 'status', header: 'Status', render: (r) => <Text>{r.status}</Text> },
];

const ROWS: Row[] = [
  { id: '1', name: 'Alice', status: 'active', amount: '100' },
  { id: '2', name: 'Bob', status: 'pending', amount: '200' },
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

  // ── New: error state ───────────────────────────────────────────────────

  it('shows inline error text when error=true and loading=false', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        keyExtractor={keyExtractor}
        error={true}
      />,
    );
    expect(screen.getByText("Couldn't load. Please try again.")).toBeOnTheScreen();
  });

  it('fires onRetry when the Retry button is pressed', () => {
    const onRetry = jest.fn();
    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        keyExtractor={keyExtractor}
        error={true}
        onRetry={onRetry}
      />,
    );
    fireEvent.press(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows skeleton (not error) when both loading=true and error=true', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        keyExtractor={keyExtractor}
        loading={true}
        error={true}
      />,
    );
    // Skeleton renders — error message must NOT appear
    expect(screen.queryByText("Couldn't load. Please try again.")).toBeNull();
    // Headers still visible
    expect(screen.getAllByText('Name').length).toBeGreaterThanOrEqual(1);
    // Row data not rendered
    expect(screen.queryByText('Alice')).toBeNull();
  });

  // ── New: right-aligned column ──────────────────────────────────────────

  it('applies textAlign:right to a right-aligned column header', () => {
    const RIGHT_COLS: Column<Row>[] = [
      { key: 'name', header: 'Name', render: (r) => <Text>{r.name}</Text> },
      {
        key: 'amount',
        header: 'Amount',
        render: (r) => <Text testID="amount-cell">{r.amount}</Text>,
        align: 'right',
      },
    ];
    render(<DataTable columns={RIGHT_COLS} rows={ROWS} keyExtractor={keyExtractor} />);

    // The "Amount" header text elements should include textAlign: 'right' in their style.
    const amountHeaders = screen.getAllByText('Amount');
    expect(amountHeaders.length).toBeGreaterThanOrEqual(1);
    // At least one of the Amount header texts has textAlign: 'right' applied.
    const hasRightAlign = amountHeaders.some((el) => {
      const flat = StyleSheet.flatten(el.props.style);
      return flat && (flat as Record<string, unknown>)['textAlign'] === 'right';
    });
    expect(hasRightAlign).toBe(true);
  });
});
