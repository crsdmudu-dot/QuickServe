import { render, screen } from '@testing-library/react-native';
import { GrowthDeltaBadge } from '@/components/admin-web/analytics/growth-delta-badge';

test('positive delta shows an up arrow and percentage', () => {
  render(<GrowthDeltaBadge delta={12.5} />);
  expect(screen.getByText('▲ 12.5%')).toBeOnTheScreen();
});
test('negative delta shows a down arrow', () => {
  render(<GrowthDeltaBadge delta={-3} />);
  expect(screen.getByText('▼ 3%')).toBeOnTheScreen();
});
test('zero delta shows a neutral dash', () => {
  render(<GrowthDeltaBadge delta={0} />);
  expect(screen.getByText('– 0%')).toBeOnTheScreen();
});
