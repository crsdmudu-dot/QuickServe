import { render, screen } from '@testing-library/react-native';
import { ExecutiveKpiCard } from '@/components/admin-web/analytics/executive-kpi-card';

test('renders label, value, and the class tag', () => {
  render(<ExecutiveKpiCard label="Current Wallet Balance" value="KES 1,000" kind="snapshot" />);
  expect(screen.getByText('Current Wallet Balance')).toBeOnTheScreen();
  expect(screen.getByText('KES 1,000')).toBeOnTheScreen();
  expect(screen.getByText('Current')).toBeOnTheScreen();
});

test('period kind shows the Selected period tag', () => {
  render(<ExecutiveKpiCard label="Total Bookings" value="42" kind="period" />);
  expect(screen.getByText('Selected period')).toBeOnTheScreen();
});

test('loading state renders skeleton placeholder and not the value', () => {
  render(<ExecutiveKpiCard label="Revenue" value="KES 5,000" kind="snapshot" loading />);
  expect(screen.getByTestId('kpi-skeleton')).toBeTruthy();
  expect(screen.queryByText('KES 5,000')).toBeNull();
  expect(screen.queryByText('Current')).toBeNull();
});

test('non-loading state renders label and value without skeleton', () => {
  render(<ExecutiveKpiCard label="Revenue" value="KES 5,000" kind="snapshot" loading={false} />);
  expect(screen.getByText('Revenue')).toBeOnTheScreen();
  expect(screen.getByText('KES 5,000')).toBeOnTheScreen();
  expect(screen.queryByTestId('kpi-skeleton')).toBeNull();
});
