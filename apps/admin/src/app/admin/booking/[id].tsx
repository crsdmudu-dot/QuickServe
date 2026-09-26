/**
 * src/app/admin/booking/[id].tsx — legacy link redirect.
 *
 * The database's booking alerts to admins (migration 0020) store the route /admin/booking/<id>,
 * from before the admin web had its own app. The booking page here is /bookings/<id>, so this
 * screen forwards old links, including alerts already stored, to the right page.
 */
import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

export default function LegacyAdminBookingRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={(id ? `/bookings/${id}` : '/bookings') as Href} />;
}
