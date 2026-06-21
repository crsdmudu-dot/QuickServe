import { getPendingProviders, setProviderApproval } from '@/lib/providers';

const mockUpdate = jest.fn();
const mockUpdateEq = jest.fn();
const mockSelectEq = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: () => ({
      select: () => ({
        eq: (...a: unknown[]) => mockSelectEq(...a),
      }),
      update: (...a: unknown[]) => mockUpdate(...a),
    }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  // Default update chain: update().eq() resolves ok
  mockUpdate.mockReturnValue({ eq: (...a: unknown[]) => mockUpdateEq(...a) });
  mockUpdateEq.mockResolvedValue({ error: null });
});

describe('getPendingProviders', () => {
  it('queries provider+pending', async () => {
    // .eq('role','provider') returns object with another .eq()
    // .eq('approval_status','pending') resolves to { data, error }
    const mockInnerEq = jest.fn().mockResolvedValue({ data: [{ id: 'p1' }], error: null });
    mockSelectEq.mockReturnValue({ eq: mockInnerEq });
    expect(await getPendingProviders()).toEqual([{ id: 'p1' }]);
    expect(mockSelectEq).toHaveBeenCalledWith('role', 'provider');
    expect(mockInnerEq).toHaveBeenCalledWith('approval_status', 'pending');
  });
});

describe('setProviderApproval', () => {
  it('updates status and returns ok', async () => {
    expect(await setProviderApproval('p1', 'approved')).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledWith({ approval_status: 'approved' });
  });
  it('maps update error', async () => {
    mockUpdateEq.mockResolvedValue({ error: { message: 'boom' } });
    expect(await setProviderApproval('p1', 'rejected')).toEqual({ ok: false, error: 'Could not update provider. Please try again.' });
  });
});
