import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments, type Href } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/auth/auth-context';
import { resolveRootRedirect } from '@/auth/root-redirect';
import { TermsGateProvider, useTermsGate } from '@/auth/terms-gate';
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
  const { status: termsStatus } = useTermsGate();
  const segments = useSegments();
  const router = useRouter();
  // Hold ordinary role routing while a password recovery is in progress (link verified,
  // password not yet set) so the user is not bounced to a role home mid-recovery.
  const recoveryActive = recovery.stage !== 'idle' && recovery.stage !== 'done';
  // F5.4: a signed-in customer or provider without the current Terms is sent to the Terms screen.
  const termsRequired = termsStatus === 'required';

  useEffect(() => {
    // Decision is pure (src/auth/root-redirect.ts): `(admin-web)` and `auth/*` link routes
    // manage their own lifecycle; otherwise signed-out → welcome, Terms not accepted → Terms screen,
    // signed-in-in-onboarding → home.
    const target = resolveRootRedirect({ isLoading, signedIn, role, segments: segments as string[], recoveryActive, termsRequired });
    if (target) router.replace(target as Href);
  }, [isLoading, signedIn, role, segments, recoveryActive, termsRequired, router]);

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
    // KeyboardProvider tracks the on-screen keyboard for the whole app, so screens can keep the
    // field being typed in visible above it (form buttons below the field stay reachable by
    // scrolling). Android no longer resizes the screen for the keyboard (edge-to-edge), and iOS
    // never did, so the app has to do it itself.
    <KeyboardProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <AuthProvider>
          <TermsGateProvider>
            <ServicesProvider>
              <BookingDraftProvider>
                <OfflineBanner />
                <ErrorBoundary>
                  <RootNavigator />
                </ErrorBoundary>
              </BookingDraftProvider>
            </ServicesProvider>
          </TermsGateProvider>
        </AuthProvider>
      </ThemeProvider>
    </KeyboardProvider>
  );
}
