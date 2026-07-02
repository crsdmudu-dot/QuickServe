/**
 * Address screen — step 2 of the booking flow.
 *
 * Default: shows AddressSearch. Once the user picks a place, shows
 * SelectedAddressCard + ApartmentDetailsForm. If the user taps
 * "Enter address manually" they get a plain text input (same as before
 * Slice 20). The "Continue" button gating is unchanged: empty address →
 * "Address is required." error; non-empty → push to /booking/schedule.
 */

import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBookingDraft } from '@/booking/booking-draft';
import { AddressSearch } from '@/components/ui/address-search';
import { ApartmentDetailsForm } from '@/components/ui/apartment-details-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectedAddressCard } from '@/components/ui/selected-address-card';
import { Text } from '@/components/ui/text';

export default function AddressScreen() {
  const theme = useTheme();
  const {
    address,
    address_label,
    latitude,
    longitude,
    building_name,
    floor,
    door_number,
    landmark,
    access_notes,
    setLocation,
    setApartment,
  } = useBookingDraft();

  // mapUrl is screen-local — not persisted to the draft.
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  // When true, show the plain manual-entry Input instead of AddressSearch.
  const [manual, setManual] = useState(false);
  const [error, setError] = useState('');

  function handleContinue() {
    if (!address.trim()) {
      setError('Address is required.');
      return;
    }
    setError('');
    router.push('/booking/schedule');
  }

  /**
   * Determine which sub-flow to show:
   * - selected: address is set AND we came via search (not manual)
   * - manual: user tapped "Enter address manually"
   * - search (default): nothing selected yet
   */
  const isSelected = !manual && address.trim().length > 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Step indicator */}
        <Text variant="caption" color="textSecondary" style={styles.step}>
          Step 1 of 4
        </Text>

        <Text variant="title" style={styles.title}>
          Your Address
        </Text>
        <Text variant="body" color="textSecondary" style={styles.subtitle}>
          Where should the provider come?
        </Text>

        <View style={styles.form}>
          {/* ── Search mode (default) ─────────────────────────────────── */}
          {!isSelected && !manual && (
            <AddressSearch
              onSelect={(details, suggestion) => {
                setLocation({
                  address: details.formattedAddress,
                  address_label: suggestion.primaryText,
                  latitude: details.latitude,
                  longitude: details.longitude,
                });
                setMapUrl(details.mapUrl);
                if (error) setError('');
              }}
              onManual={() => setManual(true)}
            />
          )}

          {/* ── Selected via search ───────────────────────────────────── */}
          {isSelected && (
            <>
              <SelectedAddressCard
                formattedAddress={address}
                mapUrl={mapUrl}
                onChange={() => {
                  setLocation({ address: '', address_label: '', latitude: null, longitude: null });
                  setMapUrl(null);
                }}
              />
              <ApartmentDetailsForm
                value={{ building_name, floor, door_number, landmark, access_notes }}
                onChange={setApartment}
              />
            </>
          )}

          {/* ── Manual entry ──────────────────────────────────────────── */}
          {manual && (
            <>
              <Input
                label="Address"
                value={address}
                onChangeText={(text) => {
                  setLocation({ address: text });
                  if (error) setError('');
                }}
                placeholder="123 Main St, City"
                error={error}
              />
              <Text
                variant="caption"
                color="primary"
                onPress={() => {
                  setManual(false);
                  setLocation({ address: '', address_label: '', latitude: null, longitude: null });
                  setMapUrl(null);
                  setError('');
                }}
              >
                Use address search
              </Text>
            </>
          )}

          {/* ── Error for non-manual modes ────────────────────────────── */}
          {!manual && error ? (
            <Text variant="caption" color="error">
              {error}
            </Text>
          ) : null}

          <Button label="Continue" fullWidth onPress={handleContinue} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  step: { marginBottom: Spacing.one },
  title: { marginBottom: Spacing.one },
  subtitle: { marginBottom: Spacing.two },
  form: { gap: Spacing.three },
});
