/**
 * Tests for SafetyTipsCard.
 *
 * Verifies: renders SAFETY_REMINDERS and CUSTOMER_TIPS section headers and content.
 */
import { render, screen } from '@testing-library/react-native';
import { SafetyTipsCard } from '@/components/customer/safety-tips-card';

// Mock trust constants to control content in tests
jest.mock('@/constants/trust', () => ({
  SAFETY_REMINDERS: [
    { title: 'Share your location with a friend', body: 'Let a trusted person know.' },
    { title: 'Verify the provider', body: 'Check the profile photo.' },
  ],
  CUSTOMER_TIPS: [
    { title: 'Take clear before photos', body: 'Photograph the area.' },
    { title: 'Be available at the start', body: 'Be present to receive the provider.' },
  ],
}));

describe('SafetyTipsCard', () => {
  it('renders the safety reminders section header', () => {
    render(<SafetyTipsCard />);
    expect(screen.getByText('Safety reminders')).toBeOnTheScreen();
  });

  it('renders the customer tips section header', () => {
    render(<SafetyTipsCard />);
    expect(screen.getByText('Tips for a great experience')).toBeOnTheScreen();
  });

  it('renders all safety reminder titles', () => {
    render(<SafetyTipsCard />);
    expect(screen.getByText('Share your location with a friend')).toBeOnTheScreen();
    expect(screen.getByText('Verify the provider')).toBeOnTheScreen();
  });

  it('renders all customer tip titles', () => {
    render(<SafetyTipsCard />);
    expect(screen.getByText('Take clear before photos')).toBeOnTheScreen();
    expect(screen.getByText('Be available at the start')).toBeOnTheScreen();
  });

  it('renders safety reminder body text', () => {
    render(<SafetyTipsCard />);
    expect(screen.getByText('Let a trusted person know.')).toBeOnTheScreen();
  });

  it('renders customer tip body text', () => {
    render(<SafetyTipsCard />);
    expect(screen.getByText('Photograph the area.')).toBeOnTheScreen();
  });

  it('renders multiple section icons', () => {
    render(<SafetyTipsCard />);
    // 2 safety reminders + 2 tips = 4 shield + 2 lightbulb icons (4 🛡️ + 2 💡 -> but same emoji repeated)
    // Safety reminders use 🛡️, customer tips use 💡
    const shields = screen.getAllByText('🛡️');
    expect(shields).toHaveLength(2);
    const bulbs = screen.getAllByText('💡');
    expect(bulbs).toHaveLength(2);
  });
});
