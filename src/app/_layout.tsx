import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/auth/auth-context';
import { BookingDraftProvider } from '@/booking/booking-draft';
import { roleHref } from '@/constants/roles';

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

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AuthProvider>
        <BookingDraftProvider>
          <RootNavigator />
        </BookingDraftProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
