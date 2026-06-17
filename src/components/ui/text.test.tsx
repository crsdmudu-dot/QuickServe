import { render, screen } from '@testing-library/react-native';
import { Text } from '@/components/ui/text';

describe('Text', () => {
  it('renders its children', () => {
    render(<Text>Hello QuickServe</Text>);
    expect(screen.getByText('Hello QuickServe')).toBeOnTheScreen();
  });
});
