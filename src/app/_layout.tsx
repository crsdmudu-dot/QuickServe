import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments, type Href } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/auth/auth-context';
import { resolveRootRedirect } from '@/auth/root-redirect';
import { BookingDraftProvider } from '@/booking/booking-draft';
import { ServicesProvider } from '@/services/services-provider';
import { ErrorBoundary } from '@/components/error-boundary';
import { OfflineBanner } from '@/components/ui/offline-banner';
import { registerForPushNotifications, setupNotificationResponseListener } from '@/lib/push';
import { initMonitoring } from '@/lib/monitoring';

// Initialise crash reporting once at startup (no-op unless EXPO_PUBLIC_SENTRY_DSN is set).
initMonitoring();

function RootNavigator() {
  const { isLoading, signedIn, role, recovery } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // Hold ordinary role routing while a password recovery is in progress (link verified,
  // password not yet set) so the user is not bounced to a role home mid-recovery.
  const recoveryActive = recovery.stage !== 'idle' && recovery.stage !== 'done';

  useEffect(() => {
    // Decision is pure (src/auth/root-redirect.ts): `(admin-web)` and `auth/*` link routes
    // manage their own lifecycle; otherwise signed-out → welcome, signed-in-in-onboarding → home.
    const target = resolveRootRedirect({ isLoading, signedIn, role, segments: segments as string[], recoveryActive });
    if (target) router.replace(target as Href);
  }, [isLoading, signedIn, role, segments, recoveryActive, router]);

  // Register this device for push once the user is signed in.
  useEffect(() => {
    if (signedIn) void registerForPushNotifications();
  }, [signedIn]);

  // Deep-link when the user taps a notification.
  useEffect(() => {
    const unsubscribe = setupNotificationResponseListener((path) => router.push(path as Href));
    return unsubscribe;
  }, [router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AuthProvider>
        <ServicesProvider>
          <BookingDraftProvider>
            <OfflineBanner />
            <ErrorBoundary>
              <RootNavigator />
            </ErrorBoundary>
          </BookingDraftProvider>
        </ServicesProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
