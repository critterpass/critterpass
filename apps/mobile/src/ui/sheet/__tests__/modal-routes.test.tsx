jest.unmock('expo-router');

import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { act } from '@testing-library/react-native';
import { Stack } from 'expo-router/js-stack';
import { Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { tokens } from '@cp/design-tokens';

import { modalGroupOptions, pushTransition } from '../../../lib/navigation/transitions';
import { ThemeProvider } from '../../../lib/theme';
import { ScreenJoltProvider } from '../../../motion/patterns/thud';
import { Sheet } from '../Sheet';

// Imported last on purpose: the testing library registers its own Reanimated mock, which cannot
// load under this app's Jest setup (jest.config.js); everything above already loaded the app's.
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** The same stack setup as the app's root layout: pushes by default, `(modal)` over the stack. */
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

function ModalGroup() {
  return <Stack screenOptions={modalGroupOptions()} />;
}

function PlaceSheet() {
  return (
    <Sheet accessibilityLabel="Place detail">
      <Text>place sheet</Text>
    </Sheet>
  );
}

const ROUTES = {
  _layout: Root,
  index: () => <Text>home</Text>,
  other: () => <Text>other screen</Text>,
  '(modal)/_layout': ModalGroup,
  '(modal)/place': PlaceSheet,
};

async function renderApp() {
  const pending = renderRouter(ROUTES, { initialUrl: '/' });
  await pending;
  await act(async () => {});
  // `renderRouter` attaches its helpers to the render promise itself, not to what it resolves to.
  return { getPathname: () => pending.getPathname() };
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('(modal) group', () => {
  it('presents a sheet over the still-rendered presenter and ✕ goes back', async () => {
    const app = await renderApp();
    const { router } = await import('expo-router');
    await act(() => {
      router.push('/place');
    });
    expect(app.getPathname()).toBe('/place');
    expect(screen.getByText('place sheet')).toBeTruthy();
    expect(screen.getByText('home', { includeHiddenElements: true })).toBeTruthy();

    await fireEvent.press(screen.getByTestId('sheet-close'));
    // renderRouter runs on fake timers; the dismiss completion hops to the JS thread on a timer.
    await act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(app.getPathname()).toBe('/');
  });

  it('keeps undeclared routes reachable next to the declared modal group', async () => {
    const app = await renderApp();
    const { router } = await import('expo-router');
    await act(() => {
      router.push('/other');
    });
    expect(app.getPathname()).toBe('/other');
    expect(screen.getByText('other screen')).toBeTruthy();
  });
});
