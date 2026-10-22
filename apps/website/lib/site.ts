// lib/site.ts — SEO helpers and JSON-LD generators for KwikServe marketing website.
// Pure data functions — no data fetching, no Supabase, no side effects.

import type { Metadata } from 'next';

export const SITE_URL = 'https://kwikserve.co.ke';

export const BRAND = {
  name: 'KwikServe',
  tagline: 'Trusted home services in Nairobi',
  description:
    'KwikServe connects customers in Nairobi with independent professionals for home, auto, delivery and personal-care services.',
  email: 'support@kwikserve.co.ke',
  // The name shown with the address; the app uses the same (SUPPORT_NAME in src/lib/support.ts).
  supportName: 'KwikServe Support',
} as const;

const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png`;

// ---------------------------------------------------------------------------
// buildMetadata
// ---------------------------------------------------------------------------

export function buildMetadata({
  title,
  description,
  path,
  ogImage,
}: {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
}): Metadata {
  const url = SITE_URL + path;
  const image = ogImage ?? DEFAULT_OG_IMAGE;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: 'KwikServe',
      type: 'website',
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

// ---------------------------------------------------------------------------
// organizationJsonLd
// ---------------------------------------------------------------------------

export function organizationJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND.name,
    url: SITE_URL,
    description: BRAND.description,
    areaServed: 'Nairobi, Kenya',
    // No social media accounts exist. Add a handle here only once the account is real and claimed.
    sameAs: [],
  };
}

// ---------------------------------------------------------------------------
// websiteJsonLd
// ---------------------------------------------------------------------------

export function websiteJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: BRAND.name,
    url: SITE_URL,
  };
}
