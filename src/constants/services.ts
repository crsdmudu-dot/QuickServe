export type ServiceCategory = 'home' | 'auto' | 'delivery' | 'personal';
export type ServiceBadge = 'Popular' | 'New';

export type Service = {
  id: string;
  title: string;
  subtitle?: string;
  /** Emoji glyph — renders identically on iOS, Android, and web. */
  icon: string;
  category: ServiceCategory;
  /** Starting price in KES. */
  startingPrice?: number;
  badge?: ServiceBadge;
  // ── Extended fields (optional) — populated by ServicesProvider from DB ───
  /** Lifecycle status from the DB (e.g. 'active', 'archived'). */
  status?: string;
  /** True when this service should be highlighted as featured. */
  featured?: boolean;
  /** True when this service should be highlighted as trending. */
  trending?: boolean;
  /** True when this service offers emergency / urgent availability. */
  emergencyAvailable?: boolean;
  /** True when an inspection is required before work can begin. */
  inspectionRequired?: boolean;
  /** True when this service is available 24 hours a day, 7 days a week. */
  available247?: boolean;
  /** Long-form marketing description. */
  fullDescription?: string;
  /** Human-readable estimated service duration (e.g. '2–3 hours'). */
  estimatedDuration?: string;
  /** Hex/brand color associated with the service tile. */
  color?: string;
};

export const CATEGORY_ORDER: ServiceCategory[] = ['home', 'auto', 'delivery', 'personal'];

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  home: 'Home Services',
  auto: 'Auto Services',
  delivery: 'Delivery Services',
  personal: 'Personal Care',
};

// No entry carries a promotional badge (Popular/New) and no subtitle makes a time,
// speed, availability, safety, licence or freshness claim: owner decision OD-S5-17 (A),
// 2026-10-14; PM stage 130u-y Part D.
export const SERVICES: Service[] = [
  // Home (9)
  { id: 'house-cleaning', title: 'House Cleaning', subtitle: 'Deep & regular cleaning', icon: '🧹', category: 'home', startingPrice: 1500 },
  { id: 'plumbing', title: 'Plumbing', subtitle: 'Leaks, fittings & repairs', icon: '🔧', category: 'home', startingPrice: 2000 },
  { id: 'electrical', title: 'Electrical Repairs', subtitle: 'Wiring & fixtures', icon: '⚡', category: 'home', startingPrice: 1800 },
  { id: 'ac-repair', title: 'AC Repair & Servicing', subtitle: 'Cooling & maintenance', icon: '❄️', category: 'home', startingPrice: 2500 },
  { id: 'painting', title: 'Home Painting', subtitle: 'Interior & exterior', icon: '🎨', category: 'home', startingPrice: 3000 },
  { id: 'pest-control', title: 'Pest Control', subtitle: 'Home pest treatment', icon: '🐜', category: 'home', startingPrice: 2200 },
  { id: 'handyman', title: 'Handyman Services', subtitle: 'Fixes & odd jobs', icon: '🛠️', category: 'home', startingPrice: 1200 },
  { id: 'appliance-repair', title: 'Appliance Repair', subtitle: 'Fridges, washers & more', icon: '🔌', category: 'home', startingPrice: 1600 },
  { id: 'movers-packers', title: 'Movers & Packers', subtitle: 'Pack, move & unpack', icon: '📦', category: 'home', startingPrice: 5000 },
  // Auto (3)
  { id: 'mechanic', title: 'Mechanic On Demand', subtitle: 'Roadside & at-home', icon: '🚗', category: 'auto', startingPrice: 2000 },
  { id: 'tire-replacement', title: 'Tire Replacement', subtitle: 'Change & balancing', icon: '🛞', category: 'auto', startingPrice: 1500 },
  { id: 'car-towing', title: 'Car Towing', subtitle: 'Breakdown recovery', icon: '🚙', category: 'auto', startingPrice: 3500 },
  // Delivery (4)
  { id: 'grocery-delivery', title: 'Grocery Delivery', subtitle: 'Groceries to your door', icon: '🛒', category: 'delivery', startingPrice: 300 },
  { id: 'food-delivery', title: 'Food Delivery', subtitle: 'From local restaurants', icon: '🍔', category: 'delivery', startingPrice: 250 },
  { id: 'medicine-delivery', title: 'Medicine Delivery', subtitle: 'Collected & delivered', icon: '💊', category: 'delivery', startingPrice: 300 },
  { id: 'package-delivery', title: 'Package Delivery', subtitle: 'Parcels & documents', icon: '📮', category: 'delivery', startingPrice: 400 },
  // Personal Care (3)
  { id: 'haircuts', title: 'Haircuts', subtitle: 'Barbers & stylists', icon: '✂️', category: 'personal', startingPrice: 800 },
  { id: 'makeup', title: 'Makeup', subtitle: 'Events & occasions', icon: '💄', category: 'personal', startingPrice: 2500 },
  { id: 'massage', title: 'Massage', subtitle: 'Relax at home', icon: '💆', category: 'personal', startingPrice: 2000 },
];

export function getServicesByCategory(category: ServiceCategory): Service[] {
  return SERVICES.filter((s) => s.category === category);
}

export function getPopularServices(): Service[] {
  return SERVICES.filter((s) => s.badge === 'Popular');
}

/**
 * Returns the Service from the constants array whose id matches `id`,
 * or `undefined` if no match is found.
 * Used as the "constants shim" fallback layer in ServicesProvider.getServiceBySlug.
 */
export function getServiceById(id: string): Service | undefined {
  return SERVICES.find((s) => s.id === id);
}
