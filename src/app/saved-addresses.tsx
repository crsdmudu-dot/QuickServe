/**
 * saved-addresses.tsx — Manage saved addresses screen.
 *
 * A pushable Stack screen (URL /saved-addresses) reachable from the customer
 * profile. Two modes:
 *   - list: shows saved address rows via SavedAddressCard with edit/delete/set-default.
 *   - form: add or edit an address using the same search/selected/manual sub-flow
 *           as booking/address.tsx — but with LOCAL state (no booking draft touched).
 *
 * Default handling: always pass is_default: false to insert/update; call
 * setDefaultSavedAddress(id) separately to satisfy the partial-unique index.
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AddressSearch } from '@/components/ui/address-search';
import { ApartmentDetailsForm } from '@/components/ui/apartment-details-form';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SavedAddressCard } from '@/components/ui/saved-address-card';
import { SelectedAddressCard } from '@/components/ui/selected-address-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import {
  createSavedAddress,
  deleteSavedAddress,
  draftToSavedAddressInput,
  getMySavedAddresses,
  setDefaultSavedAddress,
  updateSavedAddress,
  type SavedAddress,
} from '@/lib/saved-addresses';

// ── Types ──────────────────────────────────────────────────────────────────────

type LabelType = 'home' | 'work' | 'other';
type Mode = 'list' | 'form';

// ── Component ──────────────────────────────────────────────────────────────────

export default function SavedAddressesScreen() {
  const theme = useTheme();

  // ── List state ──────────────────────────────────────────────────────────────
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('list');
  const [editing, setEditing] = useState<SavedAddress | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // ── Form state (local — never touches the booking draft) ────────────────────
  const [fAddress, setFAddress] = useState('');
  const [fAddressLabel, setFAddressLabel] = useState('');
  const [fLat, setFLat] = useState<number | null>(null);
  const [fLng, setFLng] = useState<number | null>(null);
  const [fBuilding, setFBuilding] = useState('');
  const [fFloor, setFFloor] = useState('');
  const [fDoor, setFDoor] = useState('');
  const [fLandmark, setFLandmark] = useState('');
  const [fAccess, setFAccess] = useState('');
  const [fLabelType, setFLabelType] = useState<LabelType>('other');
  const [fNickname, setFNickname] = useState('');
  const [fIsDefault, setFIsDefault] = useState(false);
  const [fManual, setFManual] = useState(false);
  const [fMapUrl, setFMapUrl] = useState<string | null>(null);
  const [fError, setFError] = useState('');

  // ── Load addresses ──────────────────────────────────────────────────────────

  async function load() {
    const data = await getMySavedAddresses();
    setAddresses(data);
  }

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getMySavedAddresses().then((data) => {
      if (mounted) {
        setAddresses(data);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // ── Form helpers ────────────────────────────────────────────────────────────

  /**
   * openForm(a): prefill form from a saved address for editing,
   * or reset all fields to empty when a is null (adding new).
   */
  function openForm(a: SavedAddress | null) {
    if (a) {
      setFAddress(a.address);
      setFAddressLabel(a.address_label ?? '');
      setFLat(a.latitude);
      setFLng(a.longitude);
      setFBuilding(a.building_name ?? '');
      setFFloor(a.floor ?? '');
      setFDoor(a.door_number ?? '');
      setFLandmark(a.landmark ?? '');
      setFAccess(a.access_notes ?? '');
      setFLabelType(a.label_type);
      setFNickname(a.nickname ?? '');
      setFIsDefault(a.is_default);
    } else {
      setFAddress('');
      setFAddressLabel('');
      setFLat(null);
      setFLng(null);
      setFBuilding('');
      setFFloor('');
      setFDoor('');
      setFLandmark('');
      setFAccess('');
      setFLabelType('other');
      setFNickname('');
      setFIsDefault(false);
    }
    setFManual(false);
    setFMapUrl(null);
    setFError('');
    setEditing(a);
    setMode('form');
  }

  function closeForm() {
    setMode('list');
    setEditing(null);
    setFAddress('');
    setFAddressLabel('');
    setFLat(null);
    setFLng(null);
    setFBuilding('');
    setFFloor('');
    setFDoor('');
    setFLandmark('');
    setFAccess('');
    setFLabelType('other');
    setFNickname('');
    setFIsDefault(false);
    setFManual(false);
    setFMapUrl(null);
    setFError('');
  }

  async function handleSave() {
    if (!fAddress.trim()) {
      setFError('Address is required.');
      return;
    }

    // Always pass is_default: false — apply default via RPC to satisfy partial-unique index.
    const input = draftToSavedAddressInput(
      {
        address: fAddress,
        address_label: fAddressLabel,
        latitude: fLat,
        longitude: fLng,
        building_name: fBuilding,
        floor: fFloor,
        door_number: fDoor,
        landmark: fLandmark,
        access_notes: fAccess,
      },
      { label_type: fLabelType, nickname: fNickname, is_default: false },
    );

    if (editing) {
      const res = await updateSavedAddress(editing.id, input);
      if (res.ok && fIsDefault) await setDefaultSavedAddress(editing.id);
      if (!res.ok) {
        setFError(res.error ?? 'Could not save address.');
        return;
      }
    } else {
      const res = await createSavedAddress(input);
      if (res.ok && res.id && fIsDefault) await setDefaultSavedAddress(res.id);
      if (!res.ok) {
        setFError(res.error ?? 'Could not save address.');
        return;
      }
    }

    setMode('list');
    await load();
  }

  // ── Address sub-flow derived flag (mirrors booking/address.tsx) ─────────────
  const isSelected = !fManual && fAddress.trim().length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Back button ─────────────────────────────────────────────── */}
        <Button
          label="← Back"
          variant="ghost"
          onPress={() => router.back()}
        />

        {/* ════════════════════════════════════════════════════════════════
            LIST MODE
        ════════════════════════════════════════════════════════════════ */}
        {mode === 'list' && (
          <View style={styles.section}>
            <Text variant="title" style={styles.title}>
              Saved addresses
            </Text>

            <Button
              label="Add address"
              onPress={() => openForm(null)}
              fullWidth
            />

            {loading && (
              <View style={styles.skeletons}>
                <Skeleton height={100} />
                <Skeleton height={100} />
              </View>
            )}

            {!loading && addresses.length === 0 && (
              <EmptyState
                icon="📍"
                title="No saved addresses"
                message="Add an address to reuse it when booking."
              />
            )}

            {!loading &&
              addresses.map((a) => (
                <View key={a.id}>
                  <SavedAddressCard
                    address={a}
                    onEdit={() => openForm(a)}
                    onDelete={() => setConfirmingId(a.id)}
                    onSetDefault={() => setDefaultSavedAddress(a.id).then(load)}
                  />

                  {/* Inline delete confirmation — no Alert; web-safe + testable */}
                  {confirmingId === a.id && (
                    <View style={styles.confirmRow}>
                      <Text variant="body">Delete this address?</Text>
                      <View style={styles.confirmButtons}>
                        <Button
                          label="Delete"
                          variant="primary"
                          onPress={() => {
                            deleteSavedAddress(a.id).then(() => {
                              setConfirmingId(null);
                              load();
                            });
                          }}
                        />
                        <Button
                          label="Cancel"
                          variant="ghost"
                          onPress={() => setConfirmingId(null)}
                        />
                      </View>
                    </View>
                  )}
                </View>
              ))}
          </View>
        )}

        {/* ════════════════════════════════════════════════════════════════
            FORM MODE
        ════════════════════════════════════════════════════════════════ */}
        {mode === 'form' && (
          <View style={styles.section}>
            <Text variant="title" style={styles.title}>
              {editing ? 'Edit address' : 'Add address'}
            </Text>

            {/* ── Label type selector ──────────────────────────────────── */}
            <View style={styles.labelTypeRow}>
              {(['home', 'work', 'other'] as LabelType[]).map((type) => (
                <Button
                  key={type}
                  label={type.charAt(0).toUpperCase() + type.slice(1)}
                  variant={fLabelType === type ? 'primary' : 'secondary'}
                  onPress={() => setFLabelType(type)}
                />
              ))}
            </View>

            {/* ── Nickname ─────────────────────────────────────────────── */}
            <Input
              label="Nickname (optional)"
              value={fNickname}
              onChangeText={setFNickname}
              placeholder="e.g. My Home"
            />

            {/* ── Address sub-flow (mirrors booking/address.tsx) ───────── */}
            {!isSelected && !fManual && (
              <AddressSearch
                onSelect={(details, suggestion) => {
                  setFAddress(details.formattedAddress);
                  setFAddressLabel(suggestion.primaryText);
                  setFLat(details.latitude);
                  setFLng(details.longitude);
                  setFMapUrl(details.mapUrl);
                  setFError('');
                }}
                onManual={() => setFManual(true)}
              />
            )}

            {isSelected && (
              <>
                <SelectedAddressCard
                  formattedAddress={fAddress}
                  mapUrl={fMapUrl}
                  onChange={() => {
                    setFAddress('');
                    setFAddressLabel('');
                    setFLat(null);
                    setFLng(null);
                    setFMapUrl(null);
                  }}
                />
                <ApartmentDetailsForm
                  value={{
                    building_name: fBuilding,
                    floor: fFloor,
                    door_number: fDoor,
                    landmark: fLandmark,
                    access_notes: fAccess,
                  }}
                  onChange={(p) => {
                    if (p.building_name !== undefined) setFBuilding(p.building_name);
                    if (p.floor !== undefined) setFFloor(p.floor);
                    if (p.door_number !== undefined) setFDoor(p.door_number);
                    if (p.landmark !== undefined) setFLandmark(p.landmark);
                    if (p.access_notes !== undefined) setFAccess(p.access_notes);
                  }}
                />
              </>
            )}

            {fManual && (
              <>
                <Input
                  label="Address"
                  value={fAddress}
                  onChangeText={(text) => {
                    setFAddress(text);
                    if (fError) setFError('');
                  }}
                  placeholder="123 Main St, City"
                  error={fError}
                />
                <Text
                  variant="caption"
                  color="primary"
                  onPress={() => {
                    setFManual(false);
                    setFAddress('');
                    setFAddressLabel('');
                    setFLat(null);
                    setFLng(null);
                    setFMapUrl(null);
                    setFError('');
                  }}
                >
                  Use address search
                </Text>
              </>
            )}

            {/* Error for non-manual modes */}
            {!fManual && fError ? (
              <Text variant="caption" color="error">
                {fError}
              </Text>
            ) : null}

            {/* ── Set as default toggle ────────────────────────────────── */}
            <Button
              label={fIsDefault ? '★ Default address' : '☆ Set as default'}
              variant={fIsDefault ? 'primary' : 'secondary'}
              onPress={() => setFIsDefault((prev) => !prev)}
            />

            {/* ── Save / Cancel ────────────────────────────────────────── */}
            <Button label="Save" fullWidth onPress={handleSave} />
            <Button label="Cancel" variant="ghost" fullWidth onPress={closeForm} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.three,
  },
  title: {
    marginBottom: Spacing.one,
  },
  skeletons: {
    gap: Spacing.three,
  },
  labelTypeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  confirmRow: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
