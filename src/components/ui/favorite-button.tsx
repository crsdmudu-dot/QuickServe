// favorite-button.tsx — Heart toggle for marking providers as favorites.
// Pure presentational — fires onPress; the screen/parent owns the favorites lib call.

import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

export type FavoriteButtonProps = {
  /** Whether the provider is currently favorited. */
  active: boolean;
  /** Called when the user taps the button — parent handles the actual toggle. */
  onPress: () => void;
  /** Icon size in pixels. Defaults to 22. */
  size?: number;
};

/**
 * FavoriteButton renders a heart icon that is filled (red) when active and
 * outlined when inactive. Accessible via accessibilityRole + accessibilityLabel.
 * The parent screen is responsible for calling addFavoriteProvider /
 * removeFavoriteProvider — this component only fires `onPress`.
 */
export function FavoriteButton({ active, onPress, size = 22 }: FavoriteButtonProps) {
  const theme = useTheme();
  const label = active ? 'Remove from favorites' : 'Add to favorites';
  const icon = active ? '❤️' : '🤍';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      hitSlop={8}
    >
      {/* Use RN Text directly so we can set fontSize from the size prop */}
      <Text
        testID={active ? 'fav-active' : 'fav-inactive'}
        style={{ fontSize: size, color: active ? theme.error : theme.textTertiary }}
      >
        {icon}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
