import { Redirect, type Href } from 'expo-router';

/**
 * Root "/" entry dispatcher — WEB (admin surface).
 *
 * Phase 3G: on web the product surface is the admin panel, so "/" routes to the admin
 * dashboard. The `(admin-web)` guard then applies its normal auth handling (unauthenticated
 * → admin login), exactly as before — this preserves the web admin behaviour while making
 * the native default entry (index.tsx) the customer/provider flow.
 */
export default function IndexWeb() {
  return <Redirect href={'/(admin-web)/dashboard' as Href} />;
}
