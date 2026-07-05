// smoke.test.tsx — basic smoke test: Home page renders without crashing.
// Updated for T3: the heading is now the full hero headline.

import { render, screen } from '@testing-library/react';
import Home from '@/app/page';

describe('Home page smoke', () => {
  it('renders without crashing and shows the hero headline', () => {
    render(<Home />);
    expect(
      screen.getByRole('heading', { level: 1, name: /Your Trusted Home Services Platform in Nairobi/i }),
    ).toBeInTheDocument();
  });
});
