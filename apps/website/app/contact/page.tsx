// app/contact/page.tsx — Static contact information page.
// Server component — NO form submission, NO backend, NO Supabase.
// Only static contact info: mailto links, social links, pointers to FAQ and support.

import Link from 'next/link';
import { buildMetadata } from '@/lib/site';
import { BRAND, SITE_URL } from '@/lib/site';
import { PRIMARY_CTA } from '@/content/site';

import SectionHeading from '@/components/SectionHeading';
import CtaSection from '@/components/CtaSection';

export const metadata = buildMetadata({
  title: 'Contact QuickServe — Get in Touch',
  description:
    'Get in touch with the QuickServe team. Email us, find us on social media, or visit our FAQ and Support pages for quick answers.',
  path: '/contact',
});

export default function ContactPage() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Page header — single <h1>                                           */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-primarySurface py-20 px-6">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center gap-6">
          <SectionHeading
            as="h1"
            eyebrow="Get in Touch"
            title="Contact QuickServe"
            subtitle="Have a question, feedback, or enquiry? We'd love to hear from you. Reach out via email or social media — our team will get back to you as soon as possible."
            align="center"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Contact methods                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-4xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="Reach Us"
            title="How to Contact Us"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Email */}
            <div className="bg-surface border border-border rounded-lg p-6 flex flex-col gap-3">
              <span className="text-3xl" role="img" aria-label="Email">📧</span>
              <h3 className="text-heading font-semibold text-ink">Email</h3>
              <p className="text-label text-textSecondary">
                For general enquiries, feedback, or partnership requests:
              </p>
              <a
                href={`mailto:${BRAND.email}`}
                className="text-label font-semibold text-primary underline underline-offset-2 hover:text-primaryDark transition-colors"
              >
                {BRAND.email}
              </a>
            </div>

            {/* Support */}
            <div className="bg-surface border border-border rounded-lg p-6 flex flex-col gap-3">
              <span className="text-3xl" role="img" aria-label="Support">🎧</span>
              <h3 className="text-heading font-semibold text-ink">Help & Support</h3>
              <p className="text-label text-textSecondary">
                For booking issues, account questions, or urgent help:
              </p>
              <Link
                href="/support"
                className="text-label font-semibold text-primary underline underline-offset-2 hover:text-primaryDark transition-colors"
              >
                Visit Support Centre →
              </Link>
            </div>

            {/* FAQ */}
            <div className="bg-surface border border-border rounded-lg p-6 flex flex-col gap-3">
              <span className="text-3xl" role="img" aria-label="FAQ">❓</span>
              <h3 className="text-heading font-semibold text-ink">FAQ</h3>
              <p className="text-label text-textSecondary">
                Find quick answers to the most common questions about bookings, payments, and providers.
              </p>
              <Link
                href="/faq"
                className="text-label font-semibold text-primary underline underline-offset-2 hover:text-primaryDark transition-colors"
              >
                Browse FAQs →
              </Link>
            </div>

            {/* Social */}
            <div className="bg-surface border border-border rounded-lg p-6 flex flex-col gap-3">
              <span className="text-3xl" role="img" aria-label="Social media">💬</span>
              <h3 className="text-heading font-semibold text-ink">Social Media</h3>
              <p className="text-label text-textSecondary">
                Follow us and send a DM for quick informal responses:
              </p>
              <ul className="flex flex-col gap-1">
                {BRAND.socials.map((url) => {
                  const platform = url.includes('twitter')
                    ? 'Twitter / X'
                    : url.includes('facebook')
                    ? 'Facebook'
                    : 'Instagram';
                  return (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-label text-primary underline underline-offset-2 hover:text-primaryDark transition-colors"
                      >
                        {platform}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Provider enquiries                                                  */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-12 px-6 bg-surfaceMuted">
        <div className="max-w-4xl mx-auto flex flex-col gap-4">
          <SectionHeading
            eyebrow="For Providers"
            title="Interested in Joining as a Service Provider?"
          />
          <p className="text-body text-textSecondary">
            If you&apos;re a professional looking to grow your business on QuickServe, visit our{' '}
            <Link
              href="/become-a-provider"
              className="text-primary underline underline-offset-2 hover:text-primaryDark"
            >
              Become a Provider
            </Link>{' '}
            page to learn more and submit your application.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Closing CTA                                                         */}
      {/* ------------------------------------------------------------------ */}
      <CtaSection
        heading="Ready to Book a Service?"
        body="Download the QuickServe app and book a vetted professional in under a minute."
        primaryCta={PRIMARY_CTA}
      />
    </>
  );
}
