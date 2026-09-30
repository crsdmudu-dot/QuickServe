/**
 * blocked-users.tsx — "Blocked people" screen (store-compliance F5.2).
 *
 * A pushable screen (URL /blocked-users) reachable from the customer and provider profiles. Lists the
 * people the signed-in user has blocked (newest first) with an Unblock button for each. A block works
 * both ways: while it exists the two people cannot message each other and KwikServe will not match
 * them together. People who blocked YOU are never shown here.
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';
import { getMyBlockedUsers, unblockUser, type BlockedUser } from '@/lib/blocks';

export default function BlockedUsersScreen() {
  const theme = useTheme();
  // null while loading; the list once loaded.
  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    getMyBlockedUsers()
      .then((rows) => {
        if (current) setBlocked(rows);
      })
      .catch(() => {
        if (current) setLoadError(true);
      });
    return () => {
      current = false;
    };
  }, [reloadKey]);

  function retry() {
    setBlocked(null);
    setLoadError(false);
    setReloadKey((k) => k + 1);
  }

  async function handleUnblock(userId: string) {
    setActionError(null);
    const r = await unblockUser(userId);
    if (r.ok) setBlocked((prev) => (prev ?? []).filter((b) => b.user_id !== userId));
    else setActionError(r.error ?? 'Could not unblock. Please try again.');
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.scroll}>
      <SafeAreaView style={[styles.safe, { maxWidth: MaxContentWidth }]}>
        <Button label="← Back" variant="ghost" onPress={() => router.back()} />
        <Text variant="title">Blocked people</Text>
        <Text variant="body" color="textSecondary">
          You and the people you block can&apos;t message each other, and KwikServe won&apos;t match
          you together on bookings.
        </Text>

        {actionError ? (
          <Text variant="caption" color="error">
            {actionError}
          </Text>
        ) : null}

        {loadError ? (
          <View style={styles.row}>
            <Text variant="caption" color="error">
              Could not load blocked people.
            </Text>
            <Button label="Retry" variant="ghost" size="sm" onPress={retry} />
          </View>
        ) : blocked === null ? (
          <Text variant="caption" color="textSecondary">
            Loading…
          </Text>
        ) : blocked.length === 0 ? (
          <EmptyState icon="🛡️" title="No one blocked" message="People you block will appear here." />
        ) : (
          blocked.map((b) => (
            <Card key={b.user_id} elevation="e1" testID={`blocked-${b.user_id}`}>
              <View style={styles.row}>
                <View style={styles.info}>
                  <Text variant="heading">{b.display_name || 'KwikServe user'}</Text>
                  <Text variant="caption" color="textSecondary">
                    {b.role === 'provider' ? 'Provider' : 'Customer'} · blocked{' '}
                    {new Date(b.blocked_at).toLocaleDateString()}
                  </Text>
                </View>
                <Button
                  label="Unblock"
                  variant="secondary"
                  size="sm"
                  testID={`unblock-${b.user_id}`}
                  onPress={() => handleUnblock(b.user_id)}
                />
              </View>
            </Card>
          ))
        )}
      </SafeAreaView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    alignItems: 'center',
  },
  safe: {
    width: '100%',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  info: {
    flex: 1,
    gap: Spacing.one,
  },
});
