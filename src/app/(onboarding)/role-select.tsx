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

  function choose(role: Role) {
    selectRole(role);
    router.push('/register');
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text variant="display" style={styles.heading}>Choose your role</Text>
        <Text variant="body" color="textSecondary" style={styles.sub}>
          How will you use QuickServe?
        </Text>
      </View>

      <View style={styles.list}>
        {ROLES.map((r) => (
          <Card key={r.id} elevation="e1" onPress={() => choose(r.id)} style={styles.roleCard}>
            <View style={styles.row}>
              <IconChip icon={r.icon} size={28} />
              <View style={styles.text}>
                <Text variant="heading">{r.label}</Text>
                <Text variant="body" color="textSecondary">
                  {r.description}
                </Text>
              </View>
              <Text style={styles.chevron} color="textTertiary">›</Text>
            </View>
          </Card>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: Spacing.four },
  header: {
    paddingTop: Spacing.five,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  heading: {
    letterSpacing: -0.5,
  },
  sub: {},
  list: { gap: Spacing.three },
  roleCard: { paddingVertical: Spacing.four },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  text: { flex: 1, gap: Spacing.one },
  chevron: { fontSize: 22, lineHeight: 26 },
});
