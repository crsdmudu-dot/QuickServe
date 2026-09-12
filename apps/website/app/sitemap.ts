// app/sitemap.ts — static sitemap for all 12 KwikServe marketing routes.
// No data fetching — pure static export.
// `dynamic = 'force-static'` is required for `output: 'export'` in Next 15.

import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

type RouteConfig = {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
};

const ROUTES: RouteConfig[] = [
  { path: '/',                  changeFrequency: 'weekly',  priority: 1.0 },
  { path: '/services',          changeFrequency: 'weekly',  priority: 0.9 },
  { path: '/how-it-works',      changeFrequency: 'monthly', priority: 0.8 },
  { path: '/why-quickserve',    changeFrequency: 'monthly', priority: 0.8 },
  { path: '/become-a-provider', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/pricing',           changeFrequency: 'monthly', priority: 0.7 },
  { path: '/faq',               changeFrequency: 'monthly', priority: 0.7 },
  { path: '/contact',           changeFrequency: 'yearly',  priority: 0.6 },
  { path: '/support',           changeFrequency: 'yearly',  priority: 0.6 },
  { path: '/download',          changeFrequency: 'monthly', priority: 0.8 },
  { path: '/privacy',           changeFrequency: 'yearly',  priority: 0.4 },
  { path: '/terms',             changeFrequency: 'yearly',  priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));
}
