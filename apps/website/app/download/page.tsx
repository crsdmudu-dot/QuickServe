// app/download/page.tsx — App download landing page.
// Server component — no data fetching, no hooks, no Supabase.
// Store badges are PLACEHOLDERS — "Coming soon" — no fake store URLs.

import { buildMetadata } from '@/lib/site';
import { PRIMARY_CTA, DOWNLOAD_CTA, PROVIDER_CTA } from '@/content/site';

import SectionHeading from '@/components/SectionHeading';
import CtaSection from '@/components/CtaSection';

export const metadata = buildMetadata({
  title: 'Download the QuickServe App — Android & iOS',
  description:
    'Get the QuickServe app on Android or iOS and book trusted home services in Nairobi in under a minute. Coming soon to Google Play and the App Store.',
  path: '/download',
});

export default function DownloadPage() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Hero — single <h1>                                                  */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-primarySurface py-20 px-6">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center gap-6">
          <span className="text-caption uppercase tracking-widest font-semibold text-primary">
            Mobile App
          </span>
          <h1 className="text-display font-bold text-ink leading-tight">
            Get the QuickServe App
          </h1>
          <p className="text-body text-textSecondary max-w-2xl">
            Book trusted home services in Nairobi from the palm of your hand. Available for both
            Android and iOS — browse 19+ services, get upfront pricing, and track your professional
            in real time.
          </p>

          {/* Store badge placeholders */}
          <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
            <div
              className="flex items-center gap-3 bg-ink text-white rounded-xl px-6 py-3 opacity-70 cursor-not-allowed"
              aria-label="Google Play download coming soon"
              role="img"
            >
              <span className="text-2xl" role="img" aria-hidden="true">▶</span>
              <div className="text-left">
                <p className="text-caption leading-none text-white/70">Coming soon to</p>
                <p className="text-label font-semibold">Google Play</p>
              </div>
            </div>
            <div
              className="flex items-center gap-3 bg-ink text-white rounded-xl px-6 py-3 opacity-70 cursor-not-allowed"
              aria-label="App Store download coming soon"
              role="img"
            >
              <span className="text-2xl" role="img" aria-hidden="true"></span>
              <div className="text-left">
                <p className="text-caption leading-none text-white/70">Coming soon to</p>
                <p className="text-label font-semibold">App Store</p>
              </div>
            </div>
          </div>
          <p className="text-caption text-textTertiary">
            App launch coming soon — enter your details to be notified first.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* App value proposition                                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-4xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="Why the App"
            title="Everything at Your Fingertips"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              {
                icon: '⚡',
                title: 'Book in Under a Minute',
                body: 'Choose a service, set your location, confirm — and your professional is on the way.',
              },
              {
                icon: '📍',
                title: 'Real-Time Tracking',
                body: 'Watch your provider travel to you on a live map so you know exactly when to expect them.',
              },
              {
                icon: '💰',
                title: 'See Prices Upfront',
                body: 'No hidden fees — the price shown before you confirm is the price you pay.',
              },
              {
                icon: '🔒',
                title: 'Secure In-App Payment',
                body: 'Pay via M-Pesa or card after the job is done. All transactions are encrypted.',
              },
              {
                icon: '⭐',
                title: 'Rate & Review',
                body: 'Share honest feedback after every booking to help the community find great professionals.',
              },
              {
                icon: '📱',
                title: 'Android & iOS',
                body: 'QuickServe runs natively on both Android and iOS — optimised for performance on every device.',
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
      {/* Notification interest                                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-12 px-6 bg-surfaceMuted">
        <div className="max-w-4xl mx-auto flex flex-col gap-4 text-center">
          <SectionHeading
            eyebrow="Stay Updated"
            title="Be First to Know When We Launch"
            subtitle="The QuickServe app is coming soon to Google Play and the App Store. Contact us to register your interest and we'll notify you at launch."
            align="center"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Closing CTA                                                         */}
      {/* ------------------------------------------------------------------ */}
      <CtaSection
        heading="Ready to Experience QuickServe?"
        body="Book services via the web today, or contact us to be notified when the app launches on Android and iOS."
        primaryCta={DOWNLOAD_CTA}
        secondaryCta={PROVIDER_CTA}
      />
    </>
  );
}
