/**
 * Tests for ProfileCompletionCard.
 *
 * Verifies: percentage shown, remaining count shown, done items shown,
 * future-ready items muted with "coming soon".
 */
import { render, screen } from '@testing-library/react-native';
import { ProfileCompletionCard } from '@/components/customer/profile-completion-card';

// ── Fixtures ───────────────────────────────────────────────────────────────────

/** 2 of 3 active items done = 67% */
const PARTIAL_COMPLETION = {
  percent: 67,
  items: [
    { key: 'full_name',       label: 'Full name',       done: true  },
    { key: 'phone',           label: 'Phone number',    done: true  },
    { key: 'default_address', label: 'Default address', done: false },
    { key: 'language',        label: 'Language',        done: false, futureReady: true },
    { key: 'communication_preferences', label: 'Communication preferences', done: false, futureReady: true },
    { key: 'notification_preferences',  label: 'Notification preferences',  done: false, futureReady: true },
  ],
  missing: ['Default address'],
};

/** All 3 active items done = 100% */
const FULL_COMPLETION = {
  percent: 100,
  items: [
    { key: 'full_name',       label: 'Full name',       done: true },
    { key: 'phone',           label: 'Phone number',    done: true },
    { key: 'default_address', label: 'Default address', done: true },
    { key: 'language',        label: 'Language',        done: false, futureReady: true },
  ],
  missing: [],
};

/** 0 of 3 done = 0% */
const EMPTY_COMPLETION = {
  percent: 0,
  items: [
    { key: 'full_name',       label: 'Full name',       done: false },
    { key: 'phone',           label: 'Phone number',    done: false },
    { key: 'default_address', label: 'Default address', done: false },
  ],
  missing: ['Full name', 'Phone number', 'Default address'],
};

describe('ProfileCompletionCard', () => {
  it('renders the section header', () => {
    render(<ProfileCompletionCard completion={PARTIAL_COMPLETION} />);
    expect(screen.getByText('Profile completeness')).toBeOnTheScreen();
  });

  it('shows the percentage', () => {
    render(<ProfileCompletionCard completion={PARTIAL_COMPLETION} />);
    expect(screen.getByText('67%')).toBeOnTheScreen();
  });

  it('shows "1 task remaining"', () => {
    render(<ProfileCompletionCard completion={PARTIAL_COMPLETION} />);
    expect(screen.getByText('1 task remaining')).toBeOnTheScreen();
  });

  it('shows "tasks remaining" plural for multiple missing', () => {
    render(<ProfileCompletionCard completion={EMPTY_COMPLETION} />);
    expect(screen.getByText('3 tasks remaining')).toBeOnTheScreen();
  });

  it('shows "Profile complete!" when percent is 100', () => {
    render(<ProfileCompletionCard completion={FULL_COMPLETION} />);
    expect(screen.getByText('Profile complete!')).toBeOnTheScreen();
  });

  it('renders all item labels', () => {
    render(<ProfileCompletionCard completion={PARTIAL_COMPLETION} />);
    expect(screen.getByText('Full name')).toBeOnTheScreen();
    expect(screen.getByText('Phone number')).toBeOnTheScreen();
    expect(screen.getByText('Default address')).toBeOnTheScreen();
  });

  it('renders "coming soon" for future-ready items', () => {
    render(<ProfileCompletionCard completion={PARTIAL_COMPLETION} />);
    // 3 future-ready items each get a "coming soon" badge
    const comingSoonBadges = screen.getAllByText('coming soon');
    expect(comingSoonBadges).toHaveLength(3);
  });

  it('renders the progress bar track', () => {
    render(<ProfileCompletionCard completion={PARTIAL_COMPLETION} />);
    expect(screen.getByTestId('progress-bar-track')).toBeOnTheScreen();
    expect(screen.getByTestId('progress-bar-fill')).toBeOnTheScreen();
  });
});
