// app/layout.tsx — global shell for the KwikServe marketing website.
// Server component: Header and FaqItem carry their own 'use client'; the layout itself has no hooks.

import './globals.css';
import type { Metadata } from 'next';
import { buildMetadata, organizationJsonLd, websiteJsonLd, SITE_URL } from '@/lib/site';
import { SEO_PHRASES } from '@/content/site';
import SeoJsonLd from '@/components/SeoJsonLd';
import MarketingHeader from '@/components/MarketingHeader';
import MarketingFooter from '@/components/MarketingFooter';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  ...buildMetadata({
    title: 'KwikServe — Trusted Home Services in Nairobi',
    description: `KwikServe is your on-demand platform for ${SEO_PHRASES[0]}, ${SEO_PHRASES[2]}, and more. Book verified professionals in minutes — transparent pricing, real-time tracking.`,
    path: '/',
  }),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SeoJsonLd data={organizationJsonLd()} />
        <SeoJsonLd data={websiteJsonLd()} />
        <MarketingHeader />
        <main className="min-h-screen">{children}</main>
        <MarketingFooter />
      </body>
    </html>
  );
}
