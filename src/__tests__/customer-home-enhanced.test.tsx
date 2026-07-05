/**
 * Tests for the enhanced src/app/(customer)/index.tsx (Home).
 *
 * Verifies the NEW additive sections (Featured, Trending, Recently Used)
 * and entry links (search, providers, favorites). Keeps all existing behavior.
 *
 * Mocks: expo-router, booking-draft, lib/recent-services, constants/discovery.
 */

// ── Mocks ───────────────────────────────────────────────────────────────────
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

const mockStart = jest.fn();
jest.mock('@/booking/booking-draft', () => ({
  useBookingDraft: () => ({ start: mockStart }),
  BookingDraftProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockGetRecentlyUsedServices = jest.fn().mockResolvedValue([]);

jest.mock('@/lib/recent-services', () => ({
  getRecentlyUsedServices: (...args: unknown[]) => mockGetRecentlyUsedServices(...args),
}));

// ── Imports ─────────────────────────────────────────────────────────────────
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import HomeScreen from '@/app/(customer)/index';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRecentlyUsedServices.mockResolvedValue([]);
});

describe('HomeScreen (enhanced — additive sections)', () => {
  it('still renders the search bar placeholder', () => {
    render(<HomeScreen />);
    expect(screen.getByPlaceholderText('Search services')).toBeOnTheScreen();
  });

  it('still renders a time-based greeting', () => {
    render(<HomeScreen />);
    expect(
      screen.getByText(/Good (Morning|Afternoon|Evening)/),
    ).toBeOnTheScreen();
  });

  it('still renders the subtitle', () => {
    render(<HomeScreen />);
    expect(
      screen.getByText('What service do you need today?'),
    ).toBeOnTheScreen();
  });

  it('still renders category section titles', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Home Services')).toBeOnTheScreen();
    expect(screen.getByText('Auto Services')).toBeOnTheScreen();
    expect(screen.getByText('Delivery Services')).toBeOnTheScreen();
    expect(screen.getByText('Personal Care')).toBeOnTheScreen();
  });

  it('renders a Popular section', () => {
    render(<HomeScreen />);
    const matches = screen.getAllByText('Popular');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders Featured section', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Featured')).toBeOnTheScreen();
  });

  it('renders Trending section', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Trending')).toBeOnTheScreen();
  });

  it('renders Browse all categories footer link', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Browse all categories →')).toBeOnTheScreen();
  });

  it('search bar tap pushes to /(customer)/search', () => {
    render(<HomeScreen />);
    // The SearchBar is wrapped in a TouchableOpacity
    const searchBar = screen.getByPlaceholderText('Search services');
    // Press the parent touchable (fire event on the search input's parent)
    fireEvent.press(searchBar);
    expect(router.push).toHaveBeenCalledWith('/(customer)/search');
  });

  it('Browse providers link pushes to /(customer)/providers', () => {
    render(<HomeScreen />);
    fireEvent.press(screen.getByText('🛠 Browse providers'));
    expect(router.push).toHaveBeenCalledWith('/(customer)/providers');
  });

  it('My favorites link pushes to /(customer)/favorites', () => {
    render(<HomeScreen />);
    fireEvent.press(screen.getByText('🤍 My favorites'));
    expect(router.push).toHaveBeenCalledWith('/(customer)/favorites');
  });

  it('Browse all categories footer link pushes to /(customer)/search', () => {
    render(<HomeScreen />);
    fireEvent.press(screen.getByText('Browse all categories →'));
    expect(router.push).toHaveBeenCalledWith('/(customer)/search');
  });

  it('renders Recently Used section when recent services exist', async () => {
    const recentService = {
      id: 'house-cleaning',
      title: 'House Cleaning',
      subtitle: 'Deep clean',
      icon: '🧹',
      startingPrice: 1500,
      category: 'home' as const,
      badge: 'Popular' as const,
    };
    mockGetRecentlyUsedServices.mockResolvedValue([recentService]);
    render(<HomeScreen />);
    expect(await screen.findByText('Recently Used')).toBeOnTheScreen();
  });

  it('does NOT render Recently Used section when no recent services', async () => {
    mockGetRecentlyUsedServices.mockResolvedValue([]);
    render(<HomeScreen />);
    // Let the async settle
    await waitFor(() => expect(mockGetRecentlyUsedServices).toHaveBeenCalled());
    // May have skeleton briefly but no "Recently Used" heading after load
    await waitFor(() =>
      expect(screen.queryByText('Recently Used')).toBeNull(),
    );
  });
});
