// growth-delta-badge.tsx — period-over-period delta indicator.
import { Text } from '@/components/ui/text';
import { type ThemeColor } from '@/constants/theme';

export function GrowthDeltaBadge({ delta }: { delta: number }) {
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '–';
  const magnitude = Math.abs(delta);
  const color: ThemeColor = delta > 0 ? 'success' : delta < 0 ? 'error' : 'textSecondary';
  return <Text variant="caption" color={color}>{`${arrow} ${magnitude}%`}</Text>;
}
