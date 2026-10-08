/**
 * Once a year over the real local-first stack: REMIND ME queues `set_legendary_reminder` for the
 * dated legendary not found yet and shows it at once (offline), and the crew co-presence count
 * follows the `trip_copresence` channel, which carries counts and member ids, never a position.
 */
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import type { RealtimeClient } from '@/data/realtime/client';
import type { ChannelHandlers } from '@/data/realtime/subscriptions';
import { RealtimeClientContext } from '@/data/realtime/use-channel';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import {
  COPRESENCE_RULE,
  MAYA,
  seedCritters,
  TRIP,
  WINDOW,
} from '../../test-support/seed-critters';
import { LegendaryScreen } from '../legendary-screen';

configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const stacks: TestLocalFirst[] = [];

afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close();
    removeDir(stack.dir);
  }
});

function fakeRealtime() {
  const channels = new Map<string, ChannelHandlers>();
  const client = {
    channels: {
      acquire: (namespace: string, id: string, handlers: ChannelHandlers) => {
        channels.set(`${namespace}:${id}`, handlers);
        return () => channels.delete(`${namespace}:${id}`);
      },
    },
  } as unknown as RealtimeClient;
  const emit = (channel: string, type: string, data: unknown) =>
    channels.get(channel)?.onEvent?.({
      v: 1,
      id: '0192f000-0000-7000-8000-00000000e0e1',
      type,
      at: new Date().toISOString(),
      data,
    });
  return { client, emit, subscribed: (channel: string) => channels.has(channel) };
}

async function renderCalendar() {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  await seedCritters(stack.db, stack.uid);
  const realtime = fakeRealtime();
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <LocalFirstProvider value={stack.value}>
            <RealtimeClientContext.Provider value={realtime.client}>
              <ScreenJoltProvider>
                <LegendaryScreen />
              </ScreenJoltProvider>
            </RealtimeClientContext.Provider>
          </LocalFirstProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
  await waitFor(() => expect(screen.getByTestId(`critters-legendary-${WINDOW}`)).toBeTruthy());
  return { stack, emit: realtime.emit, subscribed: realtime.subscribed };
}

describe('legendary calendar', () => {
  it('queues the reminder offline and shows it at once', async () => {
    const { stack } = await renderCalendar();
    await fireEvent.press(screen.getByTestId('critters-legendaries-remind'));
    await waitFor(() => expect(screen.getByText('REMINDERS ON')).toBeTruthy());
    await waitFor(async () => {
      const rows = await stack.db.getAll<{ envelope: string }>(
        "SELECT envelope FROM commands WHERE cmd = 'set_legendary_reminder'",
      );
      expect(rows.map((r) => (JSON.parse(r.envelope) as { payload: unknown }).payload)).toEqual([
        { window_id: WINDOW, on: true },
      ]);
    });
  });

  it('follows the crew count on the co-presence channel, never taking a position', async () => {
    const { emit, subscribed } = await renderCalendar();
    const channel = `trip_copresence:${TRIP}`;
    // The screen joins the channel once it knows the trip under way, which is a few local reads
    // after the calendar first draws: an event sent before then reaches no one.
    await waitFor(() => expect(subscribed(channel)).toBe(true));
    await act(() =>
      emit(channel, 'copresence.progress', {
        rule_id: COPRESENCE_RULE,
        here: 3,
        needed: 6,
        missing: [MAYA],
      }),
    );
    await waitFor(() => expect(screen.getByText('3 OF 6 IN')).toBeTruthy());
    // The name comes from its own read of the crew.
    await waitFor(() => expect(screen.getByText('Still to come: Maya')).toBeTruthy());
    // A payload carrying a coordinate is not a valid count, so it changes nothing: the count the
    // screen shows stays the one it had.
    await act(() =>
      emit(channel, 'copresence.progress', {
        rule_id: COPRESENCE_RULE,
        here: 5,
        needed: 6,
        missing: [],
        lat: -8.24,
      }),
    );
    expect(screen.queryByText('5 OF 6 IN')).toBeNull();
    expect(screen.getByText('3 OF 6 IN')).toBeTruthy();
  });
});
