// growth-delta-badge.tsx — period-over-period delta indicator.
import { Text } from '@/components/ui/text';

export function GrowthDeltaBadge({ delta }: { delta: number }) {
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '–';
  const magnitude = Math.abs(delta);
  const color = delta > 0 ? 'success' : delta < 0 ? 'error' : 'textSecondary';
  return <Text variant="caption" color={color as never}>{`${arrow} ${magnitude}%`}</Text>;
}
