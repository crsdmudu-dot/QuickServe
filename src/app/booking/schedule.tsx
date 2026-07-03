/**
 * Schedule screen — step 3 of the booking flow (Slice 24 rework).
 *
 * All options write to LOCAL screen state. On "Continue", a single ScheduleInput
 * is built, resolved via resolveSchedule(), then written to the draft via setSchedule()
 * before navigating. This keeps scheduled_for canonical via one path.
 *
 * Booking options:  ASAP · Today · Tomorrow · Choose date · Choose date & time
 * Time of day:      Morning · Afternoon · Evening · Specific time
 * Flexible ±1h:     toggle shown when window='specific' or type='datetime'
 * Quick presets:    from QUICK_PRESETS (next available / this evening / tomorrow morning/afternoon)
 * Recurrence:       One time · Weekly · Every 2 weeks · Monthly · Custom
 *
 * Platform note: Android has no single "datetime" picker, so we open the native
 * date dialog then the time dialog imperatively via DateTimePickerAndroid, combining
 * the results into a single Date. iOS shows an inline DateTimePicker. Both use the
 * current onValueChange API — the old onChange prop is deprecated.
 */

import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBookingDraft } from '@/booking/booking-draft';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  resolveSchedule,
  QUICK_PRESETS,
  recurrenceLabel,
  type SchedulingType,
  type TimeWindow,
  type Recurrence,
  type ScheduleInput,
} from '@/lib/scheduling';

// ─── Types ────────────────────────────────────────────────────────────────────

