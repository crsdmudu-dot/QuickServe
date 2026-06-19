import { fireEvent, render, screen } from '@testing-library/react-native';
import { Input } from '@/components/ui/input';

describe('Input', () => {
  it('renders the label and forwards typing', () => {
    const onChangeText = jest.fn();
    render(<Input label="Email" value="" onChangeText={onChangeText} placeholder="you@example.com" />);
    expect(screen.getByText('Email')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'a@b');
    expect(onChangeText).toHaveBeenCalledWith('a@b');
  });
  it('shows an error message when provided', () => {
    render(<Input label="Email" value="" onChangeText={() => {}} error="Email is required" />);
    expect(screen.getByText('Email is required')).toBeOnTheScreen();
  });
});
