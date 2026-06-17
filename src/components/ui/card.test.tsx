import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Card } from '@/components/ui/card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card><Text>Inside</Text></Card>);
    expect(screen.getByText('Inside')).toBeOnTheScreen();
  });
  it('fires onPress when pressable', () => {
    const onPress = jest.fn();
    render(<Card onPress={onPress}><Text>Tap me</Text></Card>);
    fireEvent.press(screen.getByText('Tap me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('spreads rest props onto pressable Card', () => {
    const onPress = jest.fn();
    render(<Card onPress={onPress} testID="svc-card"><Text>Pressable</Text></Card>);
    expect(screen.getByTestId('svc-card')).toBeOnTheScreen();
  });
});
