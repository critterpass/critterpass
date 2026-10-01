import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Stack } from 'expo-router/js-stack';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import type * as ReactNativeModule from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { tokens } from '@cp/design-tokens';

import { provideSessionGate } from '../../../lib/navigation/gates';
import { modalGroupOptions, pushTransition } from '../../../lib/navigation/transitions';
import { ThemeProvider } from '../../../lib/theme';
import { ScreenJoltProvider } from '../../../motion/patterns/thud';
import { ShellTabs } from '../../shell/ShellTabs';
import { resetPresenterForTests } from '../presenter';
import { Sheet } from '../Sheet';
import { resetTabBarCoverForTests, useTabBarCovered } from '../tab-bar-cover';

// Imported last on purpose: the testing library registers its own Reanimated mock, which cannot
// load under this app's Jest setup (jest.config.js); everything above already loaded the app's.
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

// `<Sticker>` rasterises critter art through Skia's JSI/GPU host, which Jest cannot run.
jest.mock('../../sticker/Sticker', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot close over module-scope imports
  const RN = require('react-native') as typeof ReactNativeModule;
  return { Sticker: ({ kind }: { kind: string }) => <RN.View testID={`sticker-${kind}`} /> };
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** Every value the bar's cover state rendered with, in order. */
const renders: boolean[] = [];

function CoverProbe() {
  renders.push(useTabBarCovered());
  return null;
}

/** The app's root: a stack that holds the tabs, pushed pages and the `(modal)` group. */
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
              <CoverProbe />
            </ScreenJoltProvider>
          </ThemeProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * A tab screen that renders its own sheets, the way the wallet's budget and paste sheets do. The
 * first sheet can hand over to a second one, and the screen can drop its sheet without dismissing.
 */
function screenWithSheet(name: string) {
  return function ScreenWithSheet() {
    const [open, setOpen] = useState<'none' | 'first' | 'second'>('none');
    return (
      <>
        <Pressable testID={`${name}-open`} onPress={() => setOpen('first')}>
          <Text>{`${name} screen`}</Text>
        </Pressable>
        {open === 'first' ? (
          <Sheet onDismiss={() => setOpen('none')} testID={`${name}-sheet`}>
            <Text>{`${name} sheet`}</Text>
            <Pressable testID={`${name}-next`} onPress={() => setOpen('second')} />
            <Pressable testID={`${name}-drop`} onPress={() => setOpen('none')} />
          </Sheet>
        ) : null}
        {open === 'second' ? (
          <Sheet onDismiss={() => setOpen('none')} testID={`${name}-second`}>
            <Text>{`${name} second sheet`}</Text>
          </Sheet>
        ) : null}
      </>
    );
  };
}

const ROUTES = {
  _layout: Root,
  '(tabs)/_layout': ShellTabs,
  '(tabs)/index': screenWithSheet('home'),
  '(tabs)/trips': () => <Text>trips screen</Text>,
  // The wallet tab holds a stack, as in the app: its screens are one navigator below the tabs.
  '(tabs)/wallet/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
  '(tabs)/wallet/index': screenWithSheet('wallet'),
  '(tabs)/pass': () => <Text>pass screen</Text>,
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

/** How the tab bar (with its guide button) is exposed to touches and the screen reader. */
function bar() {
  const { pointerEvents, accessibilityElementsHidden, importantForAccessibility } =
    screen.getByTestId('tab-bar-container', { includeHiddenElements: true }).props;
  return { pointerEvents, accessibilityElementsHidden, importantForAccessibility };
}

const SHOWN = {
  pointerEvents: 'box-none',
  accessibilityElementsHidden: false,
  importantForAccessibility: 'auto',
};
const COVERED = {
  pointerEvents: 'none',
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
};

// Each case mounts the whole shell through the router; CI runners are several times slower.
jest.setTimeout(60_000);

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  provideSessionGate(() => ({ status: 'ready' }));
});

afterEach(() => {
  resetPresenterForTests();
  resetTabBarCoverForTests();
});

describe('a sheet a tab screen renders inside itself', () => {
  it.each([
    ['directly in a tab', '/', 'home'],
    ['in the stack a tab holds', '/wallet', 'wallet'],
  ])('covers the tab bar while it is up (%s)', async (_where, url, name) => {
    await renderApp(url);
    expect(bar()).toEqual(SHOWN);

    await fireEvent.press(screen.getByTestId(`${name}-open`));
    expect(screen.getByText(`${name} sheet`)).toBeTruthy();
    expect(bar()).toEqual(COVERED);

    await fireEvent.press(screen.getByTestId(`${name}-sheet-close`));
    // renderRouter runs on fake timers; the dismiss completion hops to the JS thread on a timer.
    await act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(screen.queryByText(`${name} sheet`)).toBeNull();
    expect(bar()).toEqual(SHOWN);
  });

  it('gives the bar back when the sheet unmounts without being dismissed', async () => {
    await renderApp('/wallet');
    await fireEvent.press(screen.getByTestId('wallet-open'));
    expect(bar()).toEqual(COVERED);

    await fireEvent.press(screen.getByTestId('wallet-drop'));
    expect(screen.queryByText('wallet sheet')).toBeNull();
    expect(bar()).toEqual(SHOWN);
  });

  it('keeps the bar covered when one sheet hands over to the next', async () => {
    await renderApp('/wallet');
    await fireEvent.press(screen.getByTestId('wallet-open'));

    renders.length = 0;
    await fireEvent.press(screen.getByTestId('wallet-next'));
    expect(screen.getByText('wallet second sheet')).toBeTruthy();
    // No render in between saw the bar uncovered, so it never flashes back.
    expect(renders).not.toContain(false);
    expect(bar()).toEqual(COVERED);
  });

  it('gives the bar back while a page is pushed over its screen', async () => {
    await renderApp('/wallet');
    await fireEvent.press(screen.getByTestId('wallet-open'));
    expect(bar()).toEqual(COVERED);

    const { router } = await import('expo-router');
    await act(() => {
      router.push('/page');
    });
    expect(bar()).toEqual(SHOWN);

    await act(() => {
      router.back();
    });
    expect(bar()).toEqual(COVERED);
  });
});

describe('a sheet on a (modal) route', () => {
  it('leaves the tab bar as it is: the route is already above it', async () => {
    await renderApp('/');
    const { router } = await import('expo-router');
    await act(() => {
      router.push('/place');
    });
    expect(screen.getByText('place sheet')).toBeTruthy();
    expect(bar()).toEqual(SHOWN);
  });
});
