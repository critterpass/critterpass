/**
 * The hub in its five phases, the MONEY tile's three states, the briefing states and the trip
 * switcher, rendered from the lab's Bali trip.
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
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { HUB_SCENES } from '../dev/hub-scenes';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function scene(name: string) {
  const make = HUB_SCENES[name] as () => ReactNode;
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

describe('trip hub', () => {
  it('counts down to wheels up before the trip, with the briefing and four tiles', async () => {
    await scene('3k-1-pre-trip');
    expect(screen.getByTestId('trip-hub-header-pre')).toBeTruthy();
    expect(screen.getByText('WHEELS UP IN')).toBeTruthy();
    expect(screen.getByText('17D 05:26:29')).toBeTruthy();
    expect(screen.getByText('OCT 12 – OCT 19 · 6 GOING')).toBeTruthy();
    expect(screen.getByText('BALI')).toBeTruthy();
    expect(screen.getByText('NUDGE')).toBeTruthy();
    expect(screen.getByText('+$186')).toBeTruthy();
    expect(screen.getByText('owed to you')).toBeTruthy();
    expect(screen.getByTestId('trip-hub-tile-quests')).toBeTruthy();
    // The first day's entry, and no switch for an account with this one trip.
    expect(screen.getByText('FIRST DAY · OCT 12')).toBeTruthy();
    expect(screen.queryByTestId('trip-hub-switch')).toBeNull();
    await scene('3k-1-pre-trip-switch');
    expect(screen.getByText('SWITCH TRIP')).toBeTruthy();
  });

  it('shows the vote CTA and no countdown while planning', async () => {
    await scene('3k-1-planning');
    expect(screen.getByTestId('trip-hub-planning-cta')).toBeTruthy();
    expect(screen.queryByTestId('trip-hub-countdown')).toBeNull();
    expect(screen.queryByTestId('trip-briefing-ready')).toBeNull();
  });

  it('shows the flight on a travel day, the day and the leave-by during the trip', async () => {
    await scene('3k-1-travel-day');
    expect(screen.getByText('LAND IN')).toBeTruthy();
    expect(screen.getByTestId('trip-hub-next')).toBeTruthy();
    await scene('3k-1-in-trip');
    expect(screen.getByText('DAY 2 OF 3')).toBeTruthy();
    expect(screen.getByText('LEAVE BY · 03:10')).toBeTruthy();
    expect(screen.getByText("CHÀ VÁ'S BRIEFING")).toBeTruthy();
    expect(screen.getByText('you owe')).toBeTruthy();
    await scene('3k-1-next-tomorrow');
    expect(screen.getByText('TOMORROW · 10:00')).toBeTruthy();
    expect(screen.getByText('NOTHING MORE TODAY')).toBeTruthy();
    expect(screen.getByText('EXPLORE ĐÀ NẴNG')).toBeTruthy();
  });

  it('says home since the last day, with the money settled', async () => {
    await scene('3k-1-post-trip');
    expect(screen.getByText('HOME SINCE')).toBeTruthy();
    expect(screen.getByText('OCT 19')).toBeTruthy();
    expect(screen.getByText('all settled')).toBeTruthy();
  });

  it('shows the briefing loading, with nothing today, failed and from yesterday', async () => {
    await scene('3k-1-briefing-loading');
    expect(screen.getByTestId('trip-briefing-loading')).toBeTruthy();
    await scene('3k-1-briefing-none');
    expect(
      screen.getByText("Nothing needs you today. I'll check again tomorrow morning."),
    ).toBeTruthy();
    await scene('3k-1-briefing-starts');
    expect(
      screen.getByText('Nothing needs you today. My morning briefings start Sep 12.'),
    ).toBeTruthy();
    await scene('3k-1-briefing-failed');
    expect(screen.getByTestId('trip-briefing-failed')).toBeTruthy();
    await scene('3k-1-briefing-stale');
    expect(screen.getByText('from Sep 24')).toBeTruthy();
    await scene('3k-1-briefing-acted');
    expect(screen.getByText('SENT')).toBeTruthy();
    expect(screen.getByText('SET ✓')).toBeTruthy();
  });

  it('collapses to three tiles and hides the ticker when there is nothing to show', async () => {
    await scene('3k-1-no-bookings');
    expect(screen.getByText('Add your first booking')).toBeTruthy();
    expect(screen.queryByTestId('trip-hub-tile-quests')).toBeNull();
    expect(screen.queryByTestId('trip-hub-ticker')).toBeNull();
  });

  it('lists two trips in the switcher', async () => {
    await scene('trips-switcher');
    expect(screen.getByText('BALI')).toBeTruthy();
    expect(screen.getByText('in progress · Oct 12 – Oct 19')).toBeTruthy();
    expect(screen.getByText('KYOTO')).toBeTruthy();
    expect(screen.getByText('voting')).toBeTruthy();
  });
});
