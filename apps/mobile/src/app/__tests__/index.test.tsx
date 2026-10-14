/**
 * `/` must open the HOME tab, not the dev group's index (both live at `/`), including while the
 * other tabs' areas have not shipped their route files yet.
 */
jest.unmock('expo-router');

import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { router, Slot, Stack, Tabs, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import type * as ReactNativeModule from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/lib/theme';

import RootIndex from '../index';

// Imported last: the testing library registers its own Reanimated mock, which cannot load
// under this app's Jest setup (jest.config.js); everything above already loaded the app's.
import { act, renderRouter, screen } from 'expo-router/testing-library';

jest.mock('@/ui/premium/stickers/art/Sticker', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot close over module-scope imports
  const RN = require('react-native') as typeof ReactNativeModule;
  return { Sticker: ({ kind }: { kind: string }) => <RN.View testID={`sticker-${kind}`} /> };
});

function TestRoot() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <I18nProvider i18n={i18n}>
          <ThemeProvider fontScale={1}>
            <Slot />
          </ThemeProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const named = (name: string) =>
  function Named() {
    return <Text>{`${name} screen`}</Text>;
  };

function HomeWithNotice() {
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  return <Text>{`home screen ${notice ?? ''}`}</Text>;
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('root route', () => {
  it('opens the HOME tab at / with the dev index also at /', async () => {
    const pending = renderRouter(
      {
        _layout: TestRoot,
        index: RootIndex,
        '(tabs)/_layout': () => <Slot />,
        '(tabs)/index': named('home'),
        '(dev)/index': named('dev'),
      },
      { initialUrl: '/' },
    );
    await pending;
    await act(async () => {});
    expect(screen.getByText('home screen')).toBeTruthy();
    expect(screen.queryByText('dev screen')).toBeNull();
  });

  it('goes back to the tabs on Home when / opens over a running app', async () => {
    await renderRouter(
      {
        _layout: () => <Stack screenOptions={{ headerShown: false }} />,
        index: RootIndex,
        '(tabs)/_layout': () => (
          <Tabs screenOptions={{ headerShown: false }}>
            <Tabs.Screen name="index" />
            <Tabs.Screen name="trips" />
          </Tabs>
        ),
        '(tabs)/index': HomeWithNotice,
        '(tabs)/trips': named('trips'),
        page: named('page'),
      },
      { initialUrl: '/' },
    );
    await act(async () => {});
    await act(async () => {
      router.navigate('/trips');
      await Promise.resolve();
    });
    await act(async () => {
      router.push('/page');
      await Promise.resolve();
    });
    expect(screen.getByText('page screen')).toBeTruthy();
    // A warm bare link: the router opens `/` over what is on screen.
    await act(async () => {
      router.push('/?notice=link_unknown');
      await Promise.resolve();
    });
    await act(async () => {});
    expect(screen.getByText('home screen link_unknown')).toBeTruthy();
    expect(screen.queryByText('page screen')).toBeNull();
    expect(router.canGoBack()).toBe(false);
  });
});
