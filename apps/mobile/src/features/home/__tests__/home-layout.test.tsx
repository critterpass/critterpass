/**
 * Layout snapshots of Home's pieces on a pinned clock, for review against 3b-2: the next-up card
 * counting down (17D 05:26:47), inside its last day, on its first day and mid-trip, and the tip.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({ useIsFocused: () => true, router: { push: jest.fn() } }));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { HomeTripInput } from '@cp/domain';

import { NextUpCard } from '../next-up-card';
import { registerTripTurn, type TripTurnView } from '../slots';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// Pinned: 2026-09-24 10:33:13 UTC, 17 days 5:26:47 before Bali's first midnight (Oct 12, UTC+8).
const TARGET = new Date('2026-10-11T16:00:00Z');
const NOW = new Date(TARGET.getTime() - (17 * 86_400 + 5 * 3600 + 26 * 60 + 47) * 1000);

const BALI: HomeTripInput = {
  id: 'trip-1',
  status: 'confirmed',
  startDate: '2026-10-12',
  endDate: '2026-10-19',
  tz: 'Asia/Makassar',
  destinationId: 'bali',
  destinationName: 'Bali',
  guideId: 'tokek',
  planProgress: 80,
  countdownTargetAt: TARGET.toISOString(),
};

async function show(ui: ReactElement) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>{ui}</GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

describe('next-up card', () => {
  it('counts down in days, hours, minutes and seconds', async () => {
    await show(<NextUpCard trip={BALI} now={() => NOW} />);
    expect(screen.getByText('17D 05:26:47')).toBeTruthy();
    expect(screen.getByText('NEXT UP · OCT 12')).toBeTruthy();
    expect(screen.getByLabelText('17 days, 5 hours to Bali')).toBeTruthy();
  });

  it('drops the days inside the last 24 hours', async () => {
    const lastDay = new Date(TARGET.getTime() - (3 * 3600 + 2 * 60 + 1) * 1000);
    await show(<NextUpCard trip={BALI} now={() => lastDay} />);
    expect(screen.getByText('03:02:01')).toBeTruthy();
  });

  it('is the trip’s day from its first midnight, in the destination zone', async () => {
    await show(<NextUpCard trip={BALI} now={() => new Date('2026-10-11T18:00:00Z')} />);
    expect(screen.getByText('TODAY · DAY 1 OF 8')).toBeTruthy();
    // No ticking chip on a trip day: the eyebrow is the card's "when".
    expect(screen.queryByText(/\d\d:\d\d:\d\d/u)).toBeNull();
    await show(<NextUpCard trip={BALI} now={() => new Date('2026-10-13T23:30:00Z')} />);
    expect(screen.getByText('TODAY · DAY 3 OF 8')).toBeTruthy();
  });

  it('shows the plan pill once the trip has progress, and not at 0%', async () => {
    await show(<NextUpCard trip={BALI} now={() => NOW} />);
    expect(screen.getByText('PLAN 80%')).toBeTruthy();
    expect(screen.getByLabelText(/plan 80 percent done/)).toBeTruthy();
    await show(<NextUpCard trip={{ ...BALI, planProgress: 0 }} now={() => NOW} />);
    expect(screen.queryByTestId('home-plan-progress')).toBeNull();
    expect(screen.queryByLabelText(/percent done/)).toBeNull();
    expect(screen.getByText('17D 05:26:47')).toBeTruthy();
  });

  it('reads "Your next trip" with no countdown before a place and dates are set', async () => {
    await show(
      <NextUpCard
        trip={{ ...BALI, destinationName: null, startDate: null, countdownTargetAt: null }}
        now={() => NOW}
      />,
    );
    expect(screen.getByLabelText(/^NEXT UP, YOUR NEXT TRIP/u)).toBeTruthy();
    expect(screen.queryByTestId('home-countdown')).toBeNull();
    expect(screen.getByText('NEXT UP')).toBeTruthy();
  });

  it('starts the countdown at the lock, not while the crew is still answering', async () => {
    await show(<NextUpCard trip={{ ...BALI, status: 'proposed' }} now={() => NOW} />);
    expect(screen.queryByTestId('home-countdown')).toBeNull();
    await show(<NextUpCard trip={{ ...BALI, status: 'pre_trip' }} now={() => NOW} />);
    expect(screen.getByTestId('home-countdown')).toBeTruthy();
  });

  it('says whose turn it is under the card: a line, and a button only for a step to take', async () => {
    const waiting: TripTurnView = {
      kind: 'plan_coming',
      mine: false,
      line: "Linh is still working on the plan. You'll get it here.",
      button: null,
      href: undefined,
      organiser: 'Linh',
      crewSize: 2,
    };
    let turn = waiting;
    const unregister = registerTripTurn(() => turn);
    try {
      await show(<NextUpCard trip={{ ...BALI, status: 'draft_review' }} now={() => NOW} />);
      expect(screen.getByTestId('home-turn-plan_coming')).toBeTruthy();
      expect(screen.getByText(waiting.line)).toBeTruthy();
      expect(screen.queryByTestId('home-turn-button')).toBeNull();
      turn = { ...waiting, kind: 'answer', mine: true, button: 'Read it and answer', href: '/p' };
      await show(<NextUpCard trip={{ ...BALI, status: 'proposed' }} now={() => NOW} />);
      expect(screen.getByTestId('home-turn-button')).toBeTruthy();
      expect(screen.getByText('READ IT AND ANSWER')).toBeTruthy();
    } finally {
      unregister();
    }
  });
});
