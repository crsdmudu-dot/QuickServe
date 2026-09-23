/**
 * account-delete-screen.test.tsx — the confirmation gate, blocker rendering and sign-out handoff.
 *
 * The screen owns the UX gate only; the server owns identity, credential re-proof and the
 * transaction. So the contract tested here is: the button cannot fire until the confirmation word
 * AND a password are present; blockers from the server are rendered by code; success signs out
 * locally and leaves; admins are refused before any control is shown.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import DeleteAccountScreen from '@/app/account/delete';
import { DELETE_CONFIRMATION_WORD } from '@/lib/account';

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: (...a: unknown[]) => mockReplace(...a),
    back: (...a: unknown[]) => mockBack(...a),
  },
}));

const mockSignOut = jest.fn(async () => {});
let mockRole: 'customer' | 'provider' | 'admin' = 'customer';
jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({ role: mockRole, signOut: mockSignOut }),
}));

// The real client throws at import time without EXPO_PUBLIC_* env; the screen never talks to it
// directly (only through requestAccountDeletion, mocked below), so a stub is all that is needed.
jest.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));

const mockRequest = jest.fn();
jest.mock('@/lib/account', () => {
  const actual = jest.requireActual('@/lib/account');
  return { ...actual, requestAccountDeletion: (...a: unknown[]) => mockRequest(...a) };
});

jest.mock('@/components/ui/support-link', () => ({ SupportLink: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'customer';
});

function fillGate(word = DELETE_CONFIRMATION_WORD, password = 'correct horse') {
  fireEvent.changeText(screen.getByTestId('delete-account-confirmation'), word);
  fireEvent.changeText(screen.getByTestId('delete-account-password'), password);
}

describe('DeleteAccountScreen — confirmation gate', () => {
  it('starts disabled and stays disabled until the exact word AND a password are entered', () => {
    render(<DeleteAccountScreen />);
    const submit = screen.getByTestId('delete-account-submit');
    expect(submit.props.accessibilityState?.disabled ?? submit.props.disabled).toBe(true);

    fillGate('delete', 'pw'); // wrong case
    expect(submit.props.accessibilityState?.disabled ?? submit.props.disabled).toBe(true);

    fillGate(DELETE_CONFIRMATION_WORD, ''); // no password
    expect(submit.props.accessibilityState?.disabled ?? submit.props.disabled).toBe(true);

    fillGate();
    expect(submit.props.accessibilityState?.disabled ?? submit.props.disabled).toBe(false);
  });

  it('never calls the server while the gate is closed', () => {
    render(<DeleteAccountScreen />);
    fillGate('nope', 'pw');
    fireEvent.press(screen.getByTestId('delete-account-submit'));
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe('DeleteAccountScreen — outcomes', () => {
  it('renders every blocker the server returns, and does not sign out', async () => {
    mockRequest.mockResolvedValueOnce({
      ok: false,
      status: 'blocked',
      blockers: ['active_booking', 'positive_wallet_balance'],
    });
    render(<DeleteAccountScreen />);
    fillGate();
    fireEvent.press(screen.getByTestId('delete-account-submit'));

    await waitFor(() => expect(screen.getByTestId('delete-account-blocked-title')).toBeOnTheScreen());
    expect(screen.getByTestId('delete-account-blocker-active_booking')).toBeOnTheScreen();
    expect(screen.getByTestId('delete-account-blocker-positive_wallet_balance')).toBeOnTheScreen();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('on deleted: signs out locally and leaves for /welcome', async () => {
    mockRequest.mockResolvedValueOnce({ ok: true, status: 'deleted' });
    render(<DeleteAccountScreen />);
    fillGate();
    fireEvent.press(screen.getByTestId('delete-account-submit'));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith('/welcome');
    expect(mockRequest).toHaveBeenCalledWith({ password: 'correct horse', confirmation: DELETE_CONFIRMATION_WORD });
  });

  it('on pending_auth_delete: still signs out and leaves (access is already revoked server-side)', async () => {
    mockRequest.mockResolvedValueOnce({ ok: true, status: 'pending_auth_delete' });
    render(<DeleteAccountScreen />);
    fillGate();
    fireEvent.press(screen.getByTestId('delete-account-submit'));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith('/welcome');
  });

  it('shows a server error and keeps the session', async () => {
    mockRequest.mockResolvedValueOnce({ ok: false, status: 'error', error: 'Incorrect password.' });
    render(<DeleteAccountScreen />);
    fillGate();
    fireEvent.press(screen.getByTestId('delete-account-submit'));
    await waitFor(() => expect(screen.getByTestId('delete-account-error')).toBeOnTheScreen());
    expect(screen.getByText('Incorrect password.')).toBeOnTheScreen();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});

describe('DeleteAccountScreen — roles', () => {
  it('admins get a notice and no controls', () => {
    mockRole = 'admin';
    render(<DeleteAccountScreen />);
    expect(screen.getByTestId('delete-account-admin-notice')).toBeOnTheScreen();
    expect(screen.queryByTestId('delete-account-submit')).toBeNull();
    expect(screen.queryByTestId('delete-account-password')).toBeNull();
  });

  it('providers see provider-specific retention copy', () => {
    mockRole = 'provider';
    render(<DeleteAccountScreen />);
    expect(screen.getByText(/earnings and payouts/)).toBeOnTheScreen();
    expect(screen.getByText(/all earnings paid out/)).toBeOnTheScreen();
  });
});

/**
 * Retention disclosure.
 *
 * The screen must not under-state what survives deletion. It previously named only bookings,
 * payments and payouts while the implementation also retains support cases, safety records and
 * account flags, so the in-app copy disclosed less than both the public page and the database.
 * These cases pin the full disclosure and the purpose limitation that qualifies it.
 */
