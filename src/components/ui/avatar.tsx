// avatar.tsx — Circular avatar: shows photo if available, else initials fallback.
import { Image, StyleSheet, View } from 'react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';

export type AvatarProps = {
  /** Full name used to derive initials when no photo is available. */
  name: string;
  /** Remote URL for the profile photo. Pass null to show initials. */
  photoUrl: string | null;
  /** Diameter in pixels. Defaults to 56. */
  size?: number;
};

/** Derives up to two uppercase initials from a name string. */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function Avatar({ name, photoUrl, size = 56 }: AvatarProps) {
  const theme = useTheme();
  const circle = { width: size, height: size, borderRadius: Radii.pill };

  if (photoUrl) {
    return (
      <Image
        testID="avatar-image"
        source={{ uri: photoUrl }}
        style={[styles.image, circle]}
      />
    );
  }

  return (
    <View style={[styles.fallback, circle, { backgroundColor: theme.backgroundElement }]}>
      <Text variant="label" color="textSecondary">
        {getInitials(name)}
      </Text>
    </View>
  );
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
