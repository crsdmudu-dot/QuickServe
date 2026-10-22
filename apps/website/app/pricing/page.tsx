// app/pricing/page.tsx — Transparent pricing marketing page.
// Server component — no data fetching, no hooks, no Supabase.
// No live prices — explains pay-per-service model and showcases service categories.
// All content mapped from content/site.ts; structural headings are literals.

import { buildMetadata } from '@/lib/site';
import {
  SERVICE_CATEGORIES,
  TRUST_BADGES,
  PRIMARY_CTA,
  PROVIDER_CTA,
} from '@/content/site';

import SectionHeading from '@/components/SectionHeading';
import ServiceCategoryCard from '@/components/ServiceCategoryCard';
import TrustBadge from '@/components/TrustBadge';
import CtaSection from '@/components/CtaSection';

export const metadata = buildMetadata({
  title: 'Simple, Transparent Pricing — KwikServe',
  description:
    'No hidden fees, no surprises. KwikServe sends you a quote before any work starts, and you pay with M-PESA only after the job is done.',
  path: '/pricing',
});

export default function PricingPage() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Page header — single <h1>                                           */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-primarySurface py-20 px-6">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center gap-6">
          <SectionHeading
            as="h1"
            eyebrow="Pricing"
            title="Simple, Transparent Pricing"
            subtitle="You get a quote before any work starts. No subscriptions and no hidden fees."
            align="center"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* How pricing works                                                   */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          <SectionHeading
            eyebrow="How It Works"
            title="Pay Per Service — No Surprises"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              {
                icon: '💰',
                title: 'Upfront Quotes',
                body: 'Every booking gets a quote in the app before any work starts. Once you accept it, the price does not go up.',
              },
              {
                icon: '🔒',
                title: 'Secure Payment',
                body: 'Pay in the app with M-PESA after the job is done. We do not take cards or cash.',
              },
              {
                icon: '🚫',
                title: 'No Hidden Fees',
                body: 'No call-out fee and no subscription. You pay only the price in the quote you accepted.',
              },
              {
                icon: '📋',
                title: 'Per-Service Pricing',
                body: 'You pay only for what you book. There are no bundles or lock-in contracts — book as often or as rarely as you need.',
              },
            ].map(({ icon, title, body }) => (
              <div key={title} className="bg-surface border border-border rounded-lg p-6 flex items-start gap-4">
                <span className="text-2xl flex-shrink-0 mt-0.5" role="img" aria-label={title}>{icon}</span>
                <div>
                  <h3 className="text-heading font-semibold text-ink">{title}</h3>
                  <p className="text-label text-textSecondary mt-1">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Trust indicators                                                    */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-primarySurface">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="Our Promise"
            title="Value You Can Count On"
            align="center"
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {TRUST_BADGES.map((badge) => (
              <TrustBadge
                key={badge.label}
                icon={badge.icon}
                label={badge.label}
                description={badge.description}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Browse services                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="Browse & Compare"
            title="Explore Services"
            subtitle="Request a service in the app to get a quote before you confirm."
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
      {/* Closing CTA                                                         */}
      {/* ------------------------------------------------------------------ */}
      <CtaSection
        heading="See Prices in the App"
        body="Request a quote in the KwikServe app."
        primaryCta={PRIMARY_CTA}
        secondaryCta={PROVIDER_CTA}
      />
    </>
  );
}
