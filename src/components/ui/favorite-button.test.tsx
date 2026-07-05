/**
 * Tests for FavoriteButton.
 *
 * Verifies: active vs inactive appearance, onPress firing, accessibility label.
 */

import { render, screen, fireEvent } from '@testing-library/react-native';
import { FavoriteButton } from '@/components/ui/favorite-button';

describe('FavoriteButton', () => {
  it('renders in inactive state', () => {
    render(<FavoriteButton active={false} onPress={jest.fn()} />);
    expect(screen.getByTestId('fav-inactive')).toBeOnTheScreen();
  });

  it('renders in active state', () => {
    render(<FavoriteButton active={true} onPress={jest.fn()} />);
    expect(screen.getByTestId('fav-active')).toBeOnTheScreen();
  });

  it('has accessibility label "Add to favorites" when inactive', () => {
    render(<FavoriteButton active={false} onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Add to favorites' })).toBeOnTheScreen();
  });

  it('has accessibility label "Remove from favorites" when active', () => {
    render(<FavoriteButton active={true} onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeOnTheScreen();
  });

  it('fires onPress when tapped', () => {
    const onPress = jest.fn();
    render(<FavoriteButton active={false} onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Add to favorites' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('fires onPress when tapped while active', () => {
    const onPress = jest.fn();
    render(<FavoriteButton active={true} onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Remove from favorites' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
