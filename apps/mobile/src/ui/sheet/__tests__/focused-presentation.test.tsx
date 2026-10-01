/**
 * "A sheet is up" for whatever may interrupt the person (lib/interaction/busy) means a sheet on the
 * screen they are looking at: one left open on a screen underneath does not count.
 */
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { act } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { tokens } from '@cp/design-tokens';

import { isBusy } from '../../../lib/interaction/busy';
import { provideSessionGate } from '../../../lib/navigation/gates';
import { modalGroupOptions, pushTransition } from '../../../lib/navigation/transitions';
import { ThemeProvider } from '../../../lib/theme';
import { ScreenJoltProvider } from '../../../motion/patterns/thud';
import { resetPresenterForTests } from '../presenter';
import { Sheet } from '../Sheet';

import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Root() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <I18nProvider i18n={i18n}>
          <ThemeProvider>
            <ScreenJoltProvider>
              <Stack screenOptions={pushTransition(tokens.motion, false)}>
                <Stack.Screen name="(modal)" options={modalGroupOptions()} />
              </Stack>
            </ScreenJoltProvider>
          </ThemeProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** A screen that renders its own sheet and can drop it without dismissing. */
function ScreenWithSheet() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable testID="home-open" onPress={() => setOpen(true)}>
        <Text>home screen</Text>
      </Pressable>
      {open ? (
        <Sheet onDismiss={() => setOpen(false)} testID="home-sheet">
          <Text>home sheet</Text>
          <Pressable testID="home-drop" onPress={() => setOpen(false)} />
        </Sheet>
      ) : null}
    </>
  );
}

const ROUTES = {
  _layout: Root,
  index: ScreenWithSheet,
  page: () => <Text>pushed page</Text>,
  '(modal)/_layout': () => <Stack screenOptions={modalGroupOptions()} />,
  '(modal)/place': () => (
    <Sheet testID="place-sheet">
      <Text>place sheet</Text>
    </Sheet>
  ),
};

async function renderApp(initialUrl: string) {
  await renderRouter(ROUTES, { initialUrl });
  await act(async () => {});
}

async function go(move: () => void) {
  await act(() => {
    move();
  });
  await act(() => {
    jest.runOnlyPendingTimers();
  });
}

// Each case mounts the app through the router; CI runners are several times slower.
jest.setTimeout(60_000);

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  provideSessionGate(() => ({ status: 'ready' }));
});

afterEach(() => {
  resetPresenterForTests();
});

describe('a sheet on the focused screen', () => {
  it('stops counting while its screen is under another one, and counts again on return', async () => {
    await renderApp('/');
    expect(isBusy()).toBe(false);
    await fireEvent.press(screen.getByTestId('home-open'));
    expect(isBusy()).toBe(true);

    await go(() => router.push('/page'));
    expect(screen.getByText('pushed page')).toBeTruthy();
    expect(isBusy()).toBe(false);

    await go(() => router.back());
    expect(screen.getByText('home sheet')).toBeTruthy();
    expect(isBusy()).toBe(true);
  });

  it('counts a (modal) route sheet while it is up', async () => {
    await renderApp('/');
    await go(() => router.push('/place'));
    expect(screen.getByText('place sheet')).toBeTruthy();
    expect(isBusy()).toBe(true);

    await go(() => router.back());
    expect(screen.queryByText('place sheet')).toBeNull();
    expect(isBusy()).toBe(false);
  });

  it('stops counting when the sheet unmounts without being dismissed', async () => {
    await renderApp('/');
    await fireEvent.press(screen.getByTestId('home-open'));
    expect(isBusy()).toBe(true);
    await fireEvent.press(screen.getByTestId('home-drop'));
    expect(screen.queryByText('home sheet')).toBeNull();
    expect(isBusy()).toBe(false);
  });
});
