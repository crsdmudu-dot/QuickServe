/**
 * Service Details — step 1 of the booking flow.
 *
 * The customer answers a short, service-specific set of questions BEFORE choosing an address, so
 * the job is actually defined: what kind of clean, which appliance, how many bedrooms, which
 * grocery items. Everything here is driven by SERVICE_FORMS — there is one renderer, not 19
 * screens.
 *
 * On Continue the answers are frozen into an immutable ServiceDetailsSnapshot and stored on the
 * booking draft, then the flow proceeds to /booking/address.
 *
 * FAIL-CLOSED: if the selected service has no configuration, this screen blocks the booking and
 * says so, rather than skipping ahead and creating a structurally incomplete booking.
 */

import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBookingDraft } from '@/booking/booking-draft';
import { ServiceDetailsForm } from '@/components/booking/service-details-form';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { getServiceForm } from '@/constants/service-forms';
import { useServices } from '@/services/services-provider';
import {
  isSafetyBlocked,
  stateFromSnapshot,
  toSnapshot,
  validate,
  type Errors,
  type FormState,
} from '@/booking/service-details-form';

export default function ServiceDetailsScreen() {
  const theme = useTheme();
  const { getServiceBySlug } = useServices();
  const { serviceId, serviceDetails, setServiceDetails, issuePhotos, addIssuePhoto, removeIssuePhoto } =
    useBookingDraft();

  const form = serviceId ? getServiceForm(serviceId) : undefined;
  // Same lookup the Review screen uses (remote → constants shim → placeholder), so the title
  // shown here matches the title shown at the end of the flow.
  const serviceTitle = serviceId ? getServiceBySlug(serviceId).title : 'Service';

  // Restore anything already answered so Back from Address does not lose the customer's work.
  const [state, setState] = useState<FormState>(() =>
    form ? stateFromSnapshot(form, serviceDetails) : { answers: {}, lines: [] },
  );
  const [errors, setErrors] = useState<Errors>({});

  /** Visible, safe Back. This is the FIRST route of the nested booking stack, so the native
   *  header shows no arrow — we render our own and fall back to a safe destination when there
   *  is nothing to pop (deep link, cold start), never a dead end. */
  function handleBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }

  const backHeader = (
    <View style={styles.headerRow}>
      <Button label="← Back" variant="ghost" onPress={handleBack} testID="service-details-back" />
    </View>
  );

  // ── Fail-closed: no configuration for this service ────────────────────────
  if (!form) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        {backHeader}
        <View style={styles.centered} testID="service-details-unavailable">
          <Text variant="title" style={styles.title}>
            Not available yet
          </Text>
          <Text variant="body" color="textSecondary" style={styles.subtitle}>
            Booking for this service isn&apos;t available yet. Please choose another service or try again later.
          </Text>
          <Button label="Choose another service" fullWidth onPress={handleBack} testID="service-details-unavailable-back" />
        </View>
      </SafeAreaView>
    );
  }

  const gate = form.safetyGate;
  const blocked = isSafetyBlocked(form, state);

  /** Same picker the Notes step uses, writing to the same draft array — one photo mechanism. */
  async function handlePickPhoto() {
    // Images only — video is explicitly out of scope for every V1 service config.
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    if (result.canceled || !result.assets?.[0]) return;
    addIssuePhoto(result.assets[0].uri);
  }

  function handleContinue() {
    const found = validate(form!, state);
    setErrors(found);
    if (Object.keys(found).length > 0 || isSafetyBlocked(form!, state)) return;
    setServiceDetails(toSnapshot(form!, serviceTitle, state));
    router.push('/booking/address');
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      {backHeader}
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text variant="caption" color="textSecondary" style={styles.step}>
          Step 1 of 5
        </Text>

        <Text variant="title" style={styles.title}>
          {serviceTitle}
        </Text>
        <Text variant="body" color="textSecondary" style={styles.subtitle}>
          Tell us a little about the job so we can send the right person.
        </Text>

        <View style={styles.form}>
          {/* ── Safety gate: asked before the form, and blocks when triggered ── */}
          {gate && (
            <View style={styles.block} testID={`gate-${gate.key}`}>
              <Text variant="body" style={styles.gateLabel}>
                {gate.label}
              </Text>
              <View style={styles.optionColumn}>
                {gate.options.map((o) => (
                  <Button
                    key={o.key}
                    label={o.label}
                    fullWidth
                    variant={state.gate === o.key ? 'primary' : 'secondary'}
                    testID={`gate-option-${o.key}`}
                    onPress={() => setState({ ...state, gate: o.key })}
                  />
                ))}
              </View>
              {errors[gate.key] ? (
                <Text variant="caption" color="error" testID={`error-${gate.key}`}>
                  {errors[gate.key]}
                </Text>
              ) : null}
            </View>
          )}

          {blocked && gate ? (
            <View style={[styles.blockNotice, { borderColor: theme.error }]} testID="safety-block">
              <Text variant="body" style={styles.gateLabel}>
                {gate.blockTitle}
              </Text>
              <Text variant="body" color="textSecondary">
                {gate.blockBody}
              </Text>
            </View>
          ) : (
            <>
              <ServiceDetailsForm
                form={form}
                state={state}
                onChange={setState}
                errors={errors}
                photos={issuePhotos}
                onAddPhoto={handlePickPhoto}
                onRemovePhoto={removeIssuePhoto}
              />
              <Button label="Continue" fullWidth onPress={handleContinue} testID="service-details-continue" />
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: { paddingHorizontal: Spacing.two, paddingTop: Spacing.two, alignItems: 'flex-start' },
  scroll: { flexGrow: 1, padding: Spacing.four, gap: Spacing.three },
  centered: { flex: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.two },
  step: { marginBottom: Spacing.one },
  title: { marginBottom: Spacing.one },
  subtitle: { marginBottom: Spacing.two },
  form: { gap: Spacing.three },
  block: { gap: Spacing.one },
  gateLabel: { fontWeight: '600' },
  optionColumn: { gap: Spacing.one },
  blockNotice: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
});
