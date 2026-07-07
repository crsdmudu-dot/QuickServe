/**
 * color-picker.tsx
 *
 * A fixed palette of design-system colors for service/category color selection.
 * Only theme palette colors are offered — no arbitrary hex input.
 *
 * Palette includes: primary, warning, error, info, success + a set of neutrals.
 *
 * Props:
 *   value        — the currently selected hex color string (e.g. '#00875A')
 *   onSelect     — called with the hex string when the user taps a swatch
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ── Palette definition ─────────────────────────────────────────────────────────

export const COLOR_PALETTE: { label: string; hex: string }[] = [
  { label: 'Primary Green',  hex: '#00875A' },
  { label: 'Success',        hex: '#2ECC82' },
  { label: 'Warning',        hex: '#F5A524' },
  { label: 'Error',          hex: '#E5484D' },
  { label: 'Info',           hex: '#0EA5E9' },
  { label: 'Neutral 500',    hex: '#6B7280' },
  { label: 'Neutral 700',    hex: '#374151' },
  { label: 'Neutral 900',    hex: '#111827' },
  { label: 'Neutral 300',    hex: '#D1D5DB' },
  { label: 'Neutral 100',    hex: '#F3F4F6' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export type ColorPickerProps = {
  value: string;
  onSelect: (hex: string) => void;
};

export function ColorPicker({ value, onSelect }: ColorPickerProps) {
  const theme = useTheme();

  return (
    <View style={styles.container} testID="color-picker">
      <Text variant="label" color="textSecondary" style={styles.label}>
        Color
      </Text>
      <View style={styles.row}>
        {COLOR_PALETTE.map((swatch) => {
          const isSelected = swatch.hex === value;
          return (
            <Pressable
              key={swatch.hex}
              onPress={() => onSelect(swatch.hex)}
              accessibilityRole="button"
              accessibilityLabel={`Select color ${swatch.label}`}
              accessibilityState={{ selected: isSelected }}
              testID={`color-swatch-${swatch.hex.replace('#', '')}`}
              style={[
                styles.swatch,
                { backgroundColor: swatch.hex },
                isSelected && {
                  borderColor: theme.text,
                  borderWidth: 2.5,
                },
                !isSelected && {
                  borderColor: theme.border,
                  borderWidth: 1,
                },
              ]}
            />
          );
        })}
      </View>
      {value ? (
        <Text variant="caption" color="textTertiary">
          Selected: {value}
        </Text>
      ) : null}
    </View>
  );
}

const SWATCH_SIZE = 36;

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  label: {
    marginBottom: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: Radii.sm,
  },
});
