/**
 * The day-of screen in each designed and undesigned state, rendered from the lab's Batur morning:
 * the countdown and who the alarm rings in the window, the in-app I'M UP only for a member still
 * asleep, the late and on-the-way faces, a day with no early start, and the app's own alarm
 * before and after its one snooze.
 */
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

import { DAY_OF_SCENES } from '../dev/day-of-scenes';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function scene(name: string) {
  const make = DAY_OF_SCENES[name] as () => ReactNode;
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

describe('day-of screen', () => {
  it('counts down in the window and names who the alarm will ring', async () => {
    await scene('3k-2-window');
    expect(screen.getByTestId('trip-day-hero-window')).toBeTruthy();
    expect(screen.getByText('03:10')).toBeTruthy();
    expect(screen.getByLabelText('22:00 to go')).toBeTruthy();
    expect(screen.getByText('4 OF 6 ARE UP')).toBeTruthy();
    expect(screen.getByText('Tokek rings Alex and Dev at 03:00')).toBeTruthy();
    expect(
      screen.getByText('Pickup at the villa gate, 03:30. Bring the headlamp, the path is dark.'),
    ).toBeTruthy();
    // I'm up already: no wake-up button for me.
    expect(screen.queryByTestId('trip-day-im-up')).toBeNull();
  });

  it("offers I'M UP and says how the alarm rings to a member still asleep", async () => {
    await scene('3k-2-not-up');
    expect(screen.getByTestId('trip-day-im-up')).toBeTruthy();
    expect(screen.getByText('Tokek rings you, Alex, and Dev at 03:00')).toBeTruthy();
    expect(screen.getByText("You'll get a notification at 03:00, not an alarm.")).toBeTruthy();
    expect(screen.getByText('Why not an alarm?')).toBeTruthy();
  });

  it('shows the time before the window with the alarm set', async () => {
    await scene('3k-2-before');
    expect(screen.getByTestId('trip-day-hero-before')).toBeTruthy();
    expect(screen.getByLabelText('2:05:00 to go')).toBeTruthy();
    expect(screen.getByText('Your alarm is set for 03:00.')).toBeTruthy();
  });

  it('turns late with sleepers, and says the crew was pinged', async () => {
    await scene('3k-2-overdue');
    expect(screen.getByTestId('trip-day-hero-overdue')).toBeTruthy();
    expect(screen.getByText('The crew was pinged to knock for Alex and Dev.')).toBeTruthy();
  });

  it('shows everyone up, and the on-the-way face once gone', async () => {
    await scene('3k-2-all-up');
    expect(screen.getByText('ALL 6 ARE UP')).toBeTruthy();
    await scene('3k-2-transit');
    expect(screen.getByTestId('trip-day-hero-transit')).toBeTruthy();
    expect(screen.getByText('ON THE WAY')).toBeTruthy();
    expect(screen.getByText('Pickup ETA 03:30')).toBeTruthy();
  });

  it("tells a member who isn't on the early item to sleep in", async () => {
    await scene('3k-2-not-mine');
    expect(screen.getByText("You're not on this one. Sleep in.")).toBeTruthy();
    expect(screen.queryByTestId('trip-day-im-up')).toBeNull();
  });

  it('leads with the first item on a day with no early start, and an empty pack list', async () => {
    await scene('3k-2-quiet-day');
    expect(screen.getByTestId('trip-day-hero-quiet')).toBeTruthy();
    expect(screen.getByText('FIRST UP')).toBeTruthy();
    expect(screen.getByText('Nothing on the list yet.')).toBeTruthy();
  });

  it('marks the screen offline and keeps the pack list working', async () => {
    await scene('3k-2-offline');
    expect(screen.getByTestId('trip-day-offline')).toBeTruthy();
    expect(screen.getByLabelText('Rp 50k for coffee').props.accessibilityState).toMatchObject({
      checked: true,
    });
  });

  it('rings with one snooze, then without it once the crew was pinged', async () => {
    await scene('5b-3-ringing');
    expect(screen.getByTestId('trip-alarm-ringing')).toBeTruthy();
    expect(screen.getByText('Snooze 5 min')).toBeTruthy();
    await scene('5b-3-crew-pinged');
    expect(screen.getByTestId('trip-alarm-final')).toBeTruthy();
    expect(screen.queryByText('Snooze 5 min')).toBeNull();
    expect(screen.getByTestId('trip-alarm-pinged')).toBeTruthy();
  });
});
