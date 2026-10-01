/**
 * The hatch ceremony's eyebrow over the real local-first stack: after a landing it names the
 * airport the traveller's own leg arrived at, never a crewmate's leg, and without a flight it
 * keeps just the time.
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
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { configure, render, screen, waitFor } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { MAYA, seedCritters, TRIP } from '../../test-support/seed-critters';
import { HatchScreen } from '../hatch-screen';

configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const LANDED = '2026-10-01T05:50:00Z';
const stacks: TestLocalFirst[] = [];

afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close();
    removeDir(stack.dir);
  }
});

async function leg(
  stack: TestLocalFirst,
  id: string,
  traveller: string,
  airport: string,
  arrivedAt: string,
) {
  await stack.db.execute(
    `INSERT INTO bookings (id, trip_id, owner_id, type, traveller_ids) VALUES (?, ?, ?, 'flight', ?)`,
    [`b-${id}`, TRIP, traveller, JSON.stringify([traveller])],
  );
  await stack.db.execute(
    `INSERT INTO flight_segments (id, booking_id, trip_id, owner_id, arr_airport, act_arr_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, `b-${id}`, TRIP, traveller, airport, arrivedAt],
  );
}

async function renderHatch(withFlights: boolean) {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  await seedCritters(stack.db, stack.uid, { egg: 'hatched' });
  await stack.db.execute('UPDATE trip_participants SET landed_at = ? WHERE user_id = ?', [
    LANDED,
    stack.uid,
  ]);
  if (withFlights) {
    await leg(stack, 'seg-mine', stack.uid, 'DPS', LANDED);
    // A crewmate's leg landing at the same moment elsewhere is not mine.
    await leg(stack, 'seg-maya', MAYA, 'SIN', LANDED);
  }
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <LocalFirstProvider value={stack.value}>
            <ScreenJoltProvider>
              <HatchScreen tripId={TRIP} />
            </ScreenJoltProvider>
          </LocalFirstProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('critters-hatch')).toBeTruthy());
}

describe('hatch eyebrow', () => {
  it('names the airport my own leg landed at', async () => {
    await renderHatch(true);
    await waitFor(() =>
      expect(screen.getByText(/^DPS · \d\d:\d\d( [AP]M)? · YOU LANDED$/u)).toBeTruthy(),
    );
    expect(screen.queryByText(/SIN/u)).toBeNull();
  });

  it('keeps just the time without a flight', async () => {
    await renderHatch(false);
    await waitFor(() =>
      expect(screen.getByText(/^\d\d:\d\d( [AP]M)? · YOU LANDED$/u)).toBeTruthy(),
    );
  });
});
