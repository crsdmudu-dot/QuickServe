/**
 * Tests for CasePriorityBadge
 *
 * Verifies that the correct human-readable label is rendered for each
 * CasePriority value defined in CASE_PRIORITIES (constants/operations.ts).
 */

import { render, screen } from '@testing-library/react-native';
import { CasePriorityBadge } from '@/components/admin-web/operations/case-priority-badge';

describe('CasePriorityBadge', () => {
  it('renders "Low" for priority low', () => {
    render(<CasePriorityBadge priority="low" />);
    expect(screen.getByText('Low')).toBeOnTheScreen();
  });

  it('renders "Medium" for priority medium', () => {
    render(<CasePriorityBadge priority="medium" />);
    expect(screen.getByText('Medium')).toBeOnTheScreen();
  });

  it('renders "High" for priority high', () => {
    render(<CasePriorityBadge priority="high" />);
    expect(screen.getByText('High')).toBeOnTheScreen();
  });

  it('renders "Urgent" for priority urgent', () => {
    render(<CasePriorityBadge priority="urgent" />);
    expect(screen.getByText('Urgent')).toBeOnTheScreen();
  });
});
