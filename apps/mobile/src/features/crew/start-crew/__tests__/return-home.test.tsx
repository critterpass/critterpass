/**
 * Done on the start-a-crew screen goes back to the Home under it: Home stays the stack's root, so
 * it has no way "back" into the finished form.
 */
jest.unmock('expo-router');

import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Redirect, router } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { Pressable, Text } from 'react-native';
import type * as ReactNativeModule from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/lib/theme';
import { ShellTabs } from '@/ui/shell/ShellTabs';

import { returnHome } from '../StartCrewScreen';

// Imported last: see ui/shell/__tests__/tab-bar.test.tsx for why.
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

jest.mock('@/ui/sticker/Sticker', () => {
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
            <Stack screenOptions={{ headerShown: false }} />
          </ThemeProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** The screen's Done, without the crew it creates: only its navigation is under test here. */
function DoneOnly() {
  return (
    <Pressable onPress={returnHome} testID="start-crew-done">
      <Text>Done</Text>
    </Pressable>
  );
}

const named = (name: string) =>
  function Named() {
    return <Text>{`${name} screen`}</Text>;
  };

async function openApp(initialUrl: string) {
  const app = renderRouter(
    {
      _layout: TestRoot,
      // As the app's root index: `/` opens the HOME tab.
      index: () => <Redirect href="/(tabs)" />,
      '(tabs)/_layout': () => <ShellTabs gated={false} />,
      '(tabs)/index': named('home'),
      inbox: named('inbox'),
      'crew/new': DoneOnly,
    },
    { initialUrl },
  );
  await app;
  await act(async () => {});
  return { getPathname: () => app.getPathname() };
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('start a crew: Done', () => {
  it('returns to the Home underneath instead of stacking a second one', async () => {
    const app = await openApp('/');
    await act(() => Promise.resolve(router.push('/inbox')));
    await act(() => Promise.resolve(router.push('/crew/new')));

    await fireEvent.press(screen.getByTestId('start-crew-done'));
    await act(async () => {});

    expect(app.getPathname()).toBe('/');
    expect(screen.getByText('home screen')).toBeTruthy();
    expect(router.canGoBack()).toBe(false);
  });

  it('opens Home in its place when the screen was opened cold', async () => {
    const app = await openApp('/crew/new');

    await fireEvent.press(screen.getByTestId('start-crew-done'));
    await act(async () => {});

    expect(app.getPathname()).toBe('/');
    expect(screen.getByText('home screen')).toBeTruthy();
    expect(router.canGoBack()).toBe(false);
  });
});