const NO_FIXED_PERIOD = /\b\d+\s*(years?|months?|days?)\b/i;

describe('DeleteAccountScreen — retention disclosure', () => {
  it.each(['customer', 'provider'] as const)('discloses support and safety records to a %s', (role) => {
    mockRole = role;
    render(<DeleteAccountScreen />);
    expect(
      screen.getByText(/support cases, internal notes and safety[\s\S]*fraud records/),
    ).toBeOnTheScreen();
  });

  it('discloses that booking photos are kept', () => {
    mockRole = 'customer';
    render(<DeleteAccountScreen />);
    expect(screen.getByText(/photos attached to those bookings/)).toBeOnTheScreen();
  });

  it('limits retention to named purposes', () => {
    mockRole = 'customer';
    render(<DeleteAccountScreen />);
    expect(screen.getByText(/Only where one of these still applies/)).toBeOnTheScreen();
    expect(screen.getByText(/fraud prevention or a legal obligation/)).toBeOnTheScreen();
  });

  it('states affirmatively that photos and notes can still identify the user', () => {
    mockRole = 'customer';
    render(<DeleteAccountScreen />);
    expect(screen.getByText(/may show you or your home/)).toBeOnTheScreen();
    expect(screen.getByText(/support notes written by our staff may describe you/)).toBeOnTheScreen();
    expect(screen.getByText(/We do not edit either/)).toBeOnTheScreen();
  });

  it('states that the account record is retained and still links past activity', () => {
    mockRole = 'customer';
    render(<DeleteAccountScreen />);
    expect(screen.getByText(/Your account record is not erased/)).toBeOnTheScreen();
    expect(screen.getByText(/links your past bookings and payments together/)).toBeOnTheScreen();
  });

  it('describes access as staff plus the booking counterpart, not staff alone', () => {
    mockRole = 'customer';
    render(<DeleteAccountScreen />);
    expect(screen.getByText(/the other person on a booking you shared/)).toBeOnTheScreen();
    expect(screen.getByText(/never use them for unrelated purposes/)).toBeOnTheScreen();
  });

  it('promises no end-of-retention deletion while no such process is implemented', () => {
    mockRole = 'customer';
    const { toJSON } = render(<DeleteAccountScreen />);
    const text = JSON.stringify(toJSON());
    expect(text).not.toMatch(/fully anonymised/i);
    expect(text).not.toMatch(/deleted or fully anonymous/i);
  });

  it('states that access ends on completion without promising other devices sign out', () => {
    mockRole = 'customer';
    const { toJSON } = render(<DeleteAccountScreen />);
    const text = JSON.stringify(toJSON());
    expect(text).toMatch(/Your access ends as soon as the deletion completes/);
    expect(text).toMatch(/may keep showing its last screen/);
    expect(text).not.toMatch(/signed out on every\s*device/i);
  });

  it('quotes no fixed retention period', () => {
    mockRole = 'customer';
    const { toJSON } = render(<DeleteAccountScreen />);
    expect(JSON.stringify(toJSON())).not.toMatch(NO_FIXED_PERIOD);
  });
});
