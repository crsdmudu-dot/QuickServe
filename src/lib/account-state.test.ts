// account-state.test.ts — isAccountSuspended (F5.6): true only on a clear "suspended" answer.
import { isAccountSuspended } from '@/lib/account-state';

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

beforeEach(() => mockRpc.mockReset());

describe('isAccountSuspended', () => {
  it('asks get_my_account_state about the caller only (no arguments)', async () => {
    mockRpc.mockResolvedValue({ data: 'active', error: null });
    await isAccountSuspended();
    expect(mockRpc).toHaveBeenCalledWith('get_my_account_state');
  });

  it('is true only for "suspended"', async () => {
    for (const [data, want] of [['suspended', true], ['active', false], ['deleted', false], [null, false]] as const) {
      mockRpc.mockResolvedValue({ data, error: null });
      expect(await isAccountSuspended()).toBe(want);
    }
  });

  it('answers false on an error or an exception, so a network problem never signs anyone out', async () => {
    mockRpc.mockResolvedValue({ data: 'suspended', error: { message: 'x' } });
    expect(await isAccountSuspended()).toBe(false);
    mockRpc.mockRejectedValue(new Error('offline'));
    expect(await isAccountSuspended()).toBe(false);
  });
});
