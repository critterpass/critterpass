/**
 * The day-of screen in each designed and undesigned state, rendered from the Batur morning:
 * the leave-by and who the alarm rings in the window, the in-app I'm up only for a member still
 * asleep, the late and on-the-way faces, a day with no early start, and the app's own alarm
 * before and after its one snooze.
 */
// The screen reaches the plan's helpers and their device database opener and billing module,
// which Jest cannot load; nothing here reads a database.
jest.mock('@/data/powersync/db', () => ({}));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { InAppAlarmPremium } from '../../premium/alarm/InAppAlarmPremium';
import { DayOfReady } from '../../premium/day/DayOfPremium';
import { alarmFixture, DAY_OF_FIXTURES } from '../test-support/day-of-fixtures';
import type { DayOfProps } from '../use-day-of';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function show(make: () => ReactNode) {
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

const scene = (name: string) =>
  show(() => <DayOfReady props={(DAY_OF_FIXTURES[name] as () => DayOfProps)()} />);
const alarm = (snoozeAllowed: boolean) =>
  show(() => <InAppAlarmPremium {...alarmFixture(snoozeAllowed)} />);

describe('day-of screen', () => {
  it('counts down in the window and names who the alarm will ring', async () => {
    await scene('3k-2-window');
    expect(screen.getByTestId('trip-day-hero-window')).toBeTruthy();
    expect(screen.getByText('Leave by')).toBeTruthy();
    expect(screen.getByTestId('trip-day-big').props.children).toBe('03:10');
    // The countdown runs from the page's own clock, not the test machine's.
    expect(screen.getByTestId('trip-day-countdown').props.children).toMatch(/^\d+:\d\d to\sgo$/u);
    expect(screen.getByText('4 of 6 are up')).toBeTruthy();
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
    expect(screen.getByText('You’ll get a notification at 03:00, not an alarm.')).toBeTruthy();
    expect(screen.getByText('Why not an alarm?')).toBeTruthy();
  });

  it('shows the time before the window with the alarm set', async () => {
    await scene('3k-2-before');
    expect(screen.getByTestId('trip-day-hero-before')).toBeTruthy();
    expect(screen.getByText('Your alarm is set for 03:00.')).toBeTruthy();
  });

  it('turns late with sleepers, and says the crew was pinged', async () => {
    await scene('3k-2-overdue');
    expect(screen.getByTestId('trip-day-hero-overdue')).toBeTruthy();
    expect(screen.getByText('The crew was pinged to knock for Alex and Dev.')).toBeTruthy();
    // Prose ties its short last words with no-break spaces, so the line is read with them as spaces.
    expect(
      String(screen.getByTestId('trip-day-countdown').props.children).replace(/\u00a0/gu, ' '),
    ).toBe('Leave-by time has passed');
  });

  it('shows everyone up, and the on-the-way face once gone', async () => {
    await scene('3k-2-all-up');
    expect(screen.getByText('All 6 are up')).toBeTruthy();
    await scene('3k-2-transit');
    expect(screen.getByTestId('trip-day-hero-transit')).toBeTruthy();
    expect(screen.getByText('On the way')).toBeTruthy();
    expect(screen.getByText('Pickup ETA 03:30')).toBeTruthy();
  });

  it("tells a member who isn't on the early item to sleep in", async () => {
    await scene('3k-2-not-mine');
    expect(screen.getByText('You’re not on this one. Sleep in.')).toBeTruthy();
    expect(screen.queryByTestId('trip-day-im-up')).toBeNull();
  });

  it('leads with the first item on a day with no early start, and an empty pack list', async () => {
    await scene('3k-2-quiet-day');
    expect(screen.queryByTestId(/^trip-day-hero-/u)).toBeNull();
    expect(screen.getByText('First up')).toBeTruthy();
    expect(screen.getByTestId('trip-day-big').props.children).toBe('09:30');
    expect(screen.queryAllByTestId(/^trip-day-pack-p/u)).toHaveLength(0);
    expect(screen.getByTestId('trip-day-pack-add')).toBeTruthy();
  });

  it('marks the screen offline and keeps the pack list working', async () => {
    await scene('3k-2-offline');
    expect(screen.getByText('Offline · changes send when you’re back')).toBeTruthy();
    expect(screen.getByLabelText('Rp 50k for coffee').props.accessibilityState).toMatchObject({
      checked: true,
    });
  });

  it('rings with one snooze, then without it once the crew was pinged', async () => {
    await alarm(true);
    expect(screen.getByTestId('trip-alarm-ringing')).toBeTruthy();
    expect(screen.getByText('Snooze 5 min')).toBeTruthy();
    await alarm(false);
    expect(screen.getByTestId('trip-alarm-final')).toBeTruthy();
    expect(screen.queryByText('Snooze 5 min')).toBeNull();
    expect(screen.getByTestId('trip-alarm-pinged')).toBeTruthy();
  });
});
