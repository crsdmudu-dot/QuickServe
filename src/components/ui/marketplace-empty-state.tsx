// marketplace-empty-state.tsx — Per-variant empty state for the marketplace/discovery flow.
// Wraps the existing EmptyState primitive with appropriate copy per variant.
// Does NOT reimplement EmptyState logic.

import { EmptyState } from '@/components/ui/empty-state';

export type MarketplaceEmptyStateVariant =
  | 'search-empty'
  | 'no-results'
  | 'no-favorites'
  | 'no-providers';

export type MarketplaceEmptyStateProps = {
  variant: MarketplaceEmptyStateVariant;
  /** Optional CTA handler — if provided alongside actionLabel, shows a button. */
  onAction?: () => void;
  /** Label for the CTA button. */
  actionLabel?: string;
};

/** Copy per variant */
const VARIANT_COPY: Record<
  MarketplaceEmptyStateVariant,
  { icon: string; title: string; message: string }
> = {
  'search-empty': {
    icon: '🔍',
    title: 'Start your search',
    message: 'Type a service name or category to discover providers near you.',
  },
  'no-results': {
    icon: '😕',
    title: 'No results found',
    message: 'We couldn\'t find any providers matching your search. Try different keywords or filters.',
  },
  'no-favorites': {
    icon: '🤍',
    title: 'No favorites yet',
    message: 'Tap the heart on a provider card to save them here for quick access.',
  },
  'no-providers': {
    icon: '🛠️',
    title: 'No providers available',
    message: 'There are no providers in this category right now. Check back soon!',
  },
};

/**
 * MarketplaceEmptyState wraps the existing EmptyState with marketplace-specific
 * copy for each variant. Pass onAction + actionLabel to show a CTA button.
 */
export function MarketplaceEmptyState({
  variant,
  onAction,
  actionLabel,
}: MarketplaceEmptyStateProps) {
  const { icon, title, message } = VARIANT_COPY[variant];

  return (
    <EmptyState
      icon={icon}
      title={title}
      message={message}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
}
