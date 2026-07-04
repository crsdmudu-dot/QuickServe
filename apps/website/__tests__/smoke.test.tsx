import { render, screen } from '@testing-library/react';
import Home from '@/app/page';

describe('Home page', () => {
  it('renders the QuickServe heading', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'QuickServe' })).toBeInTheDocument();
  });
});
