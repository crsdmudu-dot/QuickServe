// saved-address-picker.tsx — Loads the signed-in customer's saved addresses
// and renders them as selectable SavedAddressCard rows. Presentation/orchestration only.

import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { getMySavedAddresses, type SavedAddress } from '@/lib/saved-addresses';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SavedAddressCard } from '@/components/ui/saved-address-card';
import { Skeleton } from '@/components/ui/skeleton';

// ── Props ─────────────────────────────────────────────────────────────────────

export type SavedAddressPickerProps = {
  /** Called with the chosen address when the user taps a card. */
  onSelect: (address: SavedAddress) => void;
  /** Optional — renders a "Use a new address" affordance when provided. */
  onUseNew?: () => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * SavedAddressPicker fetches the signed-in customer's saved addresses on mount
 * and renders:
 *  - A loading skeleton while the fetch is in-flight.
 *  - SavedAddressCard rows (selection-only — no edit/delete/set-default) when loaded.
 *  - An EmptyState when the list is empty.
 *  - A "Use a new address" button whenever onUseNew is provided.
 */
export function SavedAddressPicker({ onSelect, onUseNew }: SavedAddressPickerProps) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getMySavedAddresses()
      .then((rows) => {
        if (!cancelled) setAddresses(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ gap: Spacing.two }}>
        <Skeleton height={88} />
        <Skeleton height={88} />
      </View>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  if (addresses.length === 0) {
    return (
      <EmptyState
        icon="📍"
        title="No saved addresses yet"
        message="Search or enter an address below to get started."
        actionLabel={onUseNew ? 'Use a new address' : undefined}
        onAction={onUseNew}
      />
    );
  }

  // ── Non-empty list ─────────────────────────────────────────────────────────

  return (
    <View style={{ gap: Spacing.two }}>
      {addresses.map((a) => (
        <SavedAddressCard
          key={a.id}
          address={a}
          onSelect={() => onSelect(a)}
        />
      ))}
      {onUseNew ? (
        <Button
          label="Use a new address"
          variant="ghost"
          onPress={onUseNew}
        />
      ) : null}
    </View>
  );
}
