/**
 * Every fixed rooms scene renders its real view (the screenshots come from these), and the states
 * say what they should: the member's own room ringed with no move buttons, the refused drop, the
 * free-cancellation line only with a booking.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { ROOMS_SCENES } from '../scenes';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderScene(name: string) {
  const scene = ROOMS_SCENES.find((candidate) => candidate.name === name);
  if (scene === undefined) throw new Error(`no scene ${name}`);
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <ScreenJoltProvider>{scene.render()}</ScreenJoltProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

describe('rooms scenes', () => {
  it.each(ROOMS_SCENES.map((scene) => scene.name))('%s renders', async (name) => {
    await renderScene(name);
    expect(screen.getByTestId('setup-rooms')).toBeTruthy();
  });

  it('matches the render: three grouped rooms, same pairs after, $470 each', async () => {
    await renderScene('3c-6-rooms');
    expect(screen.getByText('LIGHT SLEEPERS')).toBeTruthy();
    expect(screen.getByTestId('setup-rooms-mirrored-stay-2')).toBeTruthy();
    expect(screen.getByLabelText('$470 each')).toBeTruthy();
    expect(screen.getByRole('header', { name: /who sleeps where/i })).toBeTruthy();
  });

  it('shows a member no move targets and no lock', async () => {
    await renderScene('rooms-member');
    expect(screen.queryByTestId('setup-rooms-lock')).toBeNull();
    expect(screen.getByTestId('setup-rooms-ask-swap')).toBeTruthy();
  });

  it('explains a refused drop and a booking', async () => {
    await renderScene('rooms-over-capacity');
    expect(screen.getByTestId('setup-rooms-full')).toBeTruthy();
    await renderScene('rooms-booked');
    expect(screen.getByTestId('setup-rooms-free-cancel')).toBeTruthy();
  });
});
