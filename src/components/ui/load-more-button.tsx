/**
 * load-more-button.tsx — Reusable "Load more" button for paginated lists.
 *
 * Renders nothing when hasMore is false.
 * Shows a ghost "Load more" button when hasMore is true.
 * Disabled and shows a spinner while loading is true.
 */
import { ActivityIndicator, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';

export type LoadMoreButtonProps = {
  onPress: () => void;
  loading: boolean;
  hasMore: boolean;
};

export function LoadMoreButton({ onPress, loading, hasMore }: LoadMoreButtonProps) {
  const theme = useTheme();

  if (!hasMore) return null;

  return (
    <View
      testID="load-more"
      style={{
        alignItems: 'center',
        paddingVertical: Spacing.three,
      }}>
      {loading ? (
        <ActivityIndicator size="small" color={theme.primary} />
      ) : (
        <Button
          label="Load more"
          variant="ghost"
          onPress={onPress}
          disabled={loading}
        />
      )}
    </View>
  );
}
