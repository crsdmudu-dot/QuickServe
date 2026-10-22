// home.test.tsx — integration tests for the KwikServe Home page (app/page.tsx).

import { render, screen, getAllByRole } from '@testing-library/react';
import Home from '@/app/page';
import { FAQ_PREVIEW_QUESTIONS } from '@/content/site';

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
  it('renders how-it-works step titles, with no speed promise (D9 (a), F-127c-3)', () => {
    render(<Home />);
    expect(screen.getByText('Choose a service')).toBeInTheDocument();
    expect(screen.getByText('Book in the app')).toBeInTheDocument();
    expect(screen.queryByText(/in seconds/i)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // FAQ preview: questions only, each linking to the FAQ page (F-127c-2)
  // -------------------------------------------------------------------------
  it('renders a "See all FAQs" link pointing to /faq', () => {
    render(<Home />);
    const faqLink = screen.getByRole('link', { name: /see all faqs/i });
    expect(faqLink).toBeInTheDocument();
    expect(faqLink).toHaveAttribute('href', '/faq');
  });

  it('lists the FAQ preview questions as links to /faq, with no answers and no accordion', () => {
    const { container } = render(<Home />);
    for (const question of FAQ_PREVIEW_QUESTIONS) {
      expect(screen.getByRole('link', { name: question })).toHaveAttribute('href', '/faq');
    }
    // No collapsible rows: the answers are only on the FAQ page, from the approved text.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    // Words of the answers that the preview used to restate (and the operator line) are gone.
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/Hired Corp|operated by|support@kwikserve\.co\.ke|available only in Kenya|job details/i);
  });

  // -------------------------------------------------------------------------
  // Wording ruled on by PM stage 127c
  // -------------------------------------------------------------------------
  it('the app call to action says nothing about launch timing (switch-neutral, F-127c-11)', () => {
    const { container } = render(<Home />);
    const text = container.textContent ?? '';
    expect(text).toContain('For Android and iOS.');
    expect(text).not.toMatch(/coming soon|available now|out now/i);
  });

  it('makes no absolute quality claim and promises providers no flow of work (F-127c-5, F-127c-6)', () => {
    const { container } = render(<Home />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/raise the bar|steady stream|growing network/i);
    expect(text).toContain('Customers can rate every completed job.');
  });

  // -------------------------------------------------------------------------
  // No placeholder social proof (stage-04 F2-2 / M6): no invented figures or testimonials
  // -------------------------------------------------------------------------
  it('renders no placeholder figures, testimonials or "illustrative" captions', () => {
    const { container } = render(<Home />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/illustrative|placeholder|testimonial/i);
    expect(text).not.toContain('10,000+');
    expect(text).not.toContain('4.9');
    expect(container.querySelector('blockquote')).toBeNull();
  });
});
