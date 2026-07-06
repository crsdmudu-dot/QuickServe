/**
 * Tests for ServiceGuaranteesCard.
 *
 * Verifies: renders SERVICE_GUARANTEES section header and all guarantee content.
 */
import { render, screen } from '@testing-library/react-native';
import { ServiceGuaranteesCard } from '@/components/customer/service-guarantees-card';

// Mock trust constants to control content in tests
jest.mock('@/constants/trust', () => ({
  SERVICE_GUARANTEES: [
    { title: 'Vetted professionals', body: 'Every provider is background-checked.' },
    { title: 'Secure payment', body: 'Payments are processed through secure channels.' },
    { title: 'On-time commitment', body: 'Providers commit to your agreed time window.' },
  ],
}));

describe('ServiceGuaranteesCard', () => {
  it('renders the section header', () => {
    render(<ServiceGuaranteesCard />);
    expect(screen.getByText('Our guarantees')).toBeOnTheScreen();
  });

  it('renders all guarantee titles', () => {
    render(<ServiceGuaranteesCard />);
    expect(screen.getByText('Vetted professionals')).toBeOnTheScreen();
    expect(screen.getByText('Secure payment')).toBeOnTheScreen();
    expect(screen.getByText('On-time commitment')).toBeOnTheScreen();
  });

  it('renders all guarantee body text', () => {
    render(<ServiceGuaranteesCard />);
    expect(screen.getByText('Every provider is background-checked.')).toBeOnTheScreen();
    expect(screen.getByText('Payments are processed through secure channels.')).toBeOnTheScreen();
    expect(screen.getByText('Providers commit to your agreed time window.')).toBeOnTheScreen();
  });

  it('renders guarantee icons (✅) for each guarantee', () => {
    render(<ServiceGuaranteesCard />);
    const icons = screen.getAllByText('✅');
    expect(icons).toHaveLength(3);
  });
});
