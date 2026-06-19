import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '@/auth/auth-context';

function Probe() {
  const { isLoading, role, signedIn, selectRole, signIn, signOut } = useAuth();
  return (
    <>
      <Text>{isLoading ? 'loading' : `ready:${role ?? 'none'}:${signedIn}`}</Text>
      <Pressable onPress={() => selectRole('provider')}>
        <Text>select</Text>
      </Pressable>
      <Pressable onPress={() => signIn()}>
        <Text>signin</Text>
      </Pressable>
      <Pressable onPress={() => signOut()}>
        <Text>signout</Text>
      </Pressable>
    </>
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

it('loads defaults then supports select/sign-in/sign-out with persistence', async () => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByText('ready:none:false')).toBeOnTheScreen());

  fireEvent.press(screen.getByText('select'));
  await waitFor(() => expect(screen.getByText('ready:provider:false')).toBeOnTheScreen());
  expect(JSON.parse((await AsyncStorage.getItem('quickserve.auth')) ?? '{}')).toEqual({
    role: 'provider',
    signedIn: false,
  });

  fireEvent.press(screen.getByText('signin'));
  await waitFor(() => expect(screen.getByText('ready:provider:true')).toBeOnTheScreen());
  expect(JSON.parse((await AsyncStorage.getItem('quickserve.auth')) ?? '{}')).toEqual({
    role: 'provider',
    signedIn: true,
  });

  fireEvent.press(screen.getByText('signout'));
  await waitFor(() => expect(screen.getByText('ready:none:false')).toBeOnTheScreen());
  expect(await AsyncStorage.getItem('quickserve.auth')).toBeNull();
});

it('signIn persists the currently stored role, not a closure value', async () => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByText('ready:none:false')).toBeOnTheScreen());

  fireEvent.press(screen.getByText('select'));
  await waitFor(() => expect(screen.getByText('ready:provider:false')).toBeOnTheScreen());

  fireEvent.press(screen.getByText('signin'));
  await waitFor(() => expect(screen.getByText('ready:provider:true')).toBeOnTheScreen());

  expect(JSON.parse((await AsyncStorage.getItem('quickserve.auth')) ?? '{}')).toEqual({
    role: 'provider',
    signedIn: true,
  });
});
