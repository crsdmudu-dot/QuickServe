/**
 * terms-gate.test.tsx — the signed-in Terms gate (F5.4): who is checked, the one-time automatic record for people who
 * ticked the box when registering, and accepting from the prompt.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { TermsGateProvider, useTermsGate } from '@/auth/terms-gate';
import { CURRENT_TERMS_VERSION } from '@/constants/terms';

let mockAuth: { session: unknown; role: string | null } = { session: null, role: null };
jest.mock('@/auth/auth-context', () => ({ useAuth: () => mockAuth }));
const mockStatus = jest.fn();
const mockAccept = jest.fn();
jest.mock('@/lib/terms', () => ({
  getMyTermsStatus: (...a: unknown[]) => mockStatus(...a),
  acceptCurrentTerms: (...a: unknown[]) => mockAccept(...a),
}));

function Probe() {
  const gate = useTermsGate();
  return (
    <>
      <Text testID="status">{gate.status}</Text>
      <Pressable testID="agree" onPress={() => void gate.accept()} />
    </>
  );
}
const session = (id: string, metadata: Record<string, unknown> = {}) => ({ user: { id, user_metadata: metadata } });
const status = () => screen.getByTestId('status').props.children;

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { session: null, role: null };
});

describe('TermsGateProvider', () => {
  it('is idle when signed out, and for admins (who are not gated in this app)', () => {
    const { rerender } = render(<TermsGateProvider><Probe /></TermsGateProvider>);
    expect(status()).toBe('idle');
    mockAuth = { session: session('a1'), role: 'admin' };
    rerender(<TermsGateProvider><Probe /></TermsGateProvider>);
    expect(status()).toBe('idle');
    expect(mockStatus).not.toHaveBeenCalled();
  });

  it('checks a signed-in customer: accepted when the current version is on record', async () => {
    mockAuth = { session: session('c1'), role: 'customer' };
    mockStatus.mockResolvedValue('accepted');
    render(<TermsGateProvider><Probe /></TermsGateProvider>);
    expect(status()).toBe('checking');
    await waitFor(() => expect(status()).toBe('accepted'));
    expect(mockStatus).toHaveBeenCalledWith('c1');
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('required for a provider with no record and no register consent', async () => {
    mockAuth = { session: session('p1'), role: 'provider' };
    mockStatus.mockResolvedValue('required');
    render(<TermsGateProvider><Probe /></TermsGateProvider>);
    await waitFor(() => expect(status()).toBe('required'));
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('records the register-checkbox consent once, automatically, at first sign-in', async () => {
    mockAuth = { session: session('c2', { terms_version: CURRENT_TERMS_VERSION }), role: 'customer' };
    mockStatus.mockResolvedValue('required');
    mockAccept.mockResolvedValue({ ok: true });
    render(<TermsGateProvider><Probe /></TermsGateProvider>);
    await waitFor(() => expect(status()).toBe('accepted'));
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockAccept).toHaveBeenCalledWith('register');
  });

  it('an older version agreed at registration still needs the prompt; so does a failed automatic record', async () => {
    mockAuth = { session: session('c3', { terms_version: 'draft-older' }), role: 'customer' };
    mockStatus.mockResolvedValue('required');
    const { unmount } = render(<TermsGateProvider><Probe /></TermsGateProvider>);
    await waitFor(() => expect(status()).toBe('required'));
    expect(mockAccept).not.toHaveBeenCalled();
    unmount();

    mockAuth = { session: session('c4', { terms_version: CURRENT_TERMS_VERSION }), role: 'customer' };
    mockAccept.mockResolvedValue({ ok: false, error: 'x' });
    render(<TermsGateProvider><Probe /></TermsGateProvider>);
    await waitFor(() => expect(status()).toBe('required'));
  });

  it('accepting from the prompt records source "prompt" and lifts the gate', async () => {
    mockAuth = { session: session('c5'), role: 'customer' };
    mockStatus.mockResolvedValue('required');
    mockAccept.mockResolvedValue({ ok: true });
    render(<TermsGateProvider><Probe /></TermsGateProvider>);
    await waitFor(() => expect(status()).toBe('required'));
    await act(async () => { fireEvent.press(screen.getByTestId('agree')); });
    await waitFor(() => expect(status()).toBe('accepted'));
    expect(mockAccept).toHaveBeenCalledWith('prompt');
  });

  it('a failed check leaves the status unknown (the database still enforces the rule)', async () => {
    mockAuth = { session: session('c6'), role: 'customer' };
    mockStatus.mockResolvedValue('unknown');
    render(<TermsGateProvider><Probe /></TermsGateProvider>);
    await waitFor(() => expect(status()).toBe('unknown'));
  });
});
