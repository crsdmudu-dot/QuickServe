import { render, screen } from '@testing-library/react-native';
import { VerifiedBadge } from '@/components/ui/verified-badge';

describe('VerifiedBadge', () => {
  it('renders the verified label', () => {
    render(<VerifiedBadge />);
    expect(screen.getByText('Verified by QuickServe')).toBeOnTheScreen();
  });
});
