/**
 * Tests for src/app/trust.tsx (Slice 34 Task 5)
 *
 * Verifies:
 *   - No sample provider card with invented figures is shown (App Store 2.3.1)
 *   - The vetting text claims only team review and approval (owner, 2026-09-26)
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

  it('renders "Verified by KwikServe" badge text', () => {
    render(<TrustScreen />);
    // VerifiedBadge + body text both contain "Verified by KwikServe" — at least one present
    expect(screen.getAllByText('Verified by KwikServe').length).toBeGreaterThanOrEqual(1);
  });

  it('shows no sample provider card with invented figures', () => {
    render(<TrustScreen />);
    expect(screen.queryByTestId('trust-signal-card')).toBeNull();
  });

  it('claims team review and approval only, not background, ID or skills checks', () => {
    render(<TrustScreen />);
    expect(screen.getByText(/reviewed and approved by our team/)).toBeOnTheScreen();
    expect(screen.queryByText(/background check|identity verification|skills assessment/i)).toBeNull();
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
