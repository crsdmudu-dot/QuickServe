// marketplace-provider-card.tsx — Displays a provider's curated public profile.
// Shows the 10 curated PublicProvider fields only — no PII, no response time/distance
// (those are future-ready: they will render only if a field is present, which it isn't today).
// FavoriteButton fires onToggleFavorite; the SCREEN owns the favorites lib call.

import { Pressable, StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PublicProvider } from '@/lib/favorites';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { Text } from '@/components/ui/text';
import { VerifiedBadge } from '@/components/ui/verified-badge';

export type MarketplaceProviderCardProps = {
  provider: PublicProvider;
  /** Whether this provider is in the current user's favorites list. */
  isFavorite: boolean;
  /** Called with provider_id when the heart button is tapped; screen handles the lib call. */
  onToggleFavorite: (providerId: string) => void;
  /** Optional tap handler for the whole card (e.g. navigate to provider profile). */
  onPress?: () => void;
};

/**
 * MarketplaceProviderCard renders a curated provider summary card.
 *
 * Fields shown (all from PublicProvider, no PII):
 *  - Avatar (profile_photo_url or initials)
 *  - Display name (full_name ?? 'Provider')
 *  - VerifiedBadge (when is_verified)
 *  - Rating + review count (when average_rating is not null)
 *  - Completed jobs count
 *  - Years experience (when present)
 *  - Availability status ('available' → green dot; other → muted)
 *  - FavoriteButton (fires onToggleFavorite)
 *
 * Response time and distance are FUTURE-READY: they are absent from PublicProvider today,
 * so they are simply not rendered. Do NOT add fake data.
 */
export function MarketplaceProviderCard({
  provider,
  isFavorite,
  onToggleFavorite,
  onPress,
}: MarketplaceProviderCardProps) {
  const theme = useTheme();
  const displayName = provider.full_name ?? 'Provider';
  const isAvailable = provider.availability_status === 'available';

  return (
    <Card onPress={onPress} elevation="e1" style={styles.card}>
      {/* Top row: Avatar + name/badge + favorite button */}
      <View style={styles.topRow}>
        <Avatar
          name={displayName}
          photoUrl={provider.profile_photo_url}
          size={52}
        />

        <View style={styles.nameCol}>
          <Text variant="label" weight="semibold" numberOfLines={1}>
            {displayName}
          </Text>
          {provider.is_verified ? <VerifiedBadge /> : null}
        </View>

        <FavoriteButton
          active={isFavorite}
          onPress={() => onToggleFavorite(provider.provider_id)}
        />
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        {/* Availability dot */}
        <View style={styles.statItem}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: isAvailable ? theme.success : theme.neutral400,
              },
            ]}
          />
          <Text
            variant="caption"
            color={isAvailable ? 'success' : 'textSecondary'}
          >
            {isAvailable ? 'Available' : 'Unavailable'}
          </Text>
        </View>

        {/* Rating (only when average_rating is not null) */}
        {provider.average_rating != null ? (
          <View style={styles.statItem}>
            <Text variant="caption">⭐</Text>
            <Text variant="caption" weight="semibold">
              {provider.average_rating.toFixed(1)}
            </Text>
            {provider.review_count > 0 ? (
              <Text variant="caption" color="textSecondary">
                ({provider.review_count})
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Completed jobs */}
        <View style={styles.statItem}>
          <Text variant="caption" color="textSecondary">
            {provider.completed_jobs_count} jobs
          </Text>
        </View>

        {/* Years experience (only when present) */}
        {provider.years_experience != null ? (
          <View style={styles.statItem}>
            <Text variant="caption" color="textSecondary">
              {provider.years_experience}yr{provider.years_experience !== 1 ? 's' : ''}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  nameCol: {
    flex: 1,
    gap: Spacing.half,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: Radii.pill,
  },
});
