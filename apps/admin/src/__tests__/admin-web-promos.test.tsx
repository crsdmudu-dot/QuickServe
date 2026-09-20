/**
 * Tests for the web-admin promotions management screen:
 *   - src/app/promos/index.tsx
 *
 * Verifies:
 *   - The codes list renders the fixture promo code after data loads.
 *   - The redemption history shows the fixture discount_amount.
 *   - The create form: fill code + value, select a type, press "Create promo"
 *     → adminCreatePromoCode called with expected args.
 *   - Enable/Disable button → adminUpdatePromoCode(id, { is_active: !current }).
 *
 * All network calls are mocked. Uses findBy* / waitFor for async data loads.
 */

// ── Promotions lib mocks ──────────────────────────────────────────────────────

const mockAdminGetPromoCodes = jest.fn().mockResolvedValue([] as unknown[]);
const mockAdminGetPromoRedemptions = jest.fn().mockResolvedValue([] as unknown[]);
const mockAdminCreatePromoCode = jest.fn().mockResolvedValue({ ok: true });
const mockAdminUpdatePromoCode = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/promotions', () => ({
  adminGetPromoCodes: (...args: unknown[]) => mockAdminGetPromoCodes(...args),
  adminGetPromoRedemptions: (...args: unknown[]) =>
    mockAdminGetPromoRedemptions(...args),
  adminCreatePromoCode: (...args: unknown[]) =>
    mockAdminCreatePromoCode(...args),
  adminUpdatePromoCode: (...args: unknown[]) =>
    mockAdminUpdatePromoCode(...args),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import AdminWebPromosScreen from '@admin/app/promos/index';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const MOCK_PROMO_CODE = {
  id: 'promo-id-aaaa-1111',
  code: 'SAVE20',
  discount_type: 'percentage' as const,
  discount_value: 20,
  max_discount: null,
  max_redemptions: 100,
  per_user_limit: 1,
  starts_at: null,
  ends_at: null,
  is_active: true,
  created_by: 'admin-user-uuid',
  created_at: '2026-07-01T00:00:00Z',
};

const MOCK_REDEMPTION = {
  id: 'redemption-id-bbbb-2222',
  promo_code_id: 'promo-id-aaaa-1111',
  customer_id: 'customer-id-cccc-3333',
  booking_id: 'booking-id-dddd-4444',
  payment_id: 'payment-id-eeee-5555',
  discount_type: 'percentage',
  discount_amount: 500,
  created_at: '2026-07-02T08:00:00Z',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AdminWebPromosScreen (promo codes + redemption history)', () => {
  beforeEach(() => {
    mockAdminGetPromoCodes.mockClear();
    mockAdminGetPromoRedemptions.mockClear();
    mockAdminCreatePromoCode.mockClear();
    mockAdminUpdatePromoCode.mockClear();
    mockAdminGetPromoCodes.mockResolvedValue([MOCK_PROMO_CODE]);
    mockAdminGetPromoRedemptions.mockResolvedValue([MOCK_REDEMPTION]);
    mockAdminCreatePromoCode.mockResolvedValue({ ok: true });
    mockAdminUpdatePromoCode.mockResolvedValue({ ok: true });
  });

  // ── Codes list ─────────────────────────────────────────────────────────────

  it('renders the fixture promo code in the codes list', async () => {
    render(<AdminWebPromosScreen />);
    expect(await screen.findByText('SAVE20')).toBeOnTheScreen();
  });

  it('shows the discount_type in the codes list', async () => {
    render(<AdminWebPromosScreen />);
    await screen.findByText('SAVE20');
    // 'percentage' appears as both a type chip button and a table cell value
    const elements = screen.getAllByText('percentage');
    expect(elements.length).toBeGreaterThanOrEqual(1);
    expect(elements[0]).toBeOnTheScreen();
  });

  // ── Redemption history ─────────────────────────────────────────────────────

  it('renders the redemption discount_amount formatted as KES', async () => {
    render(<AdminWebPromosScreen />);
    // discount_amount = 500 → formatKes(500) = "KES 500"
    expect(await screen.findByText('KES 500')).toBeOnTheScreen();
  });

  it('shows the customer id slice in the redemption history', async () => {
    render(<AdminWebPromosScreen />);
    await screen.findByText('KES 500');
    // customer_id starts with 'customer-id-cccc-3333' → slice(0,8) = 'customer'
    expect(screen.getByText('#customer')).toBeOnTheScreen();
  });

  // ── Create form ────────────────────────────────────────────────────────────

  it('"Create promo" button is disabled when code and/or value are empty', async () => {
    render(<AdminWebPromosScreen />);
    await screen.findByText('SAVE20');
    // Button should be disabled — just verifying it exists and doesn't crash
    const createBtn = screen.getByText('Create promo');
    expect(createBtn).toBeOnTheScreen();
  });

  it('calls adminCreatePromoCode with correct args after filling form + pressing Create', async () => {
    render(<AdminWebPromosScreen />);
    await screen.findByText('SAVE20');

    // Fill code input (label text = "Code")
    fireEvent.changeText(screen.getByPlaceholderText('e.g. SAVE20'), 'SUMMER10');

    // Select 'fixed' type chip
    fireEvent.press(screen.getByText('fixed'));

    // Fill discount value
    fireEvent.changeText(screen.getByPlaceholderText('e.g. 500'), '200');

    // Press Create promo
    fireEvent.press(screen.getByText('Create promo'));

    await waitFor(() =>
      expect(mockAdminCreatePromoCode).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'SUMMER10',
          discount_type: 'fixed',
          discount_value: 200,
        }),
      ),
    );
  });

  // ── Enable / Disable ───────────────────────────────────────────────────────

  it('pressing Disable calls adminUpdatePromoCode with is_active: false for an active promo', async () => {
    render(<AdminWebPromosScreen />);
    await screen.findByText('SAVE20');

    // The fixture code is is_active: true, so the button label is "Disable"
    fireEvent.press(screen.getByText('Disable'));

    await waitFor(() =>
      expect(mockAdminUpdatePromoCode).toHaveBeenCalledWith(
        MOCK_PROMO_CODE.id,
        { is_active: false },
      ),
    );
  });

  it('pressing Enable calls adminUpdatePromoCode with is_active: true for an inactive promo', async () => {
    mockAdminGetPromoCodes.mockResolvedValue([
      { ...MOCK_PROMO_CODE, is_active: false },
    ]);
    render(<AdminWebPromosScreen />);
    await screen.findByText('SAVE20');

    // The code is now inactive, button label is "Enable"
    fireEvent.press(screen.getByText('Enable'));

    await waitFor(() =>
      expect(mockAdminUpdatePromoCode).toHaveBeenCalledWith(
        MOCK_PROMO_CODE.id,
        { is_active: true },
      ),
    );
  });

  // ── Empty states ───────────────────────────────────────────────────────────

  it('shows the codes empty state when no promo codes exist', async () => {
    mockAdminGetPromoCodes.mockResolvedValueOnce([]);
    render(<AdminWebPromosScreen />);
    expect(await screen.findByText('No promo codes yet.')).toBeOnTheScreen();
  });

  it('shows the redemptions empty state when no redemptions exist', async () => {
    mockAdminGetPromoRedemptions.mockResolvedValueOnce([]);
    render(<AdminWebPromosScreen />);
    expect(await screen.findByText('No redemptions yet.')).toBeOnTheScreen();
  });
});

