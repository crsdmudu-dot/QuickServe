/**
 * Schedule screen — step 3 of the booking flow.
 *
 * A button opens the native DateTimePicker.  Once the user picks a date/time
 * we store it in the booking draft as an ISO string and show a human-readable
 * summary.  Continue is only allowed when a date has been chosen.
 */

import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBookingDraft } from '@/booking/booking-draft';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export default function ScheduleScreen() {
  const theme = useTheme();
  const { scheduledFor, setScheduledFor } = useBookingDraft();
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState('');

  function handlePickerChange(_event: DateTimePickerEvent, date?: Date) {
    // On Android the picker closes automatically; on iOS keep it open.
    if (Platform.OS !== 'ios') setShowPicker(false);
    if (date) {
      setScheduledFor(date.toISOString());
      setError('');
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
      <Text variant="title">When do you need it?</Text>
      <View style={styles.form}>
        <Button label="Pick date & time" onPress={() => setShowPicker(true)} variant="secondary" />

        {scheduledFor ? (
          <Text variant="body" color="textSecondary">
            {new Date(scheduledFor).toLocaleString()}
          </Text>
        ) : null}

        {showPicker ? (
          <DateTimePicker
            value={scheduledFor ? new Date(scheduledFor) : new Date()}
            mode="datetime"
            display="default"
            onChange={handlePickerChange}
          />
        ) : null}

        {error ? (
          <Text variant="caption" color="error">
            {error}
          </Text>
        ) : null}

        <Button label="Continue" fullWidth onPress={handleContinue} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: Spacing.four, gap: Spacing.four },
  form: { gap: Spacing.three },
});
