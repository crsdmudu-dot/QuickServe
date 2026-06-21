/**
 * Tests for StatusBadge — verifies that the correct label is rendered for
 * each status value passed as a prop.
 */

import { render, screen } from '@testing-library/react-native';
import { StatusBadge } from '@/components/ui/status-badge';

describe('StatusBadge', () => {
  it('renders the label for provider_assigned', () => {
    render(<StatusBadge status="provider_assigned" />);
    expect(screen.getByText('Provider assigned')).toBeOnTheScreen();
  });

  it('renders the label for completed', () => {
    render(<StatusBadge status="completed" />);
    expect(screen.getByText('Completed')).toBeOnTheScreen();
  });
});
