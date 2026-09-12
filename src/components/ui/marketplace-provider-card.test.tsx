/**
 * Tests for MarketplaceProviderCard.
 *
 * Verifies: name, rating, jobs, verified badge (when is_verified), years experience,
 * availability status, FavoriteButton firing onToggleFavorite, and that
 * response-time/distance are NOT rendered (no data today).
 */

import { render, screen, fireEvent } from '@testing-library/react-native';
import type { PublicProvider } from '@/lib/favorites';
import { MarketplaceProviderCard } from '@/components/ui/marketplace-provider-card';

const BASE_PROVIDER: PublicProvider = {
  provider_id: 'prov-1',
  full_name: 'Alice Wambui',
  average_rating: 4.8,
  review_count: 32,
  completed_jobs_count: 150,
  is_verified: true,
  years_experience: 5,
  availability_status: 'available',
  profile_photo_url: null,
  created_at: '2024-01-01T00:00:00Z',
};

function renderCard(
  overrides: Partial<PublicProvider> = {},
  isFavorite = false,
  onToggleFavorite = jest.fn(),
  onPress?: () => void,
) {
  const provider = { ...BASE_PROVIDER, ...overrides };
  return render(
    <MarketplaceProviderCard
      provider={provider}
      isFavorite={isFavorite}
      onToggleFavorite={onToggleFavorite}
      onPress={onPress}
    />,
  );
}

describe('MarketplaceProviderCard', () => {
  it('renders the provider display name', () => {
    renderCard();
    expect(screen.getByText('Alice Wambui')).toBeOnTheScreen();
  });

  it('falls back to "Provider" when full_name is null', () => {
    renderCard({ full_name: null });
    expect(screen.getByText('Provider')).toBeOnTheScreen();
  });

  it('renders rating and review count when average_rating is present', () => {
    renderCard({ average_rating: 4.8, review_count: 32 });
    expect(screen.getByText('4.8')).toBeOnTheScreen();
    expect(screen.getByText('(32)')).toBeOnTheScreen();
  });

  it('hides rating block gracefully when average_rating is null', () => {
    renderCard({ average_rating: null });
    expect(screen.queryByText(/\.0|\.5/)).toBeNull();
    // confirm (review_count) is not shown
    expect(screen.queryByText('(32)')).toBeNull();
  });

  it('renders completed jobs count', () => {
    renderCard({ completed_jobs_count: 150 });
    expect(screen.getByText('150 jobs')).toBeOnTheScreen();
  });

  it('renders VerifiedBadge when is_verified is true', () => {
    renderCard({ is_verified: true });
    expect(screen.getByText('Verified by KwikServe')).toBeOnTheScreen();
  });

  it('does NOT render VerifiedBadge when is_verified is false', () => {
    renderCard({ is_verified: false });
    expect(screen.queryByText('Verified by KwikServe')).toBeNull();
  });

  it('renders years experience when present', () => {
    renderCard({ years_experience: 5 });
    expect(screen.getByText('5yrs')).toBeOnTheScreen();
  });

  it('does NOT render years experience when null', () => {
    renderCard({ years_experience: null });
    expect(screen.queryByText(/yr/)).toBeNull();
  });

  it('shows Available indicator for availability_status "available"', () => {
    renderCard({ availability_status: 'available' });
    expect(screen.getByText('Available')).toBeOnTheScreen();
  });

  it('shows Unavailable indicator for non-available status', () => {
    renderCard({ availability_status: 'unavailable' });
    expect(screen.getByText('Unavailable')).toBeOnTheScreen();
  });

  it('renders FavoriteButton in inactive state by default', () => {
    renderCard({}, false);
    expect(screen.getByTestId('fav-inactive')).toBeOnTheScreen();
  });

  it('renders FavoriteButton in active state when isFavorite is true', () => {
    renderCard({}, true);
    expect(screen.getByTestId('fav-active')).toBeOnTheScreen();
  });

  it('calls onToggleFavorite with provider_id when FavoriteButton is pressed', () => {
    const onToggleFavorite = jest.fn();
    renderCard({}, false, onToggleFavorite);
    fireEvent.press(screen.getByRole('button', { name: 'Add to favorites' }));
    expect(onToggleFavorite).toHaveBeenCalledWith('prov-1');
  });

  it('does NOT render response time (no data today)', () => {
    renderCard();
    // Response time would be something like "5 min" or "response"
    expect(screen.queryByText(/response/i)).toBeNull();
    expect(screen.queryByText(/min\s*response/i)).toBeNull();
  });

  it('does NOT render distance (no data today)', () => {
    renderCard();
    // Distance would look like "2.5 km"
    expect(screen.queryByText(/km/i)).toBeNull();
  });

  it('fires onPress when the card is tapped', () => {
    const onPress = jest.fn();
    renderCard({}, false, jest.fn(), onPress);
    fireEvent.press(screen.getByText('Alice Wambui'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders singular "yr" for years_experience === 1', () => {
    renderCard({ years_experience: 1 });
    expect(screen.getByText('1yr')).toBeOnTheScreen();
  });
});
