/**
 * Tests for CompletenessCard
 *
 * Verifies:
 *   - Shows percentage value.
 *   - Done items marked ✓; remaining items not.
 *   - Future-ready items shown muted with "coming soon".
 *   - "N tasks remaining" summary line.
 *   - "All active items complete!" when no missing items.
 */

import { render, screen } from '@testing-library/react-native';
import { CompletenessCard } from '@/components/provider/completeness-card';
import type { CompletenessResult } from '@/lib/provider-completeness';

/** A completeness result with 2 done, 1 remaining, 2 future-ready. */
const PARTIAL_COMPLETENESS: CompletenessResult = {
  percent: 67,
  items: [
    { key: 'photo',               label: 'Profile photo',           done: true,  futureReady: false },
    { key: 'bio',                 label: 'Bio',                     done: true,  futureReady: false },
    { key: 'experience',          label: 'Years of experience',     done: false, futureReady: false },
    { key: 'government_verification', label: 'Government verification', done: false, futureReady: true },
    { key: 'payment_details',     label: 'Payment details',         done: false, futureReady: true },
  ],
  missing: ['Years of experience'],
};

const COMPLETE_COMPLETENESS: CompletenessResult = {
  percent: 100,
  items: [
    { key: 'photo', label: 'Profile photo', done: true, futureReady: false },
    { key: 'bio',   label: 'Bio',           done: true, futureReady: false },
  ],
  missing: [],
};

describe('CompletenessCard', () => {
  it('shows the percentage value', () => {
    render(<CompletenessCard completeness={PARTIAL_COMPLETENESS} />);
    expect(screen.getByText('67%')).toBeOnTheScreen();
  });

  it('renders "N tasks remaining" when items remain', () => {
    render(<CompletenessCard completeness={PARTIAL_COMPLETENESS} />);
    expect(screen.getByText('1 task remaining')).toBeOnTheScreen();
  });

  it('renders "All active items complete!" when nothing is missing', () => {
    render(<CompletenessCard completeness={COMPLETE_COMPLETENESS} />);
    expect(screen.getByText('All active items complete!')).toBeOnTheScreen();
  });

  it('shows ✓ for done items', () => {
    render(<CompletenessCard completeness={PARTIAL_COMPLETENESS} />);
    // There are 2 done items — getAllByText finds both
    const checks = screen.getAllByText('✓');
    expect(checks.length).toBe(2);
  });

  it('shows future-ready items with "coming soon" label', () => {
    render(<CompletenessCard completeness={PARTIAL_COMPLETENESS} />);
    const comingSoon = screen.getAllByText('coming soon');
    expect(comingSoon.length).toBe(2);
  });

  it('renders future-ready item labels', () => {
    render(<CompletenessCard completeness={PARTIAL_COMPLETENESS} />);
    expect(screen.getByText('Government verification')).toBeOnTheScreen();
    expect(screen.getByText('Payment details')).toBeOnTheScreen();
  });

  it('renders all item labels', () => {
    render(<CompletenessCard completeness={PARTIAL_COMPLETENESS} />);
    expect(screen.getByText('Profile photo')).toBeOnTheScreen();
    expect(screen.getByText('Bio')).toBeOnTheScreen();
    expect(screen.getByText('Years of experience')).toBeOnTheScreen();
  });

  it('uses plural "tasks" for >1 remaining', () => {
    const multi: CompletenessResult = {
      percent: 50,
      items: [
        { key: 'photo',       label: 'Profile photo',       done: true,  futureReady: false },
        { key: 'bio',         label: 'Bio',                 done: false, futureReady: false },
        { key: 'experience',  label: 'Years of experience', done: false, futureReady: false },
      ],
      missing: ['Bio', 'Years of experience'],
    };
    render(<CompletenessCard completeness={multi} />);
    expect(screen.getByText('2 tasks remaining')).toBeOnTheScreen();
  });
});
