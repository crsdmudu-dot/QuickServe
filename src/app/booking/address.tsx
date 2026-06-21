/**
 * Address screen — step 2 of the booking flow.
 *
 * The user types their address here.  If they press Continue without filling
 * in the field we show an inline error; otherwise we advance to the schedule
 * screen.
 */

import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBookingDraft } from '@/booking/booking-draft';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

export default function AddressScreen() {
  const theme = useTheme();
  const { address, setAddress } = useBookingDraft();
  const [error, setError] = useState('');

  function handleContinue() {
    if (!address.trim()) {
      setError('Address is required.');
      return;
    }
    setError('');
    router.push('/booking/schedule');
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <Text variant="title">Your Address</Text>
      <View style={styles.form}>
        <Input
          label="Address"
          value={address}
          onChangeText={(text) => {
            setAddress(text);
            if (error) setError('');
          }}
          placeholder="123 Main St, City"
          error={error}
        />
        <Button label="Continue" fullWidth onPress={handleContinue} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: Spacing.four, gap: Spacing.four },
  form: { gap: Spacing.three },
});
