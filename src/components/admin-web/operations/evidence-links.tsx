/**
 * src/components/admin-web/operations/evidence-links.tsx
 *
 * EvidenceLinks — display-only list of evidence linked to a support case.
 * Fetches via getCaseEvidence(caseId) on mount, then renders the returned
 * CaseEvidenceLink[] grouped by kind: photo / chat / payment_attempt / review.
 *
 * NEVER mutates data — read-only component.
 *
 * Props:
 *   caseId — the support case UUID to fetch evidence for.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { type CaseEvidenceLink } from '@/constants/operations';
import { getCaseEvidence } from '@/lib/operations';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';

// ── Kind display names ─────────────────────────────────────────────────────

const KIND_LABELS: Record<CaseEvidenceLink['kind'], string> = {
  photo:           'Photos',
  chat:            'Chat messages',
  payment_attempt: 'Payment attempts',
  review:          'Reviews',
};

// Ordered list of kinds for grouped display.
const KIND_ORDER: CaseEvidenceLink['kind'][] = [
  'photo',
  'chat',
  'payment_attempt',
  'review',
];

// ── Props ──────────────────────────────────────────────────────────────────

export type EvidenceLinksProps = {
  caseId: string;
};

// ── Component ──────────────────────────────────────────────────────────────

export function EvidenceLinks({ caseId }: EvidenceLinksProps) {
  const [links, setLinks] = useState<CaseEvidenceLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await getCaseEvidence(caseId);
      if (!cancelled) {
        setLinks(data);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [caseId]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <SectionHeader title="Case evidence" />
        <Text variant="caption" color="textSecondary">
          Loading…
        </Text>
      </View>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (links.length === 0) {
    return (
      <View style={styles.container}>
        <SectionHeader title="Case evidence" />
        <Text variant="caption" color="textSecondary">
          No linked evidence available.
        </Text>
      </View>
    );
  }

  // ── Grouped display ──────────────────────────────────────────────────────
  const byKind = Object.fromEntries(
    KIND_ORDER.map((k) => [k, links.filter((l) => l.kind === k)]),
  ) as Record<CaseEvidenceLink['kind'], CaseEvidenceLink[]>;

  return (
    <View style={styles.container}>
      <SectionHeader title="Case evidence" />
      {KIND_ORDER.map((k) => {
        const group = byKind[k];
        if (group.length === 0) return null;
        return (
          <View key={k} style={styles.group}>
            <Text variant="label" weight="medium">
              {KIND_LABELS[k]}
            </Text>
            {group.map((link) => (
              <Card key={link.ref} style={styles.linkCard}>
                <Text variant="body">{link.label}</Text>
                <Text variant="caption" color="textTertiary">
                  {`Ref: #${link.ref.slice(0, 8)}`}
                </Text>
              </Card>
            ))}
          </View>
        );
      })}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  group: {
    gap: Spacing.two,
  },
  linkCard: {
    gap: Spacing.half,
  },
});
