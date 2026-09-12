import { useState } from 'react';
import { StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

export type InputProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  helperText?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  /**
   * Applied to the text field. When set, the inline error message is tagged `<testID>-error`, so
   * a screen with many inputs can assert WHICH field failed rather than just that some text
   * appeared. Purely additive — inputs without it behave exactly as before.
   */
  testID?: string;
};

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  helperText,
  secureTextEntry,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  multiline = false,
  testID,
}: InputProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.error
    : focused
      ? theme.primary
      : theme.border;

  const borderWidth = focused || error ? 1.5 : 1;

  return (
    <View style={styles.container}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            borderColor,
            borderWidth,
            color: theme.text,
            backgroundColor: theme.surface,
          },
          multiline && styles.multiline,
        ]}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType as KeyboardTypeOptions}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {error ? (
        <Text variant="caption" color="error" testID={testID ? `${testID}-error` : undefined}>
          {error}
        </Text>
      ) : helperText ? (
        <Text variant="caption" color="textTertiary">
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one, alignSelf: 'stretch' },
  input: {
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
    height: 52,
    fontSize: 16,
  },
  multiline: {
    height: 100,
    paddingTop: Spacing.two,
    textAlignVertical: 'top',
  },
});
