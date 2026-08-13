/**
 * Tests for src/app/trust.tsx (Slice 34 Task 5)
 *
 * Verifies:
 *   - TrustSignalCard is rendered with signals
 *   - ServiceGuaranteesCard is rendered
 *   - SafetyTipsCard is rendered
 *   - Verified provider explanation section (VerifiedBadge) is rendered
 */

import { render, screen, waitFor } from '@testing-library/react-native';

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Trust components — mock with testIDs so we can assert mounting
jest.mock('@/components/customer/trust-signal-card', () => ({
  TrustSignalCard: ({ signals }: { signals: { key: string; label: string; icon: string }[] }) => {
    const { View } = require('react-native');
    return (
      <View
        testID="trust-signal-card"
        accessibilityLabel={`signals:${signals.map((s) => s.key).join(',')}`}
      />
    );
  },
}));

jest.mock('@/components/customer/service-guarantees-card', () => ({
  ServiceGuaranteesCard: () => {
    const { View } = require('react-native');
    return <View testID="service-guarantees-card" />;
  },
}));

jest.mock('@/components/customer/safety-tips-card', () => ({
  SafetyTipsCard: () => {
    const { View } = require('react-native');
    return <View testID="safety-tips-card" />;
  },
}));

// VerifiedBadge — keep real component (it's a simple View+Text, no side effects)

import TrustScreen from '@/app/trust';

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TrustScreen', () => {
  it('renders the heading', () => {
    render(<TrustScreen />);
    expect(screen.getByText('Trust & Safety')).toBeOnTheScreen();
  });

  it('renders the verified providers section', () => {
    render(<TrustScreen />);
    expect(screen.getByText('Verified providers')).toBeOnTheScreen();
  });

  it('renders "Verified by QuickServe" badge text', () => {
    render(<TrustScreen />);
    // VerifiedBadge + body text both contain "Verified by QuickServe" — at least one present
    expect(screen.getAllByText('Verified by QuickServe').length).toBeGreaterThanOrEqual(1);
  });

  it('renders TrustSignalCard with illustrative signals', () => {
    render(<TrustScreen />);
    const card = screen.getByTestId('trust-signal-card');
    expect(card).toBeOnTheScreen();
    // The illustrative signals include verified, jobs_100, top_rated
    const label = card.props.accessibilityLabel as string;
    expect(label).toContain('verified');
    expect(label).toContain('jobs_100');
    expect(label).toContain('top_rated');
  });

  it('renders ServiceGuaranteesCard', () => {
    render(<TrustScreen />);
    expect(screen.getByTestId('service-guarantees-card')).toBeOnTheScreen();
  });

  it('renders SafetyTipsCard', () => {
    render(<TrustScreen />);
    expect(screen.getByTestId('safety-tips-card')).toBeOnTheScreen();
  });
});
