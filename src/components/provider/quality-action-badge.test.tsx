/**
 * Tests for QualityActionBadge
 *
 * Verifies:
 *   - Correct label rendered per action type.
 *   - Color applied to label text for each action type.
 */

import { render, screen } from '@testing-library/react-native';
import { QualityActionBadge } from '@/components/provider/quality-action-badge';
import { QUALITY_ACTION_TYPES } from '@/constants/provider-quality';

describe('QualityActionBadge', () => {
  it('renders the correct label for coaching_needed', () => {
    render(<QualityActionBadge actionType="coaching_needed" />);
    expect(screen.getByText('Coaching needed')).toBeOnTheScreen();
  });

  it('renders the correct label for coaching_completed', () => {
    render(<QualityActionBadge actionType="coaching_completed" />);
    expect(screen.getByText('Coaching completed')).toBeOnTheScreen();
  });

  it('renders the correct label for warning_given', () => {
    render(<QualityActionBadge actionType="warning_given" />);
    expect(screen.getByText('Warning given')).toBeOnTheScreen();
  });

  it('renders the correct label for improvement_observed', () => {
    render(<QualityActionBadge actionType="improvement_observed" />);
    expect(screen.getByText('Improvement observed')).toBeOnTheScreen();
  });

  it('renders the correct label for temporarily_paused_recommended', () => {
    render(<QualityActionBadge actionType="temporarily_paused_recommended" />);
    expect(screen.getByText('Temporary pause recommended')).toBeOnTheScreen();
  });

  it('renders the correct label for no_action', () => {
    render(<QualityActionBadge actionType="no_action" />);
    expect(screen.getByText('No action')).toBeOnTheScreen();
  });

  it('applies the correct color for warning (coaching_needed = #F5A524)', () => {
    render(<QualityActionBadge actionType="coaching_needed" />);
    const meta = QUALITY_ACTION_TYPES.find((t) => t.id === 'coaching_needed')!;
    const el = screen.getByText('Coaching needed');
    // style is a nested array — flatten and check for the color object
    const flatStyle = [el.props.style].flat(Infinity) as object[];
    expect(flatStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: meta.color })]),
    );
  });

  it('applies the correct color for error (warning_given = #E5484D)', () => {
    render(<QualityActionBadge actionType="warning_given" />);
    const meta = QUALITY_ACTION_TYPES.find((t) => t.id === 'warning_given')!;
    const el = screen.getByText('Warning given');
    const flatStyle = [el.props.style].flat(Infinity) as object[];
    expect(flatStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: meta.color })]),
    );
  });

  it('renders all 6 action types without crashing', () => {
    for (const qt of QUALITY_ACTION_TYPES) {
      const { unmount } = render(<QualityActionBadge actionType={qt.id} />);
      expect(screen.getByText(qt.label)).toBeOnTheScreen();
      unmount();
    }
  });
});
