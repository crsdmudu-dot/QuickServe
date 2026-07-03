// saved-address-card.tsx — Pure presentational card for a single saved address.
// No data fetching, no Supabase, no navigation. All data comes through props.

import { Pressable, StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDestination } from '@/lib/address-format';
import { type SavedAddress } from '@/lib/saved-addresses';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

// ── Label map ─────────────────────────────────────────────────────────────────

const LABEL_MAP: Record<SavedAddress['label_type'], { icon: string; text: string }> = {
  home: { icon: '🏠', text: 'Home' },
  work: { icon: '💼', text: 'Work' },
  other: { icon: '📍', text: 'Other' },
};

// ── Props ─────────────────────────────────────────────────────────────────────

export type SavedAddressCardProps = {
  address: SavedAddress;
  onSelect?: () => void;      // tap the card body to choose it
  onEdit?: () => void;
  onDelete?: () => void;
  onSetDefault?: () => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * SavedAddressCard renders a single saved address in a Card.
 *
 * - Header: label icon + label text, plus a "Default" pill when is_default.
 * - Title: nickname (when non-empty) or the label text.
 * - Address block: primary text + optional detail lines from formatDestination.
 * - Last used caption: shown only when last_used_at is non-null.
 * - Actions: only rendered when the matching handler prop is passed.
 */
export function SavedAddressCard({
  address,
  onSelect,
  onEdit,
  onDelete,
  onSetDefault,
}: SavedAddressCardProps) {
  const theme = useTheme();
  const label = LABEL_MAP[address.label_type] ?? LABEL_MAP.other;
  const title = address.nickname?.trim() ? address.nickname : label.text;
  const d = formatDestination(address);

  const lastUsed = address.last_used_at
    ? `Last used ${new Date(address.last_used_at).toLocaleDateString()}`
    : null;

  const inner = (
    <Card style={styles.card}>
      {/* ── Header row: icon + label text + optional Default badge ── */}
      <View style={styles.headerRow}>
        <Text variant="caption" style={styles.labelIcon}>
          {label.icon}
        </Text>
        <Text variant="caption" color="textSecondary" style={styles.labelText}>
          {label.text}
        </Text>
        {address.is_default && (
          <View
            testID="default-badge"
            style={[styles.defaultBadge, { backgroundColor: theme.successSurface }]}>
            <Text variant="caption" color="success">
              Default
            </Text>
          </View>
        )}
      </View>

      {/* ── Title ── */}
      <Text variant="label" weight="semibold" style={styles.title}>
        {title}
      </Text>

      {/* ── Address block ── */}
      <Text variant="body" style={styles.primary}>
        {d.primary}
      </Text>
      {d.lines.map((line, i) => (
        <Text key={i} variant="caption" color="textSecondary">
          {line}
        </Text>
      ))}

      {/* ── Last used caption ── */}
      {lastUsed ? (
        <Text variant="caption" color="textSecondary" style={styles.lastUsed}>
          {lastUsed}
        </Text>
      ) : null}

      {/* ── Action row ── */}
      {(onSetDefault || onEdit || onDelete) ? (
        <View style={styles.actionsRow}>
          {/* "Set default" is hidden when already default */}
          {onSetDefault && !address.is_default ? (
            <Button label="Set default" variant="ghost" onPress={onSetDefault} />
          ) : null}
          {onEdit ? <Button label="Edit" variant="ghost" onPress={onEdit} /> : null}
          {onDelete ? <Button label="Delete" variant="ghost" onPress={onDelete} /> : null}
        </View>
      ) : null}
    </Card>
  );

  // Wrap in a Pressable only when onSelect is provided.
  if (onSelect) {
    return (
      <Pressable
        onPress={onSelect}
        accessibilityRole="button"
        testID="saved-address-select">
        {inner}
      </Pressable>
    );
  }

  return inner;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    gap: Spacing.one,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginBottom: Spacing.one,
  },
  labelIcon: {
    fontSize: 14,
  },
  labelText: {
    flex: 1,
  },
  defaultBadge: {
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  title: {
    marginBottom: Spacing.one,
  },
  primary: {
    marginBottom: 2,
  },
  lastUsed: {
    marginTop: Spacing.one,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
});
