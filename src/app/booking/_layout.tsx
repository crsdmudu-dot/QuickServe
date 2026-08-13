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
    </Stack>
  );
}
