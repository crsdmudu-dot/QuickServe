import { render, screen } from '@testing-library/react-native';
import { Avatar } from '@/components/ui/avatar';

describe('Avatar', () => {
  it('shows initials when no photo url', () => {
    render(<Avatar name="Jane Doe" photoUrl={null} />);
    expect(screen.getByText('JD')).toBeOnTheScreen();
  });

  it('renders Image with testID when photoUrl is provided', () => {
    render(<Avatar name="Jane Doe" photoUrl="http://x/p.png" />);
    expect(screen.getByTestId('avatar-image')).toBeOnTheScreen();
  });
});
