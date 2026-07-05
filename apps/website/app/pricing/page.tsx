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
  title: 'Simple, Transparent Pricing — QuickServe',
  description:
    'No hidden fees, no surprises. QuickServe shows you the full price before you confirm every booking. Pay securely per service — fair rates, upfront quotes, guaranteed quality.',
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
            subtitle="You see the exact price before you confirm. No subscriptions, no hidden fees — just fair, upfront rates for every service."
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
                body: 'Every booking shows a clear price estimate before you confirm. What you see is what you pay.',
              },
              {
                icon: '🔒',
                title: 'Secure Payment',
                body: 'Pay through the app after the job is done — via M-Pesa or card. Your payment details are always encrypted.',
              },
              {
                icon: '🚫',
                title: 'No Hidden Fees',
                body: 'No call-out charges, no platform subscription, no surprise extras. The quoted price is the final price.',
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
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
            subtitle="Select a service in the app to see live pricing in your area before you confirm."
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
        body="Download QuickServe to view live, upfront pricing for every service in your area."
        primaryCta={PRIMARY_CTA}
        secondaryCta={PROVIDER_CTA}
      />
    </>
  );
}
