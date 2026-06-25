// avatar.tsx — Circular avatar: shows photo if available, else initials fallback.
import { Image, StyleSheet, View } from 'react-native';

import { Colors, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

export type AvatarProps = {
  /** Full name used to derive initials when no photo is available. */
  name: string;
  /** Remote URL for the profile photo. Pass null to show initials. */
  photoUrl: string | null;
  /** Diameter in pixels. Defaults to 56. */
  size?: number;
  /** Whether to show a ring border around the avatar. Defaults to false. */
  ring?: boolean;
};

/** Derives up to two uppercase initials from a name string. */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function Avatar({ name, photoUrl, size = 56, ring = false }: AvatarProps) {
  const theme = useTheme();
  const ringSize = ring ? 2 : 0;
  const outerSize = size + ringSize * 2;
  const circle = { width: size, height: size, borderRadius: Radii.pill };
  const outerStyle = ring
    ? {
        width: outerSize,
        height: outerSize,
        borderRadius: Radii.pill,
        borderWidth: 2,
        borderColor: theme.primary,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
      }
    : null;

  const content = photoUrl ? (
    <Image
      testID="avatar-image"
      source={{ uri: photoUrl }}
      style={[styles.image, circle]}
    />
  ) : (
    <View
      style={[
        styles.fallback,
        circle,
        { backgroundColor: theme.primarySurface },
      ]}>
      <Text variant="label" color="primary" weight="semibold">
        {getInitials(name)}
      </Text>
    </View>
  );

  if (ring) {
    return <View style={outerStyle}>{content}</View>;
  }

  return content;
}

const styles = StyleSheet.create({
  image: {
    resizeMode: 'cover',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
