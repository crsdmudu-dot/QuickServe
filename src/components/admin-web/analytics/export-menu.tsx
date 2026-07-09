/**
 * export-menu.tsx — Future-ready, DISABLED export controls.
 *
 * Renders three disabled buttons (CSV / Excel / PDF) with a "coming soon"
 * caption. No export logic is implemented in this slice — these stubs exist
 * so the header slot is wired up and the UI is ready for Task 6+ to enable.
 *
 * The `disabled` prop on each Button sets `accessibilityState.disabled = true`
 * and prevents press events (matches the real Button API in button.tsx).
 */
import { View, StyleSheet } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';

export function ExportMenu() {
  return (
    <View style={styles.row}>
      {(['CSV', 'Excel', 'PDF'] as const).map((label) => (
        <Button
          key={label}
          testID={`export-${label.toLowerCase()}`}
          label={label}
          onPress={() => {}}
          disabled
          variant="secondary"
        />
      ))}
      <Text variant="caption" color="textSecondary">
        Exports coming soon
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
});