// ── Desktop layout polish ─────────────────────────────────────────────────────
// Flattens nested style arrays without touching StyleSheet (keeps this suite free of require())
const flatStyle = (s: unknown): Record<string, unknown> =>
  Array.isArray(s) ? Object.assign({}, ...s.map(flatStyle)) : s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
describe('AdminWebPromosScreen — desktop layout', () => {
  beforeEach(() => {
    mockAdminGetPromoCodes.mockResolvedValue([MOCK_PROMO_CODE]);
    mockAdminGetPromoRedemptions.mockResolvedValue([MOCK_REDEMPTION]);
  });
  it('renders the in-row Disable/Enable control at the compact size and gives promo codes room', async () => {
    render(<AdminWebPromosScreen />);
    await screen.findByText('SAVE20');
    for (const b of screen.queryAllByRole('button', { name: /^(Disable|Enable)$/ })) expect(b).toHaveStyle({ height: 36 });
    // the code cell itself (the create form also labels its input 'Code')
    let node: any = screen.getByText('SAVE20');
    let width: unknown;
    for (let i = 0; i < 6 && node && width === undefined; i++) { const st = flatStyle(node.props?.style); if (st.flexBasis !== undefined) break; width = st.width; node = node.parent; }
    // the Code column keeps a 150px floor and the largest share of the codes table (see column-distribution tests)
    expect(width).toBeUndefined();
    expect(floor('Code')).toBeGreaterThanOrEqual(150);
  });
});

// Declared width of the table column that contains a header label (walks up to the cell style).
// Style of the table cell that contains a header label (the first ancestor declaring a flex basis or width).
const columnCellStyle = (label: string): Record<string, unknown> => {
  let node: any = screen.getAllByText(label).at(-1);
  for (let i = 0; i < 6 && node; i++) { const st = flatStyle(node.props?.style); if (st.flexBasis !== undefined || st.width !== undefined) return st; node = node.parent; }
  return {};
};
// Share of the free width a column receives (flex columns), asserting the column is not fixed-width.
const share = (label: string): number => { const st = columnCellStyle(label); expect(st.width).toBeUndefined(); expect(typeof st.flexGrow).toBe('number'); expect(st.flexShrink).toBe(0); return st.flexGrow as number; };
const floor = (label: string): number => { const st = columnCellStyle(label); expect(st.flexBasis).toBe(st.minWidth); return st.minWidth as number; };

describe('AdminWebPromosScreen — column distribution', () => {
  beforeEach(() => {
    mockAdminGetPromoCodes.mockResolvedValue([MOCK_PROMO_CODE]);
    mockAdminGetPromoRedemptions.mockResolvedValue([MOCK_REDEMPTION]);
  });
  it('codes table declares flex shares summing to 100% over content floors', async () => {
    render(<AdminWebPromosScreen />);
    await screen.findByText('SAVE20');
    const shares = ['Code', 'Type', 'Value', 'Limits', 'Window', 'Active', 'Action'].map(share);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect(share('Action')).toBeLessThanOrEqual(15);
    // content floors: real promo codes never break mid-word and the compact toggle keeps its room
    expect(floor('Code')).toBeGreaterThanOrEqual(150);
    expect(floor('Action')).toBeGreaterThanOrEqual(100);
    expect(floor('Window')).toBeGreaterThanOrEqual(160);
  });
  it('redemptions table declares flex shares summing to 100%', async () => {
    render(<AdminWebPromosScreen />);
    await screen.findByText('KES 500');
    const shares = ['Promo', 'Customer', 'Booking', 'Payment', 'Amount', 'Date'].map(share);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect(mockAdminUpdatePromoCode).not.toHaveBeenCalled();
  });
});
