export type Role = 'customer' | 'provider' | 'admin';

export type RoleOption = {
  id: Role;
  label: string;
  description: string;
  icon: string; // emoji
};

export const ROLES: RoleOption[] = [
  { id: 'customer', label: 'Customer', description: 'Book trusted services near you', icon: '🧍' },
  { id: 'provider', label: 'Service Provider', description: 'Offer your services and earn', icon: '🧰' },
  { id: 'admin', label: 'Admin', description: 'Manage the QuickServe platform', icon: '🛡️' },
];

export function roleHref(role: Role): '/' | '/provider' | '/admin' {
  switch (role) {
    case 'customer':
      return '/';
    case 'provider':
      return '/provider';
    case 'admin':
      return '/admin';
  }
}
