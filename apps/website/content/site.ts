// content/site.ts — typed, extensible content for the KwikServe marketing website.
// No data fetching, no Supabase, no server-only code — pure static data.

export type Cta = { label: string; href: string };

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export const NAV_LINKS: { label: string; href: string }[] = [
  { label: 'Services', href: '/services' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Why KwikServe', href: '/why-quickserve' },
  { label: 'Become a Provider', href: '/become-a-provider' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
];

// ---------------------------------------------------------------------------
// Footer groups
// ---------------------------------------------------------------------------

export const FOOTER_GROUPS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Company',
    links: [
      { label: 'About / Why KwikServe', href: '/why-quickserve' },
      { label: 'How It Works', href: '/how-it-works' },
      { label: 'Become a Provider', href: '/become-a-provider' },
    ],
  },
  {
    title: 'Services',
    links: [
      { label: 'Browse Services', href: '/services' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Download App', href: '/download' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'FAQ', href: '/faq' },
      { label: 'Contact', href: '/contact' },
      { label: 'Support', href: '/support' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Delete Account', href: '/delete-account' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Service categories — 19 entries; copy verbatim
// ---------------------------------------------------------------------------

export const SERVICE_CATEGORIES: {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
}[] = [
  { id: 'house-cleaning', title: 'House Cleaning', subtitle: 'Deep & regular cleaning', icon: '🧹' },
  { id: 'plumbing', title: 'Plumbing', subtitle: 'Leaks, fittings & repairs', icon: '🔧' },
  { id: 'electrical', title: 'Electrical Repairs', subtitle: 'Wiring & fixtures', icon: '⚡' },
  { id: 'ac-repair', title: 'AC Repair & Servicing', subtitle: 'Cooling & maintenance', icon: '❄️' },
  { id: 'painting', title: 'Home Painting', subtitle: 'Interior & exterior', icon: '🎨' },
  { id: 'pest-control', title: 'Pest Control', subtitle: 'Safe & thorough', icon: '🐜' },
  { id: 'handyman', title: 'Handyman Services', subtitle: 'Fixes & odd jobs', icon: '🛠️' },
  { id: 'appliance-repair', title: 'Appliance Repair', subtitle: 'Fridges, washers & more', icon: '🔌' },
  { id: 'movers-packers', title: 'Movers & Packers', subtitle: 'Pack, move & unpack', icon: '📦' },
  { id: 'mechanic', title: 'Mechanic On Demand', subtitle: 'Roadside & at-home', icon: '🚗' },
  { id: 'tire-replacement', title: 'Tire Replacement', subtitle: 'Change & balancing', icon: '🛞' },
  { id: 'car-towing', title: 'Car Towing', subtitle: 'Vehicle recovery', icon: '🚙' },
  { id: 'grocery-delivery', title: 'Grocery Delivery', subtitle: 'Fresh to your door', icon: '🛒' },
  { id: 'food-delivery', title: 'Food Delivery', subtitle: 'From local restaurants', icon: '🍔' },
  { id: 'medicine-delivery', title: 'Medicine Delivery', subtitle: 'Pharmacy on demand', icon: '💊' },
  { id: 'package-delivery', title: 'Package Delivery', subtitle: 'Parcels and documents', icon: '📮' },
  { id: 'haircuts', title: 'Haircuts', subtitle: 'Barbers & stylists', icon: '✂️' },
  { id: 'makeup', title: 'Makeup', subtitle: 'Events & occasions', icon: '💄' },
  { id: 'massage', title: 'Massage', subtitle: 'Relax at home', icon: '💆' },
];

// ---------------------------------------------------------------------------
// How It Works — 6 steps
// ---------------------------------------------------------------------------

export const HOW_IT_WORKS_STEPS: { title: string; body: string }[] = [
  {
    title: 'Choose a service',
    body: 'Pick from 19 home, auto, delivery & personal-care services.',
  },
  {
    title: 'Book in seconds',
    body: 'Set your location and preferred time.',
  },
  {
    title: 'Get a quote',
    body: 'We send you the price in the app. Once you accept it, we assign a provider to your booking.',
  },
  {
    title: 'Track in real time',
    body: "Follow your pro's arrival on the map.",
  },
  {
    title: 'Job done, then pay',
    body: 'Your provider completes the job, and you pay with M-PESA in the app.',
  },
  {
    title: 'Rate & review',
    body: 'Share feedback and help the community.',
  },
];

// ---------------------------------------------------------------------------
// Customer benefits
// ---------------------------------------------------------------------------

export const CUSTOMER_BENEFITS: { icon: string; title: string; text: string }[] = [
  {
    icon: '💰',
    title: 'Transparent Pricing',
    text: 'See the full price upfront — no hidden fees, no surprises.',
  },
  {
    icon: '⚡',
    title: 'Fast Booking',
    text: 'Book a service in a few taps, straight from your phone.',
  },
  {
    icon: '🔒',
    title: 'Secure Payments',
    text: 'Pay with M-PESA in the app after the job is done. We never see your M-PESA PIN.',
  },
  {
    icon: '📍',
    title: 'Real-Time Tracking',
    text: "Watch your provider travel to you and know exactly when they'll arrive.",
  },
  {
    icon: '⭐',
    title: 'Ratings & Reviews',
    text: 'Rate your provider after every job. Ratings help us keep standards high.',
  },
];

// ---------------------------------------------------------------------------
// Provider benefits
// ---------------------------------------------------------------------------

export const PROVIDER_BENEFITS: { icon: string; title: string; text: string }[] = [
  {
    icon: '📋',
    title: 'Bookings for Your Skills',
    text: 'Our team assigns you bookings for the services you offer.',
  },
  {
    icon: '🕐',
    title: 'Flexible Schedule',
    text: 'Work when you want — set your own hours and availability.',
  },
  {
    icon: '💸',
    title: 'Clear Earnings',
    text: 'The app shows what each job earned you and whether it has been paid out by M-PESA.',
  },
  {
    icon: '📈',
    title: 'Grow Your Business',
    text: 'Build a reputation, collect reviews, and attract more clients.',
  },
  {
    icon: '🆓',
    title: 'Free to Join',
    text: 'Signing up is free. You can take bookings once your provider account is active.',
  },
];

// ---------------------------------------------------------------------------
// Trust badges
// ---------------------------------------------------------------------------

export const TRUST_BADGES: { icon: string; label: string; description: string }[] = [
  {
    icon: '🔒',
    label: 'Secure Payments',
    description: 'Your payment data is encrypted and protected.',
  },
  {
    icon: '⭐',
    label: 'Ratings & Reviews',
    description: 'Customers rate every completed job.',
  },
  {
    icon: '⏱️',
    label: 'Live Job Status',
    description: 'Follow each booking in the app, from assigned to completed.',
  },
  {
    icon: '🎧',
    label: 'Email Support',
    description: 'Questions? Email our support team.',
  },
  {
    icon: '😊',
    label: 'Help If It Goes Wrong',
    description: 'If a job was not done as agreed, email us and we will look into it.',
  },
];

// ---------------------------------------------------------------------------
// FAQ preview — the first questions shown on the Home page (4 entries).
// The FAQ page itself renders the approved FAQ text from content/faq.md (app/faq/page.tsx), not this list.
// ---------------------------------------------------------------------------

export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'What is KwikServe?',
    answer:
      'KwikServe is an on-demand services platform that connects customers in Nairobi with independent professionals for home, auto, delivery and personal-care services. It is operated by Hired Corp Limited.',
  },
  {
    question: 'Which areas do you currently serve?',
    answer:
      'KwikServe is available only in Kenya. Not every service is available in every area or at every time, and we tell you if we cannot serve your booking.',
  },
  {
    question: 'How does booking work?',
    answer:
      'Open the app, choose a service, and give your address, preferred time and job details. We send you a quote in the app. Once you accept it, we assign a provider, and you can follow the booking in the app.',
  },
  {
    question: 'How do I get support?',
    answer:
      'You can reach our support team through the Contact page on this website, or by emailing support@kwikserve.co.ke.',
  },
];

// ---------------------------------------------------------------------------
// CTA copy
// ---------------------------------------------------------------------------

export const PRIMARY_CTA: Cta = { label: 'Book a Service', href: '/download' };
export const PROVIDER_CTA: Cta = { label: 'Become a Provider', href: '/become-a-provider' };
export const SECONDARY_CTA: Cta = { label: 'Contact Us', href: '/contact' };
export const DOWNLOAD_CTA: Cta = { label: 'Download the App', href: '/download' };

// ---------------------------------------------------------------------------
// SEO keyword phrases
// ---------------------------------------------------------------------------

export const SEO_PHRASES: string[] = [
  'Home Services Nairobi',
  'Trusted Plumbers Nairobi',
  'Electrician Nairobi',
  'Cleaning Services Nairobi',
  'Handyman Nairobi',
  'Professional Home Services Kenya',
];
