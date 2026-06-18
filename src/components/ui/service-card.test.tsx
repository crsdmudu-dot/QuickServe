import { render, screen, fireEvent } from '@testing-library/react-native';
import { ServiceCard } from '@/components/ui/service-card';

describe('ServiceCard', () => {
  it('renders title and formatted starting price', () => {
    render(<ServiceCard icon="🧹" title="House Cleaning" startingPrice={1500} />);
    expect(screen.getByText('House Cleaning')).toBeOnTheScreen();
    expect(screen.getByText('from KES 1,500')).toBeOnTheScreen();
  });
  it('renders a badge when provided', () => {
    render(<ServiceCard icon="🧹" title="House Cleaning" badge="Popular" />);
    expect(screen.getByText('Popular')).toBeOnTheScreen();
  });
  it('omits the price line when no startingPrice', () => {
    render(<ServiceCard icon="🧹" title="House Cleaning" />);
    expect(screen.queryByText(/from KES/)).toBeNull();
  });
  it('fires onPress', () => {
    const onPress = jest.fn();
    render(<ServiceCard icon="🧹" title="House Cleaning" onPress={onPress} />);
    fireEvent.press(screen.getByText('House Cleaning'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('truncates long titles with numberOfLines={1}', () => {
    const longTitle =
      'This Is An Extremely Long Service Title That Should Not Break The Layout In Any Grid';
    render(<ServiceCard icon="🔧" title={longTitle} />);
    expect(screen.getByText(longTitle).props.numberOfLines).toBe(1);
  });
});
