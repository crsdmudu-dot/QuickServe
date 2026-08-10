/**
 * Customer Preferences screen (Slice 34 Task 5 — pushed route).
 *
 * Sections:
 *   1. Favorite services — FavoriteServiceToggle per service; optimistic add/remove with revert.
 *   2. Default address — read-only display + link to /saved-addresses.
 *   3. Future-ready preferences — language / communication / notification (display-only "coming soon").
 */

import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FUTURE_READY_PREFERENCES } from '@/constants/customer-profile';
import { useServices } from '@/services/services-provider';
import { MaxContentWidth, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getFavoriteServiceIds,
  addFavoriteService,
  removeFavoriteService,
} from '@/lib/favorite-services';
import { getMySavedAddresses, type SavedAddress } from '@/lib/saved-addresses';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { FavoriteServiceToggle } from '@/components/customer/favorite-service-toggle';

// ── Component ──────────────────────────────────────────────────────────────────

export default function PreferencesScreen() {
  const theme = useTheme();
  const { services } = useServices();

  // ── Favorite services state ──────────────────────────────────────────────────
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favLoading, setFavLoading] = useState(true);

  // ── Default address state ────────────────────────────────────────────────────
  const [defaultAddress, setDefaultAddress] = useState<SavedAddress | null>(null);
  const [addrLoading, setAddrLoading] = useState(true);

  // ── Load on mount ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    getFavoriteServiceIds()
      .then((ids) => { if (!cancelled) setFavoriteIds(ids); })
      .finally(() => { if (!cancelled) setFavLoading(false); });

    getMySavedAddresses()
      .then((addresses) => {
        if (!cancelled) {
          setDefaultAddress(addresses.find((a) => a.is_default) ?? null);
        }
      })
      .finally(() => { if (!cancelled) setAddrLoading(false); });

    return () => { cancelled = true; };
  }, []);

  // ── Toggle handler — optimistic update + revert on failure ──────────────────
  const handleToggle = useCallback(
    async (serviceId: string) => {
      const wasActive = favoriteIds.includes(serviceId);

      // Optimistic update
      setFavoriteIds((prev) =>
        wasActive ? prev.filter((id) => id !== serviceId) : [...prev, serviceId],
      );

      const result = wasActive
        ? await removeFavoriteService(serviceId)
        : await addFavoriteService(serviceId);

      if (!result.ok) {
        // Revert on failure
        setFavoriteIds((prev) =>
          wasActive ? [...prev, serviceId] : prev.filter((id) => id !== serviceId),
        );
      }
    },
    [favoriteIds],
  );

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SafeAreaView style={[styles.safe, { maxWidth: MaxContentWidth }]}>
        {/* ── Header ──────────────────────────────────────────────────── */}
        <Text variant="title">Preferences</Text>

        {/* ── 1. Favorite services ────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Favorite services" />
          {favLoading ? (
            <View style={styles.skeletonGroup}>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={52} />
              ))}
            </View>
          ) : services.length === 0 ? (
            <EmptyState
              icon="🤍"
              title="No services"
              message="There are no services available right now."
            />
          ) : (
            <Card elevation="e1">
              <View style={styles.serviceList}>
                {services.map((service, index) => (
                  <View
                    key={service.id}
                    style={[
                      styles.serviceRow,
                      index < services.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: theme.border,
                      },
                    ]}
                  >
                    {/* Service icon + name */}
                    <Text style={styles.serviceIcon}>{service.icon}</Text>
                    <View style={styles.serviceInfo}>
                      <Text variant="label" weight="semibold">
                        {service.title}
                      </Text>
                      {service.subtitle ? (
                        <Text variant="caption" color="textSecondary">
                          {service.subtitle}
                        </Text>
                      ) : null}
                    </View>

                    {/* Favorite toggle */}
                    <FavoriteServiceToggle
                      serviceId={service.id}
                      active={favoriteIds.includes(service.id)}
                      onToggle={handleToggle}
                    />
                  </View>
                ))}
              </View>
            </Card>
          )}
        </View>

        {/* ── 2. Default address ──────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Default address" />
          {addrLoading ? (
            <Skeleton height={64} />
          ) : (
            <Card elevation="e1">
              <View style={styles.addressRow}>
                <View style={styles.addressInfo}>
                  {defaultAddress ? (
                    <>
                      <Text variant="label" weight="semibold">
                        {defaultAddress.nickname ??
                          (defaultAddress.label_type === 'home'
                            ? 'Home'
                            : defaultAddress.label_type === 'work'
                              ? 'Work'
                              : 'Saved address')}
                      </Text>
                      <Text variant="caption" color="textSecondary" numberOfLines={2}>
                        {defaultAddress.address}
                      </Text>
                    </>
                  ) : (
                    <Text variant="body" color="textSecondary">
                      No default address set.
                    </Text>
                  )}
                </View>
                <Button
                  label="Manage"
                  variant="secondary"
                  onPress={() => router.push('/saved-addresses')}
                />
              </View>
            </Card>
          )}
        </View>

        {/* ── 3. Future-ready preferences (display-only) ──────────────── */}
        <View style={styles.section}>
          <SectionHeader title="More preferences" />
          <Card elevation="e1">
            <View style={styles.futureList}>
              {FUTURE_READY_PREFERENCES.map((pref, index) => (
                <View
                  key={pref.key}
                  style={[
                    styles.futureRow,
                    index < FUTURE_READY_PREFERENCES.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: theme.border,
                    },
                  ]}
                >
                  <Text variant="label" color="textTertiary" style={styles.futureLabel}>
                    {pref.label}
                  </Text>
                  <View
                    style={[
                      styles.comingSoonBadge,
                      { backgroundColor: theme.backgroundElement },
                    ]}
                  >
                    <Text variant="caption" color="textTertiary">
                      coming soon
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        </View>
      </SafeAreaView>
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingBottom: Spacing.six,
  },
  safe: {
    width: '100%',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.five,
  },
  section: {
    gap: Spacing.two,
  },
  skeletonGroup: {
    gap: Spacing.two,
  },
  serviceList: {
    gap: 0,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  serviceIcon: {
    fontSize: 22,
    lineHeight: 28,
    width: 30,
    textAlign: 'center',
  },
  serviceInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  addressInfo: {
    flex: 1,
    gap: Spacing.one,
  },
  futureList: {
    gap: 0,
  },
  futureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  futureLabel: {
    flex: 1,
  },
  comingSoonBadge: {
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
});
