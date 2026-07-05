// lib/site.ts — SEO helpers and JSON-LD generators for QuickServe marketing website.
// Pure data functions — no data fetching, no Supabase, no side effects.

import type { Metadata } from 'next';

export const SITE_URL = 'https://quickserve.co.ke';

// PLACEHOLDER — update social handles before public launch
export const BRAND = {
  name: 'QuickServe',
  tagline: 'Trusted home services in Nairobi',
  description:
    'QuickServe connects customers in Nairobi with verified professionals for home, auto, delivery, and personal-care services.',
  email: 'hello@quickserve.co.ke',
  socials: [
    'https://twitter.com/quickserveke', // PLACEHOLDER
    'https://facebook.com/quickserveke', // PLACEHOLDER
    'https://instagram.com/quickserveke', // PLACEHOLDER
  ],
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
      siteName: 'QuickServe',
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
    // sameAs is intentionally empty while social handles are unclaimed placeholders.
    // TODO: restore real handles into sameAs once accounts are claimed:
    //   sameAs: BRAND.socials,
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
