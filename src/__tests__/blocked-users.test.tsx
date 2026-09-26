/**
 * Tests for the "Blocked people" screen (src/app/blocked-users.tsx), with the REAL @/lib/blocks
 * wrappers; only supabase.rpc is mocked, routed by function name.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
}));

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import BlockedUsersScreen from '@/app/blocked-users';

const ROWS = [
  { user_id: 'prov-1', display_name: 'Baraka Provider', role: 'provider', blocked_at: '2026-09-26T10:00:00Z' },
  { user_id: 'cust-1', display_name: 'Asha', role: 'customer', blocked_at: '2026-09-25T10:00:00Z' },
];

describe('BlockedUsersScreen', () => {
  beforeEach(() => mockRpc.mockReset());

  it('lists the people you blocked, with their role', async () => {
    mockRpc.mockResolvedValue({ data: ROWS, error: null });
    render(<BlockedUsersScreen />);
    expect(await screen.findByText('Baraka Provider')).toBeOnTheScreen();
    expect(screen.getByText('Asha')).toBeOnTheScreen();
    expect(screen.getByText(/^Provider · blocked/)).toBeOnTheScreen();
    expect(screen.getByText(/^Customer · blocked/)).toBeOnTheScreen();
  });

  it('Unblock calls unblock_user and removes the person from the list', async () => {
    mockRpc.mockImplementation((fn: string) =>
      Promise.resolve(fn === 'get_my_blocked_users' ? { data: ROWS, error: null } : { data: null, error: null }),
    );
    render(<BlockedUsersScreen />);
    await screen.findByText('Baraka Provider');
    fireEvent.press(screen.getByTestId('unblock-prov-1'));
    await waitFor(() => expect(screen.queryByText('Baraka Provider')).toBeNull());
    expect(mockRpc).toHaveBeenCalledWith('unblock_user', { p_user_id: 'prov-1' });
    expect(screen.getByText('Asha')).toBeOnTheScreen();
  });

  it('a failed unblock keeps the person and shows a message', async () => {
    mockRpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === 'get_my_blocked_users'
          ? { data: ROWS, error: null }
          : { data: null, error: { message: 'boom', code: 'XX000' } },
      ),
    );
    render(<BlockedUsersScreen />);
    await screen.findByText('Baraka Provider');
    fireEvent.press(screen.getByTestId('unblock-prov-1'));
    expect(await screen.findByText('Could not unblock. Please try again.')).toBeOnTheScreen();
    expect(screen.getByText('Baraka Provider')).toBeOnTheScreen();
  });

  it('shows an empty state when no one is blocked', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    render(<BlockedUsersScreen />);
    expect(await screen.findByText('No one blocked')).toBeOnTheScreen();
  });

  it('a failed load offers Retry, which loads again', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { message: 'boom', code: 'XX000' } })
      .mockResolvedValueOnce({ data: ROWS, error: null });
    render(<BlockedUsersScreen />);
    expect(await screen.findByText('Could not load blocked people.')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Baraka Provider')).toBeOnTheScreen();
  });
});
