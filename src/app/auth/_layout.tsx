import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

/**
 * `auth/*` — routes reached from emailed links (password recovery, email confirmation).
 * They are exempt from the root navigator's role redirects (see `resolveRootRedirect`) and
 * manage their own lifecycle. Native-only in practice: on web they render a mobile-link notice.
 */
export default function AuthLinksLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
        animation: 'fade',
      }}
    />
  );
}
