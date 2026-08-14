// components.test.tsx — renders a representative sample of shared components.

import { render, screen, fireEvent } from '@testing-library/react';
import ServiceCategoryCard from '@/components/ServiceCategoryCard';
import StatCard from '@/components/StatCard';
import Hero from '@/components/Hero';
import FaqItem from '@/components/FaqItem';
import CtaSection from '@/components/CtaSection';
import MarketingFooter from '@/components/MarketingFooter';
import SeoJsonLd from '@/components/SeoJsonLd';

// ---------------------------------------------------------------------------
// ServiceCategoryCard
// ---------------------------------------------------------------------------
describe('ServiceCategoryCard', () => {
  it('renders title, subtitle, and icon', () => {
    render(
      <ServiceCategoryCard title="Plumbing" subtitle="Leaks, fittings & repairs" icon="🔧" />,
    );
    expect(screen.getByText('Plumbing')).toBeInTheDocument();
    expect(screen.getByText('Leaks, fittings & repairs')).toBeInTheDocument();
    expect(screen.getByText('🔧')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------
describe('StatCard', () => {
  it('renders value and label', () => {
    render(<StatCard value="10,000+" label="Jobs Completed" />);
    expect(screen.getByText('10,000+')).toBeInTheDocument();
    expect(screen.getByText('Jobs Completed')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
describe('Hero', () => {
  it('renders headline and both CTA labels with correct hrefs', () => {
    render(
      <Hero
        headline="Trusted services on demand"
        subheadline="Book a verified professional in minutes."
        primaryCta={{ label: 'Book a Service', href: '/download' }}
        secondaryCta={{ label: 'Become a Provider', href: '/become-a-provider' }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Trusted services on demand' })).toBeInTheDocument();

    const primaryLink = screen.getByRole('link', { name: 'Book a Service' });
    expect(primaryLink).toBeInTheDocument();
    expect(primaryLink).toHaveAttribute('href', '/download');

    const secondaryLink = screen.getByRole('link', { name: 'Become a Provider' });
    expect(secondaryLink).toBeInTheDocument();
    expect(secondaryLink).toHaveAttribute('href', '/become-a-provider');
  });

  it('renders optional supporting text when provided', () => {
    render(
      <Hero
        headline="Headline"
        subheadline="Sub"
        supporting="Available in Nairobi"
        primaryCta={{ label: 'CTA 1', href: '/download' }}
        secondaryCta={{ label: 'CTA 2', href: '/contact' }}
      />,
    );
    expect(screen.getByText('Available in Nairobi')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// FaqItem
// ---------------------------------------------------------------------------
describe('FaqItem', () => {
  it('answer is hidden initially, appears after clicking, and aria-expanded updates', () => {
    render(
      <FaqItem
        question="What is KwikServe?"
        answer="An on-demand services platform."
      />,
    );

    const button = screen.getByRole('button', { name: /what is kwikserve\?/i });

    // Answer should not be visible initially
    expect(screen.queryByText('An on-demand services platform.')).not.toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');

    // Click to open
    fireEvent.click(button);
    expect(screen.getByText('An on-demand services platform.')).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'true');

    // Click to close
    fireEvent.click(button);
    expect(screen.queryByText('An on-demand services platform.')).not.toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});

// ---------------------------------------------------------------------------
// CtaSection
// ---------------------------------------------------------------------------
describe('CtaSection', () => {
  it('renders heading and primary CTA with correct href', () => {
    render(
      <CtaSection
        heading="Ready to get started?"
        primaryCta={{ label: 'Book a Service', href: '/download' }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Ready to get started?' })).toBeInTheDocument();

    const link = screen.getByRole('link', { name: 'Book a Service' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/download');
  });

  it('renders optional secondary CTA when provided', () => {
    render(
      <CtaSection
        heading="Join us"
        primaryCta={{ label: 'Download', href: '/download' }}
        secondaryCta={{ label: 'Contact Us', href: '/contact' }}
      />,
    );
    const secondaryLink = screen.getByRole('link', { name: 'Contact Us' });
    expect(secondaryLink).toHaveAttribute('href', '/contact');
  });
});

// ---------------------------------------------------------------------------
// MarketingFooter
// ---------------------------------------------------------------------------
describe('MarketingFooter', () => {
  it('renders footer group titles', () => {
    render(<MarketingFooter />);
    // Use heading role to disambiguate from same-named links in the footer
    expect(screen.getByRole('heading', { name: 'Company' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Services' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Support' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Legal' })).toBeInTheDocument();
  });

  it('renders footer links', () => {
    render(<MarketingFooter />);
    expect(screen.getByRole('link', { name: 'FAQ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SeoJsonLd
// ---------------------------------------------------------------------------
describe('SeoJsonLd', () => {
  it('renders a script tag containing the serialised JSON', () => {
    const data = { '@context': 'https://schema.org', '@type': 'Organization', name: 'KwikServe' };
    const { container } = render(<SeoJsonLd data={data} />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).toBeInTheDocument();
    expect(script?.innerHTML).toContain('"@type":"Organization"');
    expect(script?.innerHTML).toContain('"name":"KwikServe"');
  });
});
