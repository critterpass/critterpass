/**
 * The flight-delayed screen's behaviour, rendered from fixtures: an affected member answers a
 * question once (the card stops offering the buttons), anyone else sees it without buttons, an
 * answered question says who decided, and TELL THE CREW and Undo everything are only offered to
 * the people allowed to use them.
 */

import { describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { FlightReady } from '../../../premium/day-change/FlightDisruptionPremium';
import { FLIGHT_FIXTURES } from '../test-support/flight-fixtures';
import type { FlightViewProps } from '../view-types';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function scene(name: string) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const props = (FLIGHT_FIXTURES[name] as () => FlightViewProps)();
  return await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <ScreenJoltProvider>
            <FlightReady props={props} />
          </ScreenJoltProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

const APPROVE = /^disruption-approve-/u;
const KEEP = /^disruption-keep-/u;

describe('flight-delayed screen', () => {
  it('shows the delay, what is done and the question to an affected member', async () => {
    await scene('3k-5');
    expect(screen.getByText(/^delayed$/iu)).toBeTruthy();
    expect(screen.getByText(/^2h 10m$/iu)).toBeTruthy();
    // A vendor row says only what the vendor's answer says.
    expect(screen.getByText('Made confirmed 13:50')).toBeTruthy();
    expect(screen.getAllByTestId(APPROVE)).toHaveLength(1);
    expect(screen.getByTestId('disruption-tell-crew')).toBeTruthy();
    expect(screen.getByTestId('disruption-undo-all')).toBeTruthy();
  });

  it('takes one answer and then stops offering the buttons', async () => {
    await scene('3k-5');
    await fireEvent.press(screen.getAllByTestId(APPROVE)[0]!);
    expect(screen.queryAllByTestId(APPROVE)).toHaveLength(0);
    expect(screen.queryAllByTestId(KEEP)).toHaveLength(0);
  });

  it('shows anyone the question does not affect, without answer or undo', async () => {
    await scene('3k-5-other-member');
    expect(screen.getAllByTestId(/^disruption-question-/u).length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId(APPROVE)).toHaveLength(0);
    expect(screen.queryByTestId('disruption-tell-crew')).toBeNull();
    expect(screen.queryByTestId('disruption-undo-all')).toBeNull();
  });

  it('says who answered once someone did', async () => {
    await scene('3k-5-decided-by-other');
    expect(screen.getByText(/maya approved/iu)).toBeTruthy();
    expect(screen.queryAllByTestId(APPROVE)).toHaveLength(0);
  });

  it('never claims a rebooking for a cancelled flight: the traveller gets the airline link', async () => {
    await scene('3k-5-cancelled');
    expect(screen.getByText(/^cancelled$/iu)).toBeTruthy();
    expect(screen.getByTestId('disruption-link-rebook_flight:seg')).toBeTruthy();
    expect(screen.queryByText(/rebooked/u)).toBeNull();
  });

  it('keeps a landed disruption read-only', async () => {
    await scene('3k-5-landed');
    expect(screen.getByTestId('disruption-resolved')).toBeTruthy();
    expect(screen.queryByTestId('disruption-tell-crew')).toBeNull();
    expect(screen.queryByTestId('disruption-undo-all')).toBeNull();
  });
});
