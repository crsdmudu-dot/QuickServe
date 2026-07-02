// apartment-details-form.tsx — Controlled form for apartment / unit access details.
// All fields are optional; no validation is performed here.
// Each field change calls onChange with the changed key only (partial update).

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { Input } from '@/components/ui/input';

export type ApartmentDetails = {
  building_name?: string;
  floor?: string;
  door_number?: string;
  landmark?: string;
  access_notes?: string;
};

export type ApartmentDetailsFormProps = {
  /** Current values for all apartment detail fields. All optional. */
  value: ApartmentDetails;
  /** Called with only the changed field each time the user edits an input. */
  onChange: (partial: Partial<ApartmentDetails>) => void;
};

/**
 * ApartmentDetailsForm renders five optional controlled inputs for the
 * apartment / access details of a delivery address.
 *
 * Each input calls `onChange({ field: text })` so the parent can merge the
 * partial update into its own state without replacing unrelated fields.
 */
export function ApartmentDetailsForm({ value, onChange }: ApartmentDetailsFormProps) {
  return (
    <View style={styles.container}>
      <Input
        label="Building name"
        value={value.building_name ?? ''}
        onChangeText={(text) => onChange({ building_name: text })}
        placeholder="e.g. Green Tower"
      />
      <Input
        label="Floor"
        value={value.floor ?? ''}
        onChangeText={(text) => onChange({ floor: text })}
        placeholder="e.g. 3"
        keyboardType="default"
      />
      <Input
        label="Door / Unit number"
        value={value.door_number ?? ''}
        onChangeText={(text) => onChange({ door_number: text })}
        placeholder="e.g. Apt 12B"
      />
      <Input
        label="Landmark"
        value={value.landmark ?? ''}
        onChangeText={(text) => onChange({ landmark: text })}
        placeholder="e.g. Near the main gate"
      />
      <Input
        label="Access notes"
        value={value.access_notes ?? ''}
        onChangeText={(text) => onChange({ access_notes: text })}
        placeholder="e.g. Ring bell twice, door code is 1234"
        multiline
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
    alignSelf: 'stretch',
  },
});
