import {
  getPendingProviders,
  setProviderApproval,
  getApprovedProviders,
  getProviderProfile,
  updateMyProviderProfile,
  adminUpdateProviderProfile,
} from '@/lib/providers';

const mockUpdate = jest.fn();
const mockUpdateEq = jest.fn();
const mockSelectEq = jest.fn();
const mockSingle = jest.fn();
const mockGetUser = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: () => ({
      select: () => ({
        eq: (...a: unknown[]) => mockSelectEq(...a),
        single: (...a: unknown[]) => mockSingle(...a),
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
  // Default selectEq returns an object with .eq() and .single()
  mockSelectEq.mockReturnValue({
    eq: jest.fn().mockResolvedValue({ data: [], error: null }),
    single: (...a: unknown[]) => mockSingle(...a),
  });
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

describe('getApprovedProviders', () => {
  it('getApprovedProviders filters provider+approved', async () => {
    // select().eq('role','provider') returns object with another .eq()
    // .eq('approval_status','approved') resolves to { data, error }
    const mockInnerEq = jest.fn().mockResolvedValue({ data: [{ id: 'p1' }], error: null });
    mockSelectEq.mockReturnValue({ eq: mockInnerEq });
    expect(await getApprovedProviders()).toEqual([{ id: 'p1' }]);
    expect(mockSelectEq).toHaveBeenCalledWith('role', 'provider');
    expect(mockInnerEq).toHaveBeenCalledWith('approval_status', 'approved');
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

describe('getProviderProfile', () => {
  it('returns the row or null', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'p1', is_verified: true }, error: null });
    expect(await getProviderProfile('p1')).toEqual({ id: 'p1', is_verified: true });
    mockSingle.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await getProviderProfile('p1')).toBeNull();
  });
});

describe('updateMyProviderProfile', () => {
  it('updates the signed-in user row', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'p1' } } });
    mockUpdate.mockReturnValue({ eq: (...a: unknown[]) => mockUpdateEq(...a) });
    mockUpdateEq.mockResolvedValue({ error: null });
    expect(await updateMyProviderProfile({ availability_status: 'unavailable' })).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledWith({ availability_status: 'unavailable' });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'p1');
  });
});

describe('adminUpdateProviderProfile', () => {
  it('updates by id incl is_verified', async () => {
    mockUpdate.mockReturnValue({ eq: (...a: unknown[]) => mockUpdateEq(...a) });
    mockUpdateEq.mockResolvedValue({ error: null });
    expect(await adminUpdateProviderProfile('p1', { is_verified: true })).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledWith({ is_verified: true });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'p1');
  });
});
