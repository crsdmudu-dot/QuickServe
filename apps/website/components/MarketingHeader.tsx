'use client';
// MarketingHeader — sticky top navigation bar with desktop links + mobile menu toggle.
// 'use client' required because of useState for the mobile menu.

import { useState } from 'react';
import Link from 'next/link';
import { NAV_LINKS, PRIMARY_CTA, PROVIDER_CTA } from '@/content/site';

export default function MarketingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background border-b border-border">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Brand wordmark */}
        <Link
          href="/"
          className="text-heading font-bold text-primary tracking-tight"
        >
          KwikServe
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-label text-textSecondary hover:text-ink transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href={PROVIDER_CTA.href}
            className="text-label font-medium text-primary border border-primary rounded-pill px-4 py-2 hover:bg-primaryTint transition-colors"
          >
            {PROVIDER_CTA.label}
          </Link>
          <Link
            href={PRIMARY_CTA.href}
            className="text-label font-medium text-white bg-primary rounded-pill px-4 py-2 hover:bg-primaryDark transition-colors"
          >
            {PRIMARY_CTA.label}
          </Link>
        </div>

        {/* Hamburger button (mobile only) */}
        <button
          className="md:hidden flex flex-col gap-1.5 p-2"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          <span className="block w-6 h-0.5 bg-ink" />
          <span className="block w-6 h-0.5 bg-ink" />
          <span className="block w-6 h-0.5 bg-ink" />
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-background border-t border-border px-6 py-4 flex flex-col gap-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-body text-ink hover:text-primary transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <hr className="border-border" />
          <Link
            href={PROVIDER_CTA.href}
            className="text-label font-medium text-primary border border-primary rounded-pill px-4 py-2 text-center hover:bg-primaryTint transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            {PROVIDER_CTA.label}
          </Link>
          <Link
            href={PRIMARY_CTA.href}
            className="text-label font-medium text-white bg-primary rounded-pill px-4 py-2 text-center hover:bg-primaryDark transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            {PRIMARY_CTA.label}
          </Link>
        </div>
      )}
    </header>
  );
}
