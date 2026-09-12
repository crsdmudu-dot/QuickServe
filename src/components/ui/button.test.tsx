import { render, screen, fireEvent } from '@testing-library/react-native';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders its label', () => {
    render(<Button label="Book now" />);
    expect(screen.getByText('Book now')).toBeOnTheScreen();
  });
  it('fires onPress', () => {
    const onPress = jest.fn();
    render(<Button label="Go" onPress={onPress} />);
    fireEvent.press(screen.getByText('Go'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('does not fire onPress when disabled', () => {
    const onPress = jest.fn();
    render(<Button label="Nope" onPress={onPress} disabled />);
    fireEvent.press(screen.getByText('Nope'));
    expect(onPress).not.toHaveBeenCalled();
  });

  describe('sizes', () => {
    it('defaults to md at 52px tall with 24px horizontal padding', () => {
      render(<Button label="Default" />);
      expect(screen.getByRole('button', { name: 'Default' })).toHaveStyle({ height: 52, paddingHorizontal: 24 });
    });
    it('md stays 52px tall', () => {
      render(<Button label="Medium" size="md" />);
      expect(screen.getByRole('button', { name: 'Medium' })).toHaveStyle({ height: 52, paddingHorizontal: 24 });
    });
    it('sm renders its label at 36px tall with 10px horizontal padding and still fires onPress', () => {
      const onPress = jest.fn();
      render(<Button label="Edit" size="sm" onPress={onPress} />);
      const btn = screen.getByRole('button', { name: 'Edit' });
      expect(screen.getByText('Edit')).toBeOnTheScreen();
      expect(btn).toHaveStyle({ height: 36, paddingHorizontal: 10 });
      fireEvent.press(btn);
      expect(onPress).toHaveBeenCalledTimes(1);
    });
    it('sm respects disabled state', () => {
      const onPress = jest.fn();
      render(<Button label="Small off" size="sm" disabled onPress={onPress} />);
      const btn = screen.getByRole('button', { name: 'Small off' });
      expect(btn).toHaveStyle({ opacity: 0.5 });
      fireEvent.press(btn);
      expect(onPress).not.toHaveBeenCalled();
    });
  });
});
