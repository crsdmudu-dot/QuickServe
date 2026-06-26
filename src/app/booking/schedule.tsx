/**
 * Schedule screen — step 3 of the booking flow.
 *
 * Lets the user pick a date and time for their booking, stored in the booking
 * draft as an ISO string.  Continue is only allowed once a date has been chosen.
 *
 * Platform note: Android has no single "datetime" picker (only "date" or
 * "time"), so we open the native date dialog and then the time dialog
 * imperatively via DateTimePickerAndroid and combine the result.  iOS shows the
 * inline datetime picker.  Both use the current `onValueChange` API — the old
 * `onChange` prop is deprecated, and passing `mode="datetime"` to the Android
 * component used to crash it ("Cannot read property 'dismiss' of undefined").
 */

import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBookingDraft } from '@/booking/booking-draft';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export default function ScheduleScreen() {
  const theme = useTheme();
  const { scheduledFor, setScheduledFor } = useBookingDraft();
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [error, setError] = useState('');

  function saveDate(date: Date) {
    setScheduledFor(date.toISOString());
    setError('');
  }

  // Android: open the date dialog, then the time dialog, then combine the two
  // selections into a single Date.  Each dialog dismisses itself; we never call
  // dismiss() manually.
  function openAndroidPicker() {
    const current = scheduledFor ? new Date(scheduledFor) : new Date();
    DateTimePickerAndroid.open({
      value: current,
      mode: 'date',
      onValueChange: (_dateEvent, pickedDate) => {
        DateTimePickerAndroid.open({
          value: pickedDate,
          mode: 'time',
          onValueChange: (_timeEvent, pickedTime) => {
            const combined = new Date(pickedDate);
            combined.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
            saveDate(combined);
          },
        });
      },
    });
  }

  function handlePickPress() {
    if (Platform.OS === 'android') {
      openAndroidPicker();
    } else {
      setShowIosPicker(true);
    }
  }

  function handleContinue() {
    if (!scheduledFor) {
      setError('Please choose a date and time.');
      return;
    }
    setError('');
    router.push('/booking/notes');
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Step indicator */}
        <Text variant="caption" color="textSecondary" style={styles.step}>
          Step 2 of 4
        </Text>

        <Text variant="title" style={styles.title}>
          When do you need it?
        </Text>
        <Text variant="body" color="textSecondary" style={styles.subtitle}>
          Choose a convenient date and time.
        </Text>

        <View style={styles.form}>
          <Button label="Pick date & time" onPress={handlePickPress} variant="secondary" />

          {scheduledFor ? (
            <Text variant="body" color="textSecondary">
              {new Date(scheduledFor).toLocaleString()}
            </Text>
          ) : null}

          {showIosPicker ? (
            <DateTimePicker
              value={scheduledFor ? new Date(scheduledFor) : new Date()}
              mode="datetime"
              display="default"
              onValueChange={(_event, date) => {
                if (date) saveDate(date);
              }}
            />
          ) : null}

          {error ? (
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
