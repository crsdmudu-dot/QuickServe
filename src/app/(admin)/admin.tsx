import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { EmptyState } from '@/components/ui/empty-state';

export default function AdminScreen() {
  const theme = useTheme();
  const { signOut } = useAuth();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <EmptyState
        icon="🛡️"
        title="Admin dashboard coming soon"
        message="The QuickServe admin tools are on their way."
        actionLabel="Sign out / Switch role"
        onAction={signOut}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1, justifyContent: 'center' } });
