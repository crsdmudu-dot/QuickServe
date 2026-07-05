// app/robots.ts — robots.txt generation for the QuickServe marketing website.
// Allows all crawlers to index all public marketing routes.
// `dynamic = 'force-static'` is required for `output: 'export'` in Next 15.

import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
