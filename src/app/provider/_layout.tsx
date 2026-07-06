// Provider section layout — Stack with the tabs group + pushed screens on top.
import { Stack } from 'expo-router';

export default function ProviderLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="job/[id]" options={{ headerShown: true, title: 'Job' }} />
      <Stack.Screen name="quality" options={{ headerShown: true, title: 'Quality Dashboard' }} />
      <Stack.Screen name="code-of-conduct" options={{ headerShown: true, title: 'Code of Conduct' }} />
    </Stack>
  );
}
