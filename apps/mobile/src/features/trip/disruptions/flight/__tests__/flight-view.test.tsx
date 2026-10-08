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
  it('shows the delay, what is done and the question to an affected member', async () => {
    await scene('3k-5');
    expect(screen.getByText('DELAYED')).toBeTruthy();
    expect(screen.getByText('2H 10M')).toBeTruthy();
    // A vendor row says only what the vendor's answer says.
    expect(screen.getByText('Made confirmed 13:50')).toBeTruthy();
    expect(screen.getByText('DINNER: 19:30 → 21:00')).toBeTruthy();
    expect(screen.getByTestId('disruption-tell-crew')).toBeTruthy();
    expect(screen.getByTestId('disruption-undo-all')).toBeTruthy();
  });

  it('takes one answer and then stops offering the buttons', async () => {
    await scene('3k-5');
    await fireEvent.press(screen.getByTestId('disruption-approve'));
    expect(screen.queryByTestId('disruption-approve')).toBeNull();
    expect(screen.queryByTestId('disruption-keep')).toBeNull();
  });

  it('shows anyone the question does not affect who it waits on, without answer or undo', async () => {
    await scene('3k-5-other-member');
    expect(screen.queryByTestId('disruption-approve')).toBeNull();
    expect(screen.getByTestId('disruption-waiting-on')).toBeTruthy();
    expect(screen.queryByTestId('disruption-tell-crew')).toBeNull();
    expect(screen.queryByTestId('disruption-undo-all')).toBeNull();
  });

  it('says who answered once someone did', async () => {
    await scene('3k-5-decided-by-other');
    expect(screen.getByText(/maya approved/iu)).toBeTruthy();
    expect(screen.queryByTestId('disruption-approve')).toBeNull();
  });

  it('never claims a rebooking for a cancelled flight: the traveller gets the airline link', async () => {
    await scene('3k-5-cancelled');
    expect(screen.getByText('CANCELLED')).toBeTruthy();
    expect(screen.getByTestId('disruption-link-rebook_flight')).toBeTruthy();
    expect(screen.queryByText(/rebooked/u)).toBeNull();
  });

  it('keeps a landed disruption read-only', async () => {
    await scene('3k-5-landed');
    expect(screen.getByTestId('disruption-resolved')).toBeTruthy();
    expect(screen.queryByTestId('disruption-tell-crew')).toBeNull();
    expect(screen.queryByTestId('disruption-undo-all')).toBeNull();
  });
});
