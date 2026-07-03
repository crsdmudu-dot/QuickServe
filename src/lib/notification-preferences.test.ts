// notification-preferences.test.ts — Tests for getNotificationPreferences and
// updateNotificationPreferences in src/lib/notifications.ts.

import {
  getNotificationPreferences,
  updateNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '@/lib/notifications';

// ── Mock Supabase ──────────────────────────────────────────────────────────
// Note: variables used inside jest.mock() factory must be prefixed with "mock" (Jest rule).

const mockGetUser = jest.fn();
const mockSelect = jest.fn();
const mockMaybeSingle = jest.fn();
const mockUpsert = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: () => ({
      select: (...a: unknown[]) => {
        mockSelect(...a);
        return { maybeSingle: (...b: unknown[]) => mockMaybySingle(...b) };
      },
      upsert: (...a: unknown[]) => mockUpsert(...a),
    }),
  },
}));

// Alias inside module scope (outside jest.mock) so the tests can use the direct refs.
// The factory above references mockMaybySingle which we alias from mockMaybySingle here:
// (We need a trampoline because the factory closes over the variable at parse time.)
const mockMaybySingle = (...a: unknown[]) => mockMaybeSingle(...a);

beforeEach(() => {
  jest.clearAllMocks();
});

// ── getNotificationPreferences ─────────────────────────────────────────────

describe('getNotificationPreferences', () => {
  it('maps all 5 fields when a row is present', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        push_enabled: true,
        chat_enabled: false,
        booking_enabled: true,
        payment_enabled: false,
        marketing_enabled: true,
      },
    });
    const prefs = await getNotificationPreferences();
    expect(prefs).toEqual({
      push_enabled: true,
      chat_enabled: false,
      booking_enabled: true,
      payment_enabled: false,
      marketing_enabled: true,
    });
  });

  it('returns DEFAULT_NOTIFICATION_PREFERENCES when no row exists (data null)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null });
    const prefs = await getNotificationPreferences();
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(prefs.marketing_enabled).toBe(false);
  });

  it('returns safe defaults on error / missing data', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    const prefs = await getNotificationPreferences();
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });
});

// ── updateNotificationPreferences ─────────────────────────────────────────

describe('updateNotificationPreferences', () => {
  it('upserts with user_id from auth, the patch, and updated_at, then returns {ok:true}', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockUpsert.mockResolvedValue({ error: null });

    const res = await updateNotificationPreferences({ marketing_enabled: true });

    expect(res).toEqual({ ok: true });
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const upsertArg = mockUpsert.mock.calls[0][0] as Record<string, unknown>;
    expect(upsertArg.user_id).toBe('u1');
    expect(upsertArg.marketing_enabled).toBe(true);
    expect(typeof upsertArg.updated_at).toBe('string');
  });

  it('returns {ok:false} when user is not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await updateNotificationPreferences({ push_enabled: false });
    expect(res).toEqual({ ok: false, error: 'You must be signed in.' });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('returns {ok:false} when supabase upsert returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockUpsert.mockResolvedValue({ error: { message: 'constraint violation' } });
    const res = await updateNotificationPreferences({ booking_enabled: false });
    expect(res).toEqual({ ok: false, error: 'Could not update notification preferences.' });
  });
});
