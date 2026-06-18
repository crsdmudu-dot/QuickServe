import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ROLES, type Role } from '@/constants/roles';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { Card } from '@/components/ui/card';
import { IconChip } from '@/components/ui/icon-chip';
import { Text } from '@/components/ui/text';

export default function RoleSelectScreen() {
  const theme = useTheme();
  const { selectRole } = useAuth();

  async function choose(role: Role) {
    await selectRole(role);
    router.push('/login');
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <Text variant="title">Choose your role</Text>
      <Text variant="body" color="textSecondary">
        How will you use QuickServe?
      </Text>
      <View style={styles.list}>
        {ROLES.map((r) => (
          <Card key={r.id} onPress={() => choose(r.id)}>
            <View style={styles.row}>
              <IconChip icon={r.icon} />
              <View style={styles.text}>
                <Text variant="label">{r.label}</Text>
                <Text variant="caption" color="textSecondary">
                  {r.description}
                </Text>
              </View>
            </View>
          </Card>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: Spacing.four, gap: Spacing.two },
  list: { gap: Spacing.three, marginTop: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  text: { flex: 1, gap: Spacing.half },
});
