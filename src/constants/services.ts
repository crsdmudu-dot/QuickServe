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
};

export const CATEGORY_ORDER: ServiceCategory[] = ['home', 'auto', 'delivery', 'personal'];

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  home: 'Home Services',
  auto: 'Auto',
  delivery: 'Delivery',
  personal: 'Personal Care',
};

export const SERVICES: Service[] = [
  // Home (9)
  { id: 'house-cleaning', title: 'House Cleaning', subtitle: 'Deep & regular cleaning', icon: '🧹', category: 'home', startingPrice: 1500, badge: 'Popular' },
  { id: 'plumbing', title: 'Plumbing', subtitle: 'Leaks, fittings & repairs', icon: '🔧', category: 'home', startingPrice: 2000, badge: 'Popular' },
  { id: 'electrical', title: 'Electrical Repairs', subtitle: 'Wiring & fixtures', icon: '⚡', category: 'home', startingPrice: 1800 },
  { id: 'ac-repair', title: 'AC Repair & Servicing', subtitle: 'Cooling & maintenance', icon: '❄️', category: 'home', startingPrice: 2500, badge: 'Popular' },
  { id: 'painting', title: 'Home Painting', subtitle: 'Interior & exterior', icon: '🎨', category: 'home', startingPrice: 3000 },
  { id: 'pest-control', title: 'Pest Control', subtitle: 'Safe & thorough', icon: '🐜', category: 'home', startingPrice: 2200 },
  { id: 'handyman', title: 'Handyman Services', subtitle: 'Fixes & odd jobs', icon: '🛠️', category: 'home', startingPrice: 1200 },
  { id: 'appliance-repair', title: 'Appliance Repair', subtitle: 'Fridges, washers & more', icon: '🔌', category: 'home', startingPrice: 1600 },
  { id: 'movers-packers', title: 'Movers & Packers', subtitle: 'Pack, move & unpack', icon: '📦', category: 'home', startingPrice: 5000 },
  // Auto (3)
  { id: 'mechanic', title: 'Mechanic On Demand', subtitle: 'Roadside & at-home', icon: '🚗', category: 'auto', startingPrice: 2000, badge: 'Popular' },
  { id: 'tire-replacement', title: 'Tire Replacement', subtitle: 'Change & balancing', icon: '🛞', category: 'auto', startingPrice: 1500 },
  { id: 'car-towing', title: 'Car Towing', subtitle: '24/7 recovery', icon: '🚙', category: 'auto', startingPrice: 3500 },
  // Delivery (4)
  { id: 'grocery-delivery', title: 'Grocery Delivery', subtitle: 'Fresh to your door', icon: '🛒', category: 'delivery', startingPrice: 300, badge: 'Popular' },
  { id: 'food-delivery', title: 'Food Delivery', subtitle: 'From local restaurants', icon: '🍔', category: 'delivery', startingPrice: 250, badge: 'Popular' },
  { id: 'medicine-delivery', title: 'Medicine Delivery', subtitle: 'Pharmacy on demand', icon: '💊', category: 'delivery', startingPrice: 300 },
  { id: 'package-delivery', title: 'Package Delivery', subtitle: 'Send anything, fast', icon: '📮', category: 'delivery', startingPrice: 400 },
  // Personal Care (3)
  { id: 'haircuts', title: 'Haircuts', subtitle: 'Barbers & stylists', icon: '✂️', category: 'personal', startingPrice: 800, badge: 'New' },
  { id: 'makeup', title: 'Makeup', subtitle: 'Events & occasions', icon: '💄', category: 'personal', startingPrice: 2500 },
  { id: 'massage', title: 'Massage', subtitle: 'Relax at home', icon: '💆', category: 'personal', startingPrice: 2000, badge: 'New' },
];

export function getServicesByCategory(category: ServiceCategory): Service[] {
  return SERVICES.filter((s) => s.category === category);
}

export function getPopularServices(): Service[] {
  return SERVICES.filter((s) => s.badge === 'Popular');
}
