/**
 * Tests for AchievementGrid
 *
 * Verifies:
 *   - Earned achievement renders fully (icon + label, no "Locked").
 *   - Locked/unearned achievement shows "Locked" hint.
 *   - Progress bar text (current/target) renders when progress is present.
 *   - Empty achievements list shows empty hint.
 */

import { render, screen } from '@testing-library/react-native';
import { AchievementGrid } from '@/components/provider/achievement-grid';
import type { ProviderAchievement } from '@/lib/provider-achievements';

const EARNED_ACHIEVEMENT: ProviderAchievement = {
  key: 'first_job',
  label: 'First Job Done',
  icon: '🎉',
  earned: true,
};

const LOCKED_ACHIEVEMENT: ProviderAchievement = {
  key: 'jobs_10',
  label: '10 Jobs Completed',
  icon: '🔟',
  earned: false,
  progress: { current: 3, target: 10 },
};

const LOCKED_NO_PROGRESS: ProviderAchievement = {
  key: 'verified_provider',
  label: 'Verified Provider',
  icon: '✅',
  earned: false,
};

describe('AchievementGrid', () => {
  it('renders earned achievement icon and label', () => {
    render(<AchievementGrid achievements={[EARNED_ACHIEVEMENT]} />);
    expect(screen.getByText('🎉')).toBeOnTheScreen();
    expect(screen.getByText('First Job Done')).toBeOnTheScreen();
  });

  it('does NOT show "Locked" for earned achievement', () => {
    render(<AchievementGrid achievements={[EARNED_ACHIEVEMENT]} />);
    expect(screen.queryByText('Locked')).toBeNull();
  });

  it('shows "Locked" hint for unearned achievement', () => {
    render(<AchievementGrid achievements={[LOCKED_ACHIEVEMENT]} />);
    expect(screen.getByText('Locked')).toBeOnTheScreen();
  });

  it('renders progress bar text (current/target) when progress is present', () => {
    render(<AchievementGrid achievements={[LOCKED_ACHIEVEMENT]} />);
    expect(screen.getByText('3/10')).toBeOnTheScreen();
  });

  it('does NOT render progress text when progress is absent', () => {
    render(<AchievementGrid achievements={[LOCKED_NO_PROGRESS]} />);
    expect(screen.queryByText(/\//)).toBeNull();
  });

  it('renders both earned and locked achievements in one grid', () => {
    render(
      <AchievementGrid achievements={[EARNED_ACHIEVEMENT, LOCKED_ACHIEVEMENT]} />,
    );
    expect(screen.getByText('First Job Done')).toBeOnTheScreen();
    expect(screen.getByText('10 Jobs Completed')).toBeOnTheScreen();
    expect(screen.getByText('Locked')).toBeOnTheScreen();
  });

  it('renders a gentle empty hint when achievements array is empty', () => {
    render(<AchievementGrid achievements={[]} />);
    expect(
      screen.getByText(/No achievements yet/i),
    ).toBeOnTheScreen();
  });

  it('renders the correct icon for each achievement', () => {
    render(
      <AchievementGrid
        achievements={[EARNED_ACHIEVEMENT, LOCKED_ACHIEVEMENT]}
      />,
    );
    expect(screen.getByText('🎉')).toBeOnTheScreen();
    expect(screen.getByText('🔟')).toBeOnTheScreen();
  });
});
