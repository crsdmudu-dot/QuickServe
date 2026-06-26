import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SearchBarProps = {
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
};

export function SearchBar({ placeholder = 'Search services', value, onChangeText }: SearchBarProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = focused ? theme.primary : theme.border;
  const borderWidth = focused ? 1.5 : 1;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.surfaceMuted,
          borderColor,
          borderWidth,
        },
      ]}>
      <Text style={[styles.icon, { color: theme.textTertiary }]}>🔍</Text>
      <TextInput
        style={[styles.input, { color: theme.text }]}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.three,
    height: 52,
    gap: Spacing.two,
  },
  icon: { fontSize: 16 },
  input: { flex: 1, fontSize: 16 },
});
