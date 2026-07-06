/**
 * src/app/provider/code-of-conduct.tsx — Provider Code of Conduct (pushed route)
 *
 * Displays the static CODE_OF_CONDUCT sections (heading + body each),
 * loads the provider's current acceptance status for CONDUCT_VERSION,
 * and renders a ConductAcceptanceCard.
 *
 * Accepting → calls acceptConduct(CONDUCT_VERSION) → records acceptance (record-only).
 * No enforcement, no suspension, no dispatch or payment change.
 */

import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CONDUCT_VERSION, CODE_OF_CONDUCT } from '@/constants/provider-quality';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  acceptConduct,
  getMyConductAcceptance,
} from '@/lib/provider-quality';
import { ConductAcceptanceCard } from '@/components/provider/conduct-acceptance-card';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function ProviderCodeOfConductScreen() {
  const theme = useTheme();

  const [accepted, setAccepted] = useState(false);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load current acceptance status on mount
  useEffect(() => {
    getMyConductAcceptance(CONDUCT_VERSION).then((result) => {
      setAccepted(result.accepted);
      setAcceptedAt(result.accepted_at);
    });
  }, []);

  // Handle accept button press — record-only, no enforcement
  async function handleAccept() {
    setSubmitting(true);
    const result = await acceptConduct(CONDUCT_VERSION);
    if (result.ok) {
      // Refresh acceptance status after successful record
      const updated = await getMyConductAcceptance(CONDUCT_VERSION);
      setAccepted(updated.accepted);
      setAcceptedAt(updated.accepted_at);
    }
    setSubmitting(false);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Page heading ─────────────────────────────────────────────────── */}
        <View style={styles.pageHeader}>
          <Text variant="title" weight="bold">
            Code of Conduct
          </Text>
          <Text variant="body" color="textSecondary">
            As a QuickServe provider, you agree to uphold the following
            standards on every job.
          </Text>
        </View>

        {/* ── Acceptance card ───────────────────────────────────────────────── */}
        <ConductAcceptanceCard
          version={CONDUCT_VERSION}
          accepted={accepted}
          acceptedAt={acceptedAt}
          onAccept={handleAccept}
          submitting={submitting}
        />

        {/* ── Static conduct sections ───────────────────────────────────────── */}
        <SectionHeader title="Conduct sections" />
        {CODE_OF_CONDUCT.map((section) => (
          <Card key={section.heading} style={styles.sectionCard}>
            <Text variant="label" weight="semibold">
              {section.heading}
            </Text>
            <Text variant="body" color="textSecondary">
              {section.body}
            </Text>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  pageHeader: {
    gap: Spacing.two,
  },
  sectionCard: {
    gap: Spacing.two,
  },
});
