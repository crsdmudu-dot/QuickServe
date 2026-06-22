/**
 * Tests for src/app/admin/provider/[id].tsx
 *
 * Mocks expo-router, @/lib/providers so no real network calls are made.
 * Uses findBy* for async data loads after getProviderProfile resolves.
 */

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'p1' }),
  router: { push: jest.fn(), replace: jest.fn() },
}));

const mockProfile = {
  id: 'p1',
  full_name: 'Jane',
  phone: '0700',
  approval_status: 'approved' as const,
  profile_photo_url: null,
  bio: 'Experienced cleaner',
  years_experience: 4,
  skills: ['Cleaning', 'Ironing'],
  is_verified: false,
  completed_jobs_count: 3,
  average_rating: null,
  availability_status: 'available' as const,
};

const mockGetProviderProfile = jest.fn().mockResolvedValue(mockProfile);
const mockAdminUpdateProviderProfile = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/providers', () => ({
  getProviderProfile: (...args: unknown[]) => mockGetProviderProfile(...args),
  adminUpdateProviderProfile: (...args: unknown[]) => mockAdminUpdateProviderProfile(...args),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AdminProviderDetailScreen from '@/app/admin/provider/[id]';

describe('AdminProviderDetailScreen', () => {
  beforeEach(() => {
    mockGetProviderProfile.mockClear();
    mockAdminUpdateProviderProfile.mockClear();
  });

  it('renders provider name and completed jobs count after data loads', async () => {
    render(<AdminProviderDetailScreen />);
    // Wait for profile to load — full_name should appear
    expect(await screen.findByText('Jane')).toBeOnTheScreen();
    // completed_jobs_count = 3 should be visible in the caption
    expect(screen.getByText(/3/)).toBeOnTheScreen();
  });

  it('pressing Verify calls adminUpdateProviderProfile with is_verified: true', async () => {
    render(<AdminProviderDetailScreen />);
    await screen.findByText('Jane');

    // Profile has is_verified: false, so the button label is 'Verify'
    fireEvent.press(screen.getByText('Verify'));

    await waitFor(() =>
      expect(mockAdminUpdateProviderProfile).toHaveBeenCalledWith('p1', { is_verified: true }),
    );
  });

  it('editing bio and pressing Save calls adminUpdateProviderProfile with the new bio', async () => {
    render(<AdminProviderDetailScreen />);
    await screen.findByText('Jane');

    // Change the bio input
    const bioInput = screen.getByPlaceholderText('Short bio…');
    fireEvent.changeText(bioInput, 'Expert cleaner');

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      const calls = mockAdminUpdateProviderProfile.mock.calls;
      const saveCall = calls.find(
        (call: unknown[]) =>
          call[0] === 'p1' &&
          typeof call[1] === 'object' &&
          call[1] !== null &&
          'bio' in (call[1] as object) &&
          (call[1] as { bio: string }).bio === 'Expert cleaner',
      );
      expect(saveCall).toBeDefined();
    });
  });
});
