import { render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/index';

describe('HomeScreen', () => {
  it('renders the search bar placeholder', () => {
    render(<HomeScreen />);
    expect(screen.getByPlaceholderText('Search services')).toBeOnTheScreen();
  });

  it('renders a time-based greeting', () => {
    render(<HomeScreen />);
    expect(
      screen.getByText(/Good (Morning|Afternoon|Evening)/),
    ).toBeOnTheScreen();
  });

  it('renders the subtitle', () => {
    render(<HomeScreen />);
    expect(
      screen.getByText('What service do you need today?'),
    ).toBeOnTheScreen();
  });

  it('renders the four category section titles', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Home Services')).toBeOnTheScreen();
    expect(screen.getByText('Auto Services')).toBeOnTheScreen();
    expect(screen.getByText('Delivery Services')).toBeOnTheScreen();
    expect(screen.getByText('Personal Care')).toBeOnTheScreen();
  });

  it('renders a Popular section', () => {
    render(<HomeScreen />);
    // Multiple elements can match "Popular" (section header + card badges).
    const matches = screen.getAllByText('Popular');
    expect(matches.length).toBeGreaterThan(0);
  });
});
