/**
 * admin-web-layout-polish.test.tsx
 *
 * Regression pins for the admin-web desktop layout polish:
 *   - DataTable fills the available page width (percentage columns resolve against the page,
 *     not the table's own intrinsic width), while still overflowing horizontally when its
 *     fixed columns are wider than the page (table-only scrolling).
 *   - Dashboard "Recent Bookings" keeps its heading and "View all" action in one row, its
 *     columns are percentage-based, and status labels render as single strings.
 *   - Rendering the dashboard never calls a mutation.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ScrollView, StyleSheet } from 'react-native';

import { DataTable, type Column } from '@/components/admin-web/data-table';
import { Text } from '@/components/ui/text';
import AdminDashboard from '@/app/(admin-web)/dashboard';

const mockGetAllBookings = jest.fn();
const mockAdminGetAllPayments = jest.fn();
const mockGetPendingProviders = jest.fn();
const mockAdminGetAllReviews = jest.fn();
jest.mock('@/lib/bookings', () => ({ getAllBookings: (...a: unknown[]) => mockGetAllBookings(...a) }));
jest.mock('@/lib/payments', () => ({ adminGetAllPayments: (...a: unknown[]) => mockAdminGetAllPayments(...a) }));
jest.mock('@/lib/providers', () => ({ getPendingProviders: (...a: unknown[]) => mockGetPendingProviders(...a) }));
jest.mock('@/lib/reviews', () => ({ adminGetAllReviews: (...a: unknown[]) => mockAdminGetAllReviews(...a) }));
const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockRouterPush(...a) } }));
jest.mock('expo-router/head', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));

type Row = { id: string; a: string; b: string };
const COLS: Column<Row>[] = [
  { key: 'a', header: 'Alpha', render: (r) => <Text>{r.a}</Text>, width: '60%' },
  { key: 'b', header: 'Beta', render: (r) => <Text>{r.b}</Text>, width: '40%' },
];

function flat(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
}

// Walk up from a host element until a flattened style declares `width`.
function declaredWidthOf(el: ReturnType<typeof screen.getByText>): number | string | undefined {
  let node: any = el;
  for (let i = 0; i < 6 && node; i++) {
    const w = flat(node.props?.style).width;
    if (typeof w === 'number' || typeof w === 'string') return w;
    node = node.parent;
  }
  return undefined;
}

describe('DataTable — fills the available width', () => {
  it('lets the horizontal scroller content grow to the full page width so percentage columns are meaningful', () => {
    render(<DataTable columns={COLS} rows={[{ id: '1', a: 'x', b: 'y' }]} keyExtractor={(r) => r.id} />);
    const sv = screen.UNSAFE_getByType(ScrollView);
    expect(sv.props.horizontal).toBe(true);
    const content = flat(sv.props.contentContainerStyle);
    expect(content.flexGrow).toBe(1);
    expect(content.minWidth).toBe('100%');
    // the table container itself stretches inside the scroller
    const container = sv.props.children;
    expect(flat(container.props.style).flexGrow).toBe(1);
  });
});

describe('AdminDashboard — Recent Bookings layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllBookings.mockResolvedValue([
      { id: 'b1', service_id: 'house-cleaning', status: 'completed', scheduled_for: '2030-01-01T12:00:00Z' },
      { id: 'b2', service_id: 'car-towing', status: 'in_progress', scheduled_for: '2030-01-02T12:00:00Z' },
    ]);
    mockAdminGetAllPayments.mockResolvedValue([{ id: 'p1', status: 'paid', amount: 1500 }]);
    mockGetPendingProviders.mockResolvedValue([]);
    mockAdminGetAllReviews.mockResolvedValue([]);
  });

  it('keeps the section heading and the View all action in one header row', async () => {
    render(<AdminDashboard />);
    const heading = await screen.findByText('Recent Bookings');
    const viewAll = screen.getByRole('button', { name: 'View all' });
    // walk up from the heading to the nearest space-between row; the button must live inside it
    let headerRow: any = heading;
    while (headerRow && flat(headerRow.props?.style).justifyContent !== 'space-between') headerRow = headerRow.parent;
    expect(headerRow != null).toBe(true);
    expect(flat(headerRow.props.style).flexDirection).toBe('row');
    let cursor: any = viewAll;
    while (cursor && cursor !== headerRow) cursor = cursor.parent;
    expect(cursor === headerRow).toBe(true);
  });

  it('uses percentage columns (they fill the table because DataTable fills the page)', async () => {
    render(<AdminDashboard />);
    await screen.findByText('Recent Bookings');
    expect(declaredWidthOf(screen.getByText('Service'))).toBe('40%');
    expect(declaredWidthOf(screen.getByText('Status'))).toBe('30%');
    expect(declaredWidthOf(screen.getByText('Date'))).toBe('30%');
  });

  it('renders status labels as single unbroken strings', async () => {
    render(<AdminDashboard />);
    expect(await screen.findByText('Completed')).toBeOnTheScreen();
    expect(screen.getByText('In progress')).toBeOnTheScreen();
    expect(screen.getByText('House Cleaning')).toBeOnTheScreen();
  });

  it('never calls anything but the four read helpers and does not navigate on render', async () => {
    render(<AdminDashboard />);
    await screen.findByText('Recent Bookings');
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockGetAllBookings).toHaveBeenCalledTimes(1);
  });
});
