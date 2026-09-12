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
  FAQ_ITEMS,
  STAT_PLACEHOLDERS,
  TESTIMONIAL_PLACEHOLDERS,
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
import TestimonialCard from '@/components/TestimonialCard';
import StatCard from '@/components/StatCard';
import FaqItem from '@/components/FaqItem';
import CtaSection from '@/components/CtaSection';

// Page-level metadata overrides layout defaults for /
export const metadata = buildMetadata({
  title: 'KwikServe — Book Trusted Home Services in Nairobi',
  description: `Book ${SEO_PHRASES[0]}, ${SEO_PHRASES[1]}, ${SEO_PHRASES[3]}, and more — all on demand. ${SEO_PHRASES[5]}: vetted professionals, transparent pricing, real-time tracking.`,
  path: '/',
});

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

export default function Home() {
  const faqPreview = FAQ_ITEMS.slice(0, 4);

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* 1. Hero — single <h1> on the page                                  */}
      {/* ------------------------------------------------------------------ */}
      <Hero
        headline="Your Trusted Home Services Platform in Nairobi"
        subheadline="Book vetted professionals in under a minute — transparent pricing, real-time tracking, and guaranteed quality across 19+ services."
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
      {/* 4. Why Choose KwikServe                                            */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="Our Promise"
            title="Why Choose KwikServe"
            subtitle="We raise the bar on every booking — so you can relax and let the pros handle it."
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
        body="Join thousands of customers across Nairobi who trust KwikServe for fast, reliable, professional services."
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
            subtitle="Join a growing network of professionals and access a steady stream of customers."
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
      {/* 8. Testimonials (placeholder)                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="Testimonials"
            title="What People Are Saying"
            subtitle="Hear from customers and providers who use KwikServe every day."
            align="center"
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIAL_PLACEHOLDERS.map((testimonial) => (
              <TestimonialCard
                key={testimonial.author}
                quote={testimonial.quote}
                author={testimonial.author}
                role={testimonial.role}
              />
            ))}
          </div>
          <p className="text-caption text-textTertiary text-center" aria-label="Testimonials disclaimer">
            Illustrative — these are representative examples, not verified customer reviews. Real reviews coming soon.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 9. Social Proof / Stats (placeholder)                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-primarySurface">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="By the Numbers"
            title="KwikServe at a Glance"
            align="center"
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {STAT_PLACEHOLDERS.map((stat) => (
              <StatCard key={stat.label} value={stat.value} label={stat.label} />
            ))}
          </div>
          <p className="text-caption text-textTertiary text-center">
            Illustrative placeholder figures — not live data. These numbers will be replaced with verified metrics before public launch.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 10. FAQ Preview                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-3xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="Common Questions"
            title="Frequently Asked Questions"
            align="center"
          />
          <div className="flex flex-col gap-3">
            {faqPreview.map((item) => (
              <FaqItem key={item.question} question={item.question} answer={item.answer} />
            ))}
          </div>
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
        body="Download for Android or iOS and book your first service in under a minute."
        primaryCta={DOWNLOAD_CTA}
      />

      {/* ------------------------------------------------------------------ */}
      {/* 12. Final CTA — dual audience                                       */}
      {/* ------------------------------------------------------------------ */}
      <CtaSection
        heading="Join KwikServe Today"
        body="Whether you need a service or want to offer one — KwikServe connects you to the right people, fast."
        primaryCta={PRIMARY_CTA}
        secondaryCta={PROVIDER_CTA}
      />
    </>
  );
}
