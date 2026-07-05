// app/services/page.tsx — Browse all QuickServe service categories.
// Server component — no data fetching, no hooks, no Supabase.
// All content mapped from content/site.ts; structural headings are literals.

import { buildMetadata } from '@/lib/site';
import {
  SERVICE_CATEGORIES,
  PRIMARY_CTA,
  PROVIDER_CTA,
  SEO_PHRASES,
} from '@/content/site';

import Hero from '@/components/Hero';
import SectionHeading from '@/components/SectionHeading';
import ServiceCategoryCard from '@/components/ServiceCategoryCard';
import CtaSection from '@/components/CtaSection';

export const metadata = buildMetadata({
  title: 'Home Services in Nairobi, On Demand — QuickServe',
  description: `Browse 19+ on-demand services including ${SEO_PHRASES[3]}, ${SEO_PHRASES[1]}, ${SEO_PHRASES[2]}, ${SEO_PHRASES[4]}, and more. Book a vetted professional in Nairobi in under a minute.`,
  path: '/services',
});

export default function ServicesPage() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Hero — single <h1>                                                  */}
      {/* ------------------------------------------------------------------ */}
      <Hero
        headline="Home Services in Nairobi, On Demand"
        subheadline={`From ${SEO_PHRASES[3]} to ${SEO_PHRASES[2]} and ${SEO_PHRASES[4]} — browse our full catalogue and book a vetted professional in minutes.`}
        supporting="19+ services across home, auto, delivery & personal care"
        primaryCta={PRIMARY_CTA}
        secondaryCta={PROVIDER_CTA}
      />

      {/* ------------------------------------------------------------------ */}
      {/* All service categories grid                                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="All Services"
            title="What Would You Like Today?"
            subtitle="Tap any service to learn more and book a professional near you."
            align="center"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {SERVICE_CATEGORIES.map((cat) => (
              <ServiceCategoryCard
                key={cat.id}
                title={cat.title}
                subtitle={cat.subtitle}
                icon={cat.icon}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Closing dual CTA                                                    */}
      {/* ------------------------------------------------------------------ */}
      <CtaSection
        heading="Ready to Book a Service?"
        body="Join thousands of customers across Nairobi who trust QuickServe for fast, reliable home services."
        primaryCta={PRIMARY_CTA}
        secondaryCta={PROVIDER_CTA}
      />
    </>
  );
}
