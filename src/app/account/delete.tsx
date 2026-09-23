import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  DELETE_CONFIRMATION_WORD,
  DELETION_BLOCKER_COPY,
  requestAccountDeletion,
  type DeletionBlocker,
} from '@/lib/account';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';
import { SupportLink } from '@/components/ui/support-link';
import { Text } from '@/components/ui/text';

/**
 * Delete account — shared by customers and providers (role-aware copy), refused for admins.
 *
 * The screen owns only the CONFIRMATION gate: the user must type the confirmation word and enter
 * their current password before the button enables. Everything security-relevant — identity,
 * credential re-proof, blockers, the transaction — happens in the `delete-account` Edge Function;
 * this component never learns anything it could misuse and never names a user.
 *
 * What is deleted vs retained is stated here in plain language and must stay consistent with
 * docs/pilot/legal-support.md and the public /delete-account page.
 */
export default function DeleteAccountScreen() {
  const theme = useTheme();
  const { role, signOut } = useAuth();
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [blockers, setBlockers] = useState<DeletionBlocker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isProvider = role === 'provider';
  const isAdmin = role === 'admin';
  const canSubmit = confirmation === DELETE_CONFIRMATION_WORD && password.length > 0 && !submitting;

  async function onDelete() {
    setSubmitting(true);
    setError(null);
    setBlockers([]);
    const outcome = await requestAccountDeletion({ password, confirmation });
    setSubmitting(false);

    if (outcome.ok) {
      if (outcome.status === 'pending_auth_delete') setPending(true);
      // Local sign-out is enough: the server has already revoked data access, and for
      // `deleted` there is no session left to revoke anywhere else.
      await signOut();
      router.replace('/welcome');
      return;
    }
    if (outcome.status === 'blocked') {
      setBlockers(outcome.blockers);
      return;
    }
    setError(outcome.error);
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <SafeAreaView style={[styles.safe, { maxWidth: MaxContentWidth }]}>
        <Button label="← Back" variant="ghost" onPress={() => router.back()} testID="delete-account-back" />

        <SectionHeader title="Delete account" />

        {isAdmin ? (
          <Card>
            <Text variant="body" color="text" testID="delete-account-admin-notice">
              Admin accounts cannot be deleted from the app. Ask another administrator to remove
              your access.
            </Text>
          </Card>
        ) : (
          <>
            <Card>
              <Text variant="body" color="text">
                This permanently deletes your KwikServe account. You will be signed out on every
                device and cannot sign in again.
              </Text>
            </Card>

            <View style={styles.section}>
              <Text variant="heading" color="text">
                What is deleted
              </Text>
              <Text variant="body" color="textSecondary">
                Your name, phone number{isProvider ? ', bio, skills and profile photo' : ''}, saved
                addresses, favourites, notification settings, device registrations and your login.
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="heading" color="text">
                What is kept
              </Text>
              <Text variant="body" color="textSecondary">
                Records of completed bookings and payments{isProvider ? ', earnings and payouts' : ''}{' '}
                are kept for accounting, dispute and legal reasons, with your personal details
                removed from them. Reviews you left keep their rating but lose the written comment.
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="heading" color="text">
                Before you can delete
              </Text>
              <Text variant="body" color="textSecondary">
                All bookings must be completed or cancelled, all payments settled
                {isProvider ? ', all earnings paid out' : ', your wallet balance must be zero'}, and
                no support case may be open. We will tell you exactly what still needs attention.
              </Text>
            </View>

            {blockers.length > 0 && (
              <Card>
                <Text variant="heading" color="error" testID="delete-account-blocked-title">
                  Not yet — please resolve these first
                </Text>
                {blockers.map((b) => (
                  <Text key={b} variant="body" color="text" testID={`delete-account-blocker-${b}`}>
                    • {DELETION_BLOCKER_COPY[b]}
                  </Text>
                ))}
              </Card>
            )}

            <View style={styles.section}>
              <Input
                label={`Type ${DELETE_CONFIRMATION_WORD} to confirm`}
                value={confirmation}
                onChangeText={setConfirmation}
                autoCapitalize="characters"
                placeholder={DELETE_CONFIRMATION_WORD}
                testID="delete-account-confirmation"
              />
              <Input
                label="Current password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Your password"
                testID="delete-account-password"
              />
            </View>

            {error && (
              <Text variant="caption" color="error" testID="delete-account-error">
                {error}
              </Text>
            )}
            {pending && (
              <Text variant="caption" color="textSecondary" testID="delete-account-pending">
                Your data has been removed and access revoked. Final clean-up will complete shortly.
              </Text>
            )}

            <Button
              label="Delete my account"
              variant="primary"
              disabled={!canSubmit}
              loading={submitting}
              onPress={onDelete}
              testID="delete-account-submit"
            />

            <Text variant="caption" color="textSecondary">
              Can&apos;t sign in? You can also request deletion by email.
            </Text>
            <SupportLink />
          </>
        )}
      </SafeAreaView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  safe: { width: '100%', alignSelf: 'center', padding: Spacing.four, gap: Spacing.three },
  section: { gap: Spacing.one },
});
