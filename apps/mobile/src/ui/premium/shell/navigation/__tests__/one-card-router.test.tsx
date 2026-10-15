jest.unmock('expo-router');

import { describe, expect, it, jest } from '@jest/globals';
import { act } from '@testing-library/react-native';
import { router, useRootNavigationState } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { Tabs } from 'expo-router/js-tabs';
import { Text } from 'react-native';

import { oneCardRouter } from '../one-card-router';

// Imported last on purpose: the testing library registers its own Reanimated mock, which cannot
// load under this app's Jest setup (jest.config.js); everything above already loaded the app's.
import { renderRouter, screen } from 'expo-router/testing-library';

const ROUTER = oneCardRouter(() => undefined);

function RootNames() {
  // The container holds the root layout's route; its stack is the state under it.
  const routes = useRootNavigationState().routes[0]?.state?.routes ?? [];
  const tabs = routes.findLast((route) => route.name === '(tabs)')?.state;
  const tab = tabs?.routes[tabs.index ?? 0]?.name ?? '';
  return (
    <>
      <Text testID="root">{routes.map((route) => route.name).join(',')}</Text>
      <Text testID="tab">{tab}</Text>
    </>
  );
}

function Root() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} UNSTABLE_router={ROUTER} />
      <RootNames />
    </>
  );
}

const stack = () => <Stack screenOptions={{ headerShown: false }} />;

describe('the root router', () => {
  it('goes back to the tabs a link reaches from a page over them', async () => {
    await renderRouter(
      {
        _layout: Root,
        inbox: () => <Text>inbox</Text>,
        '(tabs)/_layout': () => <Tabs screenOptions={{ headerShown: false }} />,
        '(tabs)/index': () => <Text>home</Text>,
        '(tabs)/wallet/_layout': stack,
        '(tabs)/wallet/bookings/_layout': stack,
        '(tabs)/wallet/bookings/index': () => <Text>bookings</Text>,
      },
      { initialUrl: '/' },
    );
    await act(() => {
      jest.runOnlyPendingTimers();
    });
    await act(() => router.navigate('/inbox'));
    expect(screen.getByTestId('root').props.children).toBe('(tabs),inbox');
    await act(() => router.navigate('/wallet/bookings'));
    expect(screen.getByTestId('root').props.children).toBe('(tabs)');
    expect(screen.getByTestId('tab').props.children).toBe('wallet');
  });
});
