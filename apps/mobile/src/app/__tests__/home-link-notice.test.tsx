/**
 * A link that cannot be followed opens `/?notice=…&at=…`. Through the app's real route shape (the
 * root index forwarding to the HOME tab inside the tabs), the Home route says it only after the
 * launch screen has gone, and says it again for the next such link: the address keeps the params
 * of the first, so only the routing time tells the two apart.
 */
jest.unmock('expo-router');

import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { router, Slot, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import type * as ReactNativeModule from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { createMMKV } from 'react-native-mmkv';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { resetLinkNoticesForTests, useLinkNotice } from '@/features/home/link-notice';
import {
  markSplashRevealed,
  resetLaunchStateForTests,
  useSplashRevealed,
} from '@/features/onboarding/hatch/launch-state';
import { homeWithNotice } from '@/lib/links/route-map';
import { ThemeProvider } from '@/lib/theme';
import { toastQueue } from '@/motion/island-toast';
import { ShellTabs } from '@/ui/shell/ShellTabs';

import RootIndex from '../index';

// Imported last: see ui/shell/__tests__/tab-bar.test.tsx for why.
import { act, renderRouter, screen, waitFor } from 'expo-router/testing-library';

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

/** The HOME tab route's own param handling ((tabs)/index.tsx), without Home's data. */
function HomeTab() {
  const params = useLocalSearchParams<{ notice?: string; at?: string }>();
  useLinkNotice(
    {
      notice: typeof params.notice === 'string' ? params.notice : null,
      at: typeof params.at === 'string' ? params.at : null,
    },
    useSplashRevealed(),
  );
  return <Text>home screen</Text>;
}

async function coldStart(initialUrl: string) {
  await renderRouter(
    {
      _layout: TestRoot,
      index: RootIndex,
      '(tabs)/_layout': () => <ShellTabs gated={false} />,
      '(tabs)/index': HomeTab,
      '(tabs)/trips': () => <Text>trips screen</Text>,
    },
    { initialUrl },
  );
  await act(async () => {});
}

/** Runs a change and lets the router and its effects settle. */
async function settle(change: () => void): Promise<void> {
  await act(async () => {
    change();
    await Promise.resolve();
  });
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

beforeEach(() => resetLaunchStateForTests(createMMKV({ id: 'home-link-notice-test' })));
afterEach(() => {
  toastQueue.resetForTests();
  resetLinkNoticesForTests();
});

describe('unknown links through the real routes', () => {
  it('a cold start waits for the launch screen to go, then says it', async () => {
    await coldStart(homeWithNotice('link_unknown', Date.now()));
    // Home is mounted under the launch screen: nothing is said where nobody can see it.
    expect(screen.getByText('home screen')).toBeTruthy();
    expect(toastQueue.getCurrent()).toBeNull();

    await settle(() => markSplashRevealed());
    await waitFor(() =>
      expect(toastQueue.getCurrent()?.title).toBe('That link couldn’t be opened'),
    );
  });

  it('a second unknown link is said too, once the first has gone', async () => {
    await settle(() => markSplashRevealed());
    await coldStart(homeWithNotice('link_unknown', Date.now() - 2000));
    await waitFor(() => expect(toastQueue.getCurrent()).not.toBeNull());
    await settle(() => toastQueue.dismiss());
    expect(toastQueue.getCurrent()).toBeNull();

    // The traveller is elsewhere in the app when the next link comes in.
    await settle(() => router.navigate('/trips'));
    await waitFor(() => expect(screen.getByText('trips screen')).toBeTruthy());
    await settle(() => router.replace(homeWithNotice('link_unknown', Date.now())));
    await waitFor(() =>
      expect(toastQueue.getCurrent()?.title).toBe('That link couldn’t be opened'),
    );
  });
});
