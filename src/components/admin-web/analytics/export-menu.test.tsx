/**
 * export-menu.test.tsx — ExportMenu component tests.
 *
 * Asserts:
 *   - Three export controls (CSV, Excel, PDF) render as disabled.
 *   - Each is reachable by testID and has accessibilityState.disabled === true.
 *   - "Exports coming soon" caption is visible.
 */

import { render, screen } from '@testing-library/react-native';
import { ExportMenu } from '@/components/admin-web/analytics/export-menu';

test('renders three disabled export controls marked coming soon', () => {
  render(<ExportMenu />);

  for (const label of ['CSV', 'Excel', 'PDF']) {
    const btn = screen.getByTestId(`export-${label.toLowerCase()}`);
    expect(btn.props.accessibilityState?.disabled).toBe(true);
  }

  expect(screen.getByText(/coming soon/i)).toBeOnTheScreen();
});
