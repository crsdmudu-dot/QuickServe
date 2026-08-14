/**
 * Tests for TrustSignalCard.
 *
 * Verifies: renders signals, VerifiedBadge for 'verified' signal,
 * empty state when no signals.
 */
import { render, screen } from '@testing-library/react-native';
import { TrustSignalCard } from '@/components/customer/trust-signal-card';

const SIGNALS = [
  { key: 'verified',  label: 'Verified provider',    icon: '✅' },
  { key: 'jobs_100',  label: '100+ jobs completed',  icon: '💯' },
  { key: 'top_rated', label: 'Top rated 4.8★',       icon: '⭐' },
];

describe('TrustSignalCard', () => {
  it('renders the section header', () => {
    render(<TrustSignalCard signals={SIGNALS} />);
    expect(screen.getByText('Trust signals')).toBeOnTheScreen();
  });

  it('renders all signal labels', () => {
    render(<TrustSignalCard signals={SIGNALS} />);
    expect(screen.getByText('Verified provider')).toBeOnTheScreen();
    expect(screen.getByText('100+ jobs completed')).toBeOnTheScreen();
    expect(screen.getByText('Top rated 4.8★')).toBeOnTheScreen();
  });

  it('renders all signal icons', () => {
    render(<TrustSignalCard signals={SIGNALS} />);
    expect(screen.getByText('✅')).toBeOnTheScreen();
    expect(screen.getByText('💯')).toBeOnTheScreen();
    expect(screen.getByText('⭐')).toBeOnTheScreen();
  });

  it('renders VerifiedBadge for the verified signal', () => {
    render(<TrustSignalCard signals={SIGNALS} />);
    // VerifiedBadge renders "Verified by KwikServe"
    expect(screen.getByText('Verified by KwikServe')).toBeOnTheScreen();
  });

  it('does NOT render VerifiedBadge when no verified signal', () => {
    const noVerified = SIGNALS.filter((s) => s.key !== 'verified');
    render(<TrustSignalCard signals={noVerified} />);
    expect(screen.queryByText('Verified by KwikServe')).toBeNull();
  });

  it('renders empty state when signals array is empty', () => {
    render(<TrustSignalCard signals={[]} />);
    expect(screen.getByText('No signals yet')).toBeOnTheScreen();
  });
});
