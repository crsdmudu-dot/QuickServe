// suspension.test.ts — the admin suspension helpers (F5.6b): what is sent to the Edge Function, how its answers and
// refusals become plain messages, and the admin read of the latest suspension.
import { getLatestSuspension, liftSuspension, retrySignInBlock, suspendAccount } from '@/lib/suspension';

const mockInvoke = jest.fn();
const mockMaybeSingle = jest.fn();
const mockChain: Record<string, jest.Mock> = {};
jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    from: (table: string) => {
      mockChain.from(table);
      const chain = {
        select: (...a: unknown[]) => (mockChain.select(...a), chain),
        eq: (...a: unknown[]) => (mockChain.eq(...a), chain),
        order: (...a: unknown[]) => (mockChain.order(...a), chain),
        limit: (...a: unknown[]) => (mockChain.limit(...a), chain),
        maybeSingle: () => mockMaybeSingle(),
      };
      return chain;
    },
  },
}));

const U = '22222222-2222-4222-8222-222222222222';
const R = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of ['from', 'select', 'eq', 'order', 'limit']) mockChain[k] = jest.fn();
});

/** A non-2xx answer as supabase-js surfaces it: an error carrying the response on `context`. */
const httpError = (body: unknown) => ({ data: null, error: { context: { json: async () => body } } });

describe('calls to the Edge Function', () => {
  it('suspend sends the action, target, reason and report, and nothing about the admin', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, ban_state: 'banned', ban_state_recorded: true }, error: null });
    expect(await suspendAccount({ userId: U, reason: 'Spam', reportId: R })).toEqual({ ok: true, signInBlock: 'banned', recorded: true });
    expect(mockInvoke).toHaveBeenCalledWith('admin-account-suspension', {
      body: { action: 'suspend', user_id: U, reason: 'Spam', report_id: R },
    });
  });

  it('lift and retry send their action', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, ban_state: 'unbanned', ban_state_recorded: true }, error: null });
    await liftSuspension({ userId: U, note: 'Appeal accepted' });
    await retrySignInBlock(U);
    expect(mockInvoke.mock.calls.map((c) => c[1].body)).toEqual([
      { action: 'lift', user_id: U, note: 'Appeal accepted' },
      { action: 'retry_ban', user_id: U },
    ]);
  });

  it('reports a failed sign-in block and an unrecorded outcome truthfully', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, ban_state: 'failed', ban_state_recorded: false }, error: null });
    expect(await suspendAccount({ userId: U, reason: 'x' })).toEqual({ ok: true, signInBlock: 'failed', recorded: false });
  });

  it.each([
    ['not_allowed', 'Only an active admin can do this.'],
    ['already_suspended', 'This account is already suspended.'],
    ['user_not_suspendable', 'Only customers and providers can be suspended.'],
    ['user_deleted', 'This account has been deleted.'],
    ['no_suspension', 'This account has never been suspended.'],
  ])('turns the refusal "%s" into a plain message', async (code, message) => {
    mockInvoke.mockResolvedValue(httpError({ ok: false, error: code }));
    expect(await suspendAccount({ userId: U, reason: 'x' })).toEqual({ ok: false, error: message });
  });

  it('anything unexpected (unknown code, unreadable body, a thrown call) becomes the generic message', async () => {
    const generic = { ok: false, error: 'Could not complete the request. Please try again.' };
    mockInvoke.mockResolvedValue(httpError({ ok: false, error: 'something_new' }));
    expect(await suspendAccount({ userId: U, reason: 'x' })).toEqual(generic);
    mockInvoke.mockResolvedValue({ data: null, error: { context: { json: async () => { throw new Error('not json'); } } } });
    expect(await suspendAccount({ userId: U, reason: 'x' })).toEqual(generic);
    mockInvoke.mockRejectedValue(new Error('offline'));
    expect(await suspendAccount({ userId: U, reason: 'x' })).toEqual(generic);
    mockInvoke.mockResolvedValue({ data: { ok: true, ban_state: 'weird' }, error: null });
    expect(await suspendAccount({ userId: U, reason: 'x' })).toEqual(generic);
  });
});

describe('getLatestSuspension', () => {
  it('reads the newest suspension of that person from account_suspensions', async () => {
    const row = { id: 's1', reason: 'Spam', suspended_at: 't', lifted_at: null, lift_note: null, auth_ban_state: 'banned' };
    mockMaybeSingle.mockResolvedValue({ data: row, error: null });
    expect(await getLatestSuspension(U)).toEqual({ ok: true, suspension: row });
    expect(mockChain.from).toHaveBeenCalledWith('account_suspensions');
    expect(mockChain.eq).toHaveBeenCalledWith('user_id', U);
    expect(mockChain.order).toHaveBeenCalledWith('suspended_at', { ascending: false });
    expect(mockChain.limit).toHaveBeenCalledWith(1);
  });

  it('never suspended: ok with null; an error or a throw: not ok', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getLatestSuspension(U)).toEqual({ ok: true, suspension: null });
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await getLatestSuspension(U)).toEqual({ ok: false });
    mockMaybeSingle.mockRejectedValue(new Error('offline'));
    expect(await getLatestSuspension(U)).toEqual({ ok: false });
  });
});
