/**
 * Address screen — step 2 of the booking flow.
 *
 * Default: shows AddressSearch. Once the user picks a place, shows
 * SelectedAddressCard + ApartmentDetailsForm. If the user taps
 * "Enter address manually" they get a plain text input (same as before
 * Slice 20). The "Continue" button gating is unchanged: empty address →
 * "Address is required." error; non-empty → push to /booking/schedule.
 *
 * Slice 22 (additive):
 * - If the customer has saved addresses, shows SavedAddressPicker FIRST so they
 *   can reuse a previous address without re-typing.
 * - "Save this address" prompt appears for NEW (non-saved) addresses.
 * - Zero saved addresses → behaviour is byte-for-byte identical to before.
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBookingDraft } from '@/booking/booking-draft';
import { AddressSearch } from '@/components/ui/address-search';
import { ApartmentDetailsForm } from '@/components/ui/apartment-details-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SavedAddressPicker } from '@/components/ui/saved-address-picker';
import { SelectedAddressCard } from '@/components/ui/selected-address-card';
import { Text } from '@/components/ui/text';
import {
  createSavedAddress,
  draftToSavedAddressInput,
  getMySavedAddresses,
  savedAddressToDraftLocation,
  touchSavedAddress,
  type SavedAddress,
} from '@/lib/saved-addresses';

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

  // ── Slice 22: saved-address state ──────────────────────────────────────────
  /** The customer's saved addresses (loaded on mount; stays [] on error). */
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  /** True once the user taps "Use a new address" to dismiss the picker. */
  const [pickerDismissed, setPickerDismissed] = useState(false);
  /** True when the current address came from a saved pick (suppresses save prompt). */
  const [fromSaved, setFromSaved] = useState(false);
  /** "Save this address" toggle (shown only for new/typed addresses). */
  const [saveThis, setSaveThis] = useState(false);
  /** Label type for the save prompt. */
  const [saveLabelType, setSaveLabelType] = useState<'home' | 'work' | 'other'>('other');
  /** Nickname field for the save prompt. */
  const [saveNickname, setSaveNickname] = useState('');

  // Load saved addresses once on mount (best-effort; errors stay []).
  useEffect(() => {
    getMySavedAddresses().then(setSavedAddresses).catch(() => {});
  }, []);

  /** Handle a tap on a saved address card in the picker. */
  function handlePickSaved(a: SavedAddress) {
    const { location, apartment } = savedAddressToDraftLocation(a);
    setLocation(location);
    setApartment(apartment);
    setFromSaved(true);
    setSaveThis(false);
    setMapUrl(null);
    if (error) setError('');
    void touchSavedAddress(a.id); // fire-and-forget; bumps last_used_at
  }

  /**
   * Continue — async so we can optionally await createSavedAddress.
   * IMPORTANT: when saveThis is false, no await runs before router.push,
   * so navigation stays synchronous (the non-empty test depends on this).
   */
  async function handleContinue() {
    if (!address.trim()) {
      setError('Address is required.');
      return;
    }
    setError('');
    if (saveThis && address.trim()) {
      try {
        // Best-effort — a save failure must never block the booking.
        await createSavedAddress(
          draftToSavedAddressInput(
            {
              address,
              address_label,
              latitude,
              longitude,
              building_name,
              floor,
              door_number,
              landmark,
              access_notes,
            },
            { label_type: saveLabelType, nickname: saveNickname, is_default: false },
          ),
        );
      } catch {
        // Swallow — navigate anyway.
      }
    }
    router.push('/booking/schedule');
  }

  /**
   * Determine which sub-flow to show:
   * - selected: address is set AND we came via search or a saved pick (not manual)
   * - manual: user tapped "Enter address manually"
   * - showPicker: customer has saved addresses and hasn't dismissed picker yet
   * - search (default): nothing selected yet
   */
  const isSelected = !manual && address.trim().length > 0;
  const hasSaved = savedAddresses.length > 0;
  const showPicker = hasSaved && !pickerDismissed && !isSelected && !manual;

  /** Show "Save this address" prompt only for NEW (non-saved) addresses. */
  const showSavePrompt = address.trim().length > 0 && !fromSaved;

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
          {/* ── Saved address picker (Slice 22, only when customer has saved addresses) ── */}
          {showPicker && (
            <SavedAddressPicker
              onSelect={handlePickSaved}
              onUseNew={() => setPickerDismissed(true)}
            />
          )}

          {/* ── Search mode (default, hidden when picker is shown) ──────────── */}
          {!isSelected && !manual && !showPicker && (
            <AddressSearch
              onSelect={(details, suggestion) => {
                setLocation({
                  address: details.formattedAddress,
                  address_label: suggestion.primaryText,
                  latitude: details.latitude,
                  longitude: details.longitude,
                });
                setMapUrl(details.mapUrl);
                setFromSaved(false);
                if (error) setError('');
              }}
              onManual={() => setManual(true)}
            />
          )}

          {/* ── Selected via search or saved pick ───────────────────────────── */}
          {isSelected && (
            <>
              <SelectedAddressCard
                formattedAddress={address}
                mapUrl={mapUrl}
                onChange={() => {
                  setLocation({ address: '', address_label: '', latitude: null, longitude: null });
                  setMapUrl(null);
                  setFromSaved(false);
                }}
              />
              <ApartmentDetailsForm
                value={{ building_name, floor, door_number, landmark, access_notes }}
                onChange={setApartment}
              />
            </>
          )}

          {/* ── Manual entry ─────────────────────────────────────────────────── */}
          {manual && (
            <>
              <Input
                label="Address"
                value={address}
                onChangeText={(text) => {
                  setLocation({ address: text });
                  setFromSaved(false);
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

          {/* ── Error for non-manual modes ────────────────────────────────────── */}
          {!manual && error ? (
            <Text variant="caption" color="error">
              {error}
            </Text>
          ) : null}

          {/* ── Slice 22: "Save this address" prompt (new addresses only) ─────── */}
          {showSavePrompt && (
            <View style={styles.savePrompt}>
              {/* Toggle */}
              <Button
                label={saveThis ? '☑ Save this address' : '☐ Save this address'}
                variant={saveThis ? 'primary' : 'secondary'}
                onPress={() => setSaveThis((v) => !v)}
                fullWidth
              />

              {/* Label type + nickname (shown only when toggle is on) */}
              {saveThis && (
                <View style={styles.saveMeta}>
                  <View style={styles.labelRow}>
                    {(['home', 'work', 'other'] as const).map((type) => (
                      <Button
                        key={type}
                        label={type.charAt(0).toUpperCase() + type.slice(1)}
                        variant={saveLabelType === type ? 'primary' : 'secondary'}
                        onPress={() => setSaveLabelType(type)}
                      />
                    ))}
                  </View>
                  <Input
                    label="Nickname (optional)"
                    value={saveNickname}
                    onChangeText={setSaveNickname}
                    placeholder="e.g. My Home"
                  />
                </View>
              )}
            </View>
          )}

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
  savePrompt: { gap: Spacing.two },
  saveMeta: { gap: Spacing.two },
  labelRow: { flexDirection: 'row', gap: Spacing.two },
});
