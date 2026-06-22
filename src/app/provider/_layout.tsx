// Provider section layout — Stack with the tabs group + job detail pushed on top.
import { Stack } from 'expo-router';

export default function ProviderLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="job/[id]" options={{ headerShown: true, title: 'Job' }} />
    </Stack>
  );
}
