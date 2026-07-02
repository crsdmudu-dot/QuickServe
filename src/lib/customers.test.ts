import { adminGetAllCustomers } from '@/lib/customers';

// ── Mock Supabase ──────────────────────────────────────────────────────────

const select = jest.fn();
const eq = jest.fn();
const order = jest.fn();

// Note: variables used inside jest.mock() factory must be prefixed with "mock" (Jest rule).
const mockSelect = select;
const mockEq = eq;
const mockOrder = order;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: (...a: unknown[]) => {
        mockSelect(...a);
        return {
          eq: (...b: unknown[]) => {
            mockEq(...b);
            return {
              order: (...c: unknown[]) => mockOrder(...c),
            };
          },
        };
      },
    }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Sample fixture ─────────────────────────────────────────────────────────

const mockCustomer = {
  id: 'cust1',
  full_name: 'Jane Doe',
  phone: '+254700000000',
  created_at: '2026-06-24T09:00:00Z',
};

// ── adminGetAllCustomers ───────────────────────────────────────────────────

describe('adminGetAllCustomers', () => {
  it('returns rows and applies role=customer filter and order on success', async () => {
    order.mockResolvedValue({ data: [mockCustomer], error: null });
    const res = await adminGetAllCustomers();
    expect(res).toEqual([mockCustomer]);
    expect(mockSelect).toHaveBeenCalledWith('id, full_name, phone, created_at');
    expect(mockEq).toHaveBeenCalledWith('role', 'customer');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    const res = await adminGetAllCustomers();
    expect(res).toEqual([]);
  });
});
