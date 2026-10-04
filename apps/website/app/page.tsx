// app/page.tsx — complete KwikServe Home page.
// Server component — no data fetching, no hooks, no Supabase.
// All marketing copy comes from content/site.ts; only structural headings are literal strings.

import Link from 'next/link';
import { buildMetadata } from '@/lib/site';
import {
  SERVICE_CATEGORIES,
  HOW_IT_WORKS_STEPS,
  CUSTOMER_BENEFITS,
  PROVIDER_BENEFITS,
  TRUST_BADGES,
  FAQ_PREVIEW_QUESTIONS,
  PRIMARY_CTA,
  PROVIDER_CTA,
  DOWNLOAD_CTA,
  SEO_PHRASES,
} from '@/content/site';

import Hero from '@/components/Hero';
import SectionHeading from '@/components/SectionHeading';
import ServiceCategoryCard from '@/components/ServiceCategoryCard';
import TrustBadge from '@/components/TrustBadge';
import StepCard from '@/components/StepCard';
import BenefitItem from '@/components/BenefitItem';
import CtaSection from '@/components/CtaSection';

// Page-level metadata overrides layout defaults for /
export const metadata = buildMetadata({
  title: 'KwikServe — Book Trusted Home Services in Nairobi',
  description: `Book ${SEO_PHRASES[0]}, ${SEO_PHRASES[1]}, ${SEO_PHRASES[3]}, and more — all on demand. ${SEO_PHRASES[5]}: upfront quotes, real-time tracking and M-PESA payment after the job.`,
  path: '/',
});

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

export default function Home() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* 1. Hero — single <h1> on the page                                  */}
      {/* ------------------------------------------------------------------ */}
      <Hero
        headline="Your Trusted Home Services Platform in Nairobi"
        subheadline="Upfront quotes, real-time tracking and M-PESA payment after the job, across 19 services."
        supporting="Cleaning · Plumbing · Electrical · Delivery · Beauty & more"
        primaryCta={PRIMARY_CTA}
        secondaryCta={PROVIDER_CTA}
      />

      {/* ------------------------------------------------------------------ */}
      {/* 2. Featured Service Categories                                      */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="What We Offer"
            title="Services for Every Need"
            subtitle="From home repairs to personal care — book any service with a few taps."
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
      {/* 3. Trust Section                                                    */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-primarySurface">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="Why Trust Us"
            title="Built on Quality & Safety"
            subtitle="Every interaction on KwikServe is designed around your safety, satisfaction, and peace of mind."
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
      {/* 4. Why Choose KwikServe                                            */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="Our Promise"
            title="Why Choose KwikServe"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {CUSTOMER_BENEFITS.slice(0, 3).map((benefit) => (
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
      {/* Mid-page CTA                                                        */}
      {/* ------------------------------------------------------------------ */}
      <CtaSection
        heading="Ready to Book Your First Service?"
        body="Book home, auto, delivery and personal-care services in a few taps."
        primaryCta={PRIMARY_CTA}
        secondaryCta={PROVIDER_CTA}
      />

      {/* ------------------------------------------------------------------ */}
      {/* 5. How It Works                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="Simple Steps"
            title="How It Works"
            subtitle="Getting a professional to your door has never been easier."
            align="center"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {HOW_IT_WORKS_STEPS.map((step, i) => (
              <StepCard
                key={step.title}
                index={i + 1}
                title={step.title}
                body={step.body}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 6. Customer Benefits                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-surfaceMuted">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="For Customers"
            title="Everything You Need, Delivered"
            subtitle="KwikServe puts quality, safety, and convenience at the heart of every booking."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
      {/* 7. Provider Benefits                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-primarySurface">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="For Providers"
            title="Grow Your Business With KwikServe"
            subtitle="Offer your skills on KwikServe and take the bookings our team assigns to you."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {PROVIDER_BENEFITS.map((benefit) => (
              <BenefitItem
                key={benefit.title}
                icon={benefit.icon}
                title={benefit.title}
                text={benefit.text}
              />
            ))}
          </div>
          <div className="flex justify-start">
            <Link
              href={PROVIDER_CTA.href}
              className="text-label font-semibold text-white bg-primary rounded-pill px-8 py-3 hover:bg-primaryDark transition-colors"
            >
              {PROVIDER_CTA.label}
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 10. FAQ Preview — questions only, each linking to the FAQ page,     */}
      {/*     which shows the approved answers (F-127c-2)                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-3xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="Common Questions"
            title="Frequently Asked Questions"
            align="center"
          />
          <ul className="flex flex-col gap-3">
            {FAQ_PREVIEW_QUESTIONS.map((question) => (
              <li key={question}>
                <Link
                  href="/faq"
                  className="flex items-center justify-between gap-4 px-6 py-4 border border-border rounded-lg bg-surface hover:bg-surfaceMuted transition-colors text-label font-semibold text-ink"
                >
                  <span>{question}</span>
                  <span className="flex-shrink-0 text-textSecondary" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="text-center">
            <Link
              href="/faq"
              className="text-label font-semibold text-primary underline underline-offset-2 hover:text-primaryDark transition-colors"
            >
              See all FAQs
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 11. Download App CTA                                                */}
      {/* ------------------------------------------------------------------ */}
      <CtaSection
        heading="Get the KwikServe App"
        body="For Android and iOS."
        primaryCta={DOWNLOAD_CTA}
      />

      {/* ------------------------------------------------------------------ */}
      {/* 12. Final CTA — dual audience                                       */}
      {/* ------------------------------------------------------------------ */}
      <CtaSection
        heading="Join KwikServe Today"
        body="Whether you need a service or want to offer one, KwikServe connects you with the right people."
        primaryCta={PRIMARY_CTA}
        secondaryCta={PROVIDER_CTA}
      />
    </>
  );
}
