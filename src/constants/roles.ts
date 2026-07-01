export type Role = 'customer' | 'provider' | 'admin';

export type RoleOption = {
  id: Role;
  label: string;
  description: string;
  icon: string; // emoji
};

// Public mobile signup roles ONLY. 'admin' is intentionally excluded — admins are
// never self-registrable from the app. Admin accounts are created/promoted manually
// in Supabase for the pilot, and `handle_new_user` (migration 0001) downgrades any
// attempted admin signup to 'customer' as a backend safety net.
// Future: admin access should move to a dedicated web admin portal, not the mobile app.
export const ROLES: RoleOption[] = [
  { id: 'customer', label: 'Customer', description: 'Book trusted services near you', icon: '🧍' },
  { id: 'provider', label: 'Service Provider', description: 'Offer your services and earn', icon: '🧰' },
];

// `Role` still includes 'admin' and `roleHref` still routes it — for manually-created
// admin accounts signing in (admin screens/routes are unchanged for now).
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
