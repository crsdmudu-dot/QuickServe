// app/why-quickserve/page.tsx — Value proposition and trust differentiators.
// Server component — no data fetching, no hooks, no Supabase.
// All content mapped from content/site.ts; structural headings are literals.

import { buildMetadata } from '@/lib/site';
import {
  CUSTOMER_BENEFITS,
  TRUST_BADGES,
  PRIMARY_CTA,
  PROVIDER_CTA,
  SEO_PHRASES,
} from '@/content/site';

import SectionHeading from '@/components/SectionHeading';
import BenefitItem from '@/components/BenefitItem';
import TrustBadge from '@/components/TrustBadge';
import CtaSection from '@/components/CtaSection';

export const metadata = buildMetadata({
  title: 'Why Choose QuickServe — Trusted Home Services in Nairobi',
  description: `Discover why QuickServe is Nairobi's most trusted on-demand services platform. Vetted professionals, transparent pricing, real-time tracking, and ${SEO_PHRASES[5]} delivered to your door.`,
  path: '/why-quickserve',
});

export default function WhyQuickServePage() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Page header — single <h1>                                           */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-primarySurface py-20 px-6">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center gap-6">
          <SectionHeading
            as="h1"
            eyebrow="Our Promise"
            title="Why Choose QuickServe"
            subtitle={`We raise the bar on every booking. ${SEO_PHRASES[5]} — vetted, on time, and backed by transparent pricing so you can relax and let the pros handle it.`}
            align="center"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Customer benefits                                                   */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="For Customers"
            title="Everything You Need, Every Time"
            subtitle="QuickServe puts quality, safety, and convenience at the heart of every booking."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {CUSTOMER_BENEFITS.map((benefit) => (
              <BenefitItem
                key={benefit.title}
                icon={benefit.icon}
                title={benefit.title}
                text={benefit.text}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Trust badges                                                        */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-primarySurface">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="Built on Safety"
            title="Our Quality Standards"
            subtitle="Every interaction on QuickServe is designed around your safety, satisfaction, and peace of mind."
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
      {/* Differentiator prose                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-surfaceMuted">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <SectionHeading
            eyebrow="The Difference"
            title="What Sets Us Apart"
          />
          <p className="text-body text-textSecondary">
            Unlike informal referrals or classifieds, every professional on QuickServe has been
            identity-verified, skill-assessed, and approved before their first job. We enforce
            punctuality, monitor reviews, and remove providers who fall below our standards.
          </p>
          <p className="text-body text-textSecondary">
            You see the full price before you confirm. You track your pro in real time. You pay
            securely through the app — and if anything goes wrong, our support team is available
            around the clock.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Closing CTA                                                         */}
      {/* ------------------------------------------------------------------ */}
      <CtaSection
        heading="Experience the QuickServe Difference"
        body="Join thousands of satisfied customers across Nairobi. Book your first service today."
        primaryCta={PRIMARY_CTA}
        secondaryCta={PROVIDER_CTA}
      />
    </>
  );
}
