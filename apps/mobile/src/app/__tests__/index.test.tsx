/**
 * `/` must open the HOME tab, not the dev group's index (both live at `/`), including while the
 * other tabs' areas have not shipped their route files yet.
 */
jest.unmock('expo-router');

import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Slot } from 'expo-router';
import { Text } from 'react-native';
import type * as ReactNativeModule from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/lib/theme';
import { ShellTabs } from '@/ui/shell/ShellTabs';

import RootIndex from '../index';

// Imported last: see ui/shell/__tests__/tab-bar.test.tsx for why.
import { act, renderRouter, screen } from 'expo-router/testing-library';

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

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('root route', () => {
  it('opens the HOME tab at / with the dev index also at /', async () => {
    const pending = renderRouter(
      {
        _layout: TestRoot,
        index: RootIndex,
        '(tabs)/_layout': () => <ShellTabs gated={false} />,
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
});
