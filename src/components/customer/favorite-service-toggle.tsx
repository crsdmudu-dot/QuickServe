// favorite-service-toggle.tsx — Heart toggle for a service favorite.
// The SCREEN owns the add/removeFavoriteService call.
// This fires onToggle(serviceId) — the parent decides what happens next.
// Optimistic look: visually reflects the current `active` prop immediately.

import { Pressable, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

// ── Props ──────────────────────────────────────────────────────────────────────

export type FavoriteServiceToggleProps = {
  serviceId: string;
  active: boolean;
  onToggle: (serviceId: string) => void;
};

// ── Component ──────────────────────────────────────────────────────────────────

export function FavoriteServiceToggle({
  serviceId,
  active,
  onToggle,
}: FavoriteServiceToggleProps) {
  const theme = useTheme();

  return (
    <Pressable
      testID={active ? 'fav-service-active' : 'fav-service-inactive'}
      onPress={() => onToggle(serviceId)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={active ? 'Remove from favorites' : 'Add to favorites'}
      accessibilityState={{ checked: active }}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.heart,
          { color: active ? theme.error : theme.border },
        ]}
      >
        {active ? '♥' : '♡'}
      </Text>
    </Pressable>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  button: {
    padding: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
  heart: {
    fontSize: 24,
    lineHeight: 28,
  },
});
