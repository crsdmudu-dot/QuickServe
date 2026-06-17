import { render, screen, fireEvent } from '@testing-library/react-native';
import { EmptyState } from '@/components/ui/empty-state';

describe('EmptyState', () => {
  it('renders title and message', () => {
    render(<EmptyState icon="📭" title="No bookings yet" message="Your bookings will appear here." />);
    expect(screen.getByText('No bookings yet')).toBeOnTheScreen();
    expect(screen.getByText('Your bookings will appear here.')).toBeOnTheScreen();
  });
  it('renders and fires the action when provided', () => {
    const onAction = jest.fn();
    render(
      <EmptyState icon="📭" title="No results" message="Try another search." actionLabel="Reset" onAction={onAction} />,
    );
    fireEvent.press(screen.getByText('Reset'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
