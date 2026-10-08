/**
 * `openInTabs` against the router's real navigation state (the root stack sits inside the router's
 * own wrapper route): on a tab screen it only navigates, from a pushed page it first goes down to
 * the tabs already under that page.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { Tabs } from 'expo-router/js-tabs';
import { Text } from 'react-native';

import { openInTabs } from '../open-in-tabs';

// Imported last on purpose: the testing library registers its own Reanimated mock, which cannot
// load under this app's Jest setup (jest.config.js); everything above already loaded the app's.
import { renderRouter } from 'expo-router/testing-library';

const BARE = { headerShown: false };

const named = (name: string) =>
  function Screen() {
    return <Text>{name}</Text>;
  };

const ROUTES = {
  _layout: () => <Stack screenOptions={BARE} />,
  '(tabs)/_layout': () => (
    <Tabs screenOptions={BARE}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="trips" />
      <Tabs.Screen name="wallet" />
    </Tabs>
  ),
  '(tabs)/index': named('home'),
  '(tabs)/trips': named('trips'),
  '(tabs)/wallet': named('wallet'),
  'you/index': named('you'),
};

async function renderApp() {
  const pending = renderRouter(ROUTES, { initialUrl: '/' });
  await pending;
  await act(async () => {});
  return { getPathname: () => pending.getPathname() };
}

async function go(action: () => void) {
  await act(() => {
    action();
  });
  await act(async () => {});
}

afterEach(() => jest.restoreAllMocks());

describe('openInTabs in a rendered app', () => {
  it('navigates without dismissing on a tab screen', async () => {
    const app = await renderApp();
    const dismissTo = jest.spyOn(router, 'dismissTo');
    await go(() => openInTabs('/trips'));
    expect(dismissTo).not.toHaveBeenCalled();
    expect(app.getPathname()).toBe('/trips');

    await go(() => openInTabs('/wallet'));
    expect(dismissTo).not.toHaveBeenCalled();
    expect(app.getPathname()).toBe('/wallet');
  });

  it('dismisses to the tabs first from a pushed page', async () => {
    const app = await renderApp();
    await go(() => router.push('/you'));
    expect(app.getPathname()).toBe('/you');

    const dismissTo = jest.spyOn(router, 'dismissTo');
    await go(() => openInTabs('/trips'));
    expect(dismissTo).toHaveBeenCalledWith('/(tabs)');
    expect(app.getPathname()).toBe('/trips');

    // The page is gone from under the tabs: back walks the tabs' own history, not to the page.
    await go(() => router.back());
    expect(app.getPathname()).toBe('/');
  });
});
