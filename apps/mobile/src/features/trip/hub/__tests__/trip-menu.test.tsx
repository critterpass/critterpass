/**
 * The trip menu over the real local-first stack, with the api doubled at the transport: who is
 * offered which ending (delete, call off, leave), what confirming sends, and where it lands.
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
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import type { SyncTransport, TransportResponse } from '@/data/powersync/transport';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { TripMenu } from '../trip-menu';

const ME = '0192e1a2-0000-7000-8000-0000000000aa';
const MAYA = '0192e1a2-0000-7000-8000-0000000000bb';
const TRIP = '0192e1a2-0000-7000-8000-00000000d001';
const CREW = '0192e1a2-0000-7000-8000-00000000c001';
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const activate = (element: Parameters<typeof fireEvent>[0]) =>
  fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

function recordedApi(answers: Readonly<Record<string, TransportResponse>>) {
  const sent: { path: string; body: unknown }[] = [];
  const transport: SyncTransport = {
    postJson(path, body) {
      sent.push({ path, body });
      return Promise.resolve(answers[path.split('/').at(-1) ?? ''] ?? { status: 503, body: null });
    },
  };
  return { transport, sent };
}

const applied = (result: unknown): TransportResponse => ({
  status: 200,
  body: { status: 'applied', result },
});

let stack: TestLocalFirst | null = null;

async function open(
  answers: Readonly<Record<string, TransportResponse>>,
  trip: { status: string; role: string | null; others: readonly string[] },
) {
  const api = recordedApi(answers);
  stack = await openTestLocalFirst({ transport: api.transport, uid: ME, holdUploads: true });
  await stack.db.execute('INSERT INTO trips (id, crew_id, status) VALUES (?, ?, ?)', [
    TRIP,
    CREW,
    trip.status,
  ]);
  const people = [
    ...(trip.role === null ? [] : [[ME, trip.role, 'in']]),
    ...trip.others.map((rsvp) => [MAYA, 'member', rsvp]),
  ];
  for (const [uid, role, rsvp] of people) {
    await stack.db.execute(
      'INSERT INTO trip_participants (id, trip_id, user_id, role, rsvp) VALUES (?, ?, ?, ?, ?)',
      [`p-${uid}`, TRIP, uid, role, rsvp],
    );
  }
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <LocalFirstProvider value={stack.value}>
            <ScreenJoltProvider>
              <TripMenu tripId={TRIP} status={trip.status} role={trip.role} me={ME} />
            </ScreenJoltProvider>
          </LocalFirstProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
  return api;
}

const sentCommands = (api: { sent: { path: string }[] }) =>
  api.sent.map((s) => s.path.split('/').at(-1));

beforeEach(() => {
  jest.mocked(router.navigate).mockClear();
});
afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('the trip menu', () => {
  it('lets an organiser delete a setup trip nobody else is on, then returns to the trips', async () => {
    const api = await open(
      { delete_trip: applied({ trip_id: TRIP, deleted: true }) },
      { status: 'setup', role: 'organiser', others: ['out'] },
    );
    await fireEvent.press(await screen.findByTestId('trip-menu-delete'));
    expect(await screen.findByText(/^delete this trip\?$/iu)).toBeTruthy();
    expect(api.sent).toEqual([]);
    await activate(screen.getAllByText(/^delete trip$/iu).at(-1)!);
    await waitFor(() => expect(sentCommands(api)).toEqual(['delete_trip']));
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/(tabs)/trips'));
  });

  it('offers calling the trip off once someone else is on it, and stays on the trip', async () => {
    const api = await open(
      { cancel_trip: applied({ trip_id: TRIP, status: 'cancelled', cancelled: true }) },
      { status: 'setup', role: 'organiser', others: ['in'] },
    );
    expect(await screen.findByTestId('trip-menu-cancel')).toBeTruthy();
    expect(screen.queryByTestId('trip-menu-delete')).toBeNull();
    await fireEvent.press(screen.getByTestId('trip-menu-cancel'));
    await activate(screen.getAllByText(/^call off trip$/iu).at(-1)!);
    await waitFor(() => expect(sentCommands(api)).toEqual(['cancel_trip']));
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('lets a member leave, and keeps them on the trip when the server refuses', async () => {
    const api = await open(
      {
        leave_trip: {
          status: 409,
          body: { error: { code: 'STATE_INVALID', message: 'x', retryable: false } },
        },
      },
      { status: 'confirmed', role: 'member', others: [] },
    );
    await fireEvent.press(await screen.findByTestId('trip-menu-leave'));
    expect(await screen.findByText(/^leave this trip\?$/iu)).toBeTruthy();
    await activate(screen.getAllByText(/^leave trip$/iu).at(-1)!);
    await waitFor(() => expect(sentCommands(api)).toEqual(['leave_trip']));
    await waitFor(() => expect(screen.queryByText(/^leave this trip\?$/iu)).toBeNull());
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('offers nothing once the trip is under way, and a note once it is called off', async () => {
    await open({}, { status: 'in_trip', role: 'organiser', others: ['in'] });
    await waitFor(() => expect(screen.queryByTestId(/^trip-menu-/u)).toBeNull());
    await stack?.close();
    if (stack) removeDir(stack.dir);
    await open({}, { status: 'cancelled', role: 'member', others: [] });
    expect(await screen.findByTestId('trip-cancelled-note')).toBeTruthy();
  });
});
