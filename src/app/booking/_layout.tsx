import { Stack } from 'expo-router';

export default function BookingLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, title: 'Book a service' }}>
      {/* Booking Detail is a standalone destination (My Bookings / Payments / a notification
          tap / duplicate-warning), so it is the FIRST route of this nested stack and the
          native header shows no back arrow (its real previous screen lives in the parent
          root Stack). It renders its own in-content header with a visible, safe Back control,
          so hide the native header here to avoid a duplicate / wrongly-titled header bar. */}
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
      {/* Service Details is the FIRST route of the booking flow (entered from Home / Search /
          Favorites, which live in the parent root Stack), so the native header shows no back
          arrow here either. It renders its own visible, safe Back control — hide the native
          header to avoid a duplicate bar. */}
      <Stack.Screen name="service-details" options={{ headerShown: false }} />
      {/* Address can also be reached as a first route (and historically had NO visible Back at
          all — the Phase 6G finding). It now renders the same in-content Back control, so hide
          the native header for the same reason. */}
      <Stack.Screen name="address" options={{ headerShown: false }} />
    </Stack>
  );
}
