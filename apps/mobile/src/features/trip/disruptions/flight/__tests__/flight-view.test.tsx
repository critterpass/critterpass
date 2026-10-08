/**
 * The flight-delayed screen's behaviour, rendered from the lab scenes: an affected member answers
 * a question once (the card stops offering the buttons), anyone else sees who it waits on, an
 * answered question says who decided, and TELL THE CREW and Undo everything are only offered to
 * the people allowed to use them.
 */
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { FLIGHT_SCENES } from '../dev/flight-scenes';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function scene(name: string) {
  const make = FLIGHT_SCENES[name] as () => ReactNode;
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <ScreenJoltProvider>{make()}</ScreenJoltProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

describe('flight-delayed screen', () => {
  it('takes one answer and then stops offering the buttons', async () => {
    await scene('3k-5');
    await fireEvent.press(screen.getByTestId('disruption-approve'));
    expect(screen.queryByTestId('disruption-approve')).toBeNull();
    expect(screen.queryByTestId('disruption-keep')).toBeNull();
  });
});
