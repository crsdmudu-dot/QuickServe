import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments, type Href } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import * as Notifications from 'expo-notifications';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/auth/auth-context';
import { BookingDraftProvider } from '@/booking/booking-draft';
import { ErrorBoundary } from '@/components/error-boundary';
import { roleHref } from '@/constants/roles';
import { registerForPushNotifications, routeForNotificationData } from '@/lib/push';

function RootNavigator() {
  const { isLoading, signedIn, role } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inOnboarding = segments[0] === '(onboarding)';
    if (!signedIn && !inOnboarding) {
      router.replace('/welcome');
    } else if (signedIn && role && inOnboarding) {
      router.replace(roleHref(role));
    }
  }, [isLoading, signedIn, role, segments, router]);

  // Register this device for push once the user is signed in.
  useEffect(() => {
    if (signedIn) void registerForPushNotifications();
  }, [signedIn]);

  // Deep-link when the user taps a notification.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = routeForNotificationData(response.notification.request.content.data);
      if (route) router.push(route as Href);
    });
    return () => sub.remove();
  }, [router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AuthProvider>
        <BookingDraftProvider>
          <ErrorBoundary>
            <RootNavigator />
          </ErrorBoundary>
        </BookingDraftProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