type BookingOption = SchedulingType; // 'asap' | 'today' | 'tomorrow' | 'date' | 'datetime'

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const theme = useTheme();
  const { setSchedule } = useBookingDraft();

  // --- Local state (uniform path: all options write here; Continue resolves) ---
  const [type, setType] = useState<BookingOption>('asap');
  const [window, setWindow] = useState<TimeWindow | null>(null);
  const [pickedDate, setPickedDate] = useState<Date | null>(null);     // date-only pick ('date' type)
  const [specificTime, setSpecificTime] = useState<Date | null>(null); // exact datetime pick
  const [flexible, setFlexible] = useState(false);
  const [recurrence, setRecurrence] = useState<Recurrence>('one_time');
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [iosPickerMode, setIosPickerMode] = useState<'date' | 'datetime'>('datetime');
  const [error, setError] = useState('');

  // ─── Derived flags ────────────────────────────────────────────────────────

  // Show "Time of day" section when user picks today/tomorrow/date
  const showTimeOfDay = type === 'today' || type === 'tomorrow' || type === 'date';

  // Show "Flexible ±1h" toggle when user needs a specific instant
  const showFlexible = window === 'specific' || type === 'datetime';

  // Show the inline iOS date-only or datetime picker
  const showIosDateOnlyPicker = showIosPicker && iosPickerMode === 'date';
  const showIosDateTimePicker = showIosPicker && iosPickerMode === 'datetime';

  // ─── Handlers: booking option chips ──────────────────────────────────────

  function handleSelectType(t: BookingOption) {
    setType(t);
    setError('');
    // ASAP doesn't need window / time
    if (t === 'asap') {
      setWindow(null);
      setSpecificTime(null);
    }
    // datetime shows the picker directly; close any open iOS picker first
    if (t === 'datetime') {
      setWindow(null);
    }
    // Reset iOS picker when switching type
    setShowIosPicker(false);
  }

  // ─── Handlers: time-of-day chips ─────────────────────────────────────────

  function handleSelectWindow(w: TimeWindow) {
    setWindow(w);
    setError('');
    // Selecting a named window clears any previously picked specific time
    if (w !== 'specific') {
      setSpecificTime(null);
    }
    // Hide iOS picker if a named window is picked
    if (w !== 'specific') {
      setShowIosPicker(false);
    }
  }

  // ─── Handlers: Android date→time two-step ─────────────────────────────────

  function openAndroidDateTimePicker() {
    // Start with current specificTime or now
    const current = specificTime ?? new Date();
    DateTimePickerAndroid.open({
      value: current,
      mode: 'date',
      onValueChange: (_dateEvent, pickedD) => {
        DateTimePickerAndroid.open({
          value: pickedD,
          mode: 'time',
          onValueChange: (_timeEvent, pickedT) => {
            const combined = new Date(pickedD);
            combined.setHours(pickedT.getHours(), pickedT.getMinutes(), 0, 0);
            setSpecificTime(combined);
            setError('');
          },
        });
      },
    });
  }

  function openAndroidDatePicker() {
    // Date-only pick for 'date' type
    const current = pickedDate ?? new Date();
    DateTimePickerAndroid.open({
      value: current,
      mode: 'date',
      onValueChange: (_event, picked) => {
        setPickedDate(picked);
        setError('');
      },
    });
  }

  // ─── Handler: "Pick date & time" / "Pick a date" button ──────────────────

  function handlePickPress() {
    if (type === 'date') {
      // Date-only pick
      if (Platform.OS === 'android') {
        openAndroidDatePicker();
      } else {
        setIosPickerMode('date');
        setShowIosPicker(true);
      }
    } else {
      // datetime or specific time pick
      if (Platform.OS === 'android') {
        openAndroidDateTimePicker();
      } else {
        setIosPickerMode('datetime');
        setShowIosPicker(true);
      }
    }
  }

  // ─── Handler: quick preset chips ─────────────────────────────────────────

  function handlePreset(presetKey: string) {
    const preset = QUICK_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    const input = preset.build();
    // Apply the preset's type and window to local state; clear specific picks
    setType(input.type);
    setWindow(input.window ?? null);
    setSpecificTime(null);
    setPickedDate(null);
    setFlexible(false);
    setShowIosPicker(false);
    setError('');
  }

  // ─── Continue: build ScheduleInput → resolve → store → navigate ───────────

  function handleContinue() {
    // Build the ScheduleInput from local state
    let input: ScheduleInput;

    if (type === 'asap') {
      input = { type: 'asap', recurrence };
    } else if (type === 'today' || type === 'tomorrow') {
      if (window === 'specific' || window === null) {
        // Specific time or no window selected yet — need specificTime
        if (!specificTime) {
          setError('Please choose a date and time.');
          return;
        }
        input = { type, window: 'specific', specificTime, flexible, recurrence };
      } else {
        // Named window (morning / afternoon / evening)
        input = { type, window, recurrence };
      }
    } else if (type === 'date') {
      if (!pickedDate) {
        setError('Please choose a date and time.');
        return;
      }
      if (window === 'specific') {
        if (!specificTime) {
          setError('Please choose a date and time.');
          return;
        }
        input = { type: 'date', baseDate: pickedDate, window: 'specific', specificTime, flexible, recurrence };
      } else if (window) {
        input = { type: 'date', baseDate: pickedDate, window, recurrence };
      } else {
        // No window picked — require user to pick one
        setError('Please choose a date and time.');
        return;
      }
    } else {
      // type === 'datetime'
      if (!specificTime) {
        setError('Please choose a date and time.');
        return;
      }
      input = { type: 'datetime', specificTime, flexible, recurrence };
    }

    const resolved = resolveSchedule(input);
    setSchedule(resolved);
    setError('');
    router.push('/booking/notes');
  }

  // ─── Shared chip style helper ─────────────────────────────────────────────

  function isSelected(value: string, current: string | null) {
    return value === current;
  }

  // ─── Rendered section labels ──────────────────────────────────────────────

  const recurrenceOptions: Recurrence[] = ['one_time', 'weekly', 'biweekly', 'monthly', 'custom'];

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
          Choose a convenient time for your booking.
        </Text>

        {/* ── Section 1: Booking options ─────────────────────────────────── */}
        <SectionLabel label="Booking options" theme={theme} />
        <View style={styles.chipRow}>
          {(
            [
              { key: 'asap', label: 'ASAP' },
              { key: 'today', label: 'Today' },
              { key: 'tomorrow', label: 'Tomorrow' },
              { key: 'date', label: 'Choose date' },
              { key: 'datetime', label: 'Choose date & time' },
            ] as { key: BookingOption; label: string }[]
          ).map((opt) => (
            <Button
              key={opt.key}
              label={opt.label}
              variant={isSelected(opt.key, type) ? 'primary' : 'secondary'}
              onPress={() => handleSelectType(opt.key)}
            />
          ))}
        </View>

        {/* ── Section 2: Time of day (shown for today/tomorrow/date) ─────── */}
        {showTimeOfDay ? (
          <>
            <SectionLabel label="Time of day" theme={theme} />
            <View style={styles.chipRow}>
              {(
                [
                  { key: 'morning', label: 'Morning' },
                  { key: 'afternoon', label: 'Afternoon' },
                  { key: 'evening', label: 'Evening' },
                  { key: 'specific', label: 'Specific time' },
                ] as { key: TimeWindow; label: string }[]
              ).map((opt) => (
                <Button
                  key={opt.key}
                  label={opt.label}
                  variant={isSelected(opt.key, window) ? 'primary' : 'secondary'}
                  onPress={() => handleSelectWindow(opt.key)}
                />
              ))}
            </View>
          </>
        ) : null}

        {/* ── Date picker button + iOS inline picker ─────────────────────── */}
        {/* Show "Pick a date" for 'date' type */}
        {type === 'date' ? (
          <View style={styles.pickerSection}>
            <Button
              label={pickedDate ? pickedDate.toLocaleDateString() : 'Pick a date'}
              variant="secondary"
              onPress={handlePickPress}
            />
            {showIosDateOnlyPicker ? (
              <DateTimePicker
                value={pickedDate ?? new Date()}
                mode="date"
                display="default"
                onValueChange={(_event, date) => {
                  if (date) {
                    setPickedDate(date);
                    setError('');
                  }
                }}
              />
            ) : null}
          </View>
        ) : null}

        {/* Show "Pick date & time" button for 'datetime' or when window=specific */}
        {(type === 'datetime' || (showTimeOfDay && window === 'specific')) ? (
          <View style={styles.pickerSection}>
            <Button
              label={
                specificTime
                  ? specificTime.toLocaleString()
                  : type === 'datetime'
                  ? 'Pick date & time'
                  : 'Pick a time'
              }
              variant="secondary"
              onPress={handlePickPress}
            />
            {showIosDateTimePicker ? (
              <DateTimePicker
                value={specificTime ?? new Date()}
                mode="datetime"
                display="default"
                onValueChange={(_event, date) => {
                  if (date) {
                    setSpecificTime(date);
                    setError('');
                  }
                }}
              />
            ) : null}
          </View>
        ) : null}

        {/* ── Section 3: Flexible ±1h toggle ─────────────────────────────── */}
        {showFlexible ? (
          <>
            <SectionLabel label="Flexibility" theme={theme} />
            <Button
              label={flexible ? 'Flexible ±1 hour (on)' : 'Flexible ±1 hour'}
              variant={flexible ? 'primary' : 'secondary'}
              onPress={() => setFlexible((f) => !f)}
            />
          </>
        ) : null}

        {/* ── Section 4: Quick selections ─────────────────────────────────── */}
        <SectionLabel label="Quick selections" theme={theme} />
        <View style={styles.chipRow}>
          {QUICK_PRESETS.map((preset) => (
            <Button
              key={preset.key}
              label={preset.label}
              variant="secondary"
              onPress={() => handlePreset(preset.key)}
            />
          ))}
        </View>

        {/* ── Section 5: Recurring ────────────────────────────────────────── */}
        <SectionLabel label="Recurring" theme={theme} />
        <View style={styles.chipRow}>
          {recurrenceOptions.map((r) => (
            <Button
              key={r}
              label={recurrenceLabel(r)}
              variant={isSelected(r, recurrence) ? 'primary' : 'secondary'}
              onPress={() => setRecurrence(r)}
            />
          ))}
        </View>
        <Text variant="caption" color="textSecondary" style={styles.recurrenceCaption}>
          Recurring bookings are saved but not auto-scheduled yet.
        </Text>

        {/* ── Error message ────────────────────────────────────────────────── */}
        {error ? (
          <Text variant="caption" color="error">
            {error}
          </Text>
        ) : null}

        {/* ── Continue button ──────────────────────────────────────────────── */}
        <Button label="Continue" fullWidth onPress={handleContinue} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── SectionLabel helper ──────────────────────────────────────────────────────

function SectionLabel({ label, theme }: { label: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View
      style={[
        styles.sectionLabel,
        { borderLeftColor: theme.primary },
      ]}
    >
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  step: { marginBottom: Spacing.one },
  title: { marginBottom: Spacing.one },
  subtitle: { marginBottom: Spacing.two },
  sectionLabel: {
    borderLeftWidth: 3,
    paddingLeft: Spacing.two,
    marginTop: Spacing.one,
    borderRadius: Radii.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pickerSection: {
    gap: Spacing.two,
  },
  recurrenceCaption: {
    marginTop: -Spacing.two,
  },
});
