/**
 * Tests for src/lib/terms.ts and src/constants/terms.ts (F5.4 Terms acceptance).
 */
import { acceptCurrentTerms, getMyTermsStatus, isTermsNotAccepted, TERMS_NOT_ACCEPTED_MESSAGE } from '@/lib/terms';
import { CURRENT_TERMS_VERSION, TERMS_KEY_POINTS, termsUrl } from '@/constants/terms';

const mockMaybeSingle = jest.fn();
const mockEq = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: (...a: unknown[]) => mockEq(...a) }) }),
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  // .eq('user_id', …).eq('terms_version', …).maybeSingle()
  mockEq.mockImplementation(() => ({ eq: (...a: unknown[]) => { mockEq(...a); return { maybeSingle: () => mockMaybeSingle() }; } }));
});

describe('getMyTermsStatus', () => {
  it('asks for this user and the current version', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { terms_version: CURRENT_TERMS_VERSION }, error: null });
    expect(await getMyTermsStatus('u1')).toBe('accepted');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'u1');
    expect(mockEq).toHaveBeenCalledWith('terms_version', CURRENT_TERMS_VERSION);
  });

  it('required when there is no record, unknown when the check fails', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getMyTermsStatus('u1')).toBe('required');
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'network' } });
    expect(await getMyTermsStatus('u1')).toBe('unknown');
  });
});

describe('acceptCurrentTerms', () => {
  it('sends the current version and the source', async () => {
    mockRpc.mockResolvedValue({ error: null });
    expect(await acceptCurrentTerms('prompt')).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('accept_terms', { p_version: CURRENT_TERMS_VERSION, p_source: 'prompt' });
  });

  it('explains an out-of-date app, and any other failure, in plain words', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'terms_version_mismatch' } });
    expect(await acceptCurrentTerms('register')).toEqual({ ok: false, error: 'Our Terms have been updated. Please update the app to continue.' });
    mockRpc.mockResolvedValue({ error: { message: 'boom' } });
    expect(await acceptCurrentTerms('prompt')).toEqual({ ok: false, error: 'Could not record your acceptance. Please try again.' });
  });
});

describe('isTermsNotAccepted', () => {
  it('recognises only the exact server refusal', () => {
    expect(isTermsNotAccepted({ message: 'terms_not_accepted' })).toBe(true);
    expect(isTermsNotAccepted({ message: 'terms_not_accepted: x' })).toBe(false);
    expect(isTermsNotAccepted(null)).toBe(false);
    expect(TERMS_NOT_ACCEPTED_MESSAGE).toBe('Please accept the Terms of Service first.');
  });
});

describe('constants/terms', () => {
  const saved = process.env.EXPO_PUBLIC_WEBSITE_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.EXPO_PUBLIC_WEBSITE_URL;
    else process.env.EXPO_PUBLIC_WEBSITE_URL = saved;
  });

  it('shows no Terms link until an https website address is configured', () => {
    delete process.env.EXPO_PUBLIC_WEBSITE_URL;
    expect(termsUrl()).toBeNull();
    process.env.EXPO_PUBLIC_WEBSITE_URL = 'http://kwikserve.example';
    expect(termsUrl()).toBeNull();
    process.env.EXPO_PUBLIC_WEBSITE_URL = 'https://kwikserve.example/';
    expect(termsUrl()).toBe('https://kwikserve.example/terms');
    process.env.EXPO_PUBLIC_WEBSITE_URL = 'https://kwikserve.example/evil path';
    expect(termsUrl()).toBeNull();
  });

  it('the key points include the owner-approved 24-hour report promise', () => {
    expect(TERMS_KEY_POINTS).toContain('You can report or block anyone. Our team reviews every report within 24 hours.');
  });
});
