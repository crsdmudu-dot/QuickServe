// app/support/page.tsx — Static help & support centre page.
// Server component — no data fetching, no hooks, no Supabase, no backend.

import Link from 'next/link';
import { buildMetadata } from '@/lib/site';
import { BRAND } from '@/lib/site';
import { PRIMARY_CTA, SECONDARY_CTA } from '@/content/site';

import SectionHeading from '@/components/SectionHeading';
import CtaSection from '@/components/CtaSection';

export const metadata = buildMetadata({
  title: 'Help & Support — KwikServe',
  description:
    'Get help with your KwikServe account, bookings, payments, and more. Browse common topics, find quick answers in our FAQ, or contact our support team directly.',
  path: '/support',
});

export default function SupportPage() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Page header — single <h1>                                           */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-primarySurface py-20 px-6">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center gap-6">
          <SectionHeading
            as="h1"
            eyebrow="Support Centre"
            title="Help & Support"
            subtitle="We're here to help. Browse common topics below, or reach out to our team directly."
            align="center"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Quick links                                                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-4xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="Quick Help"
            title="Find Answers Fast"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Link
              href="/faq"
              className="bg-surface border border-border rounded-lg p-6 flex items-start gap-4 hover:shadow-md transition-shadow"
            >
              <span className="text-3xl flex-shrink-0" role="img" aria-label="FAQ">❓</span>
              <div>
                <h3 className="text-heading font-semibold text-ink">Frequently Asked Questions</h3>
                <p className="text-label text-textSecondary mt-1">
                  Browse answers to the most common questions about bookings, payments, providers, and more.
                </p>
              </div>
            </Link>
            <Link
              href="/contact"
              className="bg-surface border border-border rounded-lg p-6 flex items-start gap-4 hover:shadow-md transition-shadow"
            >
              <span className="text-3xl flex-shrink-0" role="img" aria-label="Contact">📧</span>
              <div>
                <h3 className="text-heading font-semibold text-ink">Contact Us</h3>
                <p className="text-label text-textSecondary mt-1">
                  Email our team or reach us on social media — we respond to all enquiries.
                </p>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Common topics                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-surfaceMuted">
        <div className="max-w-4xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="Common Topics"
            title="Top Support Topics"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                icon: '📅',
                title: 'Booking a service',
                body: 'Open the app, pick a service, set your location and time, and confirm. You\'ll be matched within minutes.',
              },
              {
                icon: '💳',
                title: 'Payments & billing',
                body: 'We support M-Pesa and card. You pay in-app after the job is done. For payment disputes, email us.',
              },
              {
                icon: '🔄',
                title: 'Cancellations & rescheduling',
                body: 'You can cancel or reschedule from inside the app. Cancellation policies vary by service type.',
              },
              {
                icon: '⭐',
                title: 'Ratings & reviews',
                body: 'After every job, you can rate and review your provider. This helps maintain our quality standards.',
              },
              {
                icon: '👤',
                title: 'Account & profile',
                body: 'Manage your name, address, and payment details from the Profile tab in the app.',
              },
              {
                icon: '🔒',
                title: 'Safety & trust',
                body: 'All providers are identity- and skill-verified. If you experience an issue with a provider, report it via the app or contact us.',
              },
            ].map(({ icon, title, body }) => (
              <div key={title} className="bg-surface border border-border rounded-lg p-5 flex items-start gap-4">
                <span className="text-2xl flex-shrink-0 mt-0.5" role="img" aria-label={title}>{icon}</span>
                <div>
                  <h3 className="text-label font-semibold text-ink">{title}</h3>
                  <p className="text-label text-textSecondary mt-1">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Response expectations                                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-12 px-6 bg-background">
        <div className="max-w-4xl mx-auto flex flex-col gap-4">
          <SectionHeading
            eyebrow="Response Times"
            title="When to Expect a Reply"
          />
          <p className="text-body text-textSecondary">
            Our support team is available 24/7 for urgent issues via in-app chat. For email enquiries
            sent to{' '}
            <a
              href={`mailto:${BRAND.email}`}
              className="text-primary underline underline-offset-2 hover:text-primaryDark"
            >
              {BRAND.email}
            </a>
            , we typically respond within one business day. Social media DMs are answered during
            business hours.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Closing CTA                                                         */}
      {/* ------------------------------------------------------------------ */}
      <CtaSection
        heading="Still Need Help?"
        body="Our team is ready to assist. Contact us and we'll make it right."
        primaryCta={SECONDARY_CTA}
        secondaryCta={PRIMARY_CTA}
      />
    </>
  );
}
