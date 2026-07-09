import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { MetricSection } from '@/components/admin-web/analytics/metric-section';

test('renders the title and children', () => {
  render(<MetricSection title="Platform Health"><Text>child</Text></MetricSection>);
  expect(screen.getByText('Platform Health')).toBeOnTheScreen();
  expect(screen.getByText('child')).toBeOnTheScreen();
});
