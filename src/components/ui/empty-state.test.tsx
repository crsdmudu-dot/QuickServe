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
  it('renders and fires the secondary action when provided', () => {
    const onAction = jest.fn();
    const onSecondary = jest.fn();
    render(
      <EmptyState
        icon="⏳"
        title="Awaiting approval"
        message="Under review."
        actionLabel="Sign out"
        onAction={onAction}
        secondaryActionLabel="Delete account"
        onSecondaryAction={onSecondary}
      />,
    );
    fireEvent.press(screen.getByText('Delete account'));
    expect(onSecondary).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
  });
  it('renders no secondary action when none is provided', () => {
    render(<EmptyState icon="📭" title="Empty" message="Nothing here." actionLabel="Reset" onAction={jest.fn()} />);
    expect(screen.queryByText('Delete account')).toBeNull();
  });
});
