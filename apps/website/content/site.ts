// content/site.ts — typed, extensible content for the QuickServe marketing website.
// No data fetching, no Supabase, no server-only code — pure static data.

export type Cta = { label: string; href: string };

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export const NAV_LINKS: { label: string; href: string }[] = [
  { label: 'Services', href: '/services' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Why QuickServe', href: '/why-quickserve' },
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
      { label: 'About / Why QuickServe', href: '/why-quickserve' },
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
  { id: 'car-towing', title: 'Car Towing', subtitle: '24/7 recovery', icon: '🚙' },
  { id: 'grocery-delivery', title: 'Grocery Delivery', subtitle: 'Fresh to your door', icon: '🛒' },
  { id: 'food-delivery', title: 'Food Delivery', subtitle: 'From local restaurants', icon: '🍔' },
  { id: 'medicine-delivery', title: 'Medicine Delivery', subtitle: 'Pharmacy on demand', icon: '💊' },
  { id: 'package-delivery', title: 'Package Delivery', subtitle: 'Send anything, fast', icon: '📮' },
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
    body: 'Pick from 19+ home, auto, delivery & personal-care services.',
  },
  {
    title: 'Book in seconds',
    body: 'Set your location and preferred time.',
  },
  {
    title: 'Get matched',
    body: 'We connect you with a nearby verified professional.',
  },
  {
    title: 'Track in real time',
    body: "Follow your pro's arrival on the map.",
  },
  {
    title: 'Job done',
    body: 'Your pro completes the work to a high standard.',
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
    icon: '✅',
    title: 'Verified Professionals',
    text: 'Every provider is background-checked and skill-verified before joining the platform.',
  },
  {
    icon: '💰',
    title: 'Transparent Pricing',
    text: 'See the full price upfront — no hidden fees, no surprises.',
  },
  {
    icon: '⚡',
    title: 'Fast Booking',
    text: 'Book a service in under a minute, straight from your phone.',
  },
  {
    icon: '🔒',
    title: 'Secure Payments',
    text: 'Pay safely through the app with multiple payment options.',
  },
  {
    icon: '📍',
    title: 'Real-Time Tracking',
    text: "Watch your provider travel to you and know exactly when they'll arrive.",
  },
  {
    icon: '⭐',
    title: 'Ratings & Reviews',
    text: 'Read honest reviews from real customers before you book.',
  },
];

// ---------------------------------------------------------------------------
// Provider benefits
// ---------------------------------------------------------------------------

export const PROVIDER_BENEFITS: { icon: string; title: string; text: string }[] = [
  {
    icon: '📋',
    title: 'Steady Stream of Jobs',
    text: 'Get matched with customers in your area every day.',
  },
  {
    icon: '🕐',
    title: 'Flexible Schedule',
    text: 'Work when you want — set your own hours and availability.',
  },
  {
    icon: '💸',
    title: 'Fast Payouts',
    text: 'Earnings are paid out quickly and reliably.',
  },
  {
    icon: '📈',
    title: 'Grow Your Business',
    text: 'Build a reputation, collect reviews, and attract more clients.',
  },
  {
    icon: '🤑',
    title: 'Keep More of Your Earnings',
    text: 'Competitive commission rates so you keep the majority of every job.',
  },
  {
    icon: '🆓',
    title: 'Free to Join',
    text: 'Sign up and start accepting jobs with no upfront cost.',
  },
];

// ---------------------------------------------------------------------------
// Trust badges
// ---------------------------------------------------------------------------

export const TRUST_BADGES: { icon: string; label: string; description: string }[] = [
  {
    icon: '✅',
    label: 'Verified Providers',
    description: 'All professionals are vetted and background-checked.',
  },
  {
    icon: '🔒',
    label: 'Secure Payments',
    description: 'Your payment data is encrypted and protected.',
  },
  {
    icon: '⭐',
    label: 'Ratings & Reviews',
    description: 'Transparent feedback from real customers.',
  },
  {
    icon: '⏱️',
    label: 'On-Time Service',
    description: 'Providers are held to punctuality standards.',
  },
  {
    icon: '🎧',
    label: '24/7 Support',
    description: 'Our support team is available around the clock.',
  },
  {
    icon: '😊',
    label: 'Satisfaction Focused',
    description: "We're not done until you're happy with the result.",
  },
];

// ---------------------------------------------------------------------------
// FAQ — 8 entries
// ---------------------------------------------------------------------------

export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'What is QuickServe?',
    answer:
      'QuickServe is an on-demand services platform that connects customers in Nairobi with trusted, verified professionals for home, auto, delivery, and personal-care services.',
  },
  {
    question: 'Which areas do you currently serve?',
    answer:
      'We currently operate in Nairobi and are actively expanding to other cities across Kenya. Check the app for the latest coverage in your area.',
  },
  {
    question: 'How does booking work?',
    answer:
      'Open the app, choose a service, set your location and preferred time, and confirm — you will be matched with a nearby verified provider within minutes.',
  },
  {
    question: 'Are providers vetted?',
    answer:
      'Yes. Every provider goes through an identity verification and background check before they can accept jobs on the platform.',
  },
  {
    question: 'How does payment work?',
    answer:
      'You pay securely through the app after the job is completed. We support M-Pesa and card payments, and your payment details are always encrypted.',
  },
  {
    question: 'How do I become a provider?',
    answer:
      "Visit the Become a Provider page, fill in your details, complete the verification steps, and start accepting jobs once approved. It's free to join.",
  },
  {
    question: 'Is there a mobile app?',
    answer:
      'Yes — QuickServe is available for both Android and iOS. Download it from the App Store or Google Play Store.',
  },
  {
    question: 'How do I get support?',
    answer:
      'You can reach our support team via the in-app chat, the Contact page on this website, or by emailing hello@quickserve.co.ke.',
  },
];

// ---------------------------------------------------------------------------
// Stats — PLACEHOLDER; replace before public launch
// ---------------------------------------------------------------------------

// PLACEHOLDER — not live data; replace before public launch
export const STAT_PLACEHOLDERS: { value: string; label: string }[] = [
  { value: '10,000+', label: 'Jobs Completed' },
  { value: '4.9★', label: 'Average Rating' },
  { value: '500+', label: 'Verified Providers' },
  { value: '19+', label: 'Services' },
  { value: '30 min', label: 'Avg Response Time' },
];

// ---------------------------------------------------------------------------
// Testimonials — PLACEHOLDER; replace before public launch
// ---------------------------------------------------------------------------

// PLACEHOLDER — illustrative, not real customers
export const TESTIMONIAL_PLACEHOLDERS: { quote: string; author: string; role: string }[] = [
  {
    quote:
      'QuickServe sent a plumber to my house in under 30 minutes. The work was clean and the pricing was exactly what I was quoted. I will not call anyone else.',
    author: 'Amina W.',
    role: 'Customer, Nairobi',
  },
  {
    quote:
      'I booked a house cleaning for Saturday morning and the team arrived on time, were professional, and left my apartment spotless. Absolutely worth it.',
    author: 'Brian O.',
    role: 'Customer, Nairobi',
  },
  {
    quote:
      'As a provider, QuickServe keeps my schedule full and pays me reliably. The app is simple and I love being able to set my own hours.',
    author: 'David K.',
    role: 'Service Provider, Nairobi',
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
