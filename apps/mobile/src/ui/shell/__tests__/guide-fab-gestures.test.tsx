jest.unmock('expo-router');

import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Slot } from 'expo-router';
import type * as ReactNativeModule from 'react-native';
import { Gesture, GestureHandlerRootView, State } from 'react-native-gesture-handler';
import type { GestureType } from 'react-native-gesture-handler';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { registerScreens } from '../../../lib/navigation/screen-registry';
import { ThemeProvider } from '../../../lib/theme';
import { GuideFab, guideFabGestures } from '../GuideFab';
// Imported last on purpose: see tab-bar.test.tsx (the testing library's own Reanimated mock).
import { act, renderRouter } from 'expo-router/testing-library';

// Skia cannot rasterise under Jest; the sticker suite covers the real pipeline.
jest.mock('../../sticker/Sticker', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot close over module-scope imports
  const RN = require('react-native') as typeof ReactNativeModule;
  return { Sticker: () => <RN.View /> };
});

function TestRoot() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nProvider i18n={i18n}>
          <ThemeProvider>
            <Slot />
          </ThemeProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const ROUTES = {
  _layout: TestRoot,
  index: GuideFab,
  guide: () => null,
  help: () => null,
};

let unregister: (() => void) | undefined;

async function renderFab() {
  unregister = registerScreens({ '3j-1': '/guide', '3k-6': '/help' });
  // `renderRouter` returns RNTL's render promise with the router helpers attached to it.
  const pending = renderRouter(ROUTES, { initialUrl: '/' });
  await pending;
  await act(async () => {});
  return { getPathname: () => pending.getPathname() };
}

/** The FAB builds declarative `Gesture.*()` objects; the lookup also covers the hook-based kind. */
function gestureById(testId: string): GestureType {
  return getByGestureTestId(testId) as GestureType;
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

afterEach(() => {
  unregister?.();
  unregister = undefined;
});

describe('GuideFab gestures', () => {
  it('gives each native view a single gesture so iOS attaches every handler', () => {
    const { ring, tapArea } = guideFabGestures(Gesture.LongPress(), Gesture.Tap());
    expect(ring.toGestureArray()).toHaveLength(1);
    expect(tapArea.toGestureArray()).toHaveLength(1);
  });

  it('makes the tap wait for the long-press to fail', async () => {
    await renderFab();
    const tap = gestureById('guide-fab-tap');
    const longPress = gestureById('guide-fab-long-press');
    expect(tap.handlerName).toBe('TapGestureHandler');
    expect(longPress.handlerName).toBe('LongPressGestureHandler');
    // `requireExternalGestureToFail` stores the gesture objects themselves.
    const waitsFor = (tap.config.requireToFail ?? []) as GestureType[];
    const tags = waitsFor.map((gesture) => gesture.handlerTag);
    expect(tags).toContain(longPress.handlerTag);
  });

  it('asks the guide on tap', async () => {
    const router = await renderFab();
    const tap = gestureById('guide-fab-tap');
    await act(async () => {
      // `scheduleOnRN` hops to the JS thread through a (faked) microtask: flush it.
      tap.handlers.onEnd?.({ state: State.END } as never, true);
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(router.getPathname()).toBe('/guide');
  });

  it('opens Help on long-press', async () => {
    const router = await renderFab();
    const longPress = gestureById('guide-fab-long-press');
    await act(async () => {
      longPress.handlers.onStart?.({ state: State.ACTIVE } as never);
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(router.getPathname()).toBe('/help');
  });
});
