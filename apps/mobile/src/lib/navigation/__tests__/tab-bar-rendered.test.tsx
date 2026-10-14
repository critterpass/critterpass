jest.unmock('expo-router');

import { describe, expect, it, jest } from '@jest/globals';
import { act } from '@testing-library/react-native';
import { router, useRootNavigationState } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { Tabs } from 'expo-router/js-tabs';
import { Text, View } from 'react-native';

import { tabBarHidden } from '../tab-bar';

// Imported last on purpose: the testing library registers its own Reanimated mock, which cannot
// load under this app's Jest setup (jest.config.js); everything above already loaded the app's.
import { renderRouter, screen } from 'expo-router/testing-library';

function TabsWithBar() {
  const hidden = tabBarHidden(useRootNavigationState());
  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={{ headerShown: false }} />
      <Text testID="bar">{hidden ? 'hidden' : 'shown'}</Text>
    </View>
  );
}

const stack = () => <Stack screenOptions={{ headerShown: false }} />;

describe('tab bar under the router', () => {
  it('hides for a page pushed in a tab and shows again on its root', async () => {
    await renderRouter(
      {
        _layout: stack,
        '(tabs)/_layout': TabsWithBar,
        '(tabs)/index': () => <Text>home</Text>,
        '(tabs)/wallet/_layout': stack,
        '(tabs)/wallet/bookings/_layout': stack,
        '(tabs)/wallet/bookings/index': () => <Text>bookings</Text>,
        '(tabs)/wallet/bookings/add': () => <Text>add</Text>,
        '(tabs)/wallet/bookings/paste': () => <Text>paste</Text>,
      },
      { initialUrl: '/wallet/bookings' },
    );
    await act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(screen.getByTestId('bar').props.children).toBe('shown');
    await act(() => router.push('/wallet/bookings/paste'));
    expect(screen.getByTestId('bar').props.children).toBe('shown');
    await act(() => router.back());
    await act(() => router.push('/wallet/bookings/add'));
    expect(screen.getByTestId('bar').props.children).toBe('hidden');
    await act(() => router.back());
    expect(screen.getByTestId('bar').props.children).toBe('shown');
  });
});
