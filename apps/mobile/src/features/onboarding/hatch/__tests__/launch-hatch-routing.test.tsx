// Skia's native renderer does not exist under Jest; see ui/avatar/test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/avatar/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));

/**
 * A cold start from a notification tap is never held up by the later-launch beat: the navigator
 * routes to the notification's screen while the beat is still on top, and that screen takes touches.
 */
import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { Pressable, Text } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

import { LaunchHatch } from '../LaunchHatch';
import { HATCHED_KEY, resetLaunchStateForTests } from '../launch-state';

// Imported last on purpose: the testing library registers its own Reanimated mock, which cannot
// load under this app's Jest setup (jest.config.js); everything above already loaded the app's.
import { renderRouter, screen } from 'expo-router/testing-library';

let taps = 0;

function TripDay() {
  return (
    <Pressable accessibilityRole="button" onPress={() => (taps += 1)}>
      <Text>trip day</Text>
    </Pressable>
  );
}

describe('opening from a notification during the beat', () => {
  it('routes to the notification screen with the beat on top', async () => {
    const storage = createMMKV({ id: 'launch-hatch-routing-test' });
    storage.set(HATCHED_KEY, true);
    resetLaunchStateForTests(storage);
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    function Root() {
      return (
        <I18nProvider i18n={i18n}>
          <Stack screenOptions={{ headerShown: false }} />
          <LaunchHatch revealed={false} />
        </I18nProvider>
      );
    }
    const Home = () => <Text>home</Text>;
    const rendered = renderRouter(
      { _layout: Root, index: Home, 'trip/[id]': TripDay },
      { initialUrl: '/' },
    );
    await rendered;
    expect(screen.getByTestId('launch-hatch-beat', { includeHiddenElements: true })).toBeTruthy();

    // The push handler routes the opening notification as soon as the navigator is up.
    await act(() => router.push('/trip/42'));
    expect(rendered.getPathname()).toBe('/trip/42');
    await fireEvent.press(screen.getByRole('button'));
    expect(taps).toBe(1);
  });
});
