// home-empty-catalogue.test.tsx — Phase 4C.1 regression.
// Business rule: when the admin has ZERO active services (a successful, empty
// catalogue), the customer home shows an intentional empty state and MUST NOT
// resurrect the hardcoded constants/services.ts catalogue.
//
// This fails on the pre-fix baseline (which rendered category sections / hardcoded
// cards) and passes after the fix (empty state, no service cards).

// Mock recent-services — home screen uses getRecentlyUsedServiceIds (slug list)
jest.mock('@/lib/recent-services', () => ({
  getRecentlyUsedServiceIds: jest.fn().mockResolvedValue([]),
  getRecentlyUsedServices: jest.fn().mockResolvedValue([]),
}));

// Mock notifications — home screen imports getUnreadNotificationCount for the bell
jest.mock('@/lib/notifications', () => ({
  getUnreadNotificationCount: jest.fn().mockResolvedValue(0),
}));

// Mock ServicesProvider with a SUCCESSFUL, EMPTY catalogue (loading already resolved).
jest.mock('@/services/services-provider', () => {
  const { mockServicesProviderModule } = require('../../test/mock-services');
  return mockServicesProviderModule({ services: [], loading: false });
});

import { render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/(customer)/home';
import { BookingDraftProvider } from '@/booking/booking-draft';
import { SERVICES } from '@/constants/services';

function renderHome() {
  return render(
    <BookingDraftProvider>
      <HomeScreen />
    </BookingDraftProvider>,
  );
}

describe('HomeScreen — empty service catalogue (admin has zero active services)', () => {
  it('shows the intentional empty state', () => {
    renderHome();
    expect(screen.getByText('No services available right now')).toBeOnTheScreen();
    expect(screen.getByText('Please check back soon.')).toBeOnTheScreen();
  });

  it('does NOT resurrect the hardcoded catalogue (no service cards, no category sections)', () => {
    renderHome();
    // None of the hardcoded services should render.
    for (const title of ['House Cleaning', 'Plumbing', 'Haircuts']) {
      expect(screen.queryByText(title)).toBeNull();
    }
    // Category section headers and service sections are hidden in the empty state.
    expect(screen.queryByText('Home Services')).toBeNull();
    expect(screen.queryByText('Trending')).toBeNull();
    // Sanity: the hardcoded list is non-trivial, so its absence is meaningful.
    expect(SERVICES.length).toBeGreaterThan(0);
  });
});
