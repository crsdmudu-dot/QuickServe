// MarketingFooter — brand blurb + footer link columns + copyright.
// Server component — no interactivity.

import Link from 'next/link';
import { FOOTER_GROUPS } from '@/content/site';
import { BRAND as SITE_BRAND } from '@/lib/site';

export default function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-surfaceMuted border-t border-border">
      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* Top section: brand blurb + link columns */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-12 mb-12">
          {/* Brand blurb */}
          <div className="md:col-span-1">
            <Link href="/" className="text-heading font-bold text-primary tracking-tight">
              {SITE_BRAND.name}
            </Link>
            <p className="mt-3 text-label text-textSecondary leading-relaxed">
              {SITE_BRAND.tagline}. On-demand home, auto, delivery &amp; personal-care services.
            </p>
            <p className="mt-2 text-caption text-textTertiary">
              <a href={`mailto:${SITE_BRAND.email}`} className="hover:text-primary transition-colors">
                {SITE_BRAND.email}
              </a>
            </p>
          </div>

          {/* Link columns */}
          {FOOTER_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-label font-semibold text-ink mb-4">{group.title}</h3>
              <ul className="flex flex-col gap-3">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-label text-textSecondary hover:text-primary transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Copyright */}
        <div className="border-t border-border pt-6 flex flex-col md:flex-row items-center justify-between gap-2">
          <p className="text-caption text-textTertiary">
            &copy; {year} {SITE_BRAND.name}. All rights reserved.
          </p>
          <p className="text-caption text-textTertiary">
            Built in Nairobi, Kenya.
          </p>
        </div>
      </div>
    </footer>
  );
}
