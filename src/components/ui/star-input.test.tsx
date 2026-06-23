/**
 * Tests for StarInput — verifies 5 tappable stars and onChange callback.
 */
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StarInput } from '@/components/ui/star-input';

describe('StarInput', () => {
  it('renders 5 pressable stars with correct testIDs', () => {
    render(<StarInput value={0} onChange={() => {}} />);
    expect(screen.getByTestId('star-1')).toBeOnTheScreen();
    expect(screen.getByTestId('star-2')).toBeOnTheScreen();
    expect(screen.getByTestId('star-3')).toBeOnTheScreen();
    expect(screen.getByTestId('star-4')).toBeOnTheScreen();
    expect(screen.getByTestId('star-5')).toBeOnTheScreen();
  });

  it('calls onChange(4) when star-4 is pressed', () => {
    const onChange = jest.fn();
    render(<StarInput value={0} onChange={onChange} />);
    fireEvent.press(screen.getByTestId('star-4'));
    expect(onChange).toHaveBeenCalledWith(4);
  });
});
