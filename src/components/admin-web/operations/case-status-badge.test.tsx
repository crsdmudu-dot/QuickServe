/**
 * Tests for CaseStatusBadge
 *
 * Verifies that the correct human-readable label is rendered for each
 * CaseStatus value defined in CASE_STATUSES (constants/operations.ts).
 */

import { render, screen } from '@testing-library/react-native';
import { CaseStatusBadge } from '@/components/admin-web/operations/case-status-badge';

describe('CaseStatusBadge', () => {
  it('renders "Open" for status open', () => {
    render(<CaseStatusBadge status="open" />);
    expect(screen.getByText('Open')).toBeOnTheScreen();
  });

  it('renders "In Review" for status in_review', () => {
    render(<CaseStatusBadge status="in_review" />);
    expect(screen.getByText('In Review')).toBeOnTheScreen();
  });

  it('renders "Waiting on Customer" for status waiting_on_customer', () => {
    render(<CaseStatusBadge status="waiting_on_customer" />);
    expect(screen.getByText('Waiting on Customer')).toBeOnTheScreen();
  });

  it('renders "Waiting on Provider" for status waiting_on_provider', () => {
    render(<CaseStatusBadge status="waiting_on_provider" />);
    expect(screen.getByText('Waiting on Provider')).toBeOnTheScreen();
  });

  it('renders "Resolved" for status resolved', () => {
    render(<CaseStatusBadge status="resolved" />);
    expect(screen.getByText('Resolved')).toBeOnTheScreen();
  });

  it('renders "Closed" for status closed', () => {
    render(<CaseStatusBadge status="closed" />);
    expect(screen.getByText('Closed')).toBeOnTheScreen();
  });
});
