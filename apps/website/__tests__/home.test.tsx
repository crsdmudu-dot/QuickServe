// home.test.tsx — integration tests for the QuickServe Home page (app/page.tsx).

import { render, screen, getAllByRole } from '@testing-library/react';
import Home from '@/app/page';
import { STAT_PLACEHOLDERS } from '@/content/site';

describe('Home page', () => {
  // -------------------------------------------------------------------------
  // h1 headline
  // -------------------------------------------------------------------------
  it('renders exactly one <h1> with the required headline', () => {
    render(<Home />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('Your Trusted Home Services Platform in Nairobi');
  });

  // -------------------------------------------------------------------------
  // CTAs — customer (/download) and provider (/become-a-provider)
  // -------------------------------------------------------------------------
  it('renders a customer CTA linking to /download', () => {
    render(<Home />);
    // Multiple "Book a Service" links exist (hero + CTAs); any is sufficient
    const downloadLinks = screen
      .getAllByRole('link')
      .filter((el) => el.getAttribute('href') === '/download');
    expect(downloadLinks.length).toBeGreaterThanOrEqual(1);
  });

  it('renders a provider CTA linking to /become-a-provider', () => {
    render(<Home />);
    const providerLinks = screen
      .getAllByRole('link')
      .filter((el) => el.getAttribute('href') === '/become-a-provider');
    expect(providerLinks.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Service categories — at least 19 cards
  // -------------------------------------------------------------------------
  it('renders all 19 service categories', () => {
    render(<Home />);
    expect(screen.getAllByText('House Cleaning').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Plumbing').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Massage').length).toBeGreaterThanOrEqual(1);
    // Count h3 headings that correspond to service cards (there are at least 19)
    const headings = screen.getAllByRole('heading', { level: 3 });
    // Filter headings that match known service titles
    const serviceTitles = headings.filter((h) =>
      [
        'House Cleaning', 'Plumbing', 'Electrical Repairs', 'AC Repair & Servicing',
        'Home Painting', 'Pest Control', 'Handyman Services', 'Appliance Repair',
        'Movers & Packers', 'Mechanic On Demand', 'Tire Replacement', 'Car Towing',
        'Grocery Delivery', 'Food Delivery', 'Medicine Delivery', 'Package Delivery',
        'Haircuts', 'Makeup', 'Massage',
      ].includes(h.textContent ?? '')
    );
    expect(serviceTitles.length).toBeGreaterThanOrEqual(19);
  });

  // -------------------------------------------------------------------------
  // How It Works steps
  // -------------------------------------------------------------------------
  it('renders how-it-works step titles', () => {
    render(<Home />);
    expect(screen.getByText('Choose a service')).toBeInTheDocument();
    expect(screen.getByText('Book in seconds')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Stat placeholder value
  // -------------------------------------------------------------------------
  it('renders a stat placeholder value from STAT_PLACEHOLDERS', () => {
    render(<Home />);
    // At least one stat value (e.g. "10,000+") should be present
    const firstStat = STAT_PLACEHOLDERS[0];
    expect(screen.getByText(firstStat.value)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // FAQ "See all FAQs" link
  // -------------------------------------------------------------------------
  it('renders a "See all FAQs" link pointing to /faq', () => {
    render(<Home />);
    const faqLink = screen.getByRole('link', { name: /see all faqs/i });
    expect(faqLink).toBeInTheDocument();
    expect(faqLink).toHaveAttribute('href', '/faq');
  });

  // -------------------------------------------------------------------------
  // Social proof placeholder caption
  // -------------------------------------------------------------------------
  it('labels social-proof stats as illustrative placeholders', () => {
    render(<Home />);
    // The caption containing "Illustrative placeholder figures" should be present
    expect(
      screen.getByText(/illustrative placeholder figures/i)
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Testimonial placeholder caption
  // -------------------------------------------------------------------------
  it('labels testimonials as illustrative', () => {
    render(<Home />);
    // Both the testimonials section and stats section have "Illustrative" captions —
    // use getAllByText since duplicates are expected and intentional.
    const illustrativeNodes = screen.getAllByText(/illustrative/i, { selector: 'p' });
    expect(illustrativeNodes.length).toBeGreaterThanOrEqual(1);
  });
});
