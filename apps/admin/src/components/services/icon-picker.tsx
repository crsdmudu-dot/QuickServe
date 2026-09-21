/**
 * icon-picker.tsx
 *
 * A grid of predefined emoji icons from PREDEFINED_ICONS.
 * The selected icon is highlighted with the primary tint background.
 * No free-text / upload — only the curated list is offered.
 *
 * Props:
 *   value        — the currently selected icon name (e.g. 'broom')
 *   onSelect     — called with the icon name when the user taps an icon
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radii, Spacing } from '@/constants/theme';
import { PREDEFINED_ICONS } from '@/constants/icons';
import { useTheme } from '@/hooks/use-theme';

// ── Component ─────────────────────────────────────────────────────────────────

export type IconPickerProps = {
  value: string;
  onSelect: (iconName: string) => void;
};

export function IconPicker({ value, onSelect }: IconPickerProps) {
  const theme = useTheme();

  return (
    <View style={styles.container} testID="icon-picker">
      <Text variant="label" color="textSecondary" style={styles.label}>
        Icon
      </Text>
      <View style={styles.grid}>
        {PREDEFINED_ICONS.map((icon) => {
          const isSelected = icon.name === value;
          return (
            <Pressable
              key={icon.name}
              onPress={() => onSelect(icon.name)}
              accessibilityRole="button"
              accessibilityLabel={`Select icon ${icon.name}`}
              accessibilityState={{ selected: isSelected }}
              testID={`icon-option-${icon.name}`}
              style={[
                styles.iconCell,
                {
                  backgroundColor: isSelected
                    ? theme.primaryTint
                    : theme.backgroundElement,
                  borderColor: isSelected ? theme.primary : 'transparent',
                },
              ]}>
              <Text style={styles.glyph}>{icon.glyph}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const ICON_SIZE = 44;

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  label: {
    marginBottom: Spacing.one,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  iconCell: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: Radii.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontSize: 22,
  },
});
