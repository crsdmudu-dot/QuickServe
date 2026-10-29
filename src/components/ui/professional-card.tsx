// professional-card.tsx — Displays a provider's public profile in a card.
// Shows curated fields only (no phone number).
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { Professional } from '@/lib/bookings';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Avatar } from '@/components/ui/avatar';

export type ProfessionalCardProps = {
  professional: Professional;
};

export function ProfessionalCard({ professional }: ProfessionalCardProps) {
  // No Verified badge at launch (owner direction 2026-10-28 20:27, item 1).
  const { full_name, skills, completed_jobs_count, profile_photo_url } = professional;
  const displayName = full_name ?? 'Provider';
  const primarySkill = skills?.[0] ?? null;

  return (
    <Card elevation="e1">
      <View style={styles.row}>
        <Avatar name={displayName} photoUrl={profile_photo_url} />
        <View style={styles.info}>
          <Text variant="heading">{displayName}</Text>
          {primarySkill ? (
            <Text variant="body" color="textSecondary">
              {primarySkill}
            </Text>
          ) : null}
          <Text variant="caption" color="textSecondary">
            {completed_jobs_count} jobs completed
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  info: {
    flex: 1,
    gap: Spacing.two,
  },
});
