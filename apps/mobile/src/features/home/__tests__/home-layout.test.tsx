/**
 * Home's next-up card on a pinned clock: the trip's day from its first midnight in the destination
 * zone, the countdown only once the trip is locked in, and the plan pill only with progress.
 */

import { describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { HomeTripInput } from '@cp/domain';

import { TripCollageCard } from '../premium/components/trip-collage-card';

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

const card = (trip: HomeTripInput, now: Date) => (
  <TripCollageCard trip={trip} going={[]} now={now} />
);

describe('next-up card', () => {
  it('names the day it starts and counts down once the trip is locked in', async () => {
    await show(card(BALI, NOW));
    expect(screen.getByText('Next up · Oct 12')).toBeTruthy();
    expect(screen.getByTestId('home-countdown')).toBeTruthy();
  });

  it('is the trip’s day from its first midnight, in the destination zone', async () => {
    await show(card(BALI, new Date('2026-10-11T18:00:00Z')));
    expect(screen.getByText('Today · Day 1 of 8')).toBeTruthy();
    // No countdown on a trip day: the eyebrow is the card's "when".
    expect(screen.queryByTestId('home-countdown')).toBeNull();
    await show(card(BALI, new Date('2026-10-13T23:30:00Z')));
    expect(screen.getByText('Today · Day 3 of 8')).toBeTruthy();
  });

  it('shows the plan pill once the trip has progress, and not at 0%', async () => {
    await show(card(BALI, NOW));
    expect(screen.getByTestId('home-plan-progress')).toBeTruthy();
    await show(card({ ...BALI, planProgress: 0 }, NOW));
    expect(screen.queryByTestId('home-plan-progress')).toBeNull();
    expect(screen.getByTestId('home-countdown')).toBeTruthy();
  });

  it('reads "Your next trip" with no countdown before a place and dates are set', async () => {
    await show(
      card({ ...BALI, destinationName: null, startDate: null, countdownTargetAt: null }, NOW),
    );
    expect(screen.getByLabelText('Next up, Your next trip')).toBeTruthy();
    expect(screen.queryByTestId('home-countdown')).toBeNull();
  });

  it('starts the countdown at the lock, not while the crew is still answering', async () => {
    await show(card({ ...BALI, status: 'proposed' }, NOW));
    expect(screen.queryByTestId('home-countdown')).toBeNull();
    await show(card({ ...BALI, status: 'pre_trip' }, NOW));
    expect(screen.getByTestId('home-countdown')).toBeTruthy();
  });
});
