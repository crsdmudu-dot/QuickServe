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
// Administration now lives in a dedicated web portal (apps/admin), not in this app.
export const ROLES: RoleOption[] = [
  { id: 'customer', label: 'Customer', description: 'Book trusted services near you', icon: '🧍' },
  { id: 'provider', label: 'Service Provider', description: 'Offer your services and earn', icon: '🧰' },
];

// `Role` still includes 'admin' and `roleHref` still routes it — for manually-created admin
// accounts signing in. Administration was separated out of the consumer application (apps/admin),
// so this bundle contains no `/admin` route: an admin identity lands on an inert notice screen
// that names the portal and offers sign-out. See src/app/staff-notice.tsx.
export function roleHref(role: Role): '/home' | '/provider' | '/staff-notice' {
  switch (role) {
    case 'customer':
      return '/home';
    case 'provider':
      return '/provider';
    case 'admin':
      return '/staff-notice';
  }
}
